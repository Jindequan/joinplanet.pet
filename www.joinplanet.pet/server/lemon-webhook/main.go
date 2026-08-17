package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---- config ---------------------------------------------------------------

type config struct {
	port               string
	maxMembers         int
	databaseURL        string
	corsOrigin         string
	secret             string
	variantIDs         map[string]bool
	claimToken         string
	lemonAPIKey        string
	lemonStoreID       string
	lemonRedirectURL   string
	lemonTestMode      bool
	variantCheckoutURL map[string]string // variant key -> Lemon checkout URL
	variantIDsByKey    map[string]string // variant key -> Lemon variant id
}

type app struct {
	cfg  config
	pool *pgxpool.Pool
}

func main() {
	ctx := context.Background()
	cfg := loadConfig()
	if cfg.databaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}
	pool, err := newPool(ctx, cfg.databaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "database connection failed:", err)
		os.Exit(1)
	}
	defer pool.Close()

	a := &app{cfg: cfg, pool: pool}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.health)
	mux.HandleFunc("/progress", a.withCORS(a.progress))
	mux.HandleFunc("/webhook", a.webhook)
	mux.HandleFunc("/checkout", a.withCORS(a.checkout))
	mux.HandleFunc("/intake", a.withCORS(a.intake))
	mux.HandleFunc("/email-capture", a.withCORS(a.emailCapture))
	mux.HandleFunc("/membership/claim", a.claim)
	a.mountAPI(mux) // /api/v1/* modules + public /s/ + /invite/ pages

	address := ":" + cfg.port
	// Timeouts protect against slowloris-style resource exhaustion and ensure
	// in-flight webhooks are not left dangling. Lemon retries on dropped
	// connections, and our webhook handling is idempotent, so a hard timeout is
	// safe. Idle timeout keeps connections warm for the progress polling.
	server := &http.Server{
		Addr:              address,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	fmt.Printf("PLANET backend listening on %s\n", address)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func loadConfig() config {
	maxMembers := 100
	if v, err := strconv.Atoi(os.Getenv("MAX_MEMBERSHIPS")); err == nil && v > 0 {
		maxMembers = v
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	variantIDs := make(map[string]bool)
	for _, v := range strings.Split(os.Getenv("LEMON_LIFETIME_VARIANT_IDS"), ",") {
		if v = strings.TrimSpace(v); v != "" {
			variantIDs[v] = true
		}
	}
	if v := strings.TrimSpace(os.Getenv("LEMON_LIFETIME_VARIANT_ID")); v != "" {
		variantIDs[v] = true
	}
	checkout := map[string]string{}
	idsByKey := map[string]string{}
	for _, key := range []string{"founding_20", "early_60", "final_100"} {
		idEnv := "LEMON_" + strings.ToUpper(key) + "_VARIANT_ID"
		urlEnv := "LEMON_" + strings.ToUpper(key) + "_CHECKOUT_URL"
		if v := strings.TrimSpace(os.Getenv(idEnv)); v != "" {
			variantIDs[v] = true
			idsByKey[key] = v
		}
		if u := strings.TrimSpace(os.Getenv(urlEnv)); u != "" {
			checkout[key] = u
		}
	}
	return config{
		port:               port,
		maxMembers:         maxMembers,
		databaseURL:        os.Getenv("DATABASE_URL"),
		corsOrigin:         os.Getenv("CORS_ORIGIN"),
		secret:             os.Getenv("LEMON_SQUEEZY_SIGNING_SECRET"),
		variantIDs:         variantIDs,
		claimToken:         os.Getenv("PLANET_CLAIM_TOKEN"),
		lemonAPIKey:        os.Getenv("LEMON_API_KEY"),
		lemonStoreID:       os.Getenv("LEMON_STORE_ID"),
		lemonRedirectURL:   os.Getenv("LEMON_CHECKOUT_REDIRECT_URL"),
		lemonTestMode:      strings.EqualFold(os.Getenv("LEMON_TEST_MODE"), "true"),
		variantCheckoutURL: checkout,
		variantIDsByKey:    idsByKey,
	}
}

// ---- founding tier model --------------------------------------------------

type foundingVariant struct {
	key   string
	min   int
	max   int
	price string
}

var foundingVariants = []foundingVariant{
	{"founding_20", 0, 10, "S$29.99"},
	{"early_60", 10, 50, "S$69.99"},
	{"final_100", 50, 100, "S$129.99"},
}

func variantByKey(key string) (foundingVariant, bool) {
	for _, v := range foundingVariants {
		if v.key == key {
			return v, true
		}
	}
	return foundingVariant{}, false
}

func currentVariantForCount(n int) (foundingVariant, bool) {
	for _, v := range foundingVariants {
		if n < v.max {
			return v, true
		}
	}
	return foundingVariant{}, false
}

// ---- handlers -------------------------------------------------------------

func (a *app) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		origin := a.cfg.corsOrigin
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, req)
	}
}

func (a *app) health(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *app) progress(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	rows, err := listActiveClaims(req.Context(), a.pool)
	if err != nil {
		jsonResponse(w, http.StatusServiceUnavailable, errBody("membership progress is not configured yet"))
		return
	}
	paid := len(rows)
	byVariant := map[string]int{}
	for _, r := range rows {
		byVariant[r.Sku]++
	}
	current, _ := currentVariantForCount(paid)
	jsonResponse(w, http.StatusOK, map[string]any{
		"paidMembers":      paid,
		"nextMemberNumber": paid + 1,
		"capacity":         a.cfg.maxMembers,
		"remaining":        maxInt(a.cfg.maxMembers-paid, 0),
		"percent":          minInt((paid*100)/a.cfg.maxMembers, 100),
		"currentVariant":   current.key,
		"source":           "postgres",
	})
}

func (a *app) webhook(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	if a.cfg.secret == "" {
		jsonResponse(w, http.StatusServiceUnavailable, errBody("signing secret is not configured"))
		return
	}
	body, err := io.ReadAll(io.LimitReader(req.Body, 2<<20))
	if err != nil || !validSignature(body, req.Header.Get("X-Signature"), a.cfg.secret) {
		jsonResponse(w, http.StatusUnauthorized, errBody("invalid webhook signature"))
		return
	}
	var event lemonEvent
	if err := json.Unmarshal(body, &event); err != nil || event.Data.ID == "" {
		jsonResponse(w, http.StatusUnprocessableEntity, errBody("invalid webhook payload"))
		return
	}
	eventID := event.Meta.WebhookID
	if eventID == "" {
		eventID = digest(body)
	}

	ctx := req.Context()
	isNew, err := recordWebhookEvent(ctx, a.pool, eventID, event.Meta.EventName)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not record event"))
		return
	}
	if !isNew {
		// Dedup: already processed.
		_ = markWebhookProcessed(ctx, a.pool, eventID, "")
		jsonResponse(w, http.StatusOK, map[string]any{"ok": true, "duplicate": true})
		return
	}

	attrs := event.Data.Attributes
	// variant_id lives inside the nested first_order_item object, not at the
	// top level of order attributes. Fall back to top-level for safety.
	variantID := attributeFromNested(attrs, "first_order_item", "variant_id")
	if variantID == "" {
		variantID = attribute(attrs, "variant_id")
	}
	mapping := a.planForVariant(variantID)
	status := strings.ToLower(attribute(attrs, "status"))
	refundedAt := attribute(attrs, "refunded_at")
	isRefunded := event.Meta.EventName == "order_refunded" || status == "refunded" || refundedAt != ""

	if mapping == nil {
		_ = markWebhookProcessed(ctx, a.pool, eventID, "unknown variant")
		jsonResponse(w, http.StatusOK, map[string]any{"ok": true, "ignored": true})
		return
	}

	if isRefunded {
		if err := markRefunded(ctx, a.pool, event.Data.ID, refundedAt); err != nil {
			_ = markWebhookProcessed(ctx, a.pool, eventID, err.Error())
			jsonResponse(w, http.StatusInternalServerError, errBody("webhook processing failed"))
			return
		}
		_ = markWebhookProcessed(ctx, a.pool, eventID, "")
		jsonResponse(w, http.StatusOK, map[string]any{"ok": true, "status": statusRefunded})
		return
	}

	// Paid / order_created path.
	if status == "paid" || event.Meta.EventName == "order_created" {
		email := normalizeEmail(firstAttribute(attrs, "user_email", "customer_email", "email"))
		existing, _ := findClaimByOrder(ctx, a.pool, event.Data.ID)
		if existing != nil {
			// Order already recorded — nothing to insert.
			_ = markWebhookProcessed(ctx, a.pool, eventID, "")
			jsonResponse(w, http.StatusOK, map[string]any{"ok": true, "status": existing.Status})
			return
		}
		if email == "" {
			_ = markWebhookProcessed(ctx, a.pool, eventID, "paid order has no customer email")
			jsonResponse(w, http.StatusUnprocessableEntity, errBody("paid order has no customer email"))
			return
		}
		emailHash := digest([]byte(email))
		paidAt := parseTime(firstAttribute(attrs, "created_at", "ordered_at"))
		tx, err := a.pool.Begin(ctx)
		if err != nil {
			_ = markWebhookProcessed(ctx, a.pool, eventID, err.Error())
			jsonResponse(w, http.StatusInternalServerError, errBody("webhook processing failed"))
			return
		}
		defer tx.Rollback(ctx)
		finalStatus, err := insertPaidClaim(ctx, tx, membershipClaim{
			OrderID:   event.Data.ID,
			Email:     email,
			EmailHash: emailHash,
			Sku:       mapping.sku,
			Plan:      mapping.plan,
			PaidAt:    paidAt,
		}, a.cfg.maxMembers)
		if err != nil {
			_ = markWebhookProcessed(ctx, a.pool, eventID, err.Error())
			jsonResponse(w, http.StatusInternalServerError, errBody("webhook processing failed"))
			return
		}
		if err := tx.Commit(ctx); err != nil {
			_ = markWebhookProcessed(ctx, a.pool, eventID, err.Error())
			jsonResponse(w, http.StatusInternalServerError, errBody("webhook processing failed"))
			return
		}
		// Founding entitlement: link by email hash when the user already
		// exists; otherwise /auth/verify replays this grant at signup.
		_ = grantFoundingByEmailHash(ctx, a.pool, emailHash, event.Data.ID)
		_ = markWebhookProcessed(ctx, a.pool, eventID, "")
		jsonResponse(w, http.StatusOK, map[string]any{"ok": true, "status": finalStatus})
		return
	}

	_ = markWebhookProcessed(ctx, a.pool, eventID, "")
	jsonResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *app) checkout(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	requested := req.URL.Query().Get("variant")
	if requested == "" {
		requested = "current"
	}
	active, err := countActiveMembers(req.Context(), a.pool)
	if err != nil {
		// DB unavailable: only allow the "current" fallback to proceed with 0.
		if requested != "current" {
			jsonResponse(w, http.StatusServiceUnavailable, errBody("membership count unavailable"))
			return
		}
		active = 0
	}
	if active >= a.cfg.maxMembers {
		jsonResponse(w, http.StatusGone, errBody("Lifetime membership is sold out."))
		return
	}
	current, ok := currentVariantForCount(active)
	if !ok {
		jsonResponse(w, http.StatusGone, errBody("No lifetime variant is available."))
		return
	}
	target := current
	if requested != "current" {
		if rv, ok := variantByKey(requested); ok && rv.key == current.key {
			target = rv
		}
	}
	if u, ok := a.cfg.variantCheckoutURL[target.key]; ok && u != "" {
		jsonResponse(w, http.StatusOK, map[string]string{"url": u})
		return
	}
	// No pre-built checkout URL: create one via the Lemon API.
	variantID := a.cfg.variantIDsByKey[target.key]
	if a.cfg.lemonAPIKey == "" || a.cfg.lemonStoreID == "" || variantID == "" {
		jsonResponse(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "Configure Lemon Checkout URLs or the Lemon API credentials first.",
			"variant": target.key,
		})
		return
	}
	u, err := a.createLemonCheckout(req.Context(), variantID, target.key, active+1)
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, errBody("Lemon could not create a checkout."))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"url": u})
}

func (a *app) createLemonCheckout(ctx context.Context, variantID, variantKey string, nextNumber int) (string, error) {
	attrs := map[string]any{
		"product_options": map[string]any{
			"enabled_variants": []any{toAnyNumber(variantID)},
		},
		"checkout_data": map[string]any{
			"custom": map[string]any{
				"planet_variant":     variantKey,
				"next_member_number": strconv.Itoa(nextNumber),
			},
		},
	}
	if a.cfg.lemonRedirectURL != "" {
		// Inject Lemon's {order_id} link variable so the /success page can
		// associate the post-payment intake form with the paid order.
		// Lemon replaces {order_id} with the real order id on redirect.
		redirectURL := a.cfg.lemonRedirectURL
		if !strings.Contains(redirectURL, "{order_id}") {
			sep := "?"
			if strings.Contains(redirectURL, "?") {
				sep = "&"
			}
			redirectURL = redirectURL + sep + "order_id={order_id}"
		}
		attrs["product_options"].(map[string]any)["redirect_url"] = redirectURL
	}
	if a.cfg.lemonTestMode {
		attrs["test_mode"] = true
	}
	payload := map[string]any{
		"data": map[string]any{
			"type":       "checkouts",
			"attributes": attrs,
			"relationships": map[string]any{
				"store":   map[string]any{"data": map[string]any{"type": "stores", "id": a.cfg.lemonStoreID}},
				"variant": map[string]any{"data": map[string]any{"type": "variants", "id": variantID}},
			},
		},
	}
	body, _ := json.Marshal(payload)
	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.lemonsqueezy.com/v1/checkouts", bytes.NewReader(body))
	httpReq.Header.Set("Accept", "application/vnd.api+json")
	httpReq.Header.Set("Content-Type", "application/vnd.api+json")
	httpReq.Header.Set("Authorization", "Bearer "+a.cfg.lemonAPIKey)
	// Bounded client so a slow Lemon response cannot pin a goroutine. The
	// outer request context (from the HTTP handler) still applies too.
	lemonClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := lemonClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var parsed struct {
		Data struct {
			Attributes struct {
				URL string `json:"url"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil || parsed.Data.Attributes.URL == "" {
		return "", fmt.Errorf("lemon checkout create failed (status %d)", resp.StatusCode)
	}
	return parsed.Data.Attributes.URL, nil
}

func (a *app) intake(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	var body struct {
		Email   string `json:"email"`
		Want    string `json:"want"`
		OrderID string `json:"order_id"`
		Source  string `json:"source"`
	}
	if err := decodeJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	email := normalizeEmail(body.Email)
	want := strings.TrimSpace(body.Want)
	if email == "" || want == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("email and want are required"))
		return
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "post_payment"
	}
	if err := insertPetIntake(req.Context(), a.pool, email, digest([]byte(email)), truncate(want, 1000), strings.TrimSpace(body.OrderID), source); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("intake submission failed"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *app) emailCapture(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	var body struct {
		Email  string `json:"email"`
		Source string `json:"source"`
	}
	if err := decodeJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	email := normalizeEmail(body.Email)
	if email == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("email is required"))
		return
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "waitlist"
	}
	created, err := insertEmailCapture(req.Context(), a.pool, email, digest([]byte(email)), source)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("email capture failed"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true, "created": created})
}

func (a *app) claim(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		jsonResponse(w, http.StatusMethodNotAllowed, errBody("method not allowed"))
		return
	}
	if a.cfg.claimToken == "" || req.Header.Get("x-planet-claim-token") != a.cfg.claimToken {
		jsonResponse(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}
	var body struct {
		Email  string `json:"email"`
		UserID string `json:"user_id"`
	}
	if err := decodeJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	email := normalizeEmail(body.Email)
	userID := strings.TrimSpace(body.UserID)
	if email == "" || userID == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("email and user_id are required"))
		return
	}
	claim, err := findActiveClaimByEmailHash(req.Context(), a.pool, digest([]byte(email)))
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("claim lookup failed"))
		return
	}
	if claim == nil {
		jsonResponse(w, http.StatusOK, map[string]bool{"lifetime": false})
		return
	}
	if claim.ClaimedUserID != nil && *claim.ClaimedUserID != userID {
		jsonResponse(w, http.StatusConflict, errBody("This membership is already linked to another account."))
		return
	}
	if claim.ClaimedUserID == nil {
		if err := claimMembership(req.Context(), a.pool, claim.ID, userID); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("claim failed"))
			return
		}
	}
	jsonResponse(w, http.StatusOK, map[string]any{"lifetime": true, "plan": claim.Plan, "order_id": claim.OrderID})
}

// ---- helpers --------------------------------------------------------------

type variantMapping struct {
	plan string
	sku  string
}

func (a *app) planForVariant(variantID string) *variantMapping {
	if !a.cfg.variantIDs[variantID] {
		return nil
	}
	return &variantMapping{plan: "Lifetime Membership", sku: variantID}
}

type lemonEvent struct {
	Meta struct {
		EventName string `json:"event_name"`
		WebhookID string `json:"webhook_id"`
	} `json:"meta"`
	Data struct {
		ID         string                     `json:"id"`
		Attributes map[string]json.RawMessage `json:"attributes"`
	} `json:"data"`
}

func validSignature(body []byte, provided, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	provided = strings.TrimSpace(provided)
	return hmac.Equal([]byte(expected), []byte(strings.ToLower(provided)))
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func attribute(attrs map[string]json.RawMessage, key string) string {
	raw, ok := attrs[key]
	if !ok {
		return ""
	}
	var value any
	if json.Unmarshal(raw, &value) != nil || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

// attributeFromNested extracts a field from a nested JSON object stored under
// parentKey. e.g. attributeFromNested(attrs, "first_order_item", "variant_id")
// reads attrs["first_order_item"]["variant_id"].
func attributeFromNested(attrs map[string]json.RawMessage, parentKey, key string) string {
	raw, ok := attrs[parentKey]
	if !ok {
		return ""
	}
	var nested map[string]json.RawMessage
	if json.Unmarshal(raw, &nested) != nil {
		return ""
	}
	return attribute(nested, key)
}

func firstAttribute(attrs map[string]json.RawMessage, keys ...string) string {
	for _, key := range keys {
		if v := attribute(attrs, key); v != "" {
			return v
		}
	}
	return ""
}

func digest(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func parseTime(value string) *time.Time {
	if value == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, time.RFC3339Nano, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, value); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func toAnyNumber(value string) any {
	if n, err := strconv.Atoi(value); err == nil {
		return n
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func errBody(msg string) map[string]string {
	return map[string]string{"error": msg}
}

func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func decodeJSON(req *http.Request, dst any) error {
	defer req.Body.Close()
	return json.NewDecoder(io.LimitReader(req.Body, 1<<20)).Decode(dst)
}

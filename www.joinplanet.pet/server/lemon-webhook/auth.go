package main

// auth.go — F1: email code login (request/verify) + /me profile assembly.
// Contract: docs/product/API-CONTRACT.md §F1. Codes are stored hashed
// (sha256(email + ":" + code)) and are single-use; sessions are random
// 32-byte tokens stored as sha256 hex.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"
)

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("POST /auth/request-code", a.requestCode)
		mux.HandleFunc("POST /auth/verify", a.verifyCode)
		mux.HandleFunc("GET /me", a.requireAuth(a.me))
	})
}

const loginCodeTTL = 10 * time.Minute

var errBadCode = errors.New("invalid or expired code")

// ---- POST /auth/request-code ------------------------------------------------

func (a *app) requestCode(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		jsonResponse(w, http.StatusBadRequest, errBody("a valid email is required"))
		return
	}
	code, err := generateLoginCode()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create code"))
		return
	}
	if err := insertLoginCode(req.Context(), a.pool, email, loginCodeHash(email, code), loginCodeTTL); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not store code"))
		return
	}
	resp := map[string]any{"ok": true, "expires_in": int(loginCodeTTL.Seconds())}
	if devLoginMode() {
		fmt.Fprintf(os.Stderr, "PLANET login code %s for %s\n", code, email)
		resp["dev_code"] = code
	} else if err := sendLoginEmail(req.Context(), email, code); err != nil {
		jsonResponse(w, http.StatusBadGateway, errBody("could not send email"))
		return
	}
	jsonResponse(w, http.StatusOK, resp)
}

// devLoginMode reports whether codes are echoed back instead of emailed.
func devLoginMode() bool {
	return os.Getenv("AUTH_DEV_MODE") == "1" || os.Getenv("RESEND_API_KEY") == ""
}

// sendLoginEmail delivers the code via Resend as text/plain.
func sendLoginEmail(ctx context.Context, email, code string) error {
	payload, _ := json.Marshal(map[string]string{
		"from":    "mail@joinplanet.pet",
		"to":      email,
		"subject": "Your PLANET login code",
		"text":    fmt.Sprintf("Your PLANET login code is %s. It expires in 10 minutes.", code),
	})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+os.Getenv("RESEND_API_KEY"))
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend status %d", resp.StatusCode)
	}
	return nil
}

func insertLoginCode(ctx context.Context, q pgxQuerier, email, codeHash string, ttl time.Duration) error {
	_, err := q.Exec(ctx,
		`INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1,$2, now() + $3)`,
		email, codeHash, ttl)
	return err
}

// ---- POST /auth/verify ------------------------------------------------------

func (a *app) verifyCode(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	email := normalizeEmail(body.Email)
	code := strings.TrimSpace(body.Code)
	if email == "" || code == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("email and code are required"))
		return
	}
	ctx := req.Context()
	userID, err := a.consumeLoginCode(ctx, email, code)
	if err != nil {
		jsonResponse(w, http.StatusUnauthorized, errBody("invalid or expired code"))
		return
	}
	// Signup may follow a founding purchase: replay the grant if claimed.
	a.grantFoundingIfClaimed(ctx, userID, sha256Hex(email))
	token, err := newSessionToken()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not start session"))
		return
	}
	if err := insertSession(ctx, a.pool, userID, sha256Hex(token), sessionTTL); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not start session"))
		return
	}
	user, err := loadUser(ctx, a.pool, userID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load user"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

// consumeLoginCode validates the newest unused unexpired code, marks it used
// (one-time, race-safe via the conditional UPDATE) and upserts the user row.
func (a *app) consumeLoginCode(ctx context.Context, email, code string) (int64, error) {
	var codeID int64
	err := a.pool.QueryRow(ctx,
		`SELECT id FROM login_codes
		  WHERE email = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()
		  ORDER BY id DESC LIMIT 1`, email, loginCodeHash(email, code),
	).Scan(&codeID)
	if err != nil {
		return 0, errBadCode
	}
	tag, err := a.pool.Exec(ctx,
		`UPDATE login_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL`, codeID)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() != 1 {
		return 0, errBadCode
	}
	return upsertUser(ctx, a.pool, email)
}

// upsertUser inserts or refreshes the user row for email and returns its id.
// Login and registration are one flow (contract F1).
func upsertUser(ctx context.Context, q pgxQuerier, email string) (int64, error) {
	var id int64
	err := q.QueryRow(ctx,
		`INSERT INTO users (email, email_hash, display_name)
		 VALUES ($1,$2,$3)
		 ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
		 RETURNING id`,
		email, sha256Hex(email), emailLocalPart(email),
	).Scan(&id)
	return id, err
}

func insertSession(ctx context.Context, q pgxQuerier, userID int64, tokenHash string, ttl time.Duration) error {
	_, err := q.Exec(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + $3)`,
		tokenHash, userID, ttl)
	return err
}

// ---- GET /me ----------------------------------------------------------------

type userRow struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

func (a *app) me(w http.ResponseWriter, req *http.Request, userID int64) {
	ctx := req.Context()
	user, err := loadUser(ctx, a.pool, userID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("user not found"))
		return
	}
	circles, err := a.listMyCircles(ctx, userID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load circles"))
		return
	}
	keys, err := a.listEntitlementKeys(ctx, userID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load entitlements"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"user":         user,
		"circles":      circles,
		"entitlements": keys,
	})
}

func loadUser(ctx context.Context, q pgxQuerier, userID int64) (userRow, error) {
	var u userRow
	err := q.QueryRow(ctx,
		`SELECT id, email, display_name FROM users WHERE id = $1`, userID,
	).Scan(&u.ID, &u.Email, &u.DisplayName)
	return u, err
}

// listMyCircles returns the caller's memberships with each circle's first pet.
func (a *app) listMyCircles(ctx context.Context, userID int64) ([]map[string]any, error) {
	rows, err := a.pool.Query(ctx,
		`SELECT c.id, c.name, c.timezone, m.role,
		        p.id, p.name, p.species, p.breed, p.birthday, p.avatar_key
		   FROM circle_members m
		   JOIN circles c ON c.id = m.circle_id
		   LEFT JOIN LATERAL (
		     SELECT id, name, species, breed, birthday, avatar_key FROM pets
		      WHERE circle_id = c.id ORDER BY id LIMIT 1
		   ) p ON true
		  WHERE m.user_id = $1
		  ORDER BY c.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var circleID int64
		var name, timezone, role string
		var petID *int64
		var petName, species, breed, avatarKey *string
		var birthday *time.Time
		if err := rows.Scan(&circleID, &name, &timezone, &role,
			&petID, &petName, &species, &breed, &birthday, &avatarKey); err != nil {
			return nil, err
		}
		circle := map[string]any{
			"id": circleID, "name": name, "timezone": timezone, "role": role, "pet": nil,
		}
		if petID != nil {
			circle["pet"] = map[string]any{
				"id":         *petID,
				"name":       derefString(petName),
				"species":    derefString(species),
				"breed":      derefString(breed),
				"birthday":   formatDate(birthday),
				"avatar_key": derefString(avatarKey),
			}
		}
		out = append(out, circle)
	}
	return out, rows.Err()
}

func (a *app) listEntitlementKeys(ctx context.Context, userID int64) ([]string, error) {
	rows, err := a.pool.Query(ctx,
		`SELECT feature_key FROM entitlements
		  WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
		  ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// ---- pure helpers -----------------------------------------------------------

// generateLoginCode returns a random zero-padded 6-digit numeric code.
func generateLoginCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// loginCodeHash is the stored form: sha256(email + ":" + code).
func loginCodeHash(email, code string) string {
	return sha256Hex(email + ":" + code)
}

// newSessionToken returns a fresh random 32-byte hex token.
func newSessionToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// emailLocalPart is the default display name ("dev" in dev@x.com).
func emailLocalPart(email string) string {
	if at := strings.Index(email, "@"); at > 0 {
		return email[:at]
	}
	return email
}

func validEmail(email string) bool {
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 {
		return false
	}
	domain := email[at+1:]
	return strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// formatDate renders a DATE column as YYYY-MM-DD (nil stays nil).
func formatDate(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.Format("2006-01-02")
}

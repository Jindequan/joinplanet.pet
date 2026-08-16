package main

// share_pages.go — 挂根 mux 的两个公开端点（api.go pubModules）：
//   GET /s/{token}      分享页（summary=就诊摘要 / care=Care Card），text/html
//   GET /invite/{code}  邀请预览 JSON（App 深链用）
// 内容结构见 APP-UI-SPEC-V1 §55 §56 §58 §59 §60 与 APP-LAYOUTS §6。
// 纪律：不引任何外部资源；过期/撤销/不存在一律渲染同一中性页，不暴露原因。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func init() {
	pubModules = append(pubModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("GET /s/{token}", a.handlePublicSharePage)
		mux.HandleFunc("GET /invite/{code}", a.handleInvitePreview)
	})
}

// ---- 数据一次取齐 ------------------------------------------------------------
//
// care 与 summary 共用一条聚合查询：宠物档案 + 过敏/紧急联系 + 当前用药 +
// 近 30 天 symptom/medication 事件 + 最近体重 + 近期就诊 + 今日任务（circle 时区）。
// 事件日期以 circle.timezone 渲染为 "Aug 17" 样式（Mon DD）。

const sharePageQuery = `
SELECT p.name, p.species, p.breed,
       to_char(p.birthday, 'YYYY-MM-DD'),
       p.allergies, p.emergency_contacts, p.avatar_key,
       c.timezone,
       s.id, s.kind, s.payload, s.expires_at, s.revoked_at, s.view_count,
       (SELECT u.display_name FROM users u WHERE u.id = s.created_by) AS shared_by,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', m.name, 'dose', m.dose, 'schedule', m.schedule)
                                   ORDER BY m.started_on, m.name), '[]'::jsonb)
          FROM medications m WHERE m.pet_id = p.id AND m.active) AS active_medications,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'date', to_char(e.occurred_at AT TIME ZONE c.timezone, 'Mon DD'),
                    'title', e.title) ORDER BY e.occurred_at DESC), '[]'::jsonb)
          FROM (SELECT title, occurred_at FROM timeline_events
                 WHERE pet_id = p.id AND type IN ('symptom','medication')
                   AND occurred_at >= now() - interval '30 days'
                 ORDER BY occurred_at DESC LIMIT 20) e) AS recent_changes,
       (SELECT jsonb_build_object('kg', e.data->>'weight_kg',
                                  'date', to_char(e.occurred_at AT TIME ZONE c.timezone, 'Mon DD'))
          FROM timeline_events e
         WHERE e.pet_id = p.id AND e.type = 'weight'
         ORDER BY e.occurred_at DESC LIMIT 1) AS last_weight,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'date', to_char(e.occurred_at AT TIME ZONE c.timezone, 'Mon DD'),
                    'title', e.title, 'body', e.body) ORDER BY e.occurred_at DESC), '[]'::jsonb)
          FROM (SELECT title, body, occurred_at FROM timeline_events
                 WHERE pet_id = p.id AND type = 'visit'
                 ORDER BY occurred_at DESC LIMIT 5) e) AS recent_visits,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'time', to_char(t.time_of_day, 'HH24:MI'),
                    'title', t.title,
                    'status', COALESCE(l.status, '')) ORDER BY t.time_of_day), '[]'::jsonb)
          FROM care_tasks t
          LEFT JOIN task_logs l
                 ON l.task_id = t.id AND l.log_date = (now() AT TIME ZONE c.timezone)::date
         WHERE t.pet_id = p.id AND t.active
           AND (btrim(t.repeat) IN ('', 'daily')
                OR lower(btrim(t.repeat)) = lower(btrim(to_char(now() AT TIME ZONE c.timezone, 'Day'))))
       ) AS today_tasks
  FROM share_links s
  JOIN pets p     ON p.id = s.pet_id
  JOIN circles c  ON c.id = p.circle_id
 WHERE s.token = $1`

type sharePageRow struct {
	Name              string
	Species           string
	Breed             string
	Birthday          *string
	Allergies         []byte
	EmergencyContacts []byte
	AvatarKey         *string
	Timezone          string
	ShareID           int64
	Kind              string
	Payload           []byte
	ExpiresAt         time.Time
	RevokedAt         *time.Time
	ViewCount         int
	SharedBy          string
	ActiveMeds        []byte
	RecentChanges     []byte
	LastWeight        []byte
	RecentVisits      []byte
	TodayTasks        []byte
}

func (a *app) loadSharePage(ctx context.Context, token string) (*sharePageRow, error) {
	row := &sharePageRow{}
	err := a.pool.QueryRow(ctx, sharePageQuery, token).Scan(
		&row.Name, &row.Species, &row.Breed, &row.Birthday,
		&row.Allergies, &row.EmergencyContacts, &row.AvatarKey, &row.Timezone,
		&row.ShareID, &row.Kind, &row.Payload, &row.ExpiresAt, &row.RevokedAt, &row.ViewCount,
		&row.SharedBy, &row.ActiveMeds, &row.RecentChanges, &row.LastWeight,
		&row.RecentVisits, &row.TodayTasks,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return row, nil
}

// ---- 公开分享页 handler ------------------------------------------------------

func (a *app) handlePublicSharePage(w http.ResponseWriter, req *http.Request) {
	token := req.PathValue("token")
	if !shareTokenLooksValid(token) {
		renderShareExpiredPage(w, "")
		return
	}
	row, err := a.loadSharePage(req.Context(), token)
	if err != nil {
		http.Error(w, "share temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	if row == nil {
		renderShareExpiredPage(w, "")
		return
	}
	if row.RevokedAt != nil || time.Now().After(row.ExpiresAt) {
		// 过期与撤销同一文案，不解释内部机制（spec §61）。
		renderShareExpiredPage(w, row.Name)
		return
	}
	// 有效访问才计数（R3：公开页读路径零额外 join）。
	_, _ = a.pool.Exec(req.Context(),
		`UPDATE share_links SET view_count = view_count + 1 WHERE id = $1`, row.ShareID)

	loc := shareLoadTZ(row.Timezone)
	if row.Kind == "care" {
		renderHTML(w, http.StatusOK, shareCareTmpl, row.careView(loc))
		return
	}
	renderHTML(w, http.StatusOK, shareSummaryTmpl, row.summaryView(loc))
}

// ---- 视图构建 ----------------------------------------------------------------

type shareMedLine struct {
	Name   string
	Detail string
}

type shareChangeLine struct {
	Date  string
	Title string
}

type shareVisitLine struct {
	Date  string
	Title string
	Body  string
}

type shareTaskLine struct {
	Time   string
	Title  string
	Status string
}

type shareContactData struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

type shareContactView struct {
	Name  string
	Phone string
	Href  template.URL // "tel:..."，经白名单清洗
}

// vetSummaryView — kind=summary 的模板数据（分区按 §56 兽医优先级排序）。
type vetSummaryView struct {
	TitleName   string
	Name        string
	AvatarURL   string
	ProfileLine string
	PreparedOn  string
	Reason      string
	Allergies   []string
	Meds        []shareMedLine
	Changes     []shareChangeLine
	Weight      string
	Visits      []shareVisitLine
	ExpiresLine string
	Show        struct {
		Allergies, Meds, Changes, Weight, Visits bool
	}
}

// careCardView — kind=care 的模板数据（spec §58/§59）。
type careCardView struct {
	TitleName  string
	AvatarURL  string
	SharedBy   string
	Expires    string
	Tasks      []shareTaskLine
	Primary    *shareContactView
	Vet        *shareContactView
	Decision   *shareContactView
	HasContact bool
}

func (row *sharePageRow) summaryView(loc *time.Location) *vetSummaryView {
	var payload struct {
		Reason   string             `json:"reason"`
		Includes shareIncludesInput `json:"includes"`
	}
	_ = json.Unmarshal(row.Payload, &payload) // 容错：坏 payload 走默认 includes
	inc := payload.Includes.withDefaults()

	v := &vetSummaryView{
		TitleName:   strings.ToUpper(row.Name),
		Name:        row.Name,
		PreparedOn:  time.Now().In(loc).Format("Jan 02"),
		Reason:      strings.TrimSpace(payload.Reason),
		Allergies:   shareAllergyLines(row.Allergies),
		Changes:     shareDecodeChanges(row.RecentChanges),
		Visits:      shareDecodeVisits(row.RecentVisits),
		ExpiresLine: shareExpiresLine(row.ExpiresAt, loc),
	}
	v.Show.Allergies, v.Show.Meds = inc.Allergies, inc.Medications
	v.Show.Changes, v.Show.Weight, v.Show.Visits = inc.Events, inc.Weight, inc.Visits

	v.ProfileLine = shareProfileLine(row.Species, row.Breed, row.Birthday, time.Now())
	if inc.Profile && row.AvatarKey != nil {
		v.AvatarURL = "/api/v1/files/" + *row.AvatarKey
	}
	var meds []struct {
		Name     string `json:"name"`
		Dose     string `json:"dose"`
		Schedule string `json:"schedule"`
	}
	_ = json.Unmarshal(row.ActiveMeds, &meds)
	for _, m := range meds {
		v.Meds = append(v.Meds, shareMedLine{
			Name:   m.Name,
			Detail: strings.Join(nonEmptyStrings(m.Dose, m.Schedule), " · "),
		})
	}
	var weight struct {
		Kg   string `json:"kg"`
		Date string `json:"date"`
	}
	_ = json.Unmarshal(row.LastWeight, &weight)
	if weight.Kg != "" {
		v.Weight = shareFormatKg(weight.Kg) + " kg · " + weight.Date
	}
	return v
}

func (row *sharePageRow) careView(loc *time.Location) *careCardView {
	v := &careCardView{
		TitleName: strings.ToUpper(row.Name),
		SharedBy:  row.SharedBy,
		Expires:   shareExpiresLine(row.ExpiresAt, loc),
	}
	if row.AvatarKey != nil {
		v.AvatarURL = "/api/v1/files/" + *row.AvatarKey
	}
	_ = json.Unmarshal(row.TodayTasks, &v.Tasks)
	v.Primary, v.Vet, v.Decision = shareParseContacts(row.EmergencyContacts)
	v.HasContact = v.Primary != nil || v.Vet != nil || v.Decision != nil
	return v
}

// ---- 小工具 ------------------------------------------------------------------

// shareLoadTZ 容错加载时区：非法/缺失回落 UTC（任务时间按 circle 本地时区语义）。
func shareLoadTZ(name string) *time.Location {
	if name == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// shareTokenLooksValid — 生成的 token 恒为 24 个小写 hex；其他形态直接中性页，不查库。
func shareTokenLooksValid(token string) bool {
	if len(token) != 24 {
		return false
	}
	for _, c := range token {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// shareExpiresLine — "in 71 hours"（剩余 ≤72h，§60）或 "Sunday"（§59 "Expires Sunday"）。
// 72h 阈值：24h/72h 链接的大半生显示小时数（§60 示例即 71h）；7 天链接前期显示星期。
func shareExpiresLine(expiresAt time.Time, loc *time.Location) string {
	remaining := time.Until(expiresAt)
	if remaining <= 0 {
		return "expired"
	}
	if remaining <= 72*time.Hour {
		hours := int((remaining + time.Hour - 1) / time.Hour) // 向上取整
		return fmt.Sprintf("in %d hours", hours)
	}
	return expiresAt.In(loc).Format("Monday")
}

// shareProfileLine — "Dog · Golden Retriever · 7y 2m"（档案只作辅助信息，§56）。
func shareProfileLine(species, breed string, birthday *string, now time.Time) string {
	parts := nonEmptyStrings(shareCapFirst(species), breed)
	if age := shareAgeLine(birthday, now); age != "" {
		parts = append(parts, age)
	}
	return strings.Join(parts, " · ")
}

func shareAgeLine(birthday *string, now time.Time) string {
	if birthday == nil {
		return ""
	}
	b, err := time.ParseInLocation("2006-01-02", *birthday, time.UTC)
	if err != nil || b.After(now) {
		return ""
	}
	months := (now.Year()-b.Year())*12 + int(now.Month()) - int(b.Month())
	if now.Day() < b.Day() {
		months--
	}
	if months < 1 {
		return ""
	}
	y, m := months/12, months%12
	switch {
	case y == 0:
		return fmt.Sprintf("%dm", m)
	case m == 0:
		return fmt.Sprintf("%dy", y)
	default:
		return fmt.Sprintf("%dy %dm", y, m)
	}
}

func shareCapFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func nonEmptyStrings(items ...string) []string {
	out := make([]string, 0, len(items))
	for _, s := range items {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// shareAllergyLines — 兼容字符串（"Chicken"）与对象（{name,severity}）两种档案形态。
func shareAllergyLines(raw []byte) []string {
	var entries []json.RawMessage
	if json.Unmarshal(raw, &entries) != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		var s string
		if json.Unmarshal(e, &s) == nil {
			if s = strings.TrimSpace(s); s != "" {
				out = append(out, s)
			}
			continue
		}
		var obj struct {
			Name     string `json:"name"`
			Severity string `json:"severity"`
		}
		if json.Unmarshal(e, &obj) == nil && strings.TrimSpace(obj.Name) != "" {
			if obj.Severity = strings.TrimSpace(obj.Severity); obj.Severity != "" {
				out = append(out, obj.Name+" · "+obj.Severity)
			} else {
				out = append(out, obj.Name)
			}
		}
	}
	return out
}

func shareDecodeChanges(raw []byte) []shareChangeLine {
	var out []shareChangeLine
	_ = json.Unmarshal(raw, &out)
	return out
}

func shareDecodeVisits(raw []byte) []shareVisitLine {
	var out []shareVisitLine
	_ = json.Unmarshal(raw, &out)
	return out
}

// shareFormatKg — "5.90" → "5.9"；解析失败原样返回。
func shareFormatKg(kg string) string {
	if v, err := strconv.ParseFloat(strings.TrimSpace(kg), 64); err == nil {
		return strconv.FormatFloat(v, 'f', -1, 64)
	}
	return kg
}

// shareParseContacts — {primary, vet, authorized_decision_maker}（spec §50）。
func shareParseContacts(raw []byte) (primary, vet, decision *shareContactView) {
	var ec map[string]shareContactData
	if json.Unmarshal(raw, &ec) != nil {
		return nil, nil, nil
	}
	get := func(key string) *shareContactView {
		c, ok := ec[key]
		if !ok {
			return nil
		}
		v := &shareContactView{Name: strings.TrimSpace(c.Name), Phone: strings.TrimSpace(c.Phone)}
		if v.Name == "" && v.Phone == "" {
			return nil
		}
		if href := shareTelHref(v.Phone); href != "" {
			v.Href = template.URL(href) // 已清洗为 tel:+数字
		}
		return v
	}
	return get("primary"), get("vet"), get("authorized_decision_maker")
}

// shareTelHref — tel: 链接只保留数字与 +；空号不成链。
func shareTelHref(phone string) string {
	var b strings.Builder
	b.WriteString("tel:")
	digits := 0
	for _, r := range phone {
		if (r >= '0' && r <= '9') || r == '+' {
			b.WriteRune(r)
			digits++
		}
	}
	if digits == 0 {
		return ""
	}
	return b.String()
}

func renderHTML(w http.ResponseWriter, status int, tmpl *template.Template, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = tmpl.Execute(w, data)
}

// 中性过期页：petName 为空时用 "the family"（token 不存在时不泄露任何信息）。
func renderShareExpiredPage(w http.ResponseWriter, petName string) {
	family := "the"
	if petName = strings.TrimSpace(petName); petName != "" {
		family = petName + "'s"
		if strings.HasSuffix(petName, "s") {
			family = petName + "'"
		}
	}
	renderHTML(w, http.StatusOK, shareExpiredTmpl, map[string]string{"Family": family})
}

// ---- 邀请预览（App 深链） ------------------------------------------------------

func (a *app) handleInvitePreview(w http.ResponseWriter, req *http.Request) {
	code := strings.TrimSpace(req.PathValue("code"))
	if code == "" {
		jsonResponse(w, http.StatusNotFound, errBody("invite not found"))
		return
	}
	var petName, avatarKey, inviterName *string
	err := a.pool.QueryRow(req.Context(), `
		SELECT p.name, p.avatar_key, u.display_name
		  FROM circles c
		  JOIN users u   ON u.id = c.created_by
		  LEFT JOIN pets p ON p.circle_id = c.id
		 WHERE c.invite_code = $1
		 ORDER BY p.id
		 LIMIT 1`, code).Scan(&petName, &avatarKey, &inviterName)
	if errors.Is(err, pgx.ErrNoRows) {
		jsonResponse(w, http.StatusNotFound, errBody("invite not found"))
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load invite"))
		return
	}
	var petNameOut, photoURL any
	if petName != nil {
		petNameOut = *petName
	}
	if avatarKey != nil {
		photoURL = "/api/v1/files/" + *avatarKey
	}
	var inviterOut any
	if inviterName != nil {
		inviterOut = *inviterName
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"pet_name":     petNameOut,
		"photo_url":    photoURL,
		"inviter_name": inviterOut,
	})
}

// ---- 模板 --------------------------------------------------------------------

const sharePageCSS = `
*{box-sizing:border-box}
body{margin:0;padding:40px 20px 56px;background:#fff;color:#152126;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.page{max-width:640px;margin:0 auto}
.avatar{display:block;width:72px;height:72px;border-radius:50%;object-fit:cover;margin:0 0 16px}
h1{font-size:26px;line-height:1.25;margin:0;letter-spacing:.02em}
.sub{margin:6px 0 0;color:#5b6670;font-size:15px}
.profile{margin:10px 0 0;color:#5b6670;font-size:14px}
.label{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5b6670;margin:30px 0 10px}
.row{padding:10px 12px;border-radius:8px;margin-bottom:6px;background:#f3f8fb}
.warm .row{background:#faf5ec}
.strong{font-weight:600}
.muted{color:#5b6670}
.small{font-size:13px}
a{color:inherit;text-decoration:none}
a.phone{display:inline-block;margin-top:2px;text-decoration:underline;text-underline-offset:3px}
.check{font-size:18px;font-weight:700;color:#1f7a4d}
.todo{font-size:18px;color:#9aa4ad}
.taskrow{display:flex;justify-content:space-between;align-items:center;gap:16px}
.privacy{margin:30px 0 0;padding:12px 14px;border-radius:8px;background:#f6f2e9;
  font-size:14px;font-weight:600;color:#152126}
.footer{margin-top:48px;padding-top:14px;border-top:1px solid #e8edf0;color:#8a949d;font-size:13px}
@media print{.footer{display:none}body{padding:0}.row{background:none;padding-left:0}}
`

const shareExpiredHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Private link</title>
<style>` + sharePageCSS + `</style>
</head>
<body>
<main class="page">
  <p class="label">Private link</p>
  <h1>This private link has expired.</h1>
  <p class="sub">Ask {{.Family}} family for a new link.</p>
  <footer class="footer">powered by PLANET</footer>
</main>
</body>
</html>`

const shareSummaryHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{.Name}} · Vet Summary</title>
<style>` + sharePageCSS + `</style>
</head>
<body>
<main class="page">
  {{if .AvatarURL}}<img class="avatar" src="{{.AvatarURL}}" alt="{{.Name}}">{{end}}
  <p class="label">Vet Summary</p>
  <h1>{{.TitleName}}</h1>
  <p class="sub">Prepared by family · {{.PreparedOn}}</p>
  {{if .ProfileLine}}<p class="profile">{{.ProfileLine}}</p>{{end}}

  {{if .Reason}}
  <p class="label">Why we're here</p>
  <div class="row"><div>{{.Reason}}</div></div>
  {{end}}

  {{if .Show.Allergies}}
  <p class="label">Important</p>
  {{range .Allergies}}<div class="row"><span class="strong">{{.}}</span></div>
  {{else}}<div class="row"><span class="muted">None recorded</span></div>
  {{end}}
  {{end}}

  {{if .Show.Meds}}
  <p class="label">Active medication</p>
  {{range .Meds}}<div class="row"><span class="strong">{{.Name}}</span>{{if .Detail}} <span class="muted">{{.Detail}}</span>{{end}}</div>
  {{else}}<div class="row"><span class="muted">None</span></div>
  {{end}}
  {{end}}

  {{if .Show.Changes}}
  <p class="label">Recent changes</p>
  {{range .Changes}}<div class="row"><div><div class="small muted">{{.Date}}</div><div>{{.Title}}</div></div></div>
  {{else}}<div class="row"><span class="muted">No entries in the last 30 days</span></div>
  {{end}}
  {{end}}

  {{if and .Show.Weight .Weight}}
  <p class="label">Weight</p>
  <div class="row"><span class="strong">{{.Weight}}</span></div>
  {{end}}

  {{if .Show.Visits}}
  <p class="label">Recent visits</p>
  {{range .Visits}}<div class="row"><div><div class="small muted">{{.Date}}</div><div class="strong">{{.Title}}</div>{{if .Body}}<div class="small">{{.Body}}</div>{{end}}</div></div>
  {{else}}<div class="row"><span class="muted">None recorded</span></div>
  {{end}}
  {{end}}

  <footer class="footer">Private link · Expires {{.ExpiresLine}} · powered by PLANET</footer>
</main>
</body>
</html>`

const shareCareHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Caring for {{.TitleName}}</title>
<style>` + sharePageCSS + `</style>
</head>
<body class="warm">
<main class="page">
  {{if .AvatarURL}}<img class="avatar" src="{{.AvatarURL}}" alt="">{{end}}
  <p class="label">Care Card</p>
  <h1>CARING FOR {{.TitleName}}</h1>
  <p class="sub">shared by {{.SharedBy}} · Expires {{.Expires}}</p>

  <p class="label">Today</p>
  {{range .Tasks}}<div class="row taskrow"><div><span class="muted">{{.Time}}</span>&nbsp; {{.Title}}</div>{{if eq .Status "done"}}<span class="check">✓</span>{{else}}<span class="todo">○</span>{{end}}</div>
  {{else}}<div class="row"><span class="muted">No tasks for today.</span></div>
  {{end}}

  {{if .HasContact}}
  <p class="label">If something feels wrong</p>
  {{with .Primary}}<div class="row"><div><div class="strong">{{.Name}}</div>{{if .Phone}}<a class="phone" href="{{.Href}}">{{.Phone}}</a>{{end}}</div></div>{{end}}
  {{with .Vet}}<div class="row"><div><div class="strong">{{.Name}}</div>{{if .Phone}}<a class="phone" href="{{.Href}}">{{.Phone}}</a>{{end}}</div></div>{{end}}
  {{with .Decision}}<p class="label">Medical decision contact</p><div class="row"><div><div class="strong">{{.Name}}</div>{{if .Phone}}<a class="phone" href="{{.Href}}">{{.Phone}}</a>{{end}}</div></div>{{end}}
  {{end}}

  <p class="privacy">Health history stays private.</p>

  <footer class="footer">Private · Read-only · powered by PLANET</footer>
</main>
</body>
</html>`

var (
	shareExpiredTmpl = template.Must(template.New("expired").Parse(shareExpiredHTML))
	shareSummaryTmpl = template.Must(template.New("summary").Parse(shareSummaryHTML))
	shareCareTmpl    = template.Must(template.New("care").Parse(shareCareHTML))
)

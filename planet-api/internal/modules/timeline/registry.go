// Package timeline：健康时间线（B4 起步：auto 事件 + 基础 CRUD；B6 补附件）。
// type 注册表制：新增类型 = 加注册项（BACKEND-DESIGN §13.1），不改表结构。
package timeline

import (
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

const (
	SourceUser         = contracts.SourceUser
	SourceAutoMed      = contracts.SourceAutoMed
	SourceAutoTransfer = contracts.SourceAutoTransfer
	SourceAutoCare     = contracts.SourceAutoCare
	// Keep ordinary event metadata small, while allowing one compressed photo
	// to travel through the same protected event record. The request body is
	// capped separately at 1 MiB by httpx.DecodeJSON.
	maxPayloadBytes      = 128 << 10
	maxPhotoDataBytes    = 768 << 10
	maxPhotoPayloadBytes = maxPhotoDataBytes + 512
)

// PayloadValidator 校验某类型的 payload JSON（返回错误 → VALIDATION_FAILED）。
type PayloadValidator func(payload []byte) error

var registry = map[string]PayloadValidator{
	"symptom":             func(p []byte) error { return requireText(p, "symptom payload requires title or detail") },
	"weight":              requireWeight,
	"medication":          requireMedication,
	"vaccine":             requireName,
	"vet_visit":           func(p []byte) error { return requireText(p, "vet_visit payload requires title or summary") },
	"note":                func(p []byte) error { return requireText(p, "note payload requires text or title") },
	"photo":               requirePhoto,
	"transfer":            requireTransfer,
	"care_task_completed": requireCareTaskCompleted,
	"care_task_undone":    requireCareTaskUndone,
}

// AutoTypes 允许 source=auto 的类型（用户接口禁止直接创建）。
var AutoTypes = map[string]bool{"medication": true, "transfer": true, "care_task_completed": true, "care_task_undone": true}

func ValidType(t string) bool {
	_, ok := registry[t]
	return ok
}

func ValidatePayload(t string, payload []byte) error {
	v, ok := registry[t]
	if !ok {
		return httpx.ErrValidation("unknown event type: " + t)
	}
	if len(payload) == 0 {
		payload = []byte("{}")
	}
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return httpx.ErrValidation("payload must be a JSON object")
	}
	if raw == nil {
		return httpx.ErrValidation("payload must be a JSON object")
	}
	maxBytes := maxPayloadBytes
	if t == "photo" {
		maxBytes = maxPhotoPayloadBytes
	}
	if len(payload) > maxBytes {
		return httpx.ErrValidation("payload too large")
	}
	if err := checkDepth(raw, 0); err != nil {
		return httpx.ErrValidation("payload nesting too deep")
	}
	return v(payload)
}

func requireText(p []byte, message string) error {
	var raw map[string]any
	if err := json.Unmarshal(p, &raw); err != nil || raw == nil {
		return httpx.ErrValidation(message)
	}
	for _, key := range []string{"title", "detail", "text", "summary"} {
		if value, ok := raw[key].(string); ok && len([]rune(strings.TrimSpace(value))) > 0 {
			return nil
		}
	}
	return httpx.ErrValidation(message)
}

func requireWeight(p []byte) error {
	var s struct {
		WeightG *int `json:"weight_g"`
	}
	if err := json.Unmarshal(p, &s); err != nil || s.WeightG == nil {
		return httpx.ErrValidation("weight event requires numeric weight_g")
	}
	if *s.WeightG <= 0 || *s.WeightG > 200_000 {
		return httpx.ErrValidation("weight_g out of range")
	}
	return nil
}

func requireMedication(p []byte) error {
	var s struct {
		MedicationID string `json:"medication_id"`
		Action       string `json:"action"`
		Name         string `json:"name"`
	}
	if err := json.Unmarshal(p, &s); err != nil {
		return httpx.ErrValidation("invalid medication payload")
	}
	if strings.TrimSpace(s.MedicationID) == "" || (s.Action != "started" && s.Action != "ended") {
		return httpx.ErrValidation("medication payload requires medication_id and action started|ended")
	}
	return nil
}

func requireTransfer(p []byte) error {
	var s struct {
		FromFamilyID string `json:"from_family_id"`
		ToFamilyID   string `json:"to_family_id"`
	}
	if err := json.Unmarshal(p, &s); err != nil || s.FromFamilyID == "" || s.ToFamilyID == "" {
		return httpx.ErrValidation("transfer payload requires from_family_id and to_family_id")
	}
	return nil
}

func requireCareTaskCompleted(p []byte) error {
	var s struct {
		CareTaskID string `json:"care_task_id"`
		Status     string `json:"status"`
	}
	if err := json.Unmarshal(p, &s); err != nil || strings.TrimSpace(s.CareTaskID) == "" || (s.Status != "completed" && s.Status != "skipped") {
		return httpx.ErrValidation("care_task_completed payload requires care_task_id and status completed|skipped")
	}
	return nil
}

func requireCareTaskUndone(p []byte) error {
	var s struct {
		CareTaskID string `json:"care_task_id"`
		Status     string `json:"status"`
	}
	if err := json.Unmarshal(p, &s); err != nil || strings.TrimSpace(s.CareTaskID) == "" || s.Status != "reverted" {
		return httpx.ErrValidation("care_task_undone payload requires care_task_id and status reverted")
	}
	return nil
}

func requireName(p []byte) error {
	var s struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(p, &s); err != nil || strings.TrimSpace(s.Name) == "" {
		return httpx.ErrValidation("payload requires non-empty name")
	}
	return nil
}

// requirePhoto keeps the first photo implementation deliberately small and
// private: the compressed data URI lives inside the member-protected event.
// SVG and remote URLs are rejected so an event cannot become an untrusted
// executable or an accidental external tracking surface.
func requirePhoto(p []byte) error {
	var s struct {
		PhotoData string `json:"photo_data"`
		Caption   string `json:"caption"`
	}
	if err := json.Unmarshal(p, &s); err != nil || strings.TrimSpace(s.PhotoData) == "" {
		return httpx.ErrValidation("photo event requires photo_data")
	}
	if len(s.PhotoData) > maxPhotoDataBytes {
		return httpx.ErrValidation("photo_data too large")
	}
	if !strings.HasPrefix(s.PhotoData, "data:image/") || strings.Contains(s.PhotoData, "svg") {
		return httpx.ErrValidation("photo_data must be a raster image data URI")
	}
	header, encoded, ok := strings.Cut(s.PhotoData, ",")
	if !ok || !strings.Contains(header, ";base64") || strings.TrimSpace(encoded) == "" {
		return httpx.ErrValidation("photo_data must contain base64 image data")
	}
	if _, err := base64.StdEncoding.DecodeString(encoded); err != nil {
		return httpx.ErrValidation("photo_data contains invalid base64")
	}
	return nil
}

func checkDepth(v any, depth int) error {
	if depth > 4 {
		return errDeep
	}
	switch t := v.(type) {
	case map[string]any:
		for _, c := range t {
			if err := checkDepth(c, depth+1); err != nil {
				return err
			}
		}
	case []any:
		for _, c := range t {
			if err := checkDepth(c, depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}

type depthErr struct{}

func (depthErr) Error() string { return "payload nesting too deep" }

var errDeep = depthErr{}

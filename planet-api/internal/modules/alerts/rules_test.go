package alerts

import (
	"encoding/json"
	"testing"
	"time"
)

// fixtures：真实形状的事件 payload。
func wEvent(id, petID string, at time.Time, grams int) EventInfo {
	p, _ := json.Marshal(map[string]any{"weight_g": grams})
	return EventInfo{ID: id, PetID: petID, Type: "weight", OccurredAt: at, Payload: p}
}

func sEvent(id, petID string, at time.Time, title string) EventInfo {
	p, _ := json.Marshal(map[string]any{"title": title, "detail": "some detail"})
	return EventInfo{ID: id, PetID: petID, Type: "symptom", OccurredAt: at, Payload: p}
}

var (
	pets    = []PetInfo{{ID: "pet-1", Name: "Milo"}, {ID: "pet-2", Name: "豆豆"}}
	base    = time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	daysAgo = func(n int) time.Time { return base.AddDate(0, 0, -n) }
)

func TestWeightChangeAlertsFires(t *testing.T) {
	events := []EventInfo{
		wEvent("w1", "pet-1", daysAgo(10), 5000),
		wEvent("w2", "pet-1", daysAgo(2), 4400), // -12% ≤30 天间隔 → warn
	}
	got := WeightChangeAlerts(pets, events)
	if len(got) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(got))
	}
	a := got[0]
	if a.Kind != KindWeightChange || a.Severity != SeverityWarn {
		t.Fatalf("kind/severity: %s/%s", a.Kind, a.Severity)
	}
	if a.PetName != "Milo" || a.Title != "Milo 体重变化 -12.0%" {
		t.Fatalf("title must use pet name: %q", a.Title)
	}
	if a.ID != "weight_change:w2" || !a.OccurredAt.Equal(daysAgo(2)) {
		t.Fatalf("id/occurred_at: %s %v", a.ID, a.OccurredAt)
	}
	if a.Data["from_g"] != 5000 || a.Data["to_g"] != 4400 {
		t.Fatalf("data: %v", a.Data)
	}
}

func TestWeightChangeBelowThresholdNoAlert(t *testing.T) {
	events := []EventInfo{
		wEvent("w1", "pet-1", daysAgo(10), 5000),
		wEvent("w2", "pet-1", daysAgo(2), 4700), // -6% < 10 → 不触发
	}
	if got := WeightChangeAlerts(pets, events); len(got) != 0 {
		t.Fatalf("expected no alerts, got %v", got)
	}
}

func TestWeightChangeGapTooLargeNoAlert(t *testing.T) {
	events := []EventInfo{
		wEvent("w1", "pet-1", daysAgo(45), 5000),
		wEvent("w2", "pet-1", daysAgo(2), 4000), // |Δ%| 够但间隔 43 天 > 30 → 不触发
	}
	if got := WeightChangeAlerts(pets, events); len(got) != 0 {
		t.Fatalf("expected no alerts, got %v", got)
	}
}

func TestWeightChangeOnlyLatestPairConsidered(t *testing.T) {
	// 最近两条（w3,w2）变化仅 -4% → 不触发，即使更早的 w1 差异大
	events := []EventInfo{
		wEvent("w1", "pet-1", daysAgo(40), 6000),
		wEvent("w2", "pet-1", daysAgo(20), 5000),
		wEvent("w3", "pet-1", daysAgo(3), 4800),
	}
	if got := WeightChangeAlerts(pets, events); len(got) != 0 {
		t.Fatalf("expected no alerts, got %v", got)
	}
}

func TestWeightChangeSingleEventAndBadPayload(t *testing.T) {
	bad := EventInfo{ID: "b1", PetID: "pet-1", Type: "weight", OccurredAt: daysAgo(1), Payload: []byte(`{}`)}
	events := []EventInfo{wEvent("w1", "pet-1", daysAgo(2), 5000), bad}
	if got := WeightChangeAlerts(pets, events); len(got) != 0 {
		t.Fatalf("bad payload event must be ignored, got %v", got)
	}
}

func TestSymptomRepeatFires(t *testing.T) {
	events := []EventInfo{
		sEvent("s1", "pet-1", daysAgo(5), "Vomiting"),
		sEvent("s2", "pet-1", daysAgo(1), "vomiting"), // 归一后同一症状
	}
	got := SymptomRepeatAlerts(pets, events, base)
	if len(got) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(got))
	}
	a := got[0]
	if a.Kind != KindSymptomRepeat || a.Severity != SeverityWatch {
		t.Fatalf("kind/severity: %s/%s", a.Kind, a.Severity)
	}
	if a.PetName != "Milo" {
		t.Fatalf("pet name: %q", a.PetName)
	}
	if a.Data["count"] != 2 {
		t.Fatalf("count: %v", a.Data["count"])
	}
	if !a.OccurredAt.Equal(daysAgo(1)) {
		t.Fatalf("occurred_at should be latest occurrence, got %v", a.OccurredAt)
	}
}

func TestSymptomRepeatOutsideWindowIgnored(t *testing.T) {
	events := []EventInfo{
		sEvent("s1", "pet-1", daysAgo(20), "vomiting"), // 14 天窗外
		sEvent("s2", "pet-1", daysAgo(1), "vomiting"),
	}
	if got := SymptomRepeatAlerts(pets, events, base); len(got) != 0 {
		t.Fatalf("expected no alerts, got %v", got)
	}
}

func TestSymptomRepeatDifferentTitlesNotMerged(t *testing.T) {
	events := []EventInfo{
		sEvent("s1", "pet-1", daysAgo(5), "vomiting"),
		sEvent("s2", "pet-1", daysAgo(1), "scratching"),
	}
	if got := SymptomRepeatAlerts(pets, events, base); len(got) != 0 {
		t.Fatalf("distinct symptoms must not merge, got %v", got)
	}
}

func TestSymptomRepeatPerPetSeparated(t *testing.T) {
	events := []EventInfo{
		sEvent("s1", "pet-1", daysAgo(5), "vomiting"),
		sEvent("s2", "pet-2", daysAgo(1), "vomiting"), // 同标题不同宠物：不合并
	}
	if got := SymptomRepeatAlerts(pets, events, base); len(got) != 0 {
		t.Fatalf("per-pet grouping expected, got %v", got)
	}
}

func TestSymptomRepeatFutureEventIgnored(t *testing.T) {
	events := []EventInfo{
		sEvent("s1", "pet-1", daysAgo(1), "vomiting"),
		sEvent("s2", "pet-1", base.Add(24*time.Hour), "vomiting"), // 未来事件（补记错误数据）不参与
	}
	if got := SymptomRepeatAlerts(pets, events, base); len(got) != 0 {
		t.Fatalf("future events must not count, got %v", got)
	}
}

func TestMedicationSilenceCollapsesMissedOccurrences(t *testing.T) {
	now := base
	rows := []MedicationOccurrenceInfo{
		{ID: "m1-old", PetID: "pet-1", PetName: "Milo", MedicationID: "med-1", MedicationName: "抗生素", Title: "早上喂药", DueAt: now.Add(-48 * time.Hour), Status: "missed"},
		{ID: "m1-new", PetID: "pet-1", PetName: "Milo", MedicationID: "med-1", MedicationName: "抗生素", Title: "早上喂药", DueAt: now.Add(-24 * time.Hour), Status: "missed"},
		{ID: "future", PetID: "pet-1", PetName: "Milo", MedicationID: "med-2", MedicationName: "益生菌", Title: "晚饭后", DueAt: now.Add(time.Hour), Status: "missed"},
		{ID: "done", PetID: "pet-1", PetName: "Milo", MedicationID: "med-3", MedicationName: "维生素", Title: "早餐后", DueAt: now.Add(-time.Hour), Status: "completed"},
	}
	got := MedicationSilenceAlerts(rows, now)
	if len(got) != 1 {
		t.Fatalf("expected one collapsed warning, got %v", got)
	}
	alert := got[0]
	if alert.Kind != KindMedicationSilence || alert.Title != "Milo 可能漏服：抗生素" || alert.Severity != SeverityWarn {
		t.Fatalf("unexpected medication warning: %v", alert)
	}
	if alert.ID != "medication_silence:m1-new" || alert.Data["count"] != 2 {
		t.Fatalf("latest occurrence/count: %v", alert)
	}
}

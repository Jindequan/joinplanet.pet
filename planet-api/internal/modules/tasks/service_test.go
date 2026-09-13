package tasks

import (
	"testing"
	"time"
)

func TestPetTodayTimezoneUsesPrimaryFamilyBeforeRuleSnapshot(t *testing.T) {
	candidates := []ruleCandidate{{Timezone: "America/Los_Angeles"}}
	if got := petTodayTimezoneName("Asia/Shanghai", candidates); got != "Asia/Shanghai" {
		t.Fatalf("expected primary Family timezone, got %q", got)
	}
}

func TestMergeTodayGroupsKeepsOnePetCardAcrossFamilyEdges(t *testing.T) {
	existing := []TodayPetGroup{{PetID: "pet-1", PetName: "Panghu", Items: []TodayItem{{Task: Task{ID: "task-home"}}}}}
	incoming := []TodayPetGroup{{PetID: "pet-1", PetName: "Panghu", Items: []TodayItem{{Task: Task{ID: "task-work"}}}}, {PetID: "pet-2", PetName: "Mimi"}}
	merged := mergeTodayGroups(existing, incoming)
	if len(merged) != 2 {
		t.Fatalf("expected two pet cards, got %d", len(merged))
	}
	if len(merged[0].Items) != 2 || merged[0].Items[0].Task.ID != "task-home" || merged[0].Items[1].Task.ID != "task-work" {
		t.Fatalf("expected family-edge occurrences to remain in one pet card: %#v", merged[0].Items)
	}
}

func TestPetTodayTimezoneFallsBackForLegacyPet(t *testing.T) {
	candidates := []ruleCandidate{{Timezone: "Europe/London"}}
	if got := petTodayTimezoneName("", candidates); got != "Europe/London" {
		t.Fatalf("expected rule timezone fallback, got %q", got)
	}
}

func TestPetTodayTimezoneUsesStableDefaultWhenNoTimezoneExists(t *testing.T) {
	if got := petTodayTimezoneName("", nil); got != defaultCareTimezone {
		t.Fatalf("expected default timezone, got %q", got)
	}
}

func TestOccurrenceIsFuture(t *testing.T) {
	now := time.Date(2026, 8, 24, 10, 0, 0, 0, time.UTC)
	// 当天提前完成（先记录后补全）：due_at 晚于 now 也可执行
	sameDayLater := time.Date(2026, 8, 24, 21, 0, 0, 0, time.UTC)
	if occurrenceIsFuture(Task{Timezone: "UTC", DueAt: &sameDayLater}, now) {
		t.Fatal("a same-day occurrence must be completable early")
	}
	// 跨民事日的未来 occurrence 不可完成
	nextDay := time.Date(2026, 8, 25, 1, 0, 0, 0, time.UTC)
	if !occurrenceIsFuture(Task{Timezone: "UTC", DueAt: &nextDay}, now) {
		t.Fatal("a next-civil-day occurrence must be rejected")
	}
	past := now.Add(-time.Hour)
	if occurrenceIsFuture(Task{Timezone: "UTC", DueAt: &past}, now) {
		t.Fatal("a due_at before now must be executable")
	}
	if occurrenceIsFuture(Task{}, now) {
		t.Fatal("legacy occurrence without due_at must not be treated as future")
	}
}

func TestMonthlySchedulePinsToLastDayInShortMonths(t *testing.T) {
	daily31 := Schedule{V: 1, Kind: "monthly", Day: 31}
	feb := time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC)
	if !daily31.ScheduledOn(feb, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.UTC) {
		t.Fatal("day-31 monthly rule must pin to Feb 28")
	}
	jan := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	if !daily31.ScheduledOn(jan, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.UTC) {
		t.Fatal("day-31 monthly rule must fire on Jan 31")
	}
	feb27 := time.Date(2026, 2, 27, 0, 0, 0, 0, time.UTC)
	if daily31.ScheduledOn(feb27, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.UTC) {
		t.Fatal("day-31 monthly rule must not fire on Feb 27")
	}
}

func TestOneTimeScheduleCannotBecomeRecurring(t *testing.T) {
	oneTime := []byte(`{"v":1,"kind":"once","date":"2026-09-12"}`)
	daily := []byte(`{"v":1,"kind":"daily"}`)
	if err := ValidateScheduleTransition(oneTime, daily); err == nil {
		t.Fatal("expected once -> daily transition to be rejected")
	}
	if err := ValidateScheduleTransition(oneTime, oneTime); err != nil {
		t.Fatalf("same one-time schedule should remain valid: %v", err)
	}
	if err := ValidateScheduleTransition(daily, daily); err != nil {
		t.Fatalf("same recurring schedule should remain valid: %v", err)
	}
}

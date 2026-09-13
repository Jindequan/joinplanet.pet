package notify

import "testing"

func TestFamilyNotificationKind(t *testing.T) {
	tests := map[string]string{
		"reminders": "care_reminder",
		"digest":    "care_digest",
		"alerts":    "care_alert",
		"unknown":   "care_alert",
	}
	for pref, want := range tests {
		if got := familyNotificationKind(pref); got != want {
			t.Fatalf("familyNotificationKind(%q) = %q, want %q", pref, got, want)
		}
	}
}

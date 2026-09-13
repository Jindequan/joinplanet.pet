package digest

import (
	"strings"
	"testing"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
)

func tod(s string) *string { return &s }

func TestComposeEmailFull(t *testing.T) {
	at := time.Date(2026, 8, 19, 9, 30, 0, 0, time.UTC)
	pets := []PetDigest{{
		PetID: "p1", PetName: "Milo",
		Done:    []DoneItem{{Title: "喂药", ByName: "Devin", At: at}, {Title: "遛狗", ByName: "", At: at}},
		Pending: []PendingItem{{Title: "梳毛", TimeOfDay: tod("09:00")}, {Title: "称重", TimeOfDay: nil}},
		Skipped: []DoneItem{{Title: "洗澡", ByName: "Amy", At: at}},
		Alerts: []contracts.Alert{{
			Kind: "weight_change", Severity: "warn",
			Title: "Milo 体重变化 -12.0%", Body: "10 天内体重从 5.00kg 变为 4.40kg（-12.0%），建议关注。",
		}},
	}}
	subject, text := ComposeEmail("豆豆家", "2026-08-19", pets)
	if subject != "PLANET daily digest for 豆豆家 — 2026-08-19" {
		t.Fatalf("subject: %q", subject)
	}
	for _, want := range []string{
		"【Milo】",
		"已完成 2 项：",
		"  · 喂药 · Devin\n",
		"  · 遛狗\n", // 无完成者昵称时省略 · by
		"待办 2 项：",
		"  · 梳毛（09:00）",
		"  · 称重\n",
		"跳过 1 项：",
		"  · 洗澡 · Amy",
		"预警 1 条：",
		"  · [warn] Milo 体重变化 -12.0%：10 天内体重从 5.00kg 变为 4.40kg（-12.0%），建议关注。",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("digest text missing %q:\n%s", want, text)
		}
	}
	if !strings.HasPrefix(text, subject+"\n") {
		t.Fatalf("text must start with subject line:\n%s", text)
	}
}

func TestComposeEmailEmptyPet(t *testing.T) {
	_, text := ComposeEmail("空圈", "2026-08-19", []PetDigest{{
		PetID: "p1", PetName: "Momo",
		Done: []DoneItem{}, Pending: []PendingItem{}, Skipped: []DoneItem{}, Alerts: []contracts.Alert{},
	}})
	if !strings.Contains(text, "【Momo】\n今天暂无照护记录") {
		t.Fatalf("empty pet placeholder missing:\n%s", text)
	}
}

func TestComposeEmailNoPets(t *testing.T) {
	subject, text := ComposeEmail("无宠圈", "2026-08-19", []PetDigest{})
	if subject != "PLANET daily digest for 无宠圈 — 2026-08-19" {
		t.Fatalf("subject: %q", subject)
	}
	if !strings.Contains(text, "（由 PLANET 自动发送）") {
		t.Fatalf("footer missing:\n%s", text)
	}
}

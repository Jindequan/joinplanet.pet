package digest

import (
	"fmt"
	"strings"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
)

// DigestItem / PetDigest：digest 响应与邮件共用的视图形状。
type DoneItem struct {
	OccurrenceID  string    `json:"occurrence_id"`
	CareRequestID string    `json:"care_request_id,omitempty"`
	Title         string    `json:"title"`
	ByName        string    `json:"by_name"`
	At            time.Time `json:"at"`
}

type PendingItem struct {
	OccurrenceID     string  `json:"occurrence_id"`
	CareRequestID    string  `json:"care_request_id,omitempty"`
	CareRequestState string  `json:"care_request_state,omitempty"`
	Title            string  `json:"title"`
	TimeOfDay        *string `json:"time_of_day"`
}

type PetDigest struct {
	PetID   string            `json:"pet_id"`
	PetName string            `json:"pet_name"`
	Done    []DoneItem        `json:"done"`
	Pending []PendingItem     `json:"pending"`
	Skipped []DoneItem        `json:"skipped"`
	Alerts  []contracts.Alert `json:"alerts"`
}

type DigestView struct {
	Date     string      `json:"date"`
	Timezone string      `json:"timezone"`
	Pets     []PetDigest `json:"pets"`
}

// ComposeEmail 渲染纯文本摘要邮件（纯函数，测试直接断言输出）。
// 格式："PLANET daily digest for {family} — {date}"，每只宠物：完成数+清单（title · by）、
// 待办清单、跳过清单、预警清单。
func ComposeEmail(familyName, date string, pets []PetDigest) (subject, text string) {
	subject = fmt.Sprintf("PLANET daily digest for %s — %s", familyName, date)
	var b strings.Builder
	b.WriteString(subject + "\n\n")
	for i, p := range pets {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString("【" + p.PetName + "】\n")
		if len(p.Done) == 0 && len(p.Pending) == 0 && len(p.Skipped) == 0 && len(p.Alerts) == 0 {
			b.WriteString("今天暂无照护记录\n")
			continue
		}
		if len(p.Done) > 0 {
			fmt.Fprintf(&b, "已完成 %d 项：\n", len(p.Done))
			for _, d := range p.Done {
				if d.ByName != "" {
					fmt.Fprintf(&b, "  · %s · %s\n", d.Title, d.ByName)
				} else {
					fmt.Fprintf(&b, "  · %s\n", d.Title)
				}
			}
		}
		if len(p.Pending) > 0 {
			fmt.Fprintf(&b, "待办 %d 项：\n", len(p.Pending))
			for _, t := range p.Pending {
				if t.TimeOfDay != nil {
					fmt.Fprintf(&b, "  · %s（%s）\n", t.Title, *t.TimeOfDay)
				} else {
					fmt.Fprintf(&b, "  · %s\n", t.Title)
				}
			}
		}
		if len(p.Skipped) > 0 {
			fmt.Fprintf(&b, "跳过 %d 项：\n", len(p.Skipped))
			for _, d := range p.Skipped {
				if d.ByName != "" {
					fmt.Fprintf(&b, "  · %s · %s\n", d.Title, d.ByName)
				} else {
					fmt.Fprintf(&b, "  · %s\n", d.Title)
				}
			}
		}
		if len(p.Alerts) > 0 {
			fmt.Fprintf(&b, "预警 %d 条：\n", len(p.Alerts))
			for _, a := range p.Alerts {
				fmt.Fprintf(&b, "  · [%s] %s：%s\n", a.Severity, a.Title, a.Body)
			}
		}
	}
	b.WriteString("\n（由 PLANET 自动发送）\n")
	return subject, b.String()
}

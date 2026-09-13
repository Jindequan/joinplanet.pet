// Package alerts：异常预警（P0）。规则是纯函数，请求时对既有数据计算，不落新状态。
// 用药预警通过 care_occurrences → care_plans.medication_id 读取执行事实，
// 不复制任务或新增一套用药状态。
package alerts

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
)

const (
	SeverityWatch = "watch"
	SeverityWarn  = "warn"

	KindWeightChange      = "weight_change"
	KindSymptomRepeat     = "symptom_repeat"
	KindMedicationSilence = "medication_silence"

	weightWindowDays  = 30 // 两条 weight 事件的最大间隔
	weightChangePct   = 10 // |Δ%| 阈值
	symptomWindowDays = 14 // symptom 反复的观察窗
	symptomRepeatMin  = 2  // 窗口内最少出现次数
)

// PetInfo / EventInfo：规则输入的最小数据面（repo 从既有表取数后传入）。
type PetInfo struct {
	ID   string
	Name string
}

type EventInfo struct {
	ID         string
	PetID      string
	Type       string
	OccurredAt time.Time
	Payload    []byte
}

// MedicationOccurrenceInfo is the smallest read model needed to identify a
// missed medication-linked care occurrence. The rule deliberately consumes
// the authoritative occurrence status instead of guessing from elapsed time.
type MedicationOccurrenceInfo struct {
	ID             string
	PetID          string
	PetName        string
	MedicationID   string
	MedicationName string
	Title          string
	DueAt          time.Time
	DueDate        time.Time
	Status         string
}

func payloadString(p []byte, key string) string {
	var m map[string]any
	if err := json.Unmarshal(p, &m); err != nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}

func payloadInt(p []byte, key string) (int, bool) {
	var m map[string]any
	if err := json.Unmarshal(p, &m); err != nil {
		return 0, false
	}
	f, ok := m[key].(float64)
	if !ok {
		return 0, false
	}
	return int(f), true
}

func formatKG(grams int) string {
	return fmt.Sprintf("%.2fkg", float64(grams)/1000)
}

// WeightChangeAlerts：每只活跃宠物最近两条 weight 事件，间隔 ≤30 天且 |Δ%| ≥ 10 → warn。
// 标题带宠物名（"{宠物} 体重变化 {±X.X%}"）；occurred_at 取较新事件。
func WeightChangeAlerts(pets []PetInfo, events []EventInfo) []contracts.Alert {
	names := map[string]string{}
	for _, p := range pets {
		names[p.ID] = p.Name
	}
	byPet := map[string][]EventInfo{}
	for _, e := range events {
		if e.Type != "weight" {
			continue
		}
		// Future-dated manual entries must not trigger an alert before their
		// occurrence. FamilyAlerts supplies the current time through filtering.
		if _, ok := payloadInt(e.Payload, "weight_g"); !ok {
			continue // 坏数据（无 weight_g）：跳过该事件
		}
		byPet[e.PetID] = append(byPet[e.PetID], e)
	}
	alerts := []contracts.Alert{}
	for petID, evs := range byPet {
		if len(evs) < 2 {
			continue
		}
		// 最近优先（occurred_at 相同按 id 稳定排序）
		sort.Slice(evs, func(i, j int) bool {
			if evs[i].OccurredAt.Equal(evs[j].OccurredAt) {
				return evs[i].ID > evs[j].ID
			}
			return evs[i].OccurredAt.After(evs[j].OccurredAt)
		})
		newer, older := evs[0], evs[1]
		days := newer.OccurredAt.Sub(older.OccurredAt).Hours() / 24
		if days > weightWindowDays {
			continue
		}
		toG, _ := payloadInt(newer.Payload, "weight_g")
		fromG, _ := payloadInt(older.Payload, "weight_g")
		if fromG <= 0 {
			continue
		}
		signed := (float64(toG) - float64(fromG)) / float64(fromG) * 100
		pct := signed
		if pct < 0 {
			pct = -pct
		}
		if pct < weightChangePct {
			continue
		}
		petName := names[petID]
		alerts = append(alerts, contracts.Alert{
			ID:         KindWeightChange + ":" + newer.ID,
			Kind:       KindWeightChange,
			PetID:      petID,
			PetName:    petName,
			Title:      fmt.Sprintf("%s 体重变化 %+.1f%%", petName, signed),
			Body:       fmt.Sprintf("%d 天内体重从 %s 变为 %s（%+.1f%%），建议关注。", int(days), formatKG(fromG), formatKG(toG), signed),
			Severity:   SeverityWarn,
			OccurredAt: newer.OccurredAt,
			Data: map[string]any{
				"pet_id": petID, "from_g": fromG, "to_g": toG,
				"pct": signed, "days": int(days),
			},
		})
	}
	return alerts
}

// normalizeSymptom 归一 symptom 标题：小写 + 去首尾空白（大小写/空格差异视为同一症状）。
func normalizeSymptom(title string) string {
	return strings.ToLower(strings.TrimSpace(title))
}

// SymptomRepeatAlerts：同一 symptom 标题（归一小写）在最近 14 天内出现 ≥2 次 → watch。
func SymptomRepeatAlerts(pets []PetInfo, events []EventInfo, now time.Time) []contracts.Alert {
	names := map[string]string{}
	for _, p := range pets {
		names[p.ID] = p.Name
	}
	cutoff := now.AddDate(0, 0, -symptomWindowDays)
	type bucket struct {
		count   int
		last    EventInfo // 窗口内最近一次（标题保留原始大小写）
		firstAt time.Time
	}
	byKey := map[string]*bucket{}
	order := []string{}
	for _, e := range events {
		if e.Type != "symptom" || e.OccurredAt.Before(cutoff) || e.OccurredAt.After(now) {
			continue
		}
		key := e.PetID + "|" + normalizeSymptom(payloadString(e.Payload, "title"))
		if strings.TrimSpace(payloadString(e.Payload, "title")) == "" {
			continue // 无标题的 symptom 无法归组
		}
		b, ok := byKey[key]
		if !ok {
			b = &bucket{firstAt: e.OccurredAt}
			byKey[key] = b
			order = append(order, key)
		}
		b.count++
		if e.OccurredAt.After(b.last.OccurredAt) {
			b.last = e
		}
		if e.OccurredAt.Before(b.firstAt) {
			b.firstAt = e.OccurredAt
		}
	}
	alerts := []contracts.Alert{}
	for _, key := range order {
		b := byKey[key]
		if b.count < symptomRepeatMin {
			continue
		}
		title := payloadString(b.last.Payload, "title")
		petID := b.last.PetID
		alerts = append(alerts, contracts.Alert{
			ID:         KindSymptomRepeat + ":" + b.last.ID,
			Kind:       KindSymptomRepeat,
			PetID:      petID,
			PetName:    names[petID],
			Title:      fmt.Sprintf("%s recurring symptom: %s", names[petID], title),
			Body:       fmt.Sprintf("\"%s\" was recorded %d times in the last 14 days — watch it closely or check with a vet.", title, b.count),
			Severity:   SeverityWatch,
			OccurredAt: b.last.OccurredAt,
			Data: map[string]any{
				"pet_id": petID, "symptom": title, "count": b.count,
				"first_at": b.firstAt, "last_at": b.last.OccurredAt,
			},
		})
	}
	return alerts
}

// MedicationSilenceAlerts turns confirmed missed medication occurrences into
// a cautious "可能漏服" warning. It never fires for a future occurrence or for
// a medication that had already ended on that occurrence's civil date.
// Multiple missed occurrences for one medication collapse into one alert.
func MedicationSilenceAlerts(rows []MedicationOccurrenceInfo, now time.Time) []contracts.Alert {
	type bucket struct {
		latest MedicationOccurrenceInfo
		count  int
	}
	byMedication := map[string]*bucket{}
	for _, row := range rows {
		if row.Status != "missed" || row.MedicationID == "" || row.DueAt.After(now) {
			continue
		}
		group, ok := byMedication[row.MedicationID]
		if !ok {
			group = &bucket{}
			byMedication[row.MedicationID] = group
		}
		group.count++
		if group.latest.ID == "" || row.DueAt.After(group.latest.DueAt) {
			group.latest = row
		}
	}

	alerts := make([]contracts.Alert, 0, len(byMedication))
	for _, group := range byMedication {
		row := group.latest
		body := fmt.Sprintf("%s 的 %s 照护已标记为未完成，请确认是否实际用药。", row.Title, row.MedicationName)
		if group.count > 1 {
			body = fmt.Sprintf("最近有 %d 次 %s 照护标记为未完成，请确认是否实际用药。", group.count, row.MedicationName)
		}
		alerts = append(alerts, contracts.Alert{
			ID:         KindMedicationSilence + ":" + row.ID,
			Kind:       KindMedicationSilence,
			PetID:      row.PetID,
			PetName:    row.PetName,
			Title:      fmt.Sprintf("%s 可能漏服：%s", row.PetName, row.MedicationName),
			Body:       body,
			Severity:   SeverityWarn,
			OccurredAt: row.DueAt,
			Data: map[string]any{
				"pet_id": row.PetID, "medication_id": row.MedicationID,
				"occurrence_id": row.ID, "count": group.count,
			},
		})
	}
	sort.SliceStable(alerts, func(i, j int) bool {
		return alerts[i].OccurredAt.After(alerts[j].OccurredAt)
	})
	return alerts
}

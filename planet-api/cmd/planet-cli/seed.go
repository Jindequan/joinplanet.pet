package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/joinplanet/planet-api/internal/platform/db"
	migrations "github.com/joinplanet/planet-api/migrations"
)

// cmdDemoSeed：幂等播种演示数据（默认 devin@planet.dev + Milo），打印可直接使用的 session token。
func cmdDemoSeed(args []string) {
	// 环境隔离：演示数据 + 365 天演示 session 绝不能进生产库
	if os.Getenv("PLANET_ENV") == "prod" {
		fmt.Fprintln(os.Stderr, "refused: demo-seed must not run against PLANET_ENV=prod")
		os.Exit(1)
	}
	fs := flag.NewFlagSet("demo-seed", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	email := fs.String("email", "devin@planet.dev", "demo user email")
	_ = fs.Parse(args)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	_, err := db.MigrateUp(ctx, migrations.FS, *url)
	exitOn(err)

	pool, err := db.NewPool(ctx, *url)
	exitOn(err)
	defer pool.Close()

	// 用户
	var userID string
	err = pool.QueryRow(ctx, `SELECT id FROM users WHERE lower(email)=lower($1)`, *email).Scan(&userID)
	if err != nil {
		err = pool.QueryRow(ctx,
			`INSERT INTO users (email, display_name) VALUES ($1,'Devin') RETURNING id`, *email).
			Scan(&userID)
		exitOn(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO subscriptions (user_id, plan, status)
		SELECT $1, 'free', 'active'
		WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = $1 AND status = 'active')`, userID)
	exitOn(err)

	// 圈：已是圈主则复用，否则建圈并成为 owner
	var familyID string
	err = pool.QueryRow(ctx, `
		SELECT c.id FROM families c
		JOIN family_memberships m ON m.family_id=c.id AND m.user_id=$1
			AND m.role='owner' AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		WHERE c.deleted_at IS NULL ORDER BY c.created_at LIMIT 1`, userID).Scan(&familyID)
	if err != nil {
		err = pool.QueryRow(ctx, `
			WITH c AS (
				INSERT INTO families (name, timezone, created_by_user_id)
				VALUES ('PLANET 家庭圈','Asia/Shanghai',$1) RETURNING id
			)
			INSERT INTO family_memberships (family_id, user_id, role)
			SELECT c.id, $1, 'owner' FROM c
			RETURNING family_id`, userID).Scan(&familyID)
		exitOn(err)
		_, err = pool.Exec(ctx, `INSERT INTO family_invitations (family_id,token_hash,expires_at,created_by_user_id) VALUES ($1,md5(random()::text),now()+interval '30 days',$2)`, familyID, userID)
		exitOn(err)
	}

	// 宠物 Milo
	var petID string
	err = pool.QueryRow(ctx, `SELECT p.id FROM pets p JOIN family_pet_links fp ON fp.pet_id=p.id WHERE fp.family_id=$1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL AND p.name='Milo'`, familyID).Scan(&petID)
	if err != nil {
		err = pool.QueryRow(ctx, `
			INSERT INTO pets (name, species, breed, birth_date, sex, neutered, weight_g, created_by_user_id)
			VALUES ('Milo','dog','柯基','2023-04-12','male',true,5200,$1) RETURNING id`,
			userID).Scan(&petID)
		exitOn(err)
		_, err = pool.Exec(ctx, `INSERT INTO pet_ownerships (pet_id,owner_user_id,created_by_user_id) VALUES ($1,$2,$2)`, petID, userID)
		exitOn(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO family_pet_links (family_id, pet_id, linked_by_user_id)
		VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, familyID, petID, userID)
	exitOn(err)

	// 档案
	_, err = pool.Exec(ctx, `
		UPDATE pets SET allergies=$2,conditions=$3,emergency_contacts=$4,med_decision_maker=$5,notes=$6
		WHERE id=$1 AND deleted_at IS NULL`,
		petID,
		`[{"name":"鸡肉","severity":"medium","note":"喂食后软便"}]`,
		`[{"name":"髌骨脱位（一级）","since":"2024-06","note":"避免剧烈跳跃"}]`,
		`[{"name":"Devin","phone":"+8613800000000","relation":"主人"},{"name":"安安宠医·李医生","phone":"+8621000000000","relation":"家庭兽医"}]`,
		`{"name":"Devin","phone":"+8613800000000"}`,
		`体检每年一次；心丝虫预防每月 1 号。`)
	exitOn(err)

	// 用药：进行中 + 已停（演示 auto start/end 事件）
	seedMed(ctx, pool, petID, userID, "犬心保（伊维菌素）", "68μg", "每月 1 次", "", "", "每月 1 号随餐")
	seedMed(ctx, pool, petID, userID, "甲硝唑", "25mg", "每日 2 次", "CURRENT_DATE - 20", "CURRENT_DATE - 13", "肠胃炎疗程（已完成）")

	// 任务
	for _, t := range []struct {
		title string
		sched string
		tod   string
	}{
		{"喂早餐", `{"v":1,"kind":"daily"}`, "08:00"},
		{"喂晚餐", `{"v":1,"kind":"daily"}`, "18:30"},
		{"遛狗", `{"v":1,"kind":"daily"}`, "19:00"},
		{"称体重", `{"v":1,"kind":"weekly","days":[1]}`, "09:00"},
		{"心丝虫预防", `{"v":1,"kind":"interval","every_n":30}`, "09:00"},
	} {
		var itemID string
		err = pool.QueryRow(ctx, `SELECT id FROM care_plans WHERE pet_id=$1 AND title=$2 AND status <> 'archived' ORDER BY created_at LIMIT 1`, petID, t.title).Scan(&itemID)
		if err != nil {
			err = pool.QueryRow(ctx, `
				INSERT INTO care_plans (pet_id, type, title, created_by_user_id)
				VALUES ($1,'custom',$2,$3) RETURNING id`, petID, t.title, userID).Scan(&itemID)
			exitOn(err)
			_, err = pool.Exec(ctx, `INSERT INTO care_rules (care_plan_id,frequency,schedule,interval_days,weekdays,day_of_month,local_time,timezone,effective_from,created_by_user_id)
				VALUES ($1,$2::jsonb->>'kind',$2::jsonb,CASE WHEN $2::jsonb->>'kind'='interval' THEN ($2::jsonb->>'every_n')::int END,
				CASE WHEN $2::jsonb->>'kind'='weekly' THEN ARRAY(SELECT jsonb_array_elements_text($2::jsonb->'days'))::smallint[] END,
				CASE WHEN $2::jsonb->>'kind'='monthly' THEN ($2::jsonb->>'day')::smallint END,$3,'Asia/Shanghai',CURRENT_DATE,$4)`, itemID, t.sched, nullableSeedTime(t.tod), userID)
			exitOn(err)
			_, err = pool.Exec(ctx, `
				INSERT INTO care_plan_assignments (care_plan_id, user_id, role, created_by_user_id)
				VALUES ($1,$2,'owner',$2) ON CONFLICT DO NOTHING`, itemID, userID)
			exitOn(err)
		}
	}

	// 时间线样例
	addEvent := func(eventType, payload string, daysAgo int) {
		var exists bool
		_ = pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM pet_events WHERE pet_id=$1 AND event_type=$2 AND payload=$3::jsonb)`,
			petID, eventType, payload).Scan(&exists)
		if !exists {
			_, err = pool.Exec(ctx, `
				INSERT INTO pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload, source)
				VALUES ($1,$2, now() - $4::interval, $3, $5::jsonb, 'user')`,
				petID, eventType, userID, fmt.Sprintf("%d days", daysAgo), payload)
			exitOn(err)
		}
	}
	addEvent("weight", `{"weight_g":5200}`, 6)
	addEvent("symptom", `{"title":"软便","detail":"换粮第二天出现，一天后恢复"}`, 12)
	addEvent("vaccine", `{"name":"狂犬疫苗","due":"2026-05-02"}`, 45)
	addEvent("vet_visit", `{"title":"年度体检","clinic":"安安宠医","summary":"指标正常，继续控制体重"}`, 45)

	// 今天的完成记录（喂早餐）
	var taskID string
	if err := pool.QueryRow(ctx, `
		SELECT co.id FROM care_occurrences co
		JOIN care_plans ci ON ci.id=co.care_plan_id
		WHERE co.pet_id=$1 AND ci.title='喂早餐' AND co.due_date=CURRENT_DATE
		ORDER BY co.created_at LIMIT 1`, petID).Scan(&taskID); err != nil {
		err = pool.QueryRow(ctx, `
			INSERT INTO care_occurrences (care_plan_id,care_rule_id,pet_id,occurrence_key,due_at,due_date,local_time,timezone,assigned_to_user_id,status,type_snapshot,title_snapshot,frequency_snapshot)
			SELECT ci.id,cr.id,ci.pet_id,cr.id::text||':'||CURRENT_DATE,
			       ((CURRENT_DATE + COALESCE(cr.local_time, '00:00'::time)) AT TIME ZONE cr.timezone),CURRENT_DATE,cr.local_time,cr.timezone,$2,'pending',ci.type,ci.title,cr.schedule
			FROM care_plans ci JOIN care_rules cr ON cr.care_plan_id=ci.id
			WHERE ci.pet_id=$1 AND ci.title='喂早餐' AND cr.frequency='daily'
			ON CONFLICT (care_rule_id,due_date) WHERE deleted_at IS NULL DO UPDATE SET id=care_occurrences.id
			RETURNING id`, petID, userID).Scan(&taskID)
		exitOn(err)
	}
	if taskID != "" {
		_, _ = pool.Exec(ctx, `
			UPDATE care_occurrences SET status='completed', completed_by_user_id=$2, completed_at=now(), note='demo'
			WHERE id=$1 AND status='pending'`, taskID, userID)
	}

	// 一年期演示 session
	token := randomTokenStr()
	_, err = pool.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, device_label, expires_at)
		VALUES ($1,$2,'demo-seed', now() + interval '365 days')`,
		userID, hashHexStr(token))
	exitOn(err)

	fmt.Println("demo seeded.")
	fmt.Println("email :", *email)
	fmt.Println("token :", token)
	fmt.Println()
	fmt.Println("curl 示例：")
	fmt.Printf("  curl -H 'Authorization: Bearer %s' http://localhost:8081/api/v1/me\n", token)
	fmt.Printf("  curl -H 'Authorization: Bearer %s' 'http://localhost:8081/api/v1/families/%s/today'\n", token, familyID)
}

func seedMed(ctx context.Context, pool db.Q, petID, userID, name, dose, sched, startedOn, endedOn, note string) {
	var medID string
	err := pool.QueryRow(ctx, `SELECT id FROM medications WHERE pet_id=$1 AND name=$2`, petID, name).Scan(&medID)
	if err == nil {
		return // 已存在
	}
	startedExpr := startedOn
	if startedExpr == "" {
		startedExpr = "CURRENT_DATE"
	}
	endedSQL := "NULL"
	args := []any{petID, name, dose, sched, note, userID}
	_ = endedSQL
	err = pool.QueryRow(ctx, fmt.Sprintf(`
		INSERT INTO medications (pet_id, name, dose, instructions, started_on, note, created_by_user_id)
		VALUES ($1,$2,$3,$4, %s, $5, $6) RETURNING id`, startedExpr), args...).Scan(&medID)
	exitOn(err)
	action := "started"
	if endedOn != "" {
		_, err = pool.Exec(ctx, fmt.Sprintf(`
			UPDATE medications SET ended_on = %s WHERE id = $1`, endedOn), medID)
		exitOn(err)
		action = "ended"
	}
	payload, _ := json.Marshal(map[string]string{"medication_id": medID, "action": action, "name": name})
	_, _ = pool.Exec(ctx, `
		INSERT INTO pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload, source)
		VALUES ($1,'medication', now(), $2, $3::jsonb, 'auto:med')`, petID, userID, payload)
}

func nullableSeedTime(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func randomTokenStr() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashHexStr(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

// plans 子命令：套餐限额的运行时管理（限额是数据，不是代码）。
//
//	planet-cli plans list --url ...
//	planet-cli plans set free --pets 3 --members 2 [--families N] [--storage-mb N] [--file-mb N] [--ai-monthly N]
//
// 注意：生产库的 plans/quota_configs 已对 planet_app（运行时角色）收写权，
// plans set 必须用 owner 连接串（--url "host=... user=planet_owner ..."）。
func cmdPlans(args []string) {
	flags, positional := splitArgs(args)
	if len(positional) < 1 {
		fmt.Fprintln(os.Stderr, "usage: planet-cli plans list|set ...")
		os.Exit(2)
	}
	switch positional[0] {
	case "list":
		cmdPlansList(flags)
	case "set":
		if len(positional) < 2 {
			fmt.Fprintln(os.Stderr, "usage: planet-cli plans set <key> [--families N --members N --pets N --storage-mb N --file-mb N --ai-monthly N]")
			os.Exit(2)
		}
		cmdPlansSet(positional[1], flags)
	default:
		fmt.Fprintln(os.Stderr, "usage: planet-cli plans list|set ...")
		os.Exit(2)
	}
}

func cmdPlansList(args []string) {
	fs := flag.NewFlagSet("plans list", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	_ = fs.Parse(args)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := db.NewPool(ctx, *url)
	exitOn(err)
	defer pool.Close()
	rows, err := pool.Query(ctx, `
		SELECT p.key, p.owned_families, p.members, p.active_pets, p.storage_bytes, p.file_bytes,
		       COALESCE((SELECT quota_limit FROM quota_configs q WHERE q.plan = p.key AND q.resource = 'ai_monthly'), 0),
		       p.updated_at
		FROM plans p ORDER BY p.key`)
	exitOn(err)
	defer rows.Close()
	fmt.Printf("%-8s %9s %8s %6s %12s %10s %10s  %s\n", "PLAN", "FAMILIES", "MEMBERS", "PETS", "STORAGE", "FILE", "AI/MONTH", "UPDATED")
	for rows.Next() {
		var k string
		var fam, mem, pets int
		var storage, file, ai int64
		var updated time.Time
		exitOn(rows.Scan(&k, &fam, &mem, &pets, &storage, &file, &ai, &updated))
		fmt.Printf("%-8s %9d %8d %6d %10dMB %8dMB %10d  %s\n",
			k, fam, mem, pets, storage>>20, file>>20, ai, updated.Local().Format("2006-01-02 15:04"))
	}
	exitOn(rows.Err())
}

func cmdPlansSet(key string, flags []string) {
	fs := flag.NewFlagSet("plans set", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	families := fs.Int("families", -1, "owned families limit")
	members := fs.Int("members", -1, "members per family")
	pets := fs.Int("pets", -1, "active pets per user")
	storageMB := fs.Int64("storage-mb", -1, "attachment storage per user (MB)")
	fileMB := fs.Int64("file-mb", -1, "max single file (MB)")
	aiMonthly := fs.Int64("ai-monthly", -1, "AI calls per user per month")
	_ = fs.Parse(flags)
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 32 {
		exitOn(fmt.Errorf("invalid plan key"))
	}
	provided := false
	sets := []string{"updated_at = now()"}
	vals := []any{key}
	add := func(col string, v any, flagVal any, isSet bool) {
		if isSet {
			provided = true
			vals = append(vals, v)
			sets = append(sets, fmt.Sprintf("%s = $%d", col, len(vals)))
		}
		_ = flagVal
	}
	add("owned_families", *families, families, *families >= 0)
	add("members", *members, members, *members >= 0)
	add("active_pets", *pets, pets, *pets >= 0)
	add("storage_bytes", *storageMB<<20, storageMB, *storageMB >= 0)
	add("file_bytes", *fileMB<<20, fileMB, *fileMB >= 0)
	if *aiMonthly >= 0 {
		provided = true
	}
	if !provided {
		exitOn(fmt.Errorf("nothing to set: provide at least one of --families/--members/--pets/--storage-mb/--file-mb/--ai-monthly"))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := db.NewPool(ctx, *url)
	exitOn(err)
	defer pool.Close()

	// 首次出现的新档位：以 free 默认值插入再应用修改（新档位 = 插行 + 发对应权益 key）
	var exists bool
	exitOn(pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM plans WHERE key=$1)`, key).Scan(&exists))
	if !exists {
		_, err := pool.Exec(ctx, `
			INSERT INTO plans (key, owned_families, members, active_pets, storage_bytes, file_bytes)
			VALUES ($1, 1, 2, 2, 52428800, 10485760)`, key)
		exitOn(err)
	}
	tag, err := pool.Exec(ctx,
		`UPDATE plans SET `+strings.Join(sets, ", ")+` WHERE key = $1`, vals...)
	exitOn(err)
	if tag.RowsAffected() == 0 {
		exitOn(fmt.Errorf("plan %q not updated", key))
	}
	// 事实源按资源分工（见 entitlements.PlanForEntitlement）：
	//   plans 列 = families/members/pets/storage/file 的唯一旋钮；
	//   quota_configs = ai_monthly 等 plans 表达不了的扩展资源。
	// 因此这里只同步 ai_monthly，不再给 pets/storage 双写造成第二事实源。
	setQuota := func(resource string, limit int64, enabled bool) {
		if !enabled {
			return
		}
		_, qerr := pool.Exec(ctx, `
			INSERT INTO quota_configs (plan, resource, quota_limit, updated_at)
			VALUES ($1,$2,$3,now())
			ON CONFLICT (plan, resource) DO UPDATE
			SET quota_limit = EXCLUDED.quota_limit, updated_at = now()`, key, resource, limit)
		exitOn(qerr)
	}
	setQuota("ai_monthly", *aiMonthly, *aiMonthly >= 0)
	fmt.Printf("plan %q updated (limits take effect immediately on new writes)\n", key)
}

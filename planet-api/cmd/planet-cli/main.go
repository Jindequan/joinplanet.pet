// planet-cli：迁移 / 建库 / 演示数据 / 套餐限额 等运维子命令。
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/joinplanet/planet-api/internal/platform/db"
	migrations "github.com/joinplanet/planet-api/migrations"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "migrate":
		cmdMigrate(os.Args[2:])
	case "db-ensure":
		cmdDBEnsure(os.Args[2:])
	case "demo-seed":
		cmdDemoSeed(os.Args[2:])
	case "plans":
		cmdPlans(os.Args[2:])
	case "purge-deleted":
		cmdPurgeDeleted(os.Args[2:])
	case "digest":
		cmdDigest(os.Args[2:])
	case "alerts":
		cmdAlerts(os.Args[2:])
	case "backup":
		cmdBackup(os.Args[2:])
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  planet-cli migrate up|status --url <database-url>
  planet-cli migrate down <n> --url <database-url> --allow-destructive   # dev/CI only; NEVER in production
  planet-cli db-ensure --admin-url <admin-url> --db <name>
  planet-cli demo-seed --url <database-url> [--email devin@planet.dev]
  planet-cli plans list|set --url <database-url>   # 套餐限额（运行时数据，改了即生效）
  planet-cli purge-deleted --url <database-url> [--retention-days 30] [--dry-run]
  planet-cli digest --url <database-url> --family <id> [--date YYYY-MM-DD] [--dry-run]   # 每日摘要核验/补发
  planet-cli alerts --url <database-url> --family <id>                                  # 异常预警核验
  planet-cli backup --url <database-url> --output-dir <dir> [--s3-uri s3://bucket/prefix] [--retention-days 14]`)
	os.Exit(2)
}

// splitArgs 把 --flag[=v] 从任意位置抽出（位置参数与 flags 可交错）。
// Go 标准库 flag 遇到第一个位置参数即停止解析——曾导致 `migrate up --url X`
// 的 --url 被静默忽略，连接串为空时 pgx 落到 PostgreSQL 默认的"用户名数据库"。
func splitArgs(args []string) (flags, positional []string) {
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			// `--flag value` 形式且下一个不是 flag：一并吃掉
			if !strings.Contains(a, "=") && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				i++
				flags = append(flags, args[i])
			}
			continue
		}
		positional = append(positional, a)
	}
	return flags, positional
}

// requireURL 拒绝空连接串：绝不静默回退到默认（用户名）数据库。
func requireURL(url string) string {
	if strings.TrimSpace(url) == "" {
		slog.Error("planet-cli", "err", "database url required: pass --url or set DATABASE_URL (refusing default-connection fallback)")
		os.Exit(1)
	}
	return url
}

func cmdMigrate(args []string) {
	fs := flag.NewFlagSet("migrate", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	// down 默认禁用：它是破坏性操作（会丢数据），仅本地开发/CI 验证可逆性时显式开启。
	// 生产回滚靠 pg_dump 备份恢复，绝不跑 migrate down（误跑会废库）。
	allowDestructive := fs.Bool("allow-destructive", false, "required to run 'migrate down' (dev/CI only; never in production)")
	flags, positional := splitArgs(args)
	_ = fs.Parse(flags)
	if len(positional) < 1 {
		usage()
	}
	target := requireURL(*url)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	switch positional[0] {
	case "up":
		applied, err := db.MigrateUp(ctx, migrations.FS, target)
		exitOn(err)
		if len(applied) == 0 {
			fmt.Println("migrations: already up to date")
			return
		}
		for _, m := range applied {
			fmt.Println("applied:", m)
		}
	case "down":
		if !*allowDestructive {
			slog.Error("migrate down is destructive and disabled by default",
				"hint", "pass --allow-destructive only in dev/CI; production rollback is via backup restore, not migrate down")
			os.Exit(1)
		}
		n := 1
		if len(positional) >= 2 {
			_, _ = fmt.Sscanf(positional[1], "%d", &n)
		}
		slog.Warn("migrate down: reverting schema (dev/CI only — never run against production)", "n", n)
		reverted, err := db.MigrateDown(ctx, migrations.FS, target, n)
		exitOn(err)
		for _, m := range reverted {
			fmt.Println("reverted:", m)
		}
	case "status":
		pool, err := db.NewPool(ctx, target)
		exitOn(err)
		defer pool.Close()
		current, err := db.CurrentVersion(ctx, pool)
		exitOn(err)
		latest, err := db.LatestVersion(migrations.FS)
		exitOn(err)
		fmt.Printf("database: %04d  embedded: %04d\n", current, latest)
		if current != latest {
			fmt.Println("status: PENDING (run: planet-cli migrate up)")
			os.Exit(1)
		}
		fmt.Println("status: up to date")
	default:
		usage()
	}
}

func cmdDBEnsure(args []string) {
	fs := flag.NewFlagSet("db-ensure", flag.ExitOnError)
	adminURL := fs.String("admin-url", os.Getenv("ADMIN_DATABASE_URL"), "admin connection (postgres db)")
	name := fs.String("db", "planet", "database name to create")
	_ = fs.Parse(args)
	admin := requireURL(*adminURL)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, admin)
	exitOn(err)
	defer conn.Close(ctx)

	var exists bool
	err = conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, *name).Scan(&exists)
	exitOn(err)
	if exists {
		fmt.Println("database exists:", *name)
		return
	}
	_, err = conn.Exec(ctx, `CREATE DATABASE `+quoteIdent(*name))
	exitOn(err)
	fmt.Println("database created:", *name)
}

func quoteIdent(s string) string {
	return `"` + s + `"`
}

func exitOn(err error) {
	if err != nil {
		slog.Error("planet-cli", "err", err)
		os.Exit(1)
	}
}

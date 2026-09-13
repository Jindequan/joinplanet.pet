package db

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// 迁移执行器：NNNN_name.up.sql / NNNN_name.down.sql，每个 up 在单事务内执行。
// 生产只允许 up；down 供开发与 CI 的 up→down→up 验证。

var (
	migRe  = regexp.MustCompile(`^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$`)
	schema = `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INT PRIMARY KEY,
		name       TEXT NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`
)

type Migration struct {
	Version int
	Name    string
	SQL     string // 对应方向的语句
}

func parseMigrations(f embed.FS) (ups []Migration, downs map[int]string, err error) {
	entries, err := fs.ReadDir(f, ".")
	if err != nil {
		return nil, nil, err
	}
	downs = map[int]string{}
	seen := map[int]string{}
	for _, e := range entries {
		m := migRe.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		v, _ := strconv.Atoi(m[1])
		body, rerr := f.ReadFile(e.Name())
		if rerr != nil {
			return nil, nil, rerr
		}
		if prev, dup := seen[v]; dup && prev != m[2] {
			return nil, nil, fmt.Errorf("migration %d has duplicate names %s/%s", v, prev, m[2])
		}
		seen[v] = m[2]
		if m[3] == "up" {
			ups = append(ups, Migration{Version: v, Name: m[2], SQL: string(body)})
		} else {
			downs[v] = string(body)
		}
	}
	sort.Slice(ups, func(i, j int) bool { return ups[i].Version < ups[j].Version })
	for _, u := range ups {
		if _, ok := downs[u.Version]; !ok {
			return nil, nil, fmt.Errorf("migration %04d (%s) missing .down.sql", u.Version, u.Name)
		}
	}
	return ups, downs, nil
}

// connectSimple 使用简单协议连接（单字符串多语句执行迁移）。
func connectSimple(ctx context.Context, url string) (*pgx.Conn, error) {
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	return pgx.ConnectConfig(ctx, cfg)
}

const migrationAdvisoryKey = "planet:schema-migrations"

func lockMigrations(ctx context.Context, conn *pgx.Conn) error {
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock(hashtext($1))`, migrationAdvisoryKey); err != nil {
		return err
	}
	return nil
}

func unlockMigrations(ctx context.Context, conn *pgx.Conn) {
	_, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock(hashtext($1))`, migrationAdvisoryKey)
}

// MigrateUp 应用全部未执行的 up 迁移，返回本次应用的版本名列表。
func MigrateUp(ctx context.Context, f embed.FS, url string) ([]string, error) {
	ups, _, err := parseMigrations(f)
	if err != nil {
		return nil, err
	}
	conn, err := connectSimple(ctx, url)
	if err != nil {
		return nil, err
	}
	defer conn.Close(ctx)
	if err := lockMigrations(ctx, conn); err != nil {
		return nil, fmt.Errorf("lock migrations: %w", err)
	}
	defer unlockMigrations(context.Background(), conn)

	if _, err = conn.Exec(ctx, schema); err != nil {
		return nil, fmt.Errorf("ensure schema_migrations: %w", err)
	}
	var applied []string
	for _, m := range ups {
		var appliedName string
		err = conn.QueryRow(ctx, `SELECT name FROM schema_migrations WHERE version=$1`, m.Version).Scan(&appliedName)
		if errors.Is(err, pgx.ErrNoRows) {
			err = nil
		} else if err != nil {
			return nil, err
		}
		if appliedName != "" && appliedName != m.Name {
			return nil, fmt.Errorf("migration version %04d is recorded as %q but code expects %q; refusing to continue", m.Version, appliedName, m.Name)
		}
		if appliedName != "" {
			continue
		}
		err = ConnInTx(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, m.SQL); err != nil {
				return fmt.Errorf("migration %04d_%s: %w", m.Version, m.Name, err)
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations(version, name) VALUES($1,$2)`, m.Version, m.Name)
			return err
		})
		if err != nil {
			return nil, err
		}
		applied = append(applied, fmt.Sprintf("%04d_%s", m.Version, m.Name))
	}
	return applied, nil
}

// MigrateDown 回滚最近 n 个已应用迁移（仅开发/CI）。
func MigrateDown(ctx context.Context, f embed.FS, url string, n int) ([]string, error) {
	_, downs, err := parseMigrations(f)
	if err != nil {
		return nil, err
	}
	conn, err := connectSimple(ctx, url)
	if err != nil {
		return nil, err
	}
	defer conn.Close(ctx)
	if err := lockMigrations(ctx, conn); err != nil {
		return nil, fmt.Errorf("lock migrations: %w", err)
	}
	defer unlockMigrations(context.Background(), conn)

	rows, err := conn.Query(ctx, `SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT $1`, n)
	if err != nil {
		return nil, err
	}
	type applied struct {
		v int
		n string
	}
	var list []applied
	for rows.Next() {
		var a applied
		if err = rows.Scan(&a.v, &a.n); err != nil {
			rows.Close()
			return nil, err
		}
		list = append(list, a)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}

	var reverted []string
	for _, a := range list {
		sqlText, ok := downs[a.v]
		if !ok {
			return nil, fmt.Errorf("no down migration for %04d", a.v)
		}
		err = ConnInTx(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, sqlText); err != nil {
				return fmt.Errorf("down %04d_%s: %w", a.v, a.n, err)
			}
			_, err := tx.Exec(ctx, `DELETE FROM schema_migrations WHERE version=$1`, a.v)
			return err
		})
		if err != nil {
			return nil, err
		}
		reverted = append(reverted, fmt.Sprintf("%04d_%s", a.v, a.n))
	}
	return reverted, nil
}

// LatestVersion 返回嵌入迁移的最高版本号；用于 /readyz 校验。
func LatestVersion(f embed.FS) (int, error) {
	ups, _, err := parseMigrations(f)
	if err != nil {
		return 0, err
	}
	if len(ups) == 0 {
		return 0, errors.New("no migrations embedded")
	}
	return ups[len(ups)-1].Version, nil
}

// CurrentVersion 返回数据库当前迁移版本（未迁移返回 0）。
func CurrentVersion(ctx context.Context, pool Q) (int, error) {
	var v int
	err := pool.QueryRow(ctx, `SELECT COALESCE(max(version), 0) FROM schema_migrations`).Scan(&v)
	return v, err
}

// ValidateCurrent checks every embedded migration, not just max(version).
// A database with a hole (or a reused version number) must never pass the
// readiness probe merely because its highest version looks current.
func ValidateCurrent(ctx context.Context, f embed.FS, pool Q) error {
	ups, _, err := parseMigrations(f)
	if err != nil {
		return err
	}
	for _, m := range ups {
		var name string
		err := pool.QueryRow(ctx, `SELECT name FROM schema_migrations WHERE version = $1`, m.Version).Scan(&name)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("migration %04d_%s is not applied", m.Version, m.Name)
		}
		if err != nil {
			return err
		}
		if name != m.Name {
			return fmt.Errorf("migration version %04d is recorded as %q but code expects %q", m.Version, name, m.Name)
		}
	}
	return nil
}

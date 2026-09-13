// Package db 提供连接池与事务助手。查询接口 Q 定义于 internal/contracts（跨模块契约）。
package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
)

// Q 是 contracts.Q 的别名（pool 与 tx 均满足）。
type Q = contracts.Q

// NewPool 创建受控连接池（1G 服务器：MaxConns=8，见 BACKEND-DESIGN §12.1）。
func NewPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 8
	// PostgreSQL timestamptz is stored as an instant, but its text/binary
	// decoding is session-sensitive. Make every application connection UTC;
	// civil display timezones are carried explicitly by Family/CareRule.
	cfg.ConnConfig.RuntimeParams["TimeZone"] = "UTC"
	return pgxpool.NewWithConfig(ctx, cfg)
}

// InTx 在事务内执行 fn；fn 返回错误即回滚。
func InTx(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) error {
	// Writes lock more than one aggregate in a few lifecycle paths (pet and
	// family, or family and quota). PostgreSQL can correctly detect a deadlock
	// or serialization conflict even when every individual query is correct.
	// Retry the whole transaction, never a single statement, so callers cannot
	// accidentally apply a side effect twice inside a partially rolled-back
	// unit of work.
	for attempt := 0; attempt < 3; attempt++ {
		tx, err := pool.Begin(ctx)
		if err != nil {
			if !retryableTxError(err) || attempt == 2 {
				return err
			}
			if err := backoff(ctx, attempt); err != nil {
				return err
			}
			continue
		}
		if err := fn(tx); err != nil {
			_ = tx.Rollback(ctx)
			if !retryableTxError(err) || attempt == 2 {
				return err
			}
			if err := backoff(ctx, attempt); err != nil {
				return err
			}
			continue
		}
		if err := tx.Commit(ctx); err != nil {
			if !retryableTxError(err) || attempt == 2 {
				return err
			}
			if err := backoff(ctx, attempt); err != nil {
				return err
			}
			continue
		}
		return nil
	}
	return errors.New("transaction retry exhausted")
}

func retryableTxError(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && (pgErr.Code == "40P01" || pgErr.Code == "40001")
}

func backoff(ctx context.Context, attempt int) error {
	d := time.Duration(attempt+1) * 10 * time.Millisecond
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// ConnInTx 与 InTx 相同，但用于普通 *pgx.Conn（迁移执行器）。
func ConnInTx(ctx context.Context, conn *pgx.Conn, fn func(tx pgx.Tx) error) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

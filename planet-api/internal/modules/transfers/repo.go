// Package transfers：宠物转移（B10，决策 D10）——源圈 owner 发起 + 目标圈 owner 接受的双同意流。
// 接受事务内：改 Pet 归属 → 撤销全部外部分享 → 记 auto:transfer 事件（幂等 dedupe）。
package transfers

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

type Transfer struct {
	ID              string     `json:"id"`
	PetID           string     `json:"pet_id"`
	PetName         string     `json:"pet_name"`
	PetArchived     bool       `json:"pet_archived"`
	FromFamilyID    string     `json:"from_family_id"`
	FromFamilyName  string     `json:"from_family_name"`
	ToFamilyID      string     `json:"to_family_id"`
	ToFamilyName    string     `json:"to_family_name"`
	Status          string     `json:"status"`
	CreatedByUserID *string    `json:"created_by_user_id,omitempty"`
	DecidedByUserID *string    `json:"decided_by_user_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	DecidedAt       *time.Time `json:"decided_at,omitempty"`
}

// 哨兵错误：上层映射为契约错误码。
var (
	ErrPendingExists = errors.New("pending transfer already exists")
	ErrNotPending    = errors.New("transfer not pending")
)

// transferCols 用于带 JOIN 的 SELECT（别名合法）。pet_archived 让接受方
// 在列表里直接识别纪念档案转移，无需二次拉取宠物。
const transferCols = `t.id, t.pet_id, p.name, (p.status = 'archived'), COALESCE(t.from_family_id::text,''),
	COALESCE((SELECT name FROM families WHERE id = t.from_family_id AND deleted_at IS NULL), ''),
	COALESCE(t.to_family_id::text,''), COALESCE((SELECT name FROM families WHERE id = t.to_family_id AND deleted_at IS NULL), ''), t.status,
	t.created_by_user_id, t.decided_by_user_id, t.created_at, t.decided_at`

// returningCols 用于 INSERT/UPDATE 的 RETURNING：不能用别名；宠物名与归档态用标量子查询。
const returningCols = `id, pet_id, (SELECT name FROM pets WHERE id = pet_transfers.pet_id),
	EXISTS(SELECT 1 FROM pets WHERE id = pet_transfers.pet_id AND status = 'archived'),
	COALESCE(from_family_id::text,''), COALESCE((SELECT name FROM families WHERE id = pet_transfers.from_family_id AND deleted_at IS NULL), ''),
	COALESCE(to_family_id::text,''), COALESCE((SELECT name FROM families WHERE id = pet_transfers.to_family_id AND deleted_at IS NULL), ''), status,
	created_by_user_id, decided_by_user_id, created_at, decided_at`

func scanTransfer(scan func(dest ...any) error) (Transfer, error) {
	var t Transfer
	err := scan(&t.ID, &t.PetID, &t.PetName, &t.PetArchived, &t.FromFamilyID, &t.FromFamilyName, &t.ToFamilyID, &t.ToFamilyName, &t.Status,
		&t.CreatedByUserID, &t.DecidedByUserID, &t.CreatedAt, &t.DecidedAt)
	return t, err
}

func (r *Repo) Create(ctx context.Context, q db.Q, petID, from, to string, createdBy *string) (Transfer, error) {
	var fromArg any = from
	if from == "" {
		fromArg = nil
	}
	row := q.QueryRow(ctx, `
		INSERT INTO pet_transfers (pet_id, from_family_id, to_family_id, status, created_by_user_id)
		VALUES ($1, $2, $3, 'pending', $4)
		ON CONFLICT (pet_id) WHERE status = 'pending' AND deleted_at IS NULL DO NOTHING
		RETURNING `+returningCols,
		petID, fromArg, to, createdBy)
	t, err := scanTransfer(row.Scan)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrPendingExists
	}
	return t, err
}

func (r *Repo) Get(ctx context.Context, q db.Q, id string) (Transfer, error) {
	row := q.QueryRow(ctx, `SELECT `+transferCols+`
		FROM pet_transfers t JOIN pets p ON p.id = t.pet_id WHERE t.id = $1`, id)
	return scanTransfer(row.Scan)
}

func (r *Repo) GetForUpdate(ctx context.Context, q db.Q, id string) (Transfer, error) {
	row := q.QueryRow(ctx, `SELECT `+transferCols+`
		FROM pet_transfers t JOIN pets p ON p.id = t.pet_id WHERE t.id = $1 FOR UPDATE`, id)
	return scanTransfer(row.Scan)
}

// Decide 原子转移状态：仅 PENDING 可决出。
func (r *Repo) Decide(ctx context.Context, q db.Q, id, status, decidedBy string) (Transfer, error) {
	row := q.QueryRow(ctx, `
		UPDATE pet_transfers
		SET status = $2, decided_by_user_id = $3, decided_at = now()
		WHERE id = $1 AND status = 'pending' AND deleted_at IS NULL
		RETURNING `+returningCols,
		id, status, decidedBy)
	t, err := scanTransfer(row.Scan)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotPending
	}
	return t, err
}

func (r *Repo) ListForFamily(ctx context.Context, q db.Q, familyID, direction string) ([]Transfer, error) {
	col := "to_family_id"
	if direction == "outgoing" {
		col = "from_family_id"
	}
	rows, err := q.Query(ctx, `
		SELECT `+transferCols+`
		FROM pet_transfers t JOIN pets p ON p.id = t.pet_id
		WHERE t.`+col+` = $1 AND t.deleted_at IS NULL AND p.deleted_at IS NULL
		ORDER BY (t.status = 'pending') DESC, t.created_at DESC`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Transfer{}
	for rows.Next() {
		t, err := scanTransfer(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

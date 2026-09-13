// Package migrations embeds the clean schema baseline and forward migrations.
// 规则见 docs: BACKEND-DESIGN §2.1 —— 只允许通过 migration 改结构，服务运行时零 DDL。
// Rebuilds start from 0001_initial; production rollback is restore-from-backup.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS

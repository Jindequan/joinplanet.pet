# v1.1.1 体检收口批施工单（2026-09-30 下午）

依据：FULL-SYSTEM-AUDIT-2026-09-30（P1×1/P2×9/P3×13 + UI 执法 3/机会 8）。founder 长期令「主动推进、做完善做安全」→ A/B 组全量 + C 组本体代裁。Codex 门禁仍 429，欠账维持（本批发现本身经五路盲审+本体亲核双重门）。

## 本体代裁默认（可推翻清单，汇报时列）

| # | 裁定 |
|---|---|
| D1 | L106+L115+O5 合并修法：**删 activation ready 拦截**，改为 Today 首渲染一次性 gate——直接以 `visible=true` 开 InviteSheet（无中间屏、无新概念标题），target=本人为 owner 且 member_count===1 的第一个家庭，不满足=视为 done 永不弹；kv 标记复用；`invite-step.tsx` 与 `activation.inviteStepTitle` 键删除 |
| D2 | L107 修法取「**锁全部本人在册宠行后重跑守卫**」而非仅 EXISTS 条件——只加 EXISTS 会让并发翻 active 的宠在删除继续后被落下成无主活宠，重跑守卫 409 才闭合 |
| D3 | L108：归档与暂停同口径关规则（复用 RuleClosedByPause 的标记机制，新增 archive 动作标记），恢复分支见标记即 re-arm 自今日；自然到期 legacy 路径不动 |
| D4 | L109：恢复挂药计划=409 新码 `MEDICATION_ENDED`，前端 errors.ts 映射照实短文案（指向先处理用药） |
| D5 | L114：移交后给继任者发通知，**载荷契约钉死**：kind=`ownershipTransfer`，data `{petId, petName}`，route surface=`pet` → `/pets/{petId}`；lifecycle 自持事务，InTx 返回后直接 NotifyUser（无需 petshares 式提交探测） |
| D6 | UI② 弹层双钮：**同高=主确认档**（temporary-care/skip-dialog/schedule-adjustment 三处主确认现值为准），次钮降同高、variant 保层次；临时照护页 :249 的「W3 次级=featured」注释随本裁废止并注释留痕 |
| D7 | L111 S2N：**做**，但 scope 收敛——consent-revoked=撤该 sub 全部会话+推送令牌；account-delete=只撤会话+结构化日志留 ops 追踪，**不**自动触发数据删除（删号有自己的守卫流程，Apple 侧事件不绕过） |
| D8 | L121 前置调查：outbox 粒度若非 per-recipient 则不做（会重发已成功 token 造重复推送），登记跳过 |
| D9 | L125 不改代码（信任模型登记项）；L112=founder 手工（服务器 systemctl + R2 控制台），本批只在汇报给操作指引 |

## 波次与文件所有权（互不相交才并行）

| 波次 | 仓库 | 任务 | 文件所有权 |
|---|---|---|---|
| W1a | planet-api | L107（锁+重跑守卫）、L108（归档关规则+恢复 re-arm）、L109（409 MEDICATION_ENDED 新码）、L113（archived 只迁 active），逐项测试 | `internal/modules/tasks/**`、`internal/modules/lifecycle/**`、错误注册表 |
| W1b | planet-api | L110（apple 限流 `auth_apple_ip_hour` 30/h）、L111（S2N 端点，D7 scope）、L114 后端（D5 载荷）、L117/118（迁移 0034 两个 partial 索引）、L119（struct tag→requested_by）、L121（按 D8 先调查）、L122/123/124（脚本卫生） | `internal/modules/identity/**`、`internal/modules/petshares/repo.go`、`internal/modules/notify/**`、`migrations/`、`internal/app/app.go` 公开路径段、`deploy/`、`.github/workflows/` |
| W2a | APP | L106+L115+O5（D1 合并修法）、O1（激活 intro 卡删除）、activation-invite e2e 重写+Today gate 新用例 | `src/features/activation/**`、`src/core/activation/invite-step-flag.ts`、`src/features/today/screen.tsx`、`src/i18n/*/activation.json`、对应 e2e |
| W2b | APP | O2/O3 改词、UI① rowTitle、UI② 弹层双钮（D6）、UI③+O6 Records 页头、体重单位、O4 chevron、O7 category 主层，受影响 e2e 断言同步 | `today-lists.tsx`、`today-skip-dialog.tsx`、`temporary-care.tsx`、`schedule-adjustment.tsx`、`pets/screen.tsx`、`timeline/screen.tsx`、`timeline/composer.tsx`、`pets/care-plan-form.tsx`、`today/cards.tsx`、`src/i18n/*/today.json`、`src/i18n/*/timeline.json`、对应 e2e |
| W2c | APP | L116（signOut/deleteAccount 清票据台账）、L120（respond 失效 activationSummary）、L114 前端（contract kind=ownershipTransfer+surface=pet+session-provider 分支）、L109 前端面（errors.ts 映射 MEDICATION_ENDED 五语） | `core/media/photo-upload.ts`、`account/screen.tsx`、`core/providers/session-provider.tsx`、`core/notifications/contract.ts`、`core/api/errors.ts`、`care-requests/pet-share-requests.tsx`、`src/i18n/*`（errors 域新增键） |

i18n 冲突红线：W2a=删 activation 键、W2b=改 today/timeline 键、W2c=新增 errors 键——各域单写者。e2e helper 只追加+申报。**代理一律禁 git 写、禁跑 playwright/起 server；planet-api 代理可 go build/vet/定向 go test，APP 代理可 typecheck/check:i18n/check:design/eslint。**

## 验收门（集成阶段本体执行）

四门+e2e 全量+go test 全量→code-reviewer 复审→分波次 commit+push→台账销号（L106-L125 按落点标 🔧）→汇报含可推翻默认清单。

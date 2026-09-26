# PLANET 技术事实源

状态：2026-09-14

本文是代码组织、数据库、业务边界、API、前端数据流、运行和验证方式的唯一技术事实源。产品目标和范围以 [PRODUCT.md](PRODUCT.md) 为准；原生 App 迁移约定以 [APP/docs/PLANET_APP_DESIGN_SYSTEM.md](../APP/docs/PLANET_APP_DESIGN_SYSTEM.md) 为准；当前可测试的 Web 与原生入口统一为 `APP/`。

## 1. 唯一真相与变更边界

当前只维护三类规范：

| 内容 | 唯一来源 |
|---|---|
| 产品目标、业务流程、范围、验收 | `docs/PRODUCT.md` |
| **地基形态、延伸接入、API 稳定面** | **`docs/FOUNDATION.md`** |
| 数据、API、代码分层、前后端数据流、运行验证 | `docs/ARCHITECTURE.md` |
| 原生 App 迁移说明与组件约束 | `APP/docs/PLANET_APP_DESIGN_SYSTEM.md` |
| Web 测试入口（Expo Web） | `APP/` |

`README` 只做入口和启动索引；`planet-api/README.md` 只做后端仓库运行说明；研究、营销、商业和 archive 目录不覆盖以上事实源。出现冲突时，按上表处理。视觉唯一锚点为 founder Pricing 参考图（2026-09-16 重锚定），`mobile-v3` 为历史参考（只读对照，不再约束现行配色/形态——2026-09-22 体检 P2-7 统一口径）；生产部署规划为 `app.joinplanet.pet`，营销与分享/邀请预览页由 `www.joinplanet.pet` 承担。

## 2. Workspace 与运行时

```text
joinplanet.pet/
├─ docs/               跨仓产品与技术事实源
├─ APP/                Expo + React Native 原生 App（重建中）
├─ mobile-v3/          历史视觉参考（只读，不约束现行配色/形态）
├─ planet-api/         Go HTTP API + PostgreSQL
├─ www.joinplanet.pet/ 营销站和匿名分享查看页
└─ scripts/            跨仓启动、状态和日志脚本
```

三个代码目录是独立 Git 仓库；根仓库只追踪文档和跨仓脚本。

本地默认：`planet-api → 0.0.0.0:8081`；`APP → Expo Web :5173 / Simulator Metro :8082 / iOS Simulator / Android Emulator`。仓库脚本不自动连接或安装实体设备。

生产的 `api.joinplanet.pet` 同时承载两类后端，必须由 Caddy 按路径分流：`/api/v1/*`、
`/healthz`、`/readyz` → `planet-api:8081`；Landing 的 `/progress`、`/checkout`、
`/intake`、`/email-capture`、`/webhook`、`/membership/claim` → `lemon-webhook:8080`。
部署 App API 时不能把整个域名直接反代到 8081，否则会切断收款和 webhook。

```bash
./scripts/dev.sh start all web
./scripts/dev.sh start all simulator
./scripts/dev.sh status
./scripts/dev.sh logs backend
./scripts/dev.sh stop all
```

`./scripts/dev.sh status` 以实际监听端口和进程工作目录为准，会自动修复过期的 PID/模式文件；`stop` 会先移除 `ios.sh` 可能提交的同用户 launchd 作业，再停止监听进程，避免旧 Metro/API 被系统重新拉起。重复执行 `start all simulator` 只复用现有的 `APP` Metro，不会创建第二个端口。

脚本负责进程、health check、CORS 和 App API 地址。不要让页面、脚本或文档再引入第二套旧服务地址。

## 3. 请求与代码分层

```text
Native App / Share Viewer
        │ HTTPS + Bearer（匿名分享使用一次性 token）
        ▼
HTTP middleware
recover → request id → access log → CORS → auth → handler
        ▼
Application service（事务、权限、配额、幂等、状态迁移）
        ▼
Repository（SQL、锁、分页、软删除过滤）
        ▼
PostgreSQL
```

后端目录：

```text
planet-api/
├─ cmd/planet-api/       HTTP 服务入口
├─ cmd/planet-cli/       migration、建库、demo、运维命令
├─ internal/platform/    config、db、httpx、email、clock
├─ internal/contracts/   跨模块公开类型与接口
├─ internal/modules/
│  ├─ identity/          User、验证码、Session、Preference
│  ├─ entitlements/      Plan、Quota、Subscription、Usage
│  ├─ families/          Family、成员、邀请、治理
│  ├─ pets/              Pet、owner、共享、delegation、生命周期
│  ├─ meds/              Medication 及其业务事件
│  ├─ tasks/             Care Plan、Rule、Occurrence、Today
│  ├─ timeline/          Pet Event
│  ├─ transfers/         Pet 转移状态机
│  ├─ sharing/           Pet 级临时分享
│  ├─ notify/            push token、通知偏好、发送调度
│  ├─ digest/            每日摘要
│  ├─ alerts/            请求时计算的照护异常
│  └─ lifecycle/         导出、恢复、账号删除
├─ internal/app/         唯一路由和中间件组装点
└─ migrations/           版本化 SQL
```

每个业务模块遵循 `domain/types → service → repository → http/DTO`。HTTP 不碰 SQL；模块之间只经 `internal/contracts` 的公开接口和类型依赖；不得跨模块直接调用对方 repository。生产 API 角色无 DDL 权限，只有 CLI/发布步骤执行 migration。

## 3.1 地基与延伸（形态冻结）

**地基（L0–L2）** 模块：`identity`、`families`、`pets`、`tasks`、`timeline`、`meds`。  
其 domain 表、状态机与 §7 API 路径 **不得因延伸需求改形**；只允许向前兼容扩展。

**延伸（L3–L4）** 模块：`sharing`、`digest`、`alerts`、`notify`、未来 `handoffs` 等。  
延伸模块 **只能**：

1. 通过 `internal/contracts` 或 HTTP 调用地基 service（RequirePet、Today 查询、Event 写入）。
2. 维护 **自身扩展表**（如 `share_links`、值班元数据），且不得复制 Occurrence/Event 语义。
3. 聚合只读输出（统计、快照 PDF）；默认不写地基，写则必须走 Pet Event / 既有 POST。

完整接口清单与准入规则见 [FOUNDATION.md](FOUNDATION.md)。

## 4. 数据库唯一基线

唯一完整 schema baseline 是 [`planet-api/migrations/0001_initial.up.sql`](../planet-api/migrations/0001_initial.up.sql)。新库直接执行该文件；一张表只声明一次最终 `CREATE TABLE`，seed 也在同一 baseline 内。生产库只执行 forward migration，不执行 `dropdb`、migration down 或手工补列。

所有业务表统一拥有 `created_at`、`updated_at`、`deleted_at`；时间字段使用 PostgreSQL `timestamptz`，应用连接池设置为 UTC。`date` 和 `time without time zone` 只表示 Care Rule 的民用日程字段；生成 Occurrence 时结合计划的 IANA `timezone`，最后存成 UTC `due_at`。

### 4.1 表按职责分类

| 层 | 表 | 业务职责 |
|---|---|---|
| 身份与偏好 | `users`、`user_preferences` | 人、个人默认展示条件 |
| Family 关系 | `families`、`family_memberships`、`family_invitations` | 共享关系、成员角色、邀请和家庭治理 |
| Pet 资产与访问 | `pets`、`pet_ownerships`、`family_pet_links`、`pet_user_delegations`、`pet_transfers` | Pet 本体、owner 历史、Family 可见边、临时授权和转移 |
| 照护业务 | `medications`、`care_plans`、`care_rules`、`care_plan_assignments`、`care_occurrences`、`pet_events` | 长期照护、规则、责任人、具体执行和事实记录 |
| 对外分享 | `share_links` | Pet 级有时效只读分享，保存 token hash |
| 身份基础设施 | `auth_challenges`、`sessions`、`auth_nonce_claims` | 验证码挑战和登录会话；`auth_nonce_claims`（0034）存 Apple raw_nonce 的一次性消费哈希（L56 防重放：15 分钟窗口内拦截重复使用，purge-deleted 固定 2 天清行，随账号硬删 FK 级联） |
| 可靠性基础设施 | `idempotency_keys`、`notification_outbox`、`audit_records` | 重试去重、失败通知补发、治理审计；不是业务主体 |
| 主动服务基础设施 | `push_tokens`、`job_runs`、`auth_rate_limits` | 推送设备、调度租约和认证限流 |
| 权益配置 | `plans`、`quota_configs`、`subscriptions`、`entitlements`、`user_usage` | User 级套餐、额度、订阅和原子用量；手动权益的收回=软删 `entitlements.deleted_at`（L3 收口批：全部权益读面统一 `deleted_at IS NULL`，`planet-cli entitlements revoke` 唯一收回入口，不触碰订阅） |

静态配置、业务主体、关系、规则、动态事实和基础设施必须按上述职责区分。不能把 `audit_records` 当业务历史，不能用 `job_runs` 代替规则，不能把 `idempotency_keys` 当订单或业务记录。

### 4.2 核心关系

```text
User ──< FamilyMembership >── Family
Pet  ──< FamilyPetLink     >── Family
User ──< PetOwnership      >── Pet
User ──< PetUserDelegation >── Pet
Pet  ──< CarePlan ──< CareRule
CarePlan ──< CarePlanAssignment
CarePlan + CareRule ──< CareOccurrence ──< PetEvent
Pet ──< Medication / PetEvent / ShareLink
```

### 4.3 重要约束

- Pet 的当前 owner 只能由 `pet_ownerships` 的有效记录推导；不能新建 `pets.current_owner_user_id` 作为第二个事实源。
- Family-Pet 是否可见只能由有效 `family_pet_links` 表达；Family 不通过 `pets.family_id` 拥有 Pet。
- `user_preferences.default_family_id/default_pet_id` 不能用于授权；无效偏好只回退到可访问对象。
- Care Plan 是长期意图，Care Rule 是可版本化规则，Care Occurrence 是一次执行；不能用 Today 查询临时拼出没有唯一键的执行记录。
- Pet Event 是事实记录；由完成 Care Occurrence 自动产生的事件必须带来源和 occurrence 关联，重复请求不能重复写入。
- 所有外键使用明确的 `RESTRICT`、`CASCADE` 或 `SET NULL` 语义；软删除时由 service 关闭关系，不能依赖数据库级联替代业务流程。
- **时间存储铁法（founder 2026-09-26 裁决）**：数据库永远记录 UTC（`timestamptz` 绝对时间）；时区概念只存在于服务层（物化、日界、逾期判定按 Family 时区计算）与用户层（显示格式化）。家庭时区迁移只改写 `care_rules.timezone` 的解释基准（`families/service.go` Update 同事务迁移），已物化 occurrence 的 due_at 是既成事实不重算；逾期判定唯一口径=Family 时区次日零点（`tasks/repo.go MarkMissedBeforeFamilyAt`，边界由 `dateAt(date, familyTZ)` 计算，禁止用 UTC 日界替代）。

## 5. 权限与资产安全

### 5.1 Pet 访问判定

用户访问 Pet 的充分条件为以下任一项：

1. 存在有效 `pet_ownerships`，用户是当前 owner。
2. 存在有效 `family_memberships`，用户属于某 Family，且该 Family 与 Pet 存在有效 `family_pet_links`。
3. 存在未过期、未撤销的 `pet_user_delegations`。

所有 Pet 资源先经过统一的 `pets.Service.RequirePet`；新模块不得自行拼接 owner、Family 或 delegation 查询。资源不存在和无访问权统一返回 404，避免泄露资源存在性；访问存在但角色不足返回 403，归档 Pet 的写入返回 409。

### 5.2 变更必须是完整事务

创建 Pet：检查 User 配额，创建 Pet、owner 记录和初始 Family-Pet link；配额预留与资源写入同一事务。

创建 Care Plan：创建 Plan、Rule、默认 Assignment，并按规则生成首个可执行 Occurrence；任何一步失败都不能留下半个计划。

完成 Occurrence：锁定该 Occurrence，校验当前状态和用户能力，写入完成人/时间/备注，幂等地产生 Pet Event。需要通知时先直接尝试投递；提供商失败则写入 `notification_outbox`，由调度器租约领取并退避重试。重复完成返回权威状态，不重复扣配额、不重复写事件。

删除或归档：业务数据先软删除/改变状态，关闭后续关系和执行；物理清理必须是独立的、可审计的保留策略，不能由普通 API 直接级联销毁 Pet 历史。

账号注销：共享照护请求、批次和事件保留责任链，但用户邮箱与姓名匿名化为“已删除账号”；会话、验证码、邮箱限流、设备令牌、偏好和幂等响应等账号专属数据在同一事务内清理。客户端同步清理该用户的离线队列、范围和 Today 快照。

所有创建型 POST，以及会轮换邀请码/分享秘密的 POST，都要求 8–200 字符的 `Idempotency-Key`。同一用户、同一命令、同一作用域和同一请求 hash 才能复用结果；同 key 不同 payload 必须拒绝。带秘密响应的命令必须把可安全重放的响应片段绑定在幂等记录上，不能在重试时重新生成秘密。幂等表只解决网络重试和并发占用，不是业务领域对象。

时间线手动事实的 DELETE 也支持可选 `Idempotency-Key`。移动端默认发送请求键；删除和幂等记录在同一事务内提交，因此第一次 204 丢失后的同键重试仍返回 204，不会把已成功的软删除误报为 404。旧客户端不带请求键时继续走原有一次性删除路径。

照护计划 DELETE（归档语义）和未来开放任务/交接请求收束也支持可选 `Idempotency-Key`。归档、取消未来任务、关闭请求、审计和幂等绑定在同一事务内完成；重复重试只返回成功结果，不重复写审计记录。

成员主动退出 Family 的 POST 同样支持可选请求键。退出、责任链收束、审计和幂等绑定在同一事务内完成；当前客户端默认发送请求键，重复重试只回放成功结果。

删除 Family 与删除 Pet 也支持可选请求键。Family/Pet 的软删除、关联状态收束、配额更新和审计全部成功后才绑定请求键，避免丢失响应时重复触发生命周期副作用。

## 6. 照护与 Today 算法

1. 读取活跃 Care Plan 和有效 Care Rule。
2. 按 Rule 的 `effective_from/effective_to`、frequency、日期条件和 IANA timezone 计算业务日。
3. 将 `local_time` 结合 timezone 转换为 UTC `due_at`；夏令时歧义按规则时区的本地化时间语义处理——春令时缺口时刻（墙钟不存在）向后平移到过渡后的第一个有效时刻（如 02:30→03:30），秋令时歧义墙钟取较早一次（实现见 `planet-api` tasks/service.go `dueAt`；`care_rules.dst_policy` 列当前不被读取，其 CHECK 枚举为未实现的保留值）。（2026-09-22 勘误，体检 P3：原「按 DST policy 处理」引用了无定义的 policy 名词，按代码实况改写。）
4. 唯一去重 = `uq_care_occurrences_rule_date`（`care_rule_id, due_date`）partial unique（`WHERE deleted_at IS NULL`）；`occurrence_key` 为冗余标识列，无约束。写入带 rule snapshot、title snapshot、timezone 和 due date 的 Occurrence。（2026-09-22 勘误，体检 P3：原「用 occurrence_key 做唯一去重」与实际约束载体不符。）
5. Today 只查询当前日期范围内的 Occurrence；Family 过滤先求该用户可访问的 Pet 集合，Pet 过滤只查询该 Pet。
6. 到期未执行的 Occurrence 才能进入 missed 判定；完成、跳过和撤销遵循状态机，不通过客户端直接改状态。
7. 完成或跳过后写入对应 Pet Event；撤销时恢复 Occurrence 状态并写入撤销事实，历史不被删除。

Today 本身不落库为领域对象；它是 `User + Filter + Accessible Pets + business date` 的应用查询。通知、摘要和异常预警都消费 Occurrence/事件，不反向改变 Care Plan 的定义。

## 7. API 约定

根路径为 `/api/v1`；认证 API 使用 Bearer Session。以下是当前实现的资源边界：

```text
身份：
POST   /auth/request-code
POST   /auth/verify-code
DELETE /auth/session
GET/PATCH /me
GET/PATCH /me/preferences
GET    /me/usage

Family：
POST /families                 POST /families/join
GET  /families                 GET  /families/{id}
PATCH /families/{id}           GET  /families/{id}/pets
POST /families/{id}/invite/refresh
POST /families/{id}/transfer
DELETE /families/{id}/members/{userId}
POST /families/{id}/leave      DELETE /families/{id}
POST /families/{id}/restore

Pet：
POST /families/{id}/pets       GET /pets
GET /pets/{id}                 PATCH /pets/{id}/record        POST /pets/{id}/archive|unarchive
DELETE /pets/{id}               POST/DELETE /pets/{id}/families[/{family_id}]
GET /pets/{id}/export           # 完整可携带档案导出；仅当前 owner，单读事务（2026-09-22 补登记，体检 P2-6）
GET/POST /pets/{id}/access-grants
DELETE /pets/{id}/access-grants/{grant_id}
# 预留能力：无产品入口，MVP 不承诺（founder 2026-09-22 裁决）。API 保留，
# 客户端不得依赖。
POST /pets/{id}/transfer

Care：
POST/GET /pets/{id}/care-plans  PATCH/DELETE /care-plans/{id}
GET/PUT/DELETE /care-plans/{id}/assignments[/{user_id}]；POST /care-plans/{id}/assignments/{user_id}/move 调整备用顺序
POST /care-tasks/{id}/complete
GET /today?family_id=...|pet_id=...

Pet facts and sharing：
POST/GET /pets/{id}/timeline    PATCH/DELETE /timeline-events/{id}
POST/GET /pets/{id}/medications PATCH/DELETE /medications/{id}
POST /medications/{id}/stop     POST/GET /pets/{id}/shares
DELETE /shares/{id}             GET /shares/{token}  # 仅此读取端点允许匿名
```

`DELETE /shares/{id}` 和 `DELETE /medications/{id}` 接受可选 `Idempotency-Key`；客户端默认生成请求键，删除状态、关联事实清理、审计记录和重试绑定在同一事务内，丢失 204 响应后重试仍返回成功。

`/pets/{id}/tasks`、`/tasks/{id}`、`/tasks/{id}/logs`、`GET /families/{id}/today`、`GET /families/{id}/care-risks`、`GET /families/{id}/alerts`、`GET /families/{id}/usage`、`PATCH /pets/{id}` 与 `PATCH /pets/{id}/profile` 等 legacy/孤儿入口已于 2026-09-26 删除（founder 裁决 A，L5 清缴）：照护计划一律走 `care-plans`/`care-tasks` 语义，today 一律走 `GET /today`，档案写唯一入口是 `PATCH /pets/{id}/record`。

API 统一返回结构化错误：客户端至少区分 401（会话失效）、403（角色/额度）、404（不可见资源）、409（并发/状态冲突）、410（分享过期）和 429（限流）。客户端不得把 409 当普通网络错误，也不得在 401 后继续重试原请求。

## 8. 移动端数据流与表单约束

`APP` 是 Expo/React Native 原生 App。不得引入 DOM `<form>`、Server Action、`href` 页面导航或 Next.js 页面约定。

```text
API DTO（服务端事实）
  ↓ normalize/select
View Model（页面展示）
  ↓ reset/edit
Form Draft（输入友好，数字/日期可为空字符串）
  ↓ Zod schema + payload mapper
API Payload（严格契约）
  ↓ mutation
API Response（权威结果）
  ↓ replace/invalidate
Query Cache + 页面
```

规则：

- 页面只调用 Query/Mutation hooks，不直接 `fetch`；L0–L2 经 `src/core/foundation/`，L3–L4 经 `src/core/extension/`。
- 延伸 feature（趋势、分享、接力）**禁止**新增平行 invalidate 规则；使用 `foundation/cache` 导出函数。
- 日期、时间和数字在草稿中保留字符串；校验通过后才转换成 API 所需格式。Rule 表单使用结构化字段，禁止让用户编辑 JSON。
- 展示字段不能推导权限、配额、Today 或当前 owner；这些事实只来自 API。
- 写操作成功后以服务端响应为准；Today 完成/撤销可以谨慎乐观更新，其他写入精确失效受影响缓存。
- Query key 必须包含资源、Pet/Family 范围、日期和 All/Family/Pet 过滤条件；切换过滤器不能污染另一个范围的缓存。
- 本地校验停留在 editing；网络失败保留草稿；401 清理 session；403 显示原因；409 采用服务端权威对象；破坏性操作有独立确认态。
- 所有按钮有 loading/disabled、accessibility label、成功反馈和失败重试；不可把关键状态只用颜色表达。

表单与页面组件在 `APP/` 重建中；视觉以唯一锚点（founder Pricing 参考图，2026-09-16 重锚定）与 `APP/src/ui/theme` tokens 为准，`mobile-v3` 仅作布局与交互的历史对照（2026-09-22 体检 P2-7 统一口径），业务仍经 `planet-api`。token 与共享 UI 落在 `APP/src/ui/`，页面不散落第二套品牌色。

## 9. 运行、迁移与验证

```bash
cd planet-api
make tidy
make db-ensure
make migrate-up
make test
make vet
make run
```

开发库需要重建时只针对本地 `planet` 数据库操作；生产不执行 drop/rebuild。生产顺序固定为：备份确认 → forward migration → schema 校验 → API 重启 → health check → 业务 smoke test。

生产服务启动也必须 fail-closed：`PLANET_ENV=prod` 时，API 会拒绝缺失 `RESEND_API_KEY`、缺失明确 CORS 白名单、非 HTTPS `BASE_URL` 或非回环 `BIND`；`scripts/prod-preflight.sh` 对同一组条件提前检查。推送失败日志只保留不可逆设备令牌指纹，不记录完整 token 或通知正文。

每次代码或契约改动至少执行：

```bash
cd planet-api && go test ./... && go vet ./...
cd ../APP && npm run typecheck && npm run lint
cd .. && git diff --check
```

核心回归：验证码登录、Family 创建/加入、Pet 创建和访问隔离、Care Plan 首次生成、Today 完成/跳过/撤销、Timeline 事件、分享/撤销/过期、Pet 转移、归档写保护、Family 删除恢复和重复请求。数据库验证必须检查：迁移 up→down→up（仅测试库）、所有表 metadata、UTC、唯一约束、外键和并发用例。

## 10. 维护规则

- 新表先证明现有表无法表达，再放入唯一 baseline 或新的 forward migration；禁止为同一事实建第二张 log 表或兼容主体表。
- 新字段必须说明它属于主体、关系、规则、动态事实还是基础设施，并拥有明确的删除/更新语义。
- 改 API 命名时先更新 handler、contracts、客户端和本文件；旧入口只在有迁移价值时保留兼容，不作为新设计依据。
- 旧设计只可移入 `docs/archive/`，不能继续作为 active 文档维护。
- 文档修改完成后检查是否仍残留旧的 Family、Pet、照护执行或时间线表名；除兼容入口的明确说明外，过时命名必须删除。

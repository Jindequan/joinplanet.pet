# PLANET API 契约（API-CONTRACT）

- 状态：v2，2026-08-18 重写——**与 planet-api 实现逐一对齐**（2026-08-17 版与实现路由分歧，作废；差异要点：verify→verify-code、/circles 建圈不再捆绑建宠、错误契约为结构化 envelope）
- 事实来源：`PRODUCT-SPEC.md`（产品）、`BACKEND-DESIGN.md`（后端设计）；实现仓库 `/Users/devin/code/planet-api`
- 标注：✅ 已实现并有集成测试（**V1 全量实现，2026-08-18 关版**；无任何付费端点）

## 通用约定

- 基址：`https://api.joinplanet.pet`（本地 `http://localhost:8081`）；全部 `/api/v1` 前缀
- 认证：`Authorization: Bearer <token>`（验证码登录获得，90 天滑动）；除 `request-code`/`verify-code`/`GET /shares/{token}`/健康检查外全部需要
- 时间：RFC3339；日期：`YYYY-MM-DD`；`log_date`/生日按家庭时区语义
- 错误契约（冻结，只增不改）：

```json
{ "error": { "code": "QUOTA_PETS_EXCEEDED", "message": "...", "request_id": "..." } }
```

| code | HTTP | 场景 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 请求不合法 |
| `UNAUTHENTICATED` | 401 | 无/坏/过期 session |
| `AUTH_RATE_LIMITED` | 429 | 验证码/登录限流 |
| `JOIN_RATE_LIMITED` / `SHARE_RATE_LIMITED` | 429 | 加入/分享查看限流 |
| `RESOURCE_NOT_FOUND` | 404 | 不存在**或**无隶属（不泄露） |
| `ROLE_FORBIDDEN` | 403 | 成员但角色不足 |
| `QUOTA_FAMILIES/MEMBERS/PETS/STORAGE_EXCEEDED` | 403 | 配额（附 usage） |
| `PET_ARCHIVED` | 409 | 纪念态宠物写操作 |
| `VERSION_CONFLICT` | 409 | 乐观锁失败（附 current） |
| `TASK_LOG_EXISTS` | 409 | 重复完成（**附权威 log，客户端静默采用**） |
| `ALREADY_MEMBER` | 409 | 重复加入 |
| `LAST_OWNER` | 409 | 最后 owner 不可移除/退出 |
| `AUTO_EVENT_IMMUTABLE` | 409 | 自动事件不可删改 |
| `FAMILY_NOT_EMPTY` | 409 | 删家庭前必须先处置宠物 |
| `SHARE_GONE` | 410 | 分享过期/撤销/不存在 |
| `PAYLOAD_TOO_LARGE` | 413 | 单文件超限（B6+） |
| `INTERNAL` | 500 | 兜底（日志必含 request_id） |

## 账号 ✅

```text
POST   /api/v1/auth/request-code  {email}                 → 202 {sent}（dev 模式附 dev_code）
POST   /api/v1/auth/verify-code   {email, code}           → 200 {token, expires_at, user}（登录即注册，默认 free）
DELETE /api/v1/auth/session                                → 204 登出
GET    /api/v1/me                                          → {user, entitlements[]}
PATCH  /api/v1/me           {display_name}                → {user}
DELETE /api/v1/account      {confirm: <邮箱>}              → 204 注销（拥有圈级联清理；他圈历史保留归属置空）
```

注：`GET /me` 的 `circles/pets` 内嵌结构已移除——客户端先 `GET /circles` 再 `GET /circles/{id}/pets`。

## Family ✅

```text
POST   /api/v1/circles                    {name, timezone?}      → 201 {circle, invite_code}（建圈即 owner；⬜受"拥有家庭数"配额）
GET    /api/v1/circles                                            → {circles[]}（我的圈+角色）
GET    /api/v1/circles/{id}                                       → {circle, members[]}
PATCH  /api/v1/circles/{id}               {name?, timezone?}     → {circle}（owner）
POST   /api/v1/circles/{id}/invite/refresh                        → {invite_code}（owner；旧码即失效）
POST   /api/v1/circles/join               {code}                  → {circle}（caregiver；成员配额；已活跃成员→409 ALREADY_MEMBER）
DELETE /api/v1/circles/{id}/members/{userId}                      → 204（owner；触发器保最后 owner）
POST   /api/v1/circles/{id}/leave                                 → 204（最后 owner → 409 LAST_OWNER）
GET    /api/v1/circles/{id}/usage                                 → {plan, members, member_max, pets, pet_max}
POST   /api/v1/circles/{id}/transfer      {to_user_id}            → ✅ {circle}（所有权移交，owner）
DELETE /api/v1/circles/{id}                                       → ✅ 204（清空才能删；否则 409 FAMILY_NOT_EMPTY；30 天恢复窗）
POST   /api/v1/circles/{id}/restore                              → ✅ {circle}（恢复窗内，删除发起者）
```

（`PUT /subscription/anchor` 换锚端点随 V2 付费落地，V1 不实现。）

## Pet ✅

```text
POST   /api/v1/circles/{id}/pets   {name, species, breed?, birth_date?, sex?, neutered?, weight_g?} → 201 {pet}（配额）
GET    /api/v1/circles/{id}/pets                                                            → {pets[]}（含纪念态）
GET    /api/v1/pets/{id}                                                                    → {pet, profile}
PATCH  /api/v1/pets/{id}           {..., version}                                           → {pet}（乐观锁；weight_g 拒绝——走 weight 事件）
DELETE /api/v1/pets/{id}           {confirm: <pet_id>}                                      → 204 硬删（owner）
PATCH  /api/v1/pets/{id}/profile   {allergies, conditions, emergency_contacts, med_decision_maker, notes} → {profile}
POST   /api/v1/pets/{id}/archive                                                            → {pet} 纪念态（只读/免配额/可恢复，owner）
POST   /api/v1/pets/{id}/unarchive                                                          → {pet}（重新过配额）
POST   /api/v1/pets/{id}/transfer    {to_circle_id}                                         → ✅ {transfer}（PENDING，源圈 owner）
POST   /api/v1/transfers/{id}/accept                                                       → ✅ 事务迁移+撤分享+记 transfer 事件
POST   /api/v1/transfers/{id}/decline                                                      → ✅
DELETE /api/v1/transfers/{id}                                                              → ✅ 发起者撤回
```

## 用药 ✅

```text
POST   /api/v1/pets/{id}/medications   {name, dose?, schedule?, note?}   → 201 {medication}（自动记 started 事件）
GET    /api/v1/pets/{id}/medications                                     → {medications[]}（进行中在前）
PATCH  /api/v1/medications/{id}         {name?, dose?, schedule?, note?} → {medication}
POST   /api/v1/medications/{id}/stop    {ended_on?}                      → {medication}（幂等；自动记 ended 事件；日期校验）
DELETE /api/v1/medications/{id}                                           → 204（owner；级联删其 auto 事件）
```

## 健康时间线 ✅

```text
GET    /api/v1/pets/{id}/timeline       ?before=<RFC3339>&limit=         → {events[]}（倒序）
POST   /api/v1/pets/{id}/timeline       {type, occurred_at, payload}     → 201 {event}
PATCH  /api/v1/timeline-events/{id}     {occurred_at, payload}           → {event}（本人或 owner；auto 事件不可改）
DELETE /api/v1/timeline-events/{id}                                        → 204（同上）
```

类型注册表（v1）：`symptom`/`weight`（须 weight_g，同步宠物体重）/`medication`（仅自动）/`vaccine`/`vet_visit`/`note`/`document`；B10 增 `transfer`（仅自动）。

## 今日任务 ✅

```text
POST   /api/v1/pets/{id}/tasks    {title, schedule, time_of_day?}  → 201 {task}
GET    /api/v1/pets/{id}/tasks                                      → {tasks[]}
PATCH  /api/v1/tasks/{id}        {title?, schedule?, time_of_day?, archived?} → {task}
DELETE /api/v1/tasks/{id}                                           → 204（owner）
GET    /api/v1/circles/{id}/today ?date=YYYY-MM-DD                  → {date, pets:[{pet_id, pet_name, items:[{task, log|null}]}]}（圈时区）
POST   /api/v1/tasks/{id}/logs    {status: done|skipped, date?, note?} → 201 {log}｜409 TASK_LOG_EXISTS（附权威 log）
POST   /api/v1/task-logs/{id}/undo                                    → 204（本人或 owner）
```

schedule 语法（版本化）：`{"v":1,"kind":"daily"}` ｜ `{"v":1,"kind":"weekly","days":[1..7]}`（ISO，1=周一） ｜ `{"v":1,"kind":"interval","every_n":1..365}`。补记限过去 7 天，未来拒绝。

## 分享 ✅

```text
POST   /api/v1/pets/{id}/shares  {kind, ttl_hours∈{24,72,168}, options?} → 201 {share, token}（owner；token 明文仅此一次）
GET    /api/v1/pets/{id}/shares                                           → {shares[]}（无 token 回显；含 view_count）
DELETE /api/v1/shares/{id}                                                → 204 撤销（owner；即时生效）
GET    /api/v1/shares/{token}                    【匿名，仅 GET，限流】     → 200 {kind, expires_at, created_at, data}｜410 SHARE_GONE
```

- `care_card` data = `{pet, date, tasks[], emergency_contacts, med_decision_maker}`——**绝不含病史**（契约测试锁死）。
- `summary` options = `{sections?: ["profile","medications","events"], days?: ≤365}`（默认全段/90 天）。

## 运维 ✅

```text
GET /healthz → ok        GET /readyz → ready（迁移版本一致才 200）
```

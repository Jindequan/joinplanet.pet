# PLANET 完整前端实施计划（Luna 执行版）

状态：2026-08-23  
目标目录：`/Users/devin/code/joinplanet.pet/planet-app`  
后端：`/Users/devin/code/joinplanet.pet/planet-api`  
产品事实源：`/Users/devin/code/joinplanet.pet/docs/PRODUCT.md`  
技术事实源：`/Users/devin/code/joinplanet.pet/docs/ARCHITECTURE.md`

> 本文的目标不是继续完善原型，而是把当前 `planet-app` 从高保真本地演示改造成真实 API 驱动、可测试、可恢复、无空壳入口的完整 Web/PWA 前端。

---

## 0. Luna 执行规则

### 0.1 强制边界

1. 不读取、不复制、不参考任何现有 `mobile`、`mobile-v2` 或名称包含 `v2` 的代码和设计文档。
2. 只在 `planet-app` 和本文明确列出的 `planet-api` 契约缺口内工作。
3. 不修改用户已有的无关改动，不执行 `git reset --hard`、`git checkout --` 或批量删除。
4. 一个阶段一个提交；当前阶段的验收门槛未通过，不进入下一阶段。
5. Production build 中禁止出现 `Devin`、`Rivera household`、`Mochi`、`Olive`、`Pippin` 等演示实体。
6. Runtime 中禁止用本地数组模拟服务端资源；演示数据只允许存在于测试 fixture、Storybook 或 MSW handler。
7. 所有可见按钮必须满足以下之一：
   - 执行真实操作；
   - 导航到真实页面；
   - 根据权限或后端能力明确 disabled，并解释原因；
   - 从 UI 删除。
8. 不允许出现点击后只显示 “opened”“ready to configure” 一类假成功 Toast。
9. 创建型 POST 的 `Idempotency-Key` 必须在一次提交意图内稳定复用；不能每次网络重试生成新 key。
10. 所有删除、移除、退出、撤销访问和取消转移都必须使用统一二次确认组件。

### 0.2 每阶段交付格式

Luna 完成每个阶段时必须输出：

```text
阶段：P<n>
完成项：
- ...

真实接口：
- METHOD /api/v1/...

改动文件：
- absolute/path

验证：
- npm run typecheck
- npm run lint
- npm run test
- npm run build
- 对应 E2E

未完成/阻塞：
- 无；或明确写出后端缺口和证据
```

### 0.3 分支与提交建议

- 分支：`codex/planet-app-production`
- 提交格式：
  - `feat(app-foundation): ...`
  - `feat(auth): ...`
  - `feat(families): ...`
  - `feat(pets): ...`
  - `feat(care): ...`
  - `feat(timeline): ...`
  - `test(e2e): ...`

---

## 1. 当前状态审计

### 1.1 当前有价值、应保留的部分

- 视觉 token、背景资源、移动优先布局和桌面展示框架。
- Today、Timeline、Pets、More 的信息架构。
- All / Family / Pet 的范围选择概念。
- 统一删除确认组件的视觉和交互方向。
- 背景资源与遮罩策略。
- `App.tsx` 中的部分纯展示组件可以拆分复用。

### 1.2 当前必须移除的原型行为

- `initialTasks`、`initialFamilies`、`initialPets`、`timelineItems` 等 runtime fixture。
- 所有依赖组件局部 `useState` 模拟服务端 CRUD 的代码。
- 固定日期、固定用户名、固定邮箱、固定邀请码和固定宠物。
- 假登录、任意验证码通过、本地删除、刷新后数据恢复等行为。
- “Manage”“Edit”“Transfer ownership”“Sharing”“Preferences”等无真实逻辑入口。
- 假设备会话、假通知状态、假配额、假 Care Plan 数量。
- 宠物背景图被误用成用户上传头像的语义。当前后端没有宠物媒体接口；这些图只能作为装饰背景。

### 1.3 完成定义

以下条件全部满足，才可称为“完整前端”，而不是高保真原型：

- 所有实体来自 API 或明确的客户端偏好存储。
- 刷新页面后会话、路由和服务端数据可恢复。
- 多账号、多家庭、多宠物能真实隔离和协作。
- 每个核心写操作包含 loading、成功、字段校验失败、权限失败、冲突和网络重试状态。
- 删除确认完成后调用真实 DELETE/leave/revoke API，并按服务端结果更新缓存。
- 用户可以完成产品事实源中的 3 分钟首条照护闭环。
- 双账号 E2E 通过。

---

## 2. 目标技术架构

### 2.1 依赖调整

在 `planet-app` 增加：

```bash
npm install react-router-dom @tanstack/react-query zod react-hook-form @hookform/resolvers date-fns date-fns-tz
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw @playwright/test
```

可选但建议：

```bash
npm install sonner
```

禁止引入：

- Redux（当前领域不需要第二套全局服务端状态）。
- Next.js、Server Actions 或 SSR 页面约定。
- 为了动画引入大型动画框架；优先 CSS transition/keyframes。

### 2.2 目标目录

```text
src/
├─ app/
│  ├─ App.tsx
│  ├─ router.tsx
│  ├─ providers.tsx
│  ├─ bootstrap.tsx
│  └─ routes/
├─ core/
│  ├─ api/
│  │  ├─ client.ts
│  │  ├─ errors.ts
│  │  ├─ idempotency.ts
│  │  ├─ schemas.ts
│  │  └─ endpoints.ts
│  ├─ auth/
│  │  ├─ session-store.ts
│  │  ├─ session-context.tsx
│  │  └─ require-session.tsx
│  ├─ query/
│  │  ├─ client.ts
│  │  └─ keys.ts
│  ├─ forms/
│  ├─ scope/
│  │  ├─ scope.ts
│  │  ├─ scope-provider.tsx
│  │  └─ scope-picker.tsx
│  └─ time/
├─ ui/
│  ├─ tokens.css
│  ├─ globals.css
│  ├─ layout/
│  ├─ feedback/
│  ├─ forms/
│  └─ destructive/
├─ features/
│  ├─ auth/
│  ├─ account/
│  ├─ families/
│  ├─ pets/
│  ├─ care/
│  ├─ today/
│  ├─ timeline/
│  ├─ medications/
│  ├─ sharing/
│  ├─ transfers/
│  └─ notifications/
├─ test/
│  ├─ fixtures/
│  ├─ handlers/
│  └─ render.tsx
└─ main.tsx
```

### 2.3 路由

```text
/auth
/auth/code
/today
/timeline
/pets
/pets/new
/pets/:petId
/pets/:petId/edit
/pets/:petId/care
/pets/:petId/care/new
/pets/:petId/medications
/pets/:petId/timeline
/pets/:petId/sharing
/pets/:petId/access
/pets/:petId/transfer
/families
/families/new
/families/join
/families/:familyId
/families/:familyId/settings
/families/:familyId/transfers
/account
/account/preferences
/account/deleted-families
/share/:token            # 匿名分享视图
```

移动端底部导航只映射 `/today`、`/timeline`、`/pets`、`/account`。详情和管理页面使用正常 history：返回键必须回到来源页面，而不是写死跳转。

### 2.4 服务端状态与客户端状态

服务端状态全部进入 TanStack Query：

- user / entitlements / usage
- preferences
- families / family detail / members / family usage
- pets / pet detail / profile / access grants
- care plans / assignments / Today
- timeline pages
- medications
- shares / transfers / notification prefs

客户端状态只保留：

- 当前表单草稿。
- 当前路由。
- All / Family / Pet 展示范围。
- 未提交的离线完成动作。
- 非敏感 UI 偏好。

禁止把 Family、Pet、Care、Event 的服务端实体复制到第二套 Context 中。

### 2.5 Query key 规范

```ts
queryKeys.me()
queryKeys.usage()
queryKeys.preferences()
queryKeys.families()
queryKeys.family(familyId)
queryKeys.familyPets(familyId)
queryKeys.pets({ includeArchived })
queryKeys.pet(petId)
queryKeys.carePlans(petId, { includeArchived })
queryKeys.today({ scopeType, scopeId, date })
queryKeys.timeline({ scopeType, scopeId, cursor })
queryKeys.medications(petId)
queryKeys.shares(petId)
queryKeys.transfers(familyId, direction)
```

切换 scope、日期或 Pet 时不能复用错误缓存。

---

## 3. API 基础设施约束

### 3.1 环境变量

```env
VITE_PLANET_API_URL=http://localhost:8081/api/v1
VITE_ENABLE_DEV_AUTH_CODE=false
```

禁止在页面内写死 `8081` 或 API 根路径。

### 3.2 API client

`src/core/api/client.ts` 必须负责：

- `Authorization: Bearer <token>`。
- JSON encode/decode。
- 204 无 body。
- 请求超时和 AbortSignal。
- `Idempotency-Key`。
- 结构化错误转换。
- 401 的唯一 session 清理路径。
- 保留服务端 `request_id` 供错误详情与支持排查。

统一错误类型：

```ts
type ApiError = {
  status: number
  code: string
  message: string
  requestId?: string
  current?: unknown
  log?: unknown
  usage?: unknown
}
```

后端错误 envelope：

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "resource was modified concurrently",
    "request_id": "..."
  },
  "current": {}
}
```

### 3.3 状态码处理

| 状态 | 前端行为 |
|---|---|
| 400 | 显示字段/表单错误；保留草稿 |
| 401 | 清 token、清私有 query cache、跳转 `/auth`；不自动重放写请求 |
| 403 `ROLE_FORBIDDEN` | 显示权限原因，不伪装网络失败 |
| 403 quota | 显示 `usage`、额度和可行动建议 |
| 404 | 资源不可见/不存在统一 Not Found；不泄露资源存在性 |
| 409 `PET_ARCHIVED` | 切换只读 UI |
| 409 `VERSION_CONFLICT` | 展示服务端 `current`，允许重新应用草稿 |
| 409 `TASK_LOG_EXISTS` | 使用服务端 `log` 替换本地状态 |
| 409 `LAST_OWNER` | 引导先转移 owner |
| 410 | 分享已过期页面 |
| 429 | 禁用重试到倒计时结束 |
| 5xx/离线 | 保留页面和草稿，显示 Retry |

### 3.4 幂等策略

创建以下资源时生成 key：

- Family
- Pet
- Care Plan
- Medication
- Timeline Event
- Share
- Pet transfer
- Today complete/skip

实现：

```ts
const command = createCommandId() // 8–200 字符
mutation.mutate({ command, payload })
```

同一次点击后的网络重试复用 `command`；用户修改 payload 或明确重新提交才生成新 key。

---

## 4. 必须先补齐的后端契约缺口

这些能力当前 API 不存在。Luna 不得用前端假数据绕过。

### B-01 All scope Today

当前 `/today` 要求 `family_id` 与 `pet_id` 二选一，多家庭用户无法获取真正的 All。

实现建议：

```http
GET /api/v1/today?date=YYYY-MM-DD
GET /api/v1/today?family_id=...&date=...
GET /api/v1/today?pet_id=...&date=...
```

无 scope 时返回用户全部 accessible pets，按 pet ID 去重。

验收：同一 Pet 链接到两个 Family 时，All Today 只出现一次。

### B-02 All/Family Timeline 聚合分页

当前只有 `GET /pets/{id}/timeline`。客户端并行拉取多个 Pet 后自行 merge 无法提供正确的全局 cursor。

新增：

```http
GET /api/v1/timeline?family_id=...&before=...&before_id=...&limit=...
GET /api/v1/timeline?pet_id=...&before=...&before_id=...&limit=...
GET /api/v1/timeline?before=...&before_id=...&limit=...
```

返回：

```json
{
  "events": [],
  "next_cursor": { "before": "RFC3339", "before_id": "uuid" }
}
```

### B-03 Session 列表与远程注销

当前仅支持删除当前 session。若保留“Signed-in devices / Manage”界面，新增：

```http
GET    /api/v1/me/sessions
DELETE /api/v1/me/sessions/{session_id}
DELETE /api/v1/me/sessions?except_current=true
```

如果不补后端，P3 必须删除设备列表与 Manage 入口，只显示“当前设备退出”。

### B-04 Pet 删除恢复

Family 有 deleted list/restore，Pet 当前只有 soft delete，没有用户恢复接口。

新增：

```http
GET  /api/v1/pets/deleted
POST /api/v1/pets/{id}/restore
```

如果不补，不得在 UI 承诺用户可自行恢复，只能写“进入保留期，请联系支持”。

### B-05 宠物媒体

当前 Pet DTO 无 avatar/media 字段，也无上传接口。完整宠物照片功能需要独立媒体契约。第一版可：

- 保留装饰背景；
- 使用姓名首字母 avatar；
- 隐藏“上传宠物照片”。

不要把仓库背景图伪装成用户宠物照片。

### B-06 Account locale 与完整偏好

`GET /me` 返回 locale，但 `PATCH /me` 只支持 `display_name`。通知与语言 UI 必须：

- 语言先存客户端非敏感偏好；或
- 扩展 `PATCH /me` 支持 locale。

选择其一并更新技术事实源，不能显示假保存成功。

---

## 5. P0 — 原型隔离与工程基线

### 工作项

- [ ] 把当前巨型 `src/App.tsx` 拆成路由壳与展示组件。
- [ ] 把 fixture 移到 `src/test/fixtures/prototype.ts`。
- [ ] Production 入口不 import fixture。
- [ ] 建立 `eslint`、`typecheck`、`test`、`build` 四个固定命令。
- [ ] 建立 Vitest + Testing Library + MSW。
- [ ] 为当前主要布局添加 smoke test，防止拆分造成视觉结构丢失。
- [ ] 增加 ErrorBoundary 和全局 NotFound route。

### 验收

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

- Production bundle 搜索不到演示用户与宠物名称。
- 所有页面可以在无 API 时显示明确连接错误，而不是自动回退假数据。

---

## 6. P1 — API、Query、Session 与 App Bootstrap

### 工作项

- [ ] 实现 API client、错误类型、token store、idempotency command。
- [ ] 实现 QueryClient 默认策略：GET 最多重试 2 次；mutation 默认不自动重试。
- [ ] 实现 SessionProvider。
- [ ] 实现 RequireSession route guard。
- [ ] 实现 App bootstrap：token → `/me` → preferences → families + pets。
- [ ] 无效 default family/pet 自动回退到 All，但不能 PATCH 服务端，除非用户主动保存。
- [ ] 401 清除所有私有缓存。
- [ ] 页面刷新恢复原路由。
- [ ] API 不可用时显示全屏 retry，而不是无限 spinner。

### Bootstrap 顺序

```text
读取 token
├─ 无 token → /auth
└─ 有 token → GET /me
              ├─ 401 → 清 token → /auth
              └─ 200 → 并行 GET preferences/families/pets/usage
                        → 校验 scope
                        → 渲染 app shell
```

### 测试

- token 缺失、有效、过期。
- bootstrap 某个并行请求失败。
- 401 期间多个请求并发，只执行一次 logout redirect。
- 204 响应不抛 JSON parse error。
- idempotency key 重试稳定。

---

## 7. P2 — Auth 与 User Account 完整实现

### 接口

```http
POST   /auth/request-code
POST   /auth/verify-code
DELETE /auth/session
GET    /me
PATCH  /me
GET    /me/preferences
PATCH  /me/preferences
GET    /me/usage
DELETE /account
```

### 页面与流程

#### 登录

- 邮箱输入：trim、lowercase、格式校验。
- Request code 成功进入验证码页。
- `dev_code` 只在开发环境显示，生产绝不渲染。
- 验证码 6 位；粘贴支持；错误不清空邮箱。
- 429 显示倒计时。
- verify 成功先保存 token，再 `/me` bootstrap。
- 浏览器返回验证码页时保留邮箱，但不保留验证码。

#### Account

- 真实展示 `/me.user`、entitlements、usage。
- 编辑 display name 使用 `PATCH /me`。
- 默认 Family/Pet 使用 `PATCH /me/preferences`，只允许选择当前可访问资源或 null。
- Logout 调用 `DELETE /auth/session`；即使网络失败也允许“仅清除此设备”，但明确提示服务端 session 可能仍有效。
- Delete Account 确认框要求输入当前邮箱，payload `{ "confirm": email }`。
- `ACCOUNT_HAS_OWNED_PETS` 显示必须先转移/删除哪些 Pet 的引导。

### 不可伪造的功能

- 未完成 B-03 前，删除设备会话列表 UI。
- 未完成 B-06 前，不显示服务端语言保存成功。

### Query 更新

- `PATCH /me` 成功：`setQueryData(me)`。
- preferences 成功：替换 preferences，并重新解析 scope。
- delete account 成功：清 token、清 cache、进入完成页，不直接回到普通登录页造成误解。

### 验收

- 登录、刷新恢复、改名、改默认范围、退出、账号删除阻塞和成功路径全部 E2E。
- 401、429、ACCOUNT_HAS_OWNED_PETS 有独立测试。

---

## 8. P3 — Multi-Family 完整实现

### 接口

```http
POST   /families
POST   /families/join
GET    /families
GET    /families/deleted
GET    /families/{id}
PATCH  /families/{id}
GET    /invite/{code}
POST   /families/{id}/invite/refresh
DELETE /families/{id}/members/{userId}
POST   /families/{id}/leave
GET    /families/{id}/usage
POST   /families/{id}/transfer
DELETE /families/{id}
POST   /families/{id}/restore
```

### 页面

#### Family Directory

- GET families 真列表。
- 每张卡展示 name、role、timezone、pet 数、member 数；后两项必须来自 detail 或专用聚合，不能硬算假值。
- skeleton、0 families、部分请求失败、deleted families 入口。

#### Create Family

- 字段：name、IANA timezone。
- 默认 timezone 来自浏览器 `Intl.DateTimeFormat().resolvedOptions().timeZone`。
- POST 必带 idempotency key。
- 首次响应的 invite code 仅显示一次，提供 Copy 和 Done。
- 成功后精确写入 families cache 并导航详情。

#### Join Family

- 先 GET `/invite/{code}` 显示目标 Family 预览。
- 用户二次点击 Join 才 POST。
- 重复邀请码、过期、限流分别显示。
- 成功后更新 families、pets 和 scope options。

#### Family Detail

- GET detail 获取 members 与真实角色。
- Owner：编辑 name/timezone、刷新邀请、移除成员、转移 ownership、删除/恢复。
- Caregiver：只读成员列表、Leave family。
- 不提供普通成员 role 编辑，因为当前 API 没有该接口。

#### 删除与恢复

- Owner 删除要求输入 Family name；body `{ "confirm": familyName }`。
- Leave 使用普通二次确认。
- 删除/离开后，如果当前 scope 属于该 Family，回退 All。
- Deleted Families 页面 GET deleted + restore。

### 测试

- Owner/Caregiver 权限矩阵。
- 创建重试不产生两个 Family。
- 两账号邀请加入。
- LAST_OWNER。
- 删除后 Pet 仍存在但 Family link 消失。
- restore 后 scope 可重新选择。

---

## 9. P4 — Multi-Pet 与 Pet Workspace 完整实现

### 接口

```http
POST   /families/{id}/pets
GET    /families/{id}/pets
GET    /pets
GET    /pets/{id}
PATCH  /pets/{id}
PATCH  /pets/{id}/record
PATCH  /pets/{id}/profile
POST   /pets/{id}/archive
POST   /pets/{id}/unarchive
DELETE /pets/{id}
GET    /pets/{id}/export
POST   /pets/{id}/families
DELETE /pets/{id}/families/{familyId}
GET    /pets/{id}/access-grants
POST   /pets/{id}/access-grants
DELETE /pets/{id}/access-grants/{grantId}
POST   /pets/{id}/transfer
```

### Pet Directory

- 主数据使用 GET `/pets`，因为 Pet 不属于单一 Family。
- Family 分组只根据 `family_ids` 展示关联，不能复制 Pet 实体。
- 同一 Pet 链到两个 Family 时，在 All 列表只出现一次；分组视图可以出现两处引用。
- archived pet 独立筛选，默认不混入活跃列表。

### Create Pet

字段：

- family id（初始可见 link）
- name（必填）
- species
- breed
- birth date
- sex
- neutered
- initial weight grams（可选）

成功后：

- 更新 accessible pets。
- 更新 family pets。
- 若用户选择，保存 default pet preference。
- 导航 Pet Workspace。

### Pet Record

分成明确 section：

- Identity：name/species/breed/birth date/sex/neutered。
- Medical profile：allergies/conditions/emergency contacts/decision maker/notes。
- Weight 不允许 PATCH pet；必须创建 weight Timeline event。
- 更新必须带最新 `version`。
- VERSION_CONFLICT 显示“服务端版本 vs 当前草稿”，允许 Reload 或 Reapply。

### Lifecycle

- Archive：确认后 POST，页面进入 read-only；隐藏新增 Care/Event/Medication。
- Unarchive：POST 后恢复写入口。
- Delete：确认要求 pet name 或 pet ID，真实 body `{ "confirm": petId }`。
- Export：GET 后生成 JSON 文件下载，显示下载失败重试。
- Restore：完成 B-04 后实现。

### Sharing、Delegation 与 Family links

- Share with family 与 Unshare 是两个独立确认语义。
- Access grant 表单：user ID、role、expires_at；前端不能要求邮箱，因为 API 只收 user_id。
- Revoke access 二次确认。
- Pet transfer 使用目标 Family，pending 后不可再次发起；进入 Transfers 状态页。

### 验收

- 同一 Pet 多 Family 可见性。
- archive 写入返回 409 后 UI 转只读。
- version conflict。
- 删除不误删历史。
- owner/access role 决定按钮，不从 Family role 推断 Pet owner。

---

## 10. P5 — Care Plan、Rule 与 Assignment 完整实现

### 接口

```http
POST   /pets/{id}/care-plans
GET    /pets/{id}/care-plans?include_archived=false
PATCH  /care-plans/{id}
DELETE /care-plans/{id}
GET    /care-plans/{id}/assignments
PUT    /care-plans/{id}/assignments/{userId}
DELETE /care-plans/{id}/assignments/{userId}
```

### Care Plan 表单

字段：

```ts
type CarePlanDraft = {
  type: string
  title: string
  description: string
  rule: {
    type: 'daily' | 'weekly' | 'monthly' | 'interval'
    interval: string
    days: number[]
    day: string
    time: string
    startDate: string
    endDate: string
  }
}
```

要求：

- 表单草稿中的数字与日期先保留 string。
- weekly 必须至少一天。
- monthly day 1–31，并提示短月份策略。
- interval >= 1。
- end date 不早于 start date。
- time 使用 Family timezone 解释，不显示为 UTC。
- 不允许用户编辑 raw JSON schedule。

### Care Plan 页面

- active / archived 分段。
- 展示 rule 摘要、下次 occurrence、负责人。
- Edit 使用服务端返回值 reset draft。
- Delete 使用二次确认并说明未来任务停止、历史保留。
- Assignment 只列当前 Family members；role payload 依据后端允许值。

### 后端契约核对任务

当前 `PATCH /care-plans/{id}` 使用兼容字段 `schedule/time_of_day`，而 create 使用结构化 `rule`。Luna 在实现 Edit 前必须：

1. 为更新增加与 create 相同的结构化 rule DTO；或
2. 在唯一 mapper 中把结构化 draft 转换成 schedule JSON。

不得让页面直接组装不透明 JSON。

### 验收

- daily/weekly/monthly/interval 各一条集成测试。
- 创建 Plan 同时产生首个 Today item。
- 编辑规则后旧历史不变化，新 occurrence 使用新规则。
- Assignment 增删真实生效。

---

## 11. P6 — Today 完整实现

### 前置

- 必须完成 B-01。

### 查询

```http
GET /today?date=YYYY-MM-DD
GET /today?family_id=...&date=YYYY-MM-DD
GET /today?pet_id=...&date=YYYY-MM-DD
```

### 行为

- All / Family / Pet scope 对应真实 query。
- date 按 Family timezone；多 Family All 使用各任务的 due date/timezone snapshot。
- 支持有限历史日期和 Today 快捷返回。
- 项目状态：pending、done、skipped；missed 仅由服务端事实显示。

### Complete/Skip

```http
POST /care-tasks/{taskId}/complete
Idempotency-Key: ...

{
  "status": "done | skipped",
  "date": "YYYY-MM-DD",
  "note": ""
}
```

- 点击后可 optimistic，但必须保存 rollback snapshot。
- 409 TASK_LOG_EXISTS 使用响应 `log` 替换本地。
- 网络失败显示 Pending sync，不得静默回 pending。
- skip 需要 reason/note sheet。

### Undo

```http
POST /task-logs/{logId}/undo
```

- Undo 只在服务端允许窗口显示。
- Undo 后精确移除 log 并 invalidate Timeline。
- Undo 不是删除历史；服务端会记录撤销事实时按服务端结果展示。

### 空/错状态

- 0 pets：引导创建/加入 Family 与 Pet。
- 有 Pet 无 Care Plan：引导创建 Care Plan。
- 当天全部完成：完成态而不是空白。
- 局部失败：保留日期头和已加载任务。

### 验收

- All、两个 Family、三个 Pet scope 数据不串。
- 两账号并发 complete 只产生一个权威 log。
- 离线完成重试不重复。
- 完成后 Timeline 可看到自动事件。

---

## 12. P7 — Timeline / Event 完整实现

### 前置

- 必须完成 B-02，或把全局 Timeline UI 暂时限制为单 Pet。不得做错误的客户端全局分页。

### 事件类型

用户可创建：

- `note`
- `symptom`
- `weight`
- `visit`
- `vaccine`

系统自动：

- medication lifecycle
- care occurrence/log
- transfer

自动类型在前端隐藏 Create/Edit/Delete。

### Event schema registry

```text
features/timeline/registry/
├─ note.ts
├─ symptom.ts
├─ weight.ts
├─ visit.ts
├─ vaccine.ts
└─ unknown.ts
```

每个 registry item 包含：

- Zod payload schema。
- form default values。
- payload mapper。
- display mapper。
- editable/deletable 权限。

未知事件使用通用 JSON-safe 卡片，不能导致页面 crash。

### Pagination

- 使用 infinite query。
- cursor 同时保存 `before` 与 `before_id`。
- 列表去重按 event id。
- 新建成功 prepend；删除成功精确移除；编辑成功替换。

### Create/Edit/Delete

- occurred_at 使用本地 datetime 输入，提交 RFC3339。
- weight 使用 grams 发送，在 UI 根据 locale 显示 kg/lb。
- 删除必须二次确认。
- 删除失败恢复卡片。
- 自动事件不显示三点删除菜单。

### 验收

- 每个手动类型 CRUD。
- unknown event 渲染。
- 分页边界同时间戳用 before_id 稳定。
- All/Family/Pet scope 聚合正确。

---

## 13. P8 — Medication 完整实现

### 接口

```http
POST   /pets/{id}/medications
GET    /pets/{id}/medications
PATCH  /medications/{id}
POST   /medications/{id}/stop
DELETE /medications/{id}
```

### 页面与状态

- Active / stopped 分组。
- 创建字段：name、dose、schedule、note。
- schedule 当前是 string；前端提供结构化常用输入，但 mapper 输出服务端 string。
- Edit 不修改 started_on。
- Stop 与 Delete 必须区分：
  - Stop：正常结束，保留记录，选择 ended_on。
  - Delete：错误数据清理，二次确认。
- archived Pet 全部写入口 disabled。
- 创建/停止/删除后 invalidate Pet Timeline，因为后端会产生业务事件。

### 验收

- Medication lifecycle 与 Timeline 自动事件一致。
- Stop 后不再显示 active。
- Delete 有二次确认。

---

## 14. P9 — Sharing、Transfer、Notifications、Digest、Alerts

### Sharing

```http
POST   /pets/{id}/shares
GET    /pets/{id}/shares
DELETE /shares/{id}
GET    /shares/{token}       # public
```

- kind：care_card / summary。
- TTL 选择必须明确到期时间。
- summary options 使用结构化表单。
- 明文 token 仅创建响应返回一次；成功页立即提供 Copy/Open。
- 列表只能展示 share metadata，不能假装能再次复制 token。
- revoke 二次确认。
- `/share/:token` 处理 loading、404、410、429，禁止写操作。

### Transfers

- outgoing/incoming 分页或列表。
- create/accept/decline 使用 idempotency key。
- cancel 二次确认。
- accept 后刷新 pet owner、family links、shares、scope。

### Notification Preferences

```http
GET /families/{id}/notification-prefs
PUT /families/{id}/notification-prefs
```

- 每个 Family 独立设置。
- 浏览器 Web Push 未接入前，不显示假 push enabled。
- 保存失败回滚 toggle。

### Digest / Alerts

```http
GET /families/{id}/digest
GET /families/{id}/alerts
```

- Digest 是服务端事实预览。
- Alert 不能给医疗诊断，只展示照护异常。
- 无数据是正常状态，不显示错误空壳。

---

## 15. P10 — UX、动画、可访问性和删除安全统一

### 15.1 通用状态组件

每个 query 页面必须有：

- `PageSkeleton`
- `InlineError`
- `EmptyState`
- `RetryButton`
- `PermissionNotice`
- `ConflictResolver`

每个 mutation 必须有：

- loading / disabled。
- 成功反馈。
- 失败保留草稿。
- 防重复提交。

### 15.2 动画规则

- 页面进入：150–240ms opacity + 4–10px translate。
- Sheet：220–320ms，允许 Esc/返回键关闭。
- Modal：180–240ms scale/opacity。
- 列表删除：服务端确认成功后再 collapse；失败不播放删除动画。
- optimistic completion 可立即动画，但失败必须反向恢复。
- `prefers-reduced-motion` 下取消位移和缩放。
- 不对长列表每次 refetch 重播 reveal 动画。
- 不使用动画遮盖请求等待。

### 15.3 删除与危险操作

统一 `ConfirmDialog` 参数：

```ts
type DestructiveConfirmation = {
  title: string
  consequence: string
  confirmLabel: string
  requireText?: string
  mutation: () => Promise<void>
}
```

必须覆盖：

- Account delete。
- Family delete / leave / member removal。
- Pet delete / unshare / revoke grant。
- Care Plan delete / assignment removal。
- Event delete。
- Medication delete。
- Share revoke。
- Transfer cancel/decline（根据语义决定是否 destructive）。

行为：

- 默认焦点 Cancel。
- Esc 和 backdrop 关闭（mutation 已开始后禁止关闭）。
- mutation loading 禁用两个按钮。
- 成功后关闭并导航。
- 失败保留 dialog 并显示内联错误。
- 不能先做本地删除再请求 API。

### 15.4 可访问性

- 所有 icon-only button 有 aria-label。
- Modal/Sheet 有 focus trap 和返回焦点。
- 状态不能只靠颜色表达。
- 表单错误使用 `aria-describedby`。
- Toast 使用适当 `aria-live`，不能抢焦点。
- 44×44px 最小触控区域。
- 键盘可完成所有核心流程。

---

## 16. P11 — 测试矩阵

### 16.1 单元测试

- API error parsing。
- idempotency command lifecycle。
- scope → query params。
- Care Rule mapper。
- Event registry schemas。
- timezone/date conversion。
- permission capability mapper。

### 16.2 组件测试

- Auth forms。
- Family create/join/detail。
- Pet record + VERSION_CONFLICT。
- Today complete/skip/undo。
- Event create/edit/delete。
- ConfirmDialog keyboard/focus/loading/error。
- archived Pet read-only。

### 16.3 MSW integration

每个 feature 至少覆盖：

- 200/201/204。
- 400。
- 401。
- 403 role/quota。
- 404。
- 409 对应领域冲突。
- 429。
- 500/offline。

### 16.4 Playwright E2E

#### E2E-01 首次使用（3 分钟目标）

```text
登录 → 创建 Family → 创建 Pet → 创建 Care Plan
→ Today 出现 → Complete → Timeline 出现记录
```

#### E2E-02 双账号协作

```text
A 创建 Family/Pet
→ 邀请 B
→ B 加入
→ A/B 看到同一 Pet
→ A 完成事项
→ B Timeline 看到 A 的记录
```

#### E2E-03 多家庭多宠物

- 同一账号至少两个 Family、三个 Pet。
- All / Family / Pet scope 数量、Today 和 Timeline 正确。
- 同一 Pet 多 Family link 不重复。

#### E2E-04 并发与幂等

- 两个页面同时 complete 同一任务。
- 创建请求超时后重试不重复。
- version conflict 可恢复草稿。

#### E2E-05 删除与恢复

- 所有危险操作先 Cancel，资源不变。
- 再 Confirm，API 被调用一次。
- Family restore、Pet restore（B-04 后）。

#### E2E-06 分享

- 创建 share → 匿名打开 → revoke → 再打开失效。
- 过期 token 显示 410 页面。

#### E2E-07 权限

- Caregiver 看不到 owner 治理按钮。
- 无权限 Pet 返回 404 页面。
- archived Pet 不能写。

---

## 17. P12 — 发布门槛

### 功能门槛

- [ ] 页面无空壳按钮。
- [ ] Production runtime 无 fixture。
- [ ] 所有产品事实源 V1 必须项有真实入口或明确后端阻塞。
- [ ] All / Family / Pet 真实数据隔离。
- [ ] 删除全部二次确认。
- [ ] 分享匿名路径不需要 session。

### 质量门槛

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run build
npx playwright test
cd ../planet-api && go test ./... && go vet ./...
cd .. && git diff --check
```

- 浏览器控制台无 error/warn。
- 390×844、430×932、768×1024、1280×900 视口通过。
- Lighthouse Accessibility ≥ 95。
- 无未处理 Promise rejection。
- 不把 request token、invite token、share token 打到 console。

### 文档门槛

- 更新 `planet-app/README.md`：真实启动方式、环境变量、测试。
- 更新 API gap 的事实源文档。
- 删除 README 中“local demo data”描述。
- 记录仍未实现的能力，不允许用 UI 暗示已完成。

---

## 18. 推荐执行顺序与停点

Luna 严格按以下顺序执行：

```text
P0 原型隔离
 ↓
P1 API/Session 基础
 ↓
B-01 + B-02 后端聚合契约
 ↓
P2 Auth/Account
 ↓
P3 Family
 ↓
P4 Pet
 ↓
P5 Care Plan
 ↓
P6 Today
 ↓
P7 Timeline/Event
 ↓
P8 Medication
 ↓
P9 Sharing/Transfer/Notify
 ↓
P10 UX/Accessibility
 ↓
P11 E2E
 ↓
P12 Release Gate
```

建议每次只让 Luna 执行一个阶段。P0–P4 完成前，不继续扩展视觉；P6–P9 完成前，不宣称核心产品完整。

---

## 19. 给 Luna 的首轮执行指令

可直接复制以下内容：

```text
阅读并严格执行：
/Users/devin/code/joinplanet.pet/planet-app/LUNA_IMPLEMENTATION_PLAN.md

本轮只执行 P0，不执行 P1 或后续阶段。
不要读取任何 mobile、mobile-v2 或名称包含 v2 的目录与文件。
保留现有视觉，不新增产品功能。
目标是隔离 runtime fixture、拆分巨型 App.tsx、建立测试基线和 production 无演示数据检查。

完成后必须运行：
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check

按文档 0.2 格式汇报；如果发现阻塞，只报告证据，不用假数据绕过。
```

完成 P0 后，再给 Luna：

```text
继续执行 LUNA_IMPLEMENTATION_PLAN.md 的 P1。
只做 API、Query、Session 和 Bootstrap 基础，不提前实现 Account/Family/Pet 页面。
所有测试和 P1 验收门槛通过后停止。
```

此后每轮只替换阶段编号。

---

## 20. 最终原则

PLANET 的前端完成度不以“页面数量”衡量，而以真实闭环衡量：

```text
服务端事实
→ 正确权限
→ 可理解的界面
→ 可恢复的操作
→ 可追溯的结果
```

任何没有真实数据、真实 mutation、错误处理和验收测试的入口，都应视为空壳，不计入完成。

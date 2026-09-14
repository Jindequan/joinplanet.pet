# PLANET 地基规范

状态：2026-09-14

本文定义 **不可随上层业务改形** 的地基：领域对象、权限、照护闭环、事实流与对外 API 面。
接力、分享、趋势、通知、商业等 **延伸层只读/写地基接口**，不得新增平行主体表或第二套数据流。

产品 Slogan 与 Tab 准入见 [PRODUCT.md](PRODUCT.md)。技术分层与模块边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

---

## 1. Slogan 与四层模型

**Slogan：** 我们，一起，呵护宝贝的一生。

| 层 | Slogan 词 | 地基 / 延伸 | 职责 |
|----|-----------|-------------|------|
| L0 | 我们 | **地基** | Family、成员、可见性、账号、权限 |
| L1 | 呵护 | **地基** | Care Plan / Rule / Occurrence、Today 执行、Medication |
| L2 | 一生 | **地基** | Pet 档案、Pet Event 时间线、软删/归档 |
| L3 | 一起 | **延伸** | 照护请求、接力（值班/交班）、成员间责任可见 |
| L4 | 一生·对外 | **延伸** | 分享快照、趋势聚合、导出、通知、商业 |

**变更规则：**

- L0–L2 的 **对象形态、表职责、核心 API 路径** 视为冻结；只能 **向前兼容扩展**（新字段、新 event type、新只读端点）。
- L3–L4 **必须** 通过下文「地基接口」接入；禁止为延伸功能复制 Today/Timeline/Pet 表或再建一套「分享专用 Occurrence」。

---

## 2. 五 Tab 准入（App 壳层）

| Tab | 必须回答的问题 | 可展示 | 禁止 |
|-----|----------------|--------|------|
| **今天** | 此刻要为宝贝做什么？ | 待办 Occurrence、执行人、完成/跳过/撤销、有限补记 | 长期趋势 KPI、家庭治理、分享设置 |
| **请求** | 哪些照护请求需要我回应？ | 收件箱、我发出的请求、责任链入口、原事项回流 | 复制待办、绕过 Occurrence 直接改状态 |
| **时间线** | 我们一起陪它经历了什么？ | Pet Event 事实流、记录人、分页 | 待办清单、计划编辑表单 |
| **宠物** | 宝贝是谁、怎么照护？ | 档案、计划、用药、进工作区 | 账号设置、家庭邀请 |
| **更多** | 我们是谁、怎么在一起？ | 家庭、账号、设置、趋势/分享入口 | 替代 Today 的执行流 |

新功能入库前填写：**属于哪一层、落在哪个 Tab、使用哪条地基接口**。

---

## 3. 地基对象（冻结形态）

```text
User ── preference（仅默认展示，非授权）
Family ── membership / invitation / timezone
Pet ── ownership / family_pet_link / delegation（延伸可读）
CarePlan ── CareRule ── CareOccurrence ── Today（查询）
CareOccurrence 完成/跳过/撤销 ──► PetEvent（事实）
Medication ──► PetEvent（事实）
PetEvent ──► Timeline（查询）
```

**不变式（违反即 bug）：**

1. Pet 是资产中心；Family 不拥有 Pet，只持有可见边。
2. Pet Event 是 **唯一** 业务事实流；完成照护产生的 Event 必须关联 Occurrence，幂等。
3. Today 不落库；它是 Occurrence 的应用层投影。
4. 权限只来自 owner / family link / delegation；preference 不参与授权。
5. 软删与归档只改 **状态与后续写入**，不改写历史 Event。

---

## 4. 地基 API 面（延伸层唯一入口）

以下路径与语义为 **稳定契约**。延伸模块 **只允许** 调用这些能力（或通过只读聚合扩展），不得绕过权限或自建存储。

### 4.1 身份与协作（L0）

| 能力 | 方法 | 路径 | 延伸层用途 |
|------|------|------|------------|
| 当前用户 | GET | `/me` | 所有模块 |
| 偏好 | GET/PATCH | `/me/preferences` | 默认范围 |
| 家庭列表 | GET | `/families` | 接力、分享范围 |
| 家庭详情 | GET | `/families/{id}` | 成员、时区 |
| 可见宠物 | GET | `/pets` | 聚合输入 |
| 家庭责任视图 | GET | `/families/{id}/care-responsibility` | Today / 家庭详情的当前负责人、待办和可用动作 |

### 4.2 呵护执行（L1）

| 能力 | 方法 | 路径 | 延伸层用途 |
|------|------|------|------------|
| 今日待办 | GET | `/today` | 接力摘要、分享卡 |
| 完成/跳过 | POST | `/care-tasks/{id}/complete` | —（地基写） |
| 撤销 | POST | `/task-logs/{id}/undo` | `Idempotency-Key`；支持断网重放且不会重复写撤销事实 |
| 排程例外 | POST | `/care-schedule/actions` | skip/move/add/substitute/change_rule；`change_rule` 的 `payload.time_of_day` 遵循三态：缺省不改、`HH:MM` 设置、`null` 清空 |
| 照护计划 | GET/POST/PATCH | `/pets/{id}/care-plans`, `/care-plans/{id}` | 计划属于 Family；GET/POST 多家庭宠物必须带 `family_id`，家庭筛选通过同名 query 参数传递；`type=medication` 的新建流程提交同一宠物的 `medication_id`，服务端会校验关联并联动用药提醒及停药/删除归档；PATCH 可暂停/恢复，暂停不生成 Today 待办 |
| 用药 | GET/POST | `/pets/{id}/medications` | 分享卡、摘要；多家庭宠物创建时必须带 `family_id`，停用也按选定家庭时区写入日期 |

### 4.3 事实与档案（L2）

| 能力 | 方法 | 路径 | 延伸层用途 |
|------|------|------|------------|
| 时间线 | GET | `/timeline` | 趋势、摘要、接力回顾 |
| 写事件 | POST | `/pets/{id}/timeline` | 延伸回写须走此口 |
| 宠物档案 | GET/PATCH | `/pets/{id}` | 所有对外视图 |
| 归档/软删 | POST/DELETE | `/pets/{id}/archive` 等 | 生命周期 |

### 4.4 延伸层已有入口（L4，读地基）

| 能力 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 照护统计 | GET | `/care-stats` | 读 Occurrence/Event 聚合 |
| 分享 | POST/GET | `/pets/{id}/shares` | 快照服务，不复制 Pet |
| 匿名读 | GET | `/shares/{token}` | 只读快照 |

**接力（L3，已建）** 使用独立的 `handoffs` 模块，内部 **只调用**：`/today`、`/pets/{id}`、`POST /pets/{id}/timeline`（交班 note），**禁止**新建 `relay_occurrences` 类平行表。值班状态是可撤销的 **元数据**，事实仍在 Pet Event。

---

## 5. 客户端地基包（APP）

延伸 UI（趋势、分享、未来接力）**不得**直接散落调用 `planetApi` 读地基数据；应通过 `APP/src/core/foundation/` 导出之：

- **Readers**：`today` / `timeline` / `pet` / `family` / `session`
- **Writers**：`completeCare` / `writeTimelineEvent` / …（封装 idempotency）
- **Cache**：`invalidateAfter*` 统一失效图

见 `APP/src/core/foundation/contracts.ts` 与 `index.ts`。
延伸 UI（趋势、分享、接力）经 `APP/src/core/extension/`；上层模块 import 只允许：`foundation`、`extension`、`ui`、自身 feature；跨 feature 禁止互调 screen。

---

## 6. 现状差距（2026-09-14）

| 能力 | 层 | 后端 | APP | 备注 |
|------|----|------|-----|------|
| 协作 Family | L0 | ✅ | ✅ | |
| Today 执行 | L1 | ✅ | ✅ | 经 foundation Writers + invalidate 图 |
| 时间线事实 | L2 | ✅ | ✅ | 创建/编辑/删除经 foundation Writers |
| 宠物工作区 | L2 | ✅ | ✅ | |
| 用药 | L1 | ✅ | ✅ | |
| 分享快照 | L4 | ✅ | ✅ | extension 读写 + 宠物工作区 UI |
| 趋势聚合 | L4 | ✅ | ✅ | extensionReaders 聚合 |
| **接力/值班元数据** | L3 | ✅ | ✅ | extension handoffs + Today 接力条；仅支持当前值班 claim/release |
| **Care Request 请求/响应/转交** | L3 | ✅ | 🟡 | 后端 + Today 收件箱、请求中心收发列表、责任详情与原事项回流已接通；风险、过期、备用成员自动接力、完成回传和离线队列已接通，待可操作 Simulator/Emulator 的通知 UI 验收 |
| Foundation 客户端包 | — | — | ✅ | contracts / readers / writers / cache / pending |
| Extension 客户端包 | — | — | ✅ | `APP/src/core/extension/` |
| 延伸层禁直连 API | — | — | ✅ | 趋势/分享/接力/导出经 extension |
| **L1 排程例外** | L1 | ✅ | 🟡 | §10 Override + actions；Today 已接入本次改时间/替代事项/临时加一项，计划页已接入从今天/明天起改规则；服务端已覆盖动作与幂等回放，移动端仍需 Simulator/Emulator 动作验收 |

图例：✅ 可用 · ❌ 未做 · 🟡 进行中

---

## 7. 施工顺序

### Phase A — 地基收束（当前）

1. 本文 + PRODUCT 宪法 + ARCHITECTURE 地基章写入版本库
2. APP：`foundation` 包与统一 invalidate（**已完成**）
3. 五 Tab 职责对照准入表，删除重复 Scope UI（**已完成**）
4. 验收：`登录 → 家庭 → 宠物 → 计划 → Today 完成 → Timeline 可见`（3 分钟）
   - **自动化**：`./scripts/acceptance-phase-a.sh`（live dev API）
   - **CI 级**：`cd planet-api && go test ./test/integration/... -run TestPhaseAAcceptancePath`
5. **冻结**：无 PRD/FOUNDATION 条目不得改 Tab 语义

### Phase B — 延伸「接力」最小版（**值班元数据 MVP 已完成**）

- 后端：`handoffs` 模块（`pet_handoffs` 元数据 + 交班 note → Pet Event）
- `GET /families/{id}/care-responsibility` 返回正式责任视图；`GET /families/{id}/handoff-summary` 仅为旧客户端保留兼容
- APP：Today 页「接力」条；不写第二套待办
- 验收：`go test -run TestHandoffClaimTransferAndTimeline`

**当前协作闭环已施工：** Care Request 附着在 Care Occurrence 上，支持指定成员、App 内行动收件箱、接受、拒绝后继续转交、计划备用成员自动接力、状态审计、幂等、推送回 Today、Today 责任状态、无人接手风险升级、过期收束、完成回传和离线顺序队列。待完成的是可操作移动端运行环境中的通知动作验收。完整产品规格见 [CARE-COORDINATION.md](CARE-COORDINATION.md)。

### Phase C — 延伸只读聚合（**已完成**）


- APP：`APP/src/core/extension/` — careStats、timelineInRange、分享/导出/接力读写
- 趋势、分享、公开链接、宠物导出 **仅** 经 extension + foundation
- 验收：`./scripts/verify-extension-layer.sh` + `npx tsc --noEmit`

### Phase D — L1 排程（**服务端完成，客户端入口已推进**）

- 核心思想：FOUNDATION §10 — **可继承 · 多态 · 可复用**
- 后端：`care_schedule_overrides` + Rule 版本链 + 惰性 Occurrence + 统一 `care-schedule/actions`
- APP：foundation Writers + 作用域选择 UI；Today 可对当前 Occurrence 选择“改这一次的时间 / 换成另一件事”，计划页可选择“从今天起 / 从明天起”修改循环规则
- 验收：inherit 不改历史、override 不被 rematerialize 覆盖、多态 action、并发 complete 409、substitute 单事务；`TestScheduleActionsSkipMoveSubstitute` 已覆盖 skip/move/substitute/add 及 add 幂等回放/冲突键，移动端仍需 Simulator/Emulator 动作验收

---

## 8. 功能准入三问

任何 PR 必须回答：

1. **属于哪一层？** L0–L2 改形需架构评审；L3–L4 只需接口评审。
2. **使用哪条地基 API？** 列出路径；若无，先补地基，不做平行实现。
3. **对应 Tab 准入哪一句？** 答不出则不做进该 Tab。

---

## 9. 安全与稳定

- 所有 Pet 写路径经 `RequirePet`；延伸层不得缓存「绕过权限」的副本。
- 创建型 POST 必须 `Idempotency-Key`；客户端 foundation Writers 统一注入。
- Rule 版本选择必须按 Rule 自己的 IANA 时区计算 civil date；禁止用数据库会话的 `CURRENT_DATE` 代替。
- 分享 token 只读；匿名写回（若做）必须是 **独立、可审计、可过期** 的延伸 endpoint，不能写入 Family 私有数据。
- 地基 migration **只增不拆**；列删除需 major 版本与数据迁移计划。

---

## 10. L1 排程模型：可复用 · 多态 · 可继承

Care Plan **是循环的**，但用户操作的永远是 **某一天的某一格**。
L1 的三条核心思想（**不是 OOP class 继承**，是领域继承）：

| 原则 | 含义 | 在地基中的体现 |
|------|------|----------------|
| **可继承** | 上层定义向下传递，子级可覆盖、不可静默篡改已终结历史 | Plan → Rule → Slot → Occurrence；Rule 版本链 `effective_from/to` |
| **多态** | 同一套接口，不同 kind 不同行为 | `Schedule` kind；`Override` kind；`action × scope` 统一入口 |
| **可复用** | 同一管线服务循环格、临时格、替换格、完成/跳过 | 一条 expand 管线、一套 complete 状态机、一种 Today 投影 |

```text
CarePlan                    意图（可继承的根）
    │
    └── CareRule[]          循环定义 + 版本链（effective_from/to）
            │
            └── Slot        虚拟格 (rule_id, due_date) — expand 算出，未触碰不落库
                    │
                    ├── CareOverride?     多态例外：skip | move | replace
                    │
                    └── CareOccurrence?   被触碰才 materialize（完成/跳过/需稳定 id）
```

Today = `expand(rules) ⊕ overrides ⊕ materialized` — **一条查询管线**，不 fork 第二套待办。

### 10.1 可继承（Inheritance）

**定义向下传，历史向上锁。**

```text
Plan  ──继承──►  Rule  ──继承──►  Slot（默认 due_at、title、assignee）
                      │
                      └── Rule'（新版本，effective_from = 明天）──►  新 default
```

| 层级 | 继承什么 | 覆盖规则 |
|------|----------|----------|
| Plan → Rule | 标题、类型、默认执行人 | 新 Rule 版本 **追加**，不删旧版本 |
| Rule → Slot | 哪天出格、几点、时区 | `ScheduledOn` 纯函数计算 |
| Slot → Occurrence | snapshot 固化执行当时的事实 | **仅** complete/skip 时写入；父级后续变更不改写 |

**永久改循环** = 继承链上 **插入新 Rule 版本**（已有 `effective_from/to`），不是改全局一行。
**仅改今天** = **不碰继承链**，在 Slot 上叠 Override（见 §10.2）。

不变式：**终端态 Occurrence（completed / skipped）与已生效 Override，禁止被 rematerialize 静默覆盖。**

### 10.2 多态（Polymorphism）

**同一套「槽位 + 动作 + 作用域」，不同 kind 不同语义。**

#### Schedule 多态（何时出格）

```json
{"v":1,"kind":"daily"}
{"v":1,"kind":"weekly","days":[1,3,5]}
{"v":1,"kind":"once","date":"2026-08-28"}
```

统一入口：`ParseSchedule` → `ScheduledOn(date)` — 新增 kind 只扩展策略，不改 Today 结构。

#### Override 多态（如何改格）

| kind | 行为 | 用户场景 |
|------|------|----------|
| `skip` | 此格不出现在 Today | 今天不看医生 |
| `move` | 改 `due_at`，Rule 不变 | 今天改到 19:00 |
| `replace` | skip 原格 + 指向替代 ad-hoc | 医生 → 公园 |

#### Action × Scope 多态（用户只选作用域）

统一写入口（概念）：`POST /care-schedule/actions { action, scope, slot, payload }`

| scope | 多态分支 | 存储 |
|-------|----------|------|
| `this` | skip / move / replace / add | Override |
| `from_date` / `rule` | change_rule | 新 Rule 版本 |

UI 只暴露 **仅这次 / 从某天起 / 整个计划**；服务端多态分发，用户不见多套 API。

### 10.3 可复用（Reuse）

**一条管线，所有照护形态共用。**

| 复用什么 | 共用对象 | 禁止 |
|----------|----------|------|
| 读 Today | `expand ⊕ override ⊕ join occurrence` | 循环 todo 表、分享 todo 表 |
| 写完成 | Occurrence 状态机 + 409 + Idempotency | 按 plan 类型分叉 complete |
| 写事实 | Pet Event ← `care_occurrence_id` | 完成不写 Event |
| 客户端 | `foundation` Writers / Readers | feature 直连 API |
| 延伸层 | 只读 Today / Timeline 聚合 | L3/L4 自建 Occurrence |

循环喂饭、每周看医生、临时去公园、substitute — **同一 Slot 模型、同一 complete、同一 Timeline**。

### 10.4 时间修改：三种作用域（三原则的具体化）

| 作用域 | 用户说法 | 机制 | 触及继承链？ |
|--------|----------|------|--------------|
| **仅此一次** | 今天改 19:00 | Override `move` | 否 |
| **从某天起** | 明天起都 8:00 | 新 Rule 版本 | 是（追加） |
| **整个计划** | 周三改周二 | 新 Rule 版本 + schedule kind | 是（追加） |

规则：

- 只能 override **虚拟 / pending** 格；已 complete 走 undo 或 Timeline note。
- 未来格可 move，不可 complete（`due_at > now`）。
- `due_date` = 圈时区 civil date。

### 10.5 完成态与多人并发（可复用的写管线 · 已实现）

Occurrence 是唯一完成单位；**循环格与 ad-hoc 格走同一状态机**：

```text
pending ──complete──► completed
pending ──skip──────► skipped
pending ──(超时)────► missed
completed|skipped ──undo──► pending|missed
```

**多人抢完成：** `FOR UPDATE` + `WHERE status IN ('pending','missed')` → 409 `TASK_LOG_EXISTS` + 权威 log。
第一次 complete 时对虚拟 Slot **惰性 materialize**（upsert `(rule_id, due_date)`）。

### 10.6 Substitute（多态组合：skip + ad-hoc）

「今天不看医生，改去公园」= 单事务：

1. Override `skip` on `(rule, today)`
2. Ad-hoc Slot（`once` plan 或 `source=ad_hoc`）+ 可选 `replaces_slot`
3. Pet Event 可审计

Today：skip 格不出现；公园格走同一 complete 管线。

### 10.7 Phase D API（可复用写入口）

| 能力 | action | scope |
|------|--------|-------|
| 改此格时间 | `move` | `this` |
| 取消此格 | `skip` | `this` |
| 临时加一条 | `add` | `this` |
| 取消并替换 | `substitute` | `this` |
| 改循环/永久时间 | `change_rule` | `from_date` / `rule` |
| 完成/跳过/撤销 | `complete` / `skip` / `undo` | —（已有） |

实现：`care_plans.family_id` + `care_schedule_overrides` + Rule 版本链 + 惰性 Occurrence；**不新建平行 todo 表**。多家庭宠物创建计划或执行 `add` 时必须明确照护归属，服务端按该家庭时区生成 civil date/time；缺少归属会拒绝写入，不再静默取第一家庭。旧的无家庭计划仅在宠物无家庭的无范围视图保留；一旦进入家庭工作区，计划必须有明确的 `family_id`，避免跨家庭显示或协作。
客户端：经 `foundation` Writers；延伸层只读。

### 10.8 不变式（L1）

6. 逻辑槽位唯一：generated `(care_rule_id, due_date)`；materialized 与之一一对应。
7. Override 与终端态 Occurrence **禁止**被 expand/rematerialize 静默覆盖。
8. 完成/跳过 → Pet Event，`source=auto_care`，payload dedupe。
9. Ad-hoc / substitute 不复制 Plan 表；用 Override + 链接表达。

### 10.9 体验原则

- **Today**：expand ⊕ override 后的 **可执行槽位**。
- **计划页**：继承链（Rule 版本）+ Override 摘要 + 未来预览。
- **时间线**：Occurrence 触发的 fact + 人工 note。
- **改时间必先选作用域** → 映射到继承（新 Rule）或覆盖（Override）。

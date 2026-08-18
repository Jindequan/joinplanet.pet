# PLANET APP 后端设计（BACKEND-DESIGN）

- 状态：v1（2026-08-18），待创始人评审
- 上游事实来源：`APP-DESIGN.md`（业务事实模型）、`API-CONTRACT.md`（接口契约）、`APP-TECH-STACK.md`（技术选型）、`mobile/src/lib/api.ts` + `queries.ts`（客户端现状，含 V1.5 扩展）
- 范围：APP 本体后端（代号 `planet-api`）。**明确排除** landing page 的 `server/lemon-webhook`（营销/支付/线索，独立生命周期，禁止共享数据库与代码）
- 部署约束：单台 1GB 内存 VPS（与 landing 同机），PostgreSQL，媒体走 Cloudflare R2，邮件走 Resend

---

## 0. 设计原则

1. **事实模型优先**：先冻结"谁在哪个圈、照顾哪只宠、什么角色、能做什么、删了会怎样"，业务功能（Today/Timeline/分享）只在其上叠加。
2. **单体但模块化**：一个 Go 二进制 + 清晰模块边界。1GB 内存、单人开发，微服务是负资产；模块边界保证将来可拆而不必拆。
3. **迁移版本化，运行时零 DDL**：数据库结构只能由 migration 改变，服务启动时绝不执行 `CREATE TABLE IF NOT EXISTS`。
4. **权限单点**：每个资源访问必须经过同一条 `user → membership → role → resource` 判定路径，禁止散落的 if。
5. **契约稳定**：错误码、响应形状一旦发布即冻结，只增不改；mobile 客户端是第一消费者。
6. **扩展用注册表，不用改表**：事件类型、分享类型、权益 key、任务排程语法都设计为"加注册项"而非"改结构"。
7. **不写投机代码**：明确列出暂不引入的东西（见 §14），成熟度的一部分是知道什么不做。

---

## 1. 架构总览

```text
┌────────────┐   HTTPS Bearer   ┌─────────────────────────────┐
│ Expo App    │ ───────────────▶│ Caddy (TLS, api.joinplanet.pet) │
│ (iOS/Andr.) │                  └──────────────┬──────────────┘
└────────────┘                                  │
                       ┌────────────────────────▼─────────────────┐
                       │ planet-api (Go 单二进制, systemd)         │
                       │  HTTP server + 内嵌 job runner(按需)      │
                       └───────┬──────────────────┬───────────────┘
                               │                  │ presign/管理
                        ┌──────▼──────┐    ┌──────▼──────┐   ┌─────────┐
                        │ PostgreSQL  │    │ Cloudflare R2 │   │ Resend  │
                        │ (同机,独立库)│    │ (媒体/备份)   │   │ (验证码/ │
                        └─────────────┘    └──────────────┘   │  摘要)  │
                                                               └─────────┘
        APP ── presigned PUT/GET ──▶ R2（媒体字节不经过服务器）
```

### 1.1 两个二进制

| 二进制 | 职责 |
|---|---|
| `planet-api` | HTTP 服务，只做 DML，通过 `planet_app` 角色 |
| `planet-cli` | `migrate up/down/status`、`demo-seed`、`purge-r2`、`digest-send`、`backup`、`grant` 等运维子命令，migration 通过 `planet_owner` 角色 |

定时任务用 **systemd timer 调 planet-cli 子命令**，不跑常驻队列。

### 1.2 模块划分与依赖规则

> **实现仓库（2026-08-18 起）**：独立仓库 `/Users/devin/code/planet-api`（与 joinplanet.pet 平级，零共享）。
> B0–B5 已实现并通过集成测试；当前状态见该仓库 `ARCHITECTURE.md`。
> 下方布局为设计意图，实际以实现仓库为准（migrations 位于仓库顶层 `migrations/`）。

```text
planet-api/                    # 独立仓库
├── cmd/planet-api/            # HTTP 服务入口
├── cmd/planet-cli/            # 迁移/建库/演示数据 CLI
├── internal/platform/         # 横切设施：config/db/httpx/email/clockx
├── internal/contracts/        # 跨模块共享领域类型与接口（依赖规则的关键）
├── internal/modules/          # 业务模块
│   ├── identity/     users, login_codes, sessions        [B1 ✅]
│   ├── entitlements/ 权益与配额引擎                        [B1 ✅]
│   ├── circles/      circles, members, invitations        [B2 ✅]
│   ├── pets/         pets, profile, archive               [B3 ✅]
│   ├── meds/         medications（桥接 timeline）          [B4 ✅]
│   ├── tasks/        care_tasks, task_logs, today 视图     [B5 ✅]
│   ├── timeline/     timeline_events（类型注册表）          [B4/B6 部分✅]
│   ├── attachments/  附件元数据 + R2 上传/下载             [B6 ⬜]
│   ├── sharing/      share_links + 匿名只读视图            [B7 ⬜]
│   ├── lifecycle/    export / delete / 级联               [B8 ⬜]
│   └── digest/       每日摘要（dedupe: digest_sends）      [B9 ⬜]
├── migrations/                # 版本化 SQL（embed，NNNN_*.up/down.sql）
├── test/integration/          # 集成测试（真 PG + httptest 全栈 + 并发）
├── deploy/                    # systemd units, Caddyfile, pg-tuning.conf, db-roles.sql, deploy.sh
└── Makefile
```

**依赖规则**：`modules/*` 只依赖 `platform/*` 和其他模块的**公开 Service 接口**（Go interface，在 `internal/modules/api.go` 汇总注册），禁止跨模块 import 别人的 repo 层。例：meds 停药要写 timeline 事件，调用 `timeline.Service.RecordAuto(...)`，而不是直接 INSERT timeline 表。

模块内部固定四层：`domain.go`（实体与规则）→ `service.go`（业务，事务边界）→ `repo.go`（SQL，尽量 sqlc 生成）→ `http.go`（路由与 DTO）。HTTP 层永远不直接碰 SQL。

---

## 2. 工程基线（Phase B0，一切之前）

### 2.1 Migration 纪律

- 工具：**goose**（纯 SQL，无 ORM 魔法），文件名 `NNNN_module_描述.sql`，每个文件含 Up/Down。
- 生产只允许 `migrate up`，Down 仅用于开发；CI 在空库上跑 `up → 集成测试 → down → up` 验证可逆性。
- 结构变更遵循 **expand-contract**：先加列/表（兼容旧代码）→ 部署代码 → 下个版本删旧列。禁止一步 rename/drop。
- 部署顺序固定：**先 migrate（planet-cli, owner 角色）→ 再重启 planet-api**。

### 2.2 数据库角色

| 角色 | 权限 | 使用者 |
|---|---|---|
| `planet_owner` | 库内 DDL + DML | 仅 planet-cli migrate |
| `planet_app` | 业务表 DML（SELECT/INSERT/UPDATE/DELETE），**无 DDL** | 仅 planet-api |

应用被攻破也无法改 schema、无法读 landing 库。

### 2.3 请求管道

```text
recover(panic→500+日志) → request_id → 访问日志 → 限流 → CORS(仅APP域名) → authn(公开路由跳过) → 路由 → handler
```

- 日志：`slog` JSON，每行含 `request_id, route, status, latency_ms, user_id?, circle_id?`。**禁止吞错**：所有 error 必须落到日志（此前 today 500 被 NULL 日志掩埋的事故不得重演）。
- `/healthz`（存活）`/readyz`（DB ping + migration 版本一致才 200）。

### 2.4 测试策略

- **单元**：领域规则（配额、排程展开、时区、token）。
- **集成**：docker 起 PG，repo+service 测试跑真库，**SQL 不允许只测 mock**。
- **契约**：每个端点 golden-file 响应形状测试，锁死 mobile 依赖的 JSON 结构。
- **并发**：并行完成任务、并行建宠物触配额、并行上传确认，验证唯一约束与事务。
- 每阶段验收门槛 = 上述测试全绿 + 验收场景清单（见 §10 各阶段）。

---

## 3. 事实数据模型

### 3.1 ER 总览

```text
users ─┬─ sessions / login_codes / entitlements
       │
       └─ circle_members ──── circles ── invitations(invite_code)
                                 │
                                 └─ pets ─┬─ medications ─(auto)─ timeline_events
                                          ├─ care_tasks ── task_logs
                                          ├─ timeline_events ── attachments
                                          └─ share_links
circles ── digest_sends / storage_purges(运维)
```

核心权限事实：**用户不直接拥有宠物；用户通过"圈的成员"这一关系访问圈内的宠物。** 所有授权都从 `circle_members` 出发。

### 3.2 核心 Schema（B1–B7 迁移的最终形态）

```sql
-- ============ B1 身份 ============
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        CITEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  locale       TEXT NOT NULL DEFAULT 'zh-CN',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users(email);

CREATE TABLE login_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       CITEXT NOT NULL,
  code_hash   TEXT NOT NULL,              -- sha256(6位码)，绝不存明文
  expires_at  TIMESTAMPTZ NOT NULL,       -- 10 分钟
  consumed_at TIMESTAMPTZ,
  attempts    INT NOT NULL DEFAULT 0,     -- 错误计数，≥5 作废
  created_ip  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_login_codes_email_pending ON login_codes(email)
  WHERE consumed_at IS NULL;

CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,      -- sha256(256bit 随机 token)
  device_label TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,      -- 90 天滑动
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessions_user_active ON sessions(user_id) WHERE revoked_at IS NULL;

-- ============ B1 权益 ============
CREATE TABLE entitlements (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,               -- 'pro' | '*'（founding 通配）| ...
  source     TEXT NOT NULL,               -- 'founding'|'grant'|'iap'|...
  expires_at TIMESTAMPTZ,                 -- NULL=永久
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- ============ B2 圈 ============
CREATE TABLE circles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',  -- IANA 名，log_date 的依据
  created_by    UUID NOT NULL REFERENCES users(id),
  invite_code_hash TEXT NOT NULL,          -- 滚动邀请码 hash，Owner 可刷新
  invite_expires_at TIMESTAMPTZ,           -- 邀请码可带过期
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                -- 圈删除 = 软标记 + 异步清理
);

CREATE TABLE circle_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','caregiver')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,                 -- 移除/退出：置时间戳，保留历史归属
  UNIQUE (circle_id, user_id)             -- 含历史，重加入=复活原行
);
CREATE UNIQUE INDEX uq_member_active ON circle_members(circle_id, user_id)
  WHERE removed_at IS NULL;

-- "最后一个 owner 不可被移除/降级" 由触发器兜底（服务层事务先行校验）
CREATE FUNCTION guard_last_owner() RETURNS trigger AS $$
DECLARE active_owners INT;
BEGIN
  IF OLD.role = 'owner' AND TG_OP IN ('UPDATE','DELETE')
     AND (TG_OP='DELETE' OR NEW.removed_at IS NOT NULL OR NEW.role <> 'owner') THEN
    SELECT count(*) INTO active_owners FROM circle_members
    WHERE circle_id = OLD.circle_id AND role='owner' AND removed_at IS NULL
      AND id <> OLD.id;
    IF active_owners = 0 THEN
      RAISE EXCEPTION 'circle_must_keep_one_owner';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_last_owner BEFORE UPDATE OR DELETE ON circle_members
  FOR EACH ROW EXECUTE FUNCTION guard_last_owner();

-- ============ B3 宠物 ============
CREATE TABLE pets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  species     TEXT NOT NULL CHECK (species IN ('dog','cat','other')),
  breed       TEXT NOT NULL DEFAULT '',
  birth_date  DATE,                        -- 可未知
  sex         TEXT NOT NULL DEFAULT '' CHECK (sex IN ('','male','female')),
  neutered   BOOLEAN NOT NULL DEFAULT false,
  weight_g    INT,                         -- 最新体重(克)，由 weight 事件维护(冗余，见账本)
  archived_at TIMESTAMPTZ,                 -- 归档：只读+免配额+可导出
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  version     INT NOT NULL DEFAULT 1       -- 乐观锁
);
CREATE INDEX ix_pets_circle_active ON pets(circle_id) WHERE archived_at IS NULL;

-- 档案扩展：低频、结构演进的字段用 JSONB + 应用层 schema 校验
CREATE TABLE pet_profiles (
  pet_id        UUID PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
  allergies     JSONB NOT NULL DEFAULT '[]',   -- [{name, severity?, note?}]
  conditions    JSONB NOT NULL DEFAULT '[]',   -- [{name, since?, note?}]
  emergency_contacts JSONB NOT NULL DEFAULT '[]', -- [{name, phone, relation}]
  med_decision_maker JSONB,                   -- {name, phone} 医疗决定授权人
  notes         TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ B4 用药 ============
CREATE TABLE medications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id     UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  dose       TEXT NOT NULL DEFAULT '',
  schedule   TEXT NOT NULL DEFAULT '',     -- 人读的频次描述
  started_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_on   DATE,                         -- 停药写此处 + 自动 timeline 事件
  note       TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_meds_pet_active ON medications(pet_id) WHERE ended_on IS NULL;

-- ============ B5 今日任务 ============
CREATE TABLE care_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  pet_id      UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  schedule    JSONB NOT NULL,              -- {v:1, kind:'daily'|'weekly'|'interval', ...}
  time_of_day TIME,                        -- 提示时段（展示用）
  created_by  UUID NOT NULL REFERENCES users(id),
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_tasks_circle_active ON care_tasks(circle_id) WHERE archived_at IS NULL;

CREATE TABLE task_logs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id   UUID NOT NULL REFERENCES care_tasks(id) ON DELETE CASCADE,
  log_date  DATE NOT NULL,                 -- 按 circle 时区折算的"那天"
  status    TEXT NOT NULL CHECK (status IN ('done','skipped')),
  done_by   UUID NOT NULL REFERENCES users(id),
  done_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  note      TEXT NOT NULL DEFAULT ''
);
-- 幂等核心：同任务同天只有一条 log（重完成=改写/返回权威记录）
CREATE UNIQUE INDEX uq_task_log_date ON task_logs(task_id, log_date);
CREATE INDEX ix_task_logs_task_date ON task_logs(task_id, log_date DESC);

-- ============ B6 时间线与附件 ============
CREATE TABLE timeline_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,           -- 注册表制，见 §13.1
  occurred_at     TIMESTAMPTZ NOT NULL,    -- 事情发生时间（用户输入）
  recorded_by     UUID NOT NULL REFERENCES users(id),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  payload         JSONB NOT NULL DEFAULT '{}',  -- 按 type 校验
  payload_version INT NOT NULL DEFAULT 1,
  source          TEXT NOT NULL DEFAULT 'user' -- 'user'|'auto:med_start'|...
);
CREATE INDEX ix_events_pet_time ON timeline_events(pet_id, occurred_at DESC);

CREATE TABLE attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id         UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE, -- 冗余，见账本
  pet_id            UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  timeline_event_id UUID REFERENCES timeline_events(id) ON DELETE CASCADE,
  r2_key            TEXT NOT NULL UNIQUE,
  content_type      TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256            TEXT NOT NULL DEFAULT '',
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_attach_circle ON attachments(circle_id);   -- 配额求和用

-- 删除的物理清理走 WAL 模式：同事务删附件行+登记 purge，job 再删 R2
CREATE TABLE storage_purges (
  r2_key    TEXT PRIMARY KEY,
  reason    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ B7 分享 ============
CREATE TABLE share_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('care_card','summary','timeline')),
  token_hash    TEXT NOT NULL UNIQUE,      -- sha256(随机 token)，防拖库撞库
  options       JSONB NOT NULL DEFAULT '{}',  -- summary 字段选择/时间范围
  created_by    UUID NOT NULL REFERENCES users(id),
  expires_at    TIMESTAMPTZ NOT NULL,      -- 24/72/168h
  revoked_at    TIMESTAMPTZ,
  view_count    INT NOT NULL DEFAULT 0,    -- 冗余计数，见账本
  last_viewed_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_shares_pet ON share_links(pet_id);

-- ============ B9 摘要去重 ============
CREATE TABLE digest_sends (
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  send_date DATE NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, send_date)
);
```

用户可见业务数据（事件/任务/分享/宠物）按文档采用**硬删除**，靠 FK CASCADE 保证无孤儿；圈本身软标记后由清理 job 级联硬删。

### 3.3 冗余账本（每项去规范化必须有记录）

| 冗余字段 | 理由 | 维护方式 |
|---|---|---|
| `attachments.circle_id` | 配额 `SUM(size_bytes)` 不必 JOIN pets | 同事务写入 |
| `pets.weight_g` | Pet 页头最新体重，避免每次查 weight 事件 | weight 事件写入时同事务更新 |
| `task_logs.log_date` | 唯一约束做完成幂等 | done_at+circle tz 折算 |
| `share_links.view_count` | 列表展示，容忍微小丢失 | 匿名查看 `UPDATE ... SET view_count=view_count+1` |
| `timeline_events.source` | 审计"这是人记的还是用药自动生成的" | 只写不改 |

除账本所列，其余严格 3NF（例如事件不存 circle_id，经 pet 推导）。

### 3.4 决策记录（有争议点的最终裁定）

| # | 决策 | 理由 |
|---|---|---|
| D1 | task log 的 Undo = **硬删 log 行**，v1 不留审计 | Today 语义干净、可重复完成；审计需求出现时加 audit 表，不反过来迁就 |
| D2 | **订阅锚定模型**（2026-08-18 修订，原"圈档=圈主权益"作废）：权益在 user 层；付费用户将订阅**锚定**到一个圈；圈档位 = 成员中锚定到本圈的最优权益；换锚即时生效；降级宽限=存量可读、新增拒绝；锚随成员退出自动释放；拥有圈数上限 free 1 / pro 3（防拆圈绕配额） | 付费跟人走：宠物去世、照护重心移到别的家庭时，订阅可用性不损失（PRODUCT-SPEC §2.4） |
| D3 | 宠物**软归档**（MEMORIAL：只读、免配额、可导出）+ 显式**硬删除**（需确认） | 与 V1.5 客户端一致；纪念态是情感产品的核心状态 |
| D4 | 登录码/session/邀请码/分享 token 全部**只存 hash** | 拖库不泄露可用凭证 |
| D5 | 分享失效在**查询时判定**（`expires_at>now AND revoked_at IS NULL`），不靠清理任务 | 撤销必须即时生效 |
| D6 | medication start/stop **自动生成** timeline 事件（`auto:med`），普通任务完成**不进** timeline | 保住"长期健康记忆 vs 短期协作状态"的产品语义分界 |
| D7 | 多宠物/多圈为**事实模型**（配额内），单宠文档描述作废 | 与 V1.5 客户端及配额体系一致 |
| D8 | **家庭删除 = 清空才能删 + 30 天软删恢复窗**（AWS 式）；孤儿宠物态/guardians 推迟 V2 | 误删有后悔药、销毁有强制清醒，零孤儿机制；家庭解散抢救是 V2 场景（PRODUCT-SPEC §2.2/2.5） |
| D9 | **任务模板属于宠物**（随宠物转移/处置走），不是家庭资产 | 每个任务都是宠物绑定的照护配置；接手家庭必须拿到完整用药提醒 |
| D10 | **宠物转移 = 双同意**（源圈 owner 发起 + 目标圈 owner 接受），事务内改归属 + 撤销全部分享 + 记录 transfer 事件 | 防误搬/盗搬；照护连续性可审计 |

---

## 4. 认证与权限

### 4.1 认证流程（邮箱验证码）

```text
POST /api/v1/auth/request-code {email}
  ├─ 限流: 同邮箱 1/分钟、10/天; 同 IP 30/小时
  ├─ 生成 6 位码 → 存 sha256 hash, 10 分钟有效, 返回 202（无论邮箱是否存在）
  └─ AUTH_DEV_MODE=1 时仅日志输出不真发（生产强制关闭，启动检查）

POST /api/v1/auth/verify-code {email, code}
  ├─ 原子消费: UPDATE login_codes SET consumed_at=now()
  │   WHERE email=$1 AND consumed_at IS NULL AND expires_at>now() AND code_hash=$2
  ├─ 用户不存在 → 事务内创建（登录即注册）
  └─ 创建 session（256bit token，返回明文仅此一次），90 天滑动续期

DELETE /api/v1/auth/session   → revoke 当前 session
GET  /api/v1/me               → user + entitlements + 摘要
```

防穷举：单码 `attempts≥5` 作废；verify 失败也计入限流。

### 4.2 授权模型（单一 choke point）

每个模块 service 调用共享的 `access` 助手，禁止 handler 自行判断：

```go
// 伪代码：所有资源访问的唯一路径
func (a *Access) RequirePet(ctx, petID, want Role) (Pet, Member, error) {
    pet := petsRepo.Get(petID)                  // 不存在 → 404
    m := membersRepo.ActiveMember(pet.CircleID, ctx.UserID) // 非成员 → 404（不泄露存在性）
    if want == Owner && m.Role != "owner" { return 403 ROLE_FORBIDDEN }
    if pet.Archived && mutation { return 409 PET_ARCHIVED }  // 归档只读
    return pet, m, nil
}
```

**404/403 策略**：非成员一律 404 RESOURCE_NOT_FOUND（不泄露资源存在）；成员但角色不足 403 ROLE_FORBIDDEN。

### 4.3 角色矩阵（服务端强制，与前端无关）

| 操作 | Owner | Caregiver | 匿名分享接收方 |
|---|---:|---:|---:|
| 完成任务 / 记录事件 / 上传附件 | ✅ | ✅ | ❌ |
| 编辑宠物档案 / 用药增删 | ✅ | ✅（增/停）| ❌ |
| 删除用药 / 删除宠物 / 解散圈 | ✅ | ❌ | ❌ |
| 邀请 / 移除成员 / 刷新邀请码 | ✅ | ❌ | ❌ |
| 创建 / 撤销分享 | ✅ | ❌ | ❌ |
| 编辑/删除别人的事件 | ✅ | 仅自己的 | ❌ |
| Care Card / Summary 只读视图 | — | — | ✅（限 kind 范围） |

---

## 5. 权益与配额引擎

```go
// entitlements.Service
Can(userID, key) bool        // key=='*' 命中 founding 通配；expires_at 判定
CircleTier(circleID) Plan    // = 圈 Owner 的最优权益 → Free/Pro
```

配额在**写事务内**检查（防并发超卖）：

```sql
-- 例：创建宠物（事务内）
SELECT count(*) FROM pets
 WHERE circle_id=$1 AND archived_at IS NULL FOR UPDATE;  -- 圈级串行化点
-- ≥ 配额 → 403 QUOTA_PETS_EXCEEDED
```

| 配额 | Free | Pro（`pro` 权益） | 错误码 |
|---|---|---|---|
| **拥有的家庭**（用户为活跃 owner 的圈数） | 1 | 3 | `QUOTA_FAMILIES_EXCEEDED` |
| 成员/圈 | 2 | 8 | `QUOTA_MEMBERS_EXCEEDED` |
| 活跃宠物/圈 | 2 | 25 | `QUOTA_PETS_EXCEEDED` |
| 附件总量/圈（B6+，V1 冻结） | 50MB | 10GB | `QUOTA_STORAGE_EXCEEDED` |
| 单文件（B6+） | 10MB | 50MB | `PAYLOAD_TOO_LARGE` |

归档宠物不占宠物槽。`GET /api/v1/circles/{id}/usage` 返回各项用量（含超限标记，降级宽限用）。

### 5.1 锚定模型实现（D2）

```sql
CREATE TABLE subscription_anchors (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  circle_id  UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  anchored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_anchor_circle ON subscription_anchors(circle_id);
```

- 只有持有付费权益（`pro`/`*`）的用户才有锚；free 用户无锚（默认档）。
- 首建圈时若持有付费权益 → 自动锚定。
- 圈档位解析（唯一收口 `circlePlan`）改为：`SELECT max(e.key 权益序) FROM subscription_anchors a JOIN entitlements e ON e.user_id=a.user_id WHERE a.circle_id=$1 AND e 未过期`；无行 → free。
- 换锚：`PUT /api/v1/subscription/anchor {circle_id}`（须为目标圈成员）→ 即时生效；旧圈进入降级宽限。
- 降级宽限：`circlePlan` 返回 `{plan, over_pets, over_members}`；超限时**新增**被拒（错误码不变），存量读写照常。成员退出/被移除时若其锚在本圈 → DELETE 锚行（`ON DELETE CASCADE` 于成员关系变化的服务层处理）。

---

## 6. 媒体（Cloudflare R2）

### 6.1 上传（presigned 直传，字节不过服务器）

```text
1. POST /api/v1/uploads {pet_id, content_type, size, sha256}
   ├─ 权限: RequirePet(caregiver) + 归档拒绝 + 单文件大小 + 类型白名单(image/*, application/pdf)
   ├─ 事务内预扣配额: SELECT ... FOR UPDATE 累加检查 → 插入 attachments 行(status 由 r2_key 存在即待确认)
   └─ 返回 {attachment_id, presigned_put_url(15min), r2_key}
2. APP → PUT R2（Content-Type 强制匹配）
3. POST /api/v1/uploads/{id}/confirm
   ├─ HEAD R2 校验 size/content-type（不信任客户端声明）
   ├─ 幂等：重复 confirm 返回同样结果
   └─ 失败/超时 → 附件行入 storage_purges，配额回滚
```

Key 布局：`circles/{circleID}/pets/{petID}/{attachmentID}.{ext}`——前缀即归属，便于圈级清理。

### 6.2 读取与删除

- 读取一律 API 签发**短时 presigned GET（10 分钟）**，桶私有、无公开对象、无公开基址。
- 删除 = 同事务 `DELETE attachments` + `INSERT storage_purges`；`planet-cli purge-r2`（systemd timer 每 15 分钟）消费队列删 R2 对象，成功即删行——**数据库一致性立即、物理删除最终**。
- 孤儿清扫：`planet-cli sweep-r2 --dry-run` 对比 R2 listing 与 DB（按圈前缀分页），删除创建超 24h 且无引用的对象。
- 客户端照旧先用 `expo-image-manipulator` 压到宽 1600 / 质量 0.8 再上传。

---

## 7. 分享系统（照护交接凭证，不是社交）

```text
POST /api/v1/pets/{id}/shares {kind, ttl_hours∈{24,72,168}, options}
  → 仅 Owner；返回明文 token（仅此一次）
GET  /api/v1/shares/{token}      ← 匿名、限流（IP 60/min）、无需注册
DELETE /api/v1/shares/{id}       → 撤销（Owner），立即生效（D5）
```

- token：32 字节随机 → base64url，库中只存 sha256；不可枚举、不可拖库复用。
- **按 kind 严格裁剪响应**：
  - `care_card`：今日任务（圈 tz 当天）+ 紧急联系人 + 医疗决定人。**绝不含病史/timeline**。
  - `summary`：Owner 勾选的字段 × 时间范围的就诊摘要（档案/用药/事件过滤），打印友好 HTML 由 mobile/Web 渲染，API 只给数据。
  - `timeline`：指定范围事件（只读）。
- 过期或撤销 → `410 SHARE_GONE`；不存在 → 同样 410（不泄露）。
- `view_count`/`last_viewed_at` 回显给 Owner（"寄养人看过了"）。

---

## 8. 时间语义

- 一切存储 `TIMESTAMPTZ`（UTC）；`log_date`/`started_on`/`birth_date` 等"日"粒度按 **circle.timezone**（IANA）折算。
- `GET /today?date=YYYY-MM-DD`：缺省 = 服务端按圈 tz 算出的今天；拒绝超前日期（补记仅限过去 N=7 天，防伪造未来）。
- 每日摘要/清理 timer 的"天"同样以各圈 tz 判定（job 内按圈分组处理）。
- 集成测试必须含 DST 边界与跨时区成员用例（服务器 UTC、圈 Asia/Shanghai）。

---

## 8A. 家庭生命周期与宠物转移（V1 定稿，2026-08-18）

### 8A.1 所有权移交

```text
POST /api/v1/circles/{id}/transfer {to_user_id}    仅 owner；目标须为活跃成员
事务内：目标成员 role → owner（先加），发起者 role → caregiver（后降）
触发器天然放行（降级时已存在另一活跃 owner）
```

### 8A.2 家庭删除（清空才能删 + 30 天恢复窗，D8）

```text
DELETE /api/v1/circles/{id}    仅 owner
├─ 圈内存在任何宠物（活跃或 MEMORIAL）→ 409 FAMILY_NOT_EMPTY
├─ 通过 → circles.deleted_at = now()（既有列，查询已过滤）
│          邀请码即失效、成员访问即断（现有 WHERE deleted_at IS NULL 已覆盖）
├─ 30 天内：POST /api/v1/circles/{id}/restore（发起删除的 owner 可恢复）
└─ 到期：清理 job 硬删（含成员行——触发器 v2 对"圈正在被删除"的级联放行，已实现）
```

### 8A.3 宠物转移（双同意，D10）

```text
POST /api/v1/pets/{id}/transfer {to_circle_id}   源圈 owner 发起 → pet_transfers 行（PENDING）
POST /api/v1/transfers/{id}/accept               目标圈 owner 接受（校验目标宠物槽位）
POST /api/v1/transfers/{id}/decline              目标圈 owner 拒绝
接受事务内：
  UPDATE pets SET circle_id=目标（触发器无碍）
  UPDATE care_tasks SET circle_id=目标           -- 任务模板随宠物走（D9）
  撤销该宠物全部 share_links（revoked_at=now）  -- 旧家庭不应继续可见
  INSERT timeline_events(type='transfer', source='auto:transfer',
    payload={from_circle, to_circle})            -- 注册表新增 auto 类型
```

- 用药/事件/任务执行史经 `pet_id` 外键自然跟随；`recorded_by` 引用全局 users 表，跨圈名字仍可解析。
- 发起方撤回：`DELETE /api/v1/transfers/{id}`（PENDING 时）。
- schema 新增：`pet_transfers(id, pet_id, from_circle, to_circle, status PENDING|ACCEPTED|DECLINED|CANCELLED, created_by, decided_by, created_at, decided_at)`。

---

## 9. 数据生命周期能力地图（阶段标注）

| 实体 | 创建 | 编辑 | 撤回/Undo | 归档 | 导出 | 删除 | 级联 |
|---|---|---|---|---|---|---|---|
| user | B1 | B1(name) | — | — | B8 | B8(账号注销) | sessions/codes/entitlements 级联；owned circles 先转移或删除 |
| circle | B2 | B2(name/tz) | — | — | B8 | B8(软标→job 硬清) | 全圈级联 |
| member | B2(invite) | —(角色不可降) | B2(退出=移除) | — | B8(历史归属) | B2(Owner移除) | 行保留 removed_at，记录归属不孤儿 |
| pet | B3 | B3(乐观锁) | — | B3(archive/restore) | B8 | B3(硬删,确认) | meds/tasks/events/attachments/shares 级联 |
| medication | B4 | B4 | — | ended_on 即停 | B8 | B4(Owner) | auto 事件保留（历史事实） |
| care_task | B5 | B5 | — | B5 | B8 | B5(Owner) | logs 级联 |
| task_log | B5(done/skipped) | note 可改 | B5(Undo=删) | — | B8 | 随 task | — |
| timeline_event | B6 | B6(本人或Owner) | B6(删) | — | B8 | B6(删) | attachments 级联 |
| attachment | B6 | — | — | — | B8(presign清单) | B6 | R2 物理删异步(purge) |
| share | B7 | — | B7(revoke 即时) | — | — | B7(过期自动失效+清理) | 随 pet |
| entitlement | B1(grant) | — | — | — | — | B1(cli) | 随 user |

---

## 10. 分阶段推进计划

每阶段固定交付物：migration(s) + 模块代码 + 集成/契约/并发测试 + 验收清单全过 + `planet-cli` 所需子命令。**上一阶段门槛不过，不开下一阶段。**

> **V1 边界冻结（2026-08-18，见 PRODUCT-SPEC §3）**：V1 = 纯数据库形态（无图片/附件）。
> B0–B5、B7 已实现并通过验收；B6（R2 附件）整体推迟到 V2。
> **V1 收尾项（下述 B10）完成后 V1 关版。**

### B10 V1 收尾（2026-08-18 新增，V1 关版条件）
- 锚定模型（§5.1）：`subscription_anchors` 迁移、`circlePlan` 单点改造、`PUT /api/v1/subscription/anchor`、降级宽限（usage 含 over 标记）、拥有圈数上限（`QUOTA_FAMILIES_EXCEEDED`）。
- 家庭治理（§8A.1/8A.2）：所有权移交、删除家庭（FAMILY_NOT_EMPTY + 30 天恢复窗 + 到期清理 job）。
- 宠物转移（§8A.3）：`pet_transfers` + 双同意流 + 分享自动撤销 + `auto:transfer` 事件注册。
- **验收**：付费用户换锚后旧圈降级不删数据、新圈即时升档；删家庭必须先清空；转移后任务模板可见于新家庭、旧分享全部 410；并发换锚/转移安全。

### B0 工程地基（无业务）✅
- 仓库脚手架、CI（build/vet/test/集成 PG/migration up-down-up）、双 DB 角色、config、日志、错误契约、`/healthz` `/readyz`、Caddy+systemd 骨架。
- **验收**：空库一键迁移+回滚；app 角色执行 DDL 被拒；每条日志带 request_id；演示 500 场景日志完整可查。

### B1 身份与权益
- 表：users/login_codes/sessions/entitlements。
- API：`request-code`/`verify-code`/`logout`/`me`；限流与 attempts；AUTH_DEV_MODE。
- **验收**：同邮箱重复登录稳定；码单次消费、10 分钟过期、5 次作废；撤销 session 后旧 token 立即 401；`Can(uid,'*')` founding 通配生效。

### B2 圈与成员（第一个配额点）
- 表：circles/circle_members(+触发器)/invitations 语义并入滚动邀请码。
- API：建圈、列表、详情；`POST /circles/{id}/join`（邀请码）、刷新码、移除成员、退出；首个圈自动建（对齐 mobile F3 语义）。
- **验收**：移除最后一个 owner 被 DB 拒绝；被移除成员旧 token 立即 403；重复加入复活成员关系而非报错；free 成员=2 触发 `QUOTA_MEMBERS_EXCEEDED`；并发加入不超卖。

### B3 宠物与档案
- 表：pets/pet_profiles；archive/restore；乐观锁 version。
- API：宠 CRUD、archive/unarchive（对齐 mobile V1.5）、档案读写。
- **验收**：caregiver 不能删宠/解档；归档宠一切写请求 409 `PET_ARCHIVED`、不占槽、可读可导出预览；并发编辑冲突返回 409 + 最新版本；配额含归档豁免正确。

### B4 用药（桥接时间线的第一个 auto 事件）
- 表：medications。
- API：增改停；停药事务内写 `ended_on` + 生成 `medication_end` 事件（幂等：已有则不重复）。
- **验收**：重复停药不产生重复事件；事件 source=`auto:med_end` 且不可被普通编辑删除；事件随 pet 导出。

### B5 今日照护协作
- 表：care_tasks/task_logs；schedule v1 语法 `{v:1,kind:'daily'|'weekly'|'interval',days?[],every_n?}`。
- API：任务 CRUD（Owner 删）、`GET /circles/{id}/today?date=`、`POST /tasks/{id}/logs`、`POST /task-logs/{id}/undo`。
- **验收**：两人同时完成→一个 409 返回权威 log，客户端静默采用（契约既有行为）；undo 后可重完成；跨时区/夏令时"今天"正确；未来日期拒绝、7 天内补记允许；普通任务完成**不产生** timeline 事件。

### B6 健康时间线 + R2 附件（**推迟至 V2**，2026-08-18）
- timeline 类型注册表首批：`symptom/weight/medication_note/vaccine/vet_visit/note/document`（payload schema 各自校验，含 V1.5 的 vaccine/document）。
- 上传三步流（§6.1）、presign 读取、purge 队列、孤儿清扫 CLI、`GET /usage`。
- **验收**：非成员拿不到 presign；超圈配额上传 403 `QUOTA_STORAGE_EXCEEDED` 且配额精确回滚；confirm 幂等；weight 事件同事务更新 pets.weight_g；删事件后 R2 对象在 purge 周期内消失；清扫 job 幂等重跑安全。

### B7 临时分享
- 表：share_links；API（§7）。
- **验收**：care_card 响应 JSON 中**搜不到任何历史事件字段**（用契约测试锁死）；撤销/过期后 410 且 view 计数冻结；token 枚举不可行（速率+熵）；匿名端点限流生效。

### B8 生命周期：导出与删除
- `POST /api/v1/export` → 全量 JSON（含归档宠、成员历史归属、任务与 logs、事件、附件 manifest+短时 presign 清单）。
- `DELETE /api/v1/pets/{id}`（需 `confirm_token`，先导出建议）、`DELETE /api/v1/account`（owned 圈需先转移或确认同删）。
- **验收**：导出可被脚本完整重放校验；删除后 DB 无孤儿（FK 断言测试）+ R2 前缀清空；owner 注销路径覆盖转移与同删两分支。

### B9 运维与增值（收尾）
- 每日摘要（Resend + digest_sends 去重 + 圈 tz）、过期数据清理 timer、`backup`（pg_dump → R2 `backups/` 前缀，保留 14 天）+ **恢复演练文档**、demo-seed（复刻 devin@planet.dev/Milo 演示数据）。
- **验收**：同圈同日摘要只发一次；从备份在空机恢复到可用通过一次真实演练。

---

## 11. API 错误契约（v1 冻结，只增不改）

```json
{ "error": { "code": "QUOTA_PETS_EXCEEDED", "message": "...', "request_id": "01J..." } }
```

| code | HTTP | 场景 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 请求体不合法（附 field 明细） |
| `UNAUTHENTICATED` | 401 | 无/坏/过期 session |
| `AUTH_RATE_LIMITED` | 429 | 验证码/登录限流 |
| `RESOURCE_NOT_FOUND` | 404 | 不存在**或**无隶属（不泄露） |
| `ROLE_FORBIDDEN` | 403 | 成员但角色不足 |
| `QUOTA_PETS/MEMBERS/STORAGE_EXCEEDED` | 403 | 配额（body 附 usage） |
| `PET_ARCHIVED` | 409 | 归档宠写操作 |
| `VERSION_CONFLICT` | 409 | 乐观锁失败（附最新版本） |
| `TASK_LOG_EXISTS` | 409 | 重复完成（附权威 log，客户端静默采用） |
| `PAYLOAD_TOO_LARGE` | 413 | 单文件超限 |
| `SHARE_GONE` | 410 | 过期/撤销/不存在 |
| `INTERNAL` | 500 | 兜底（日志必含 request_id） |

版本策略：`/api/v1` 内只做**增量**变更（新字段/新端点/新枚举），破坏性变更必须 `/api/v2` 并共存。

---

## 12. 部署与运维（1GB 预算）

### 12.1 内存预算（同机共存 landing 服务）

| 进程 | 预算 |
|---|---|
| OS + journald | ~150MB |
| PostgreSQL | ~280MB（shared_buffers=128MB, max_connections=40, work_mem=4MB, cache~384MB 上限） |
| planet-api | ≤128MB（GOMEMLIMIT=128MiB, 池 max 8 连接） |
| lemon-webhook(landing) | ~32MB（既有） |
| Caddy | ~32MB |
| **合计** | **~620MB，余量 ~380MB** |

PG 配置落盘 `deploy/pg-tuning.conf`；planet-api 与 landing **分库分角色**，互不可见。

### 12.2 部署序列（deploy 脚本固化）

```text
1. planet-cli migrate up        (owner 角色, 失败即停)
2. 滚动重启 planet-api          (systemd, ReadyOnceSec 健康门)
3. /readyz 200 才放流量
4. 失败回滚: 旧二进制切回; migration 遵循 expand-contract 故不需回滚 DDL
```

systemd timer 清单：`purge-r2`(15min)、`sweep-r2`(daily)、`digest`(每小时,按圈 tz 判断)、`backup`(daily 04:00 → R2)。

### 12.3 可观测性
- 全 JSON 日志进 journald；慢查询(>200ms)单独 WARN；5xx 附 request_id 供用户报障比对。
- `/readyz` 校验 migration 版本 = 二进制期望版本，防"代码超前于库"启动。

---

## 13. 扩展性设计（"加注册项，不改结构"）

1. **timeline 类型注册表**：`type` + `payload_version` + Go 侧 `map[Type]PayloadValidator`。V1.5 的 vaccine/document 已验证该路径；未来 AI 摘要、OCR 结果 = 新注册项 + 新 payload_version，旧数据不动。
2. **分享 kind 注册表**：kind + options 校验器 + 响应裁剪器，新分享形态零 schema 变更。
3. **权益 key-value + 通配**：新计划/新权益 = 插一行，配额表读 plan 配置（代码内 `PlanSpec` 结构），不改表。
4. **任务 schedule 语法版本化**（`schedule.v`）：v1 daily/weekly/interval，未来 rrule 子集升级为 v2，读取端按 v 分派。
5. **模块可拆**：digest/export 是最可能独立成 worker 的模块，因为它们已只依赖 Service 接口——迁移是"移动文件"而非重写。
6. **API v1 增量政策** + golden 契约测试，把"客户端永远不被迫崩"变成 CI 约束。

---

## 14. 明确不做（防投机清单）

不引入：Redis/Memcached、消息队列、outbox 模式、微服务、gRPC、GraphQL、ORM（sqlc 直控 SQL）、自建用户名密码体系、自建文件网关、分布式追踪、feature-flag SaaS（env 开关足够）。以上每项都在出现真实规模信号时再评估——1GB 单机 + 单人维护下，它们全是负债。

---

## 15. 文档同步义务（本设计的连带修订）

产品事实来源 = `PRODUCT-SPEC.md`（2026-08-18 起取代 PRD/MVP/APP-DESIGN/FINAL-PRODUCT-PLAN，旧文档归档于 docs/archive/）。本文档与 `API-CONTRACT.md` 为实现层唯一事实来源；B10 完成时须同步：API-CONTRACT 补锚定/家庭治理/宠物转移端点并标注实现状态。

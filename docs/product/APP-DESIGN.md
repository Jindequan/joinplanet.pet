# PLANET App 设计规划（Phase 1 MVP）

日期：2026-08-16（结构修订版：先业务功能与生命周期，后表设计）
状态：设计定稿，**开工以 Phase 0 门槛为前提**（10 个试点申请真实转化 + ≥5 个订金/付费，见 ROADMAP）
上游文档：[PRD](PRD.md) · [MVP 范围](MVP.md) · [设计方向](../design/DESIGN.md) · [路线图](../ROADMAP.md)

---

## 0. 一句话与边界

**做**：一个 PWA，让 2–4 人的家庭照护圈对一只宠物共享「今日任务 + 健康时间线 + 可撤销的临时分享」，就诊前一键生成 Vet-ready Summary。

**不做**（Phase 1 硬边界，来自 MVP.md）：

- AI 诊断/风险评级/用药建议；
- 医生账号、公开社交、电商保险硬件；
- 多宠物（schema 预留，UI 锁一宠一圈子）；
- 原生 iOS/Android；
- 复杂角色权限（只有 Owner / Caregiver / 临时链接三种视野）。

---

## 1. 业务功能与生命周期

### 1.1 三条生命周期主线

**用户生命周期**（谁在用、怎么来、怎么走）：

```text
落地页访客 → 试用申请(邮箱) → [付费成为founding会员] → 应用用户(验证码登录)
  → 建圈/受邀加入 → 日常使用 → (离开时)导出数据、注销
```

**宠物照护生命周期**（产品存在的理由，功能必须覆盖全程而非只覆盖生病时刻）：

```text
健康日常 → 出现异常 → (可能)确诊/用药/慢病 → 就医 → 交接/寄养 → 长期沉淀与记忆
```

**数据生命周期**（ROADMAP 明确要求）：创建 → 编辑 → 撤回 → 导出 → 删除。

### 1.2 业务功能清单：Phase 1 提供 8 个

**结论：Phase 1 向用户提供 8 个业务功能——4 个核心（直接对应照护生命周期的关键时刻）+ 4 个支撑（让核心成立的最小底座）。** 另有 2 个横切能力不计数（用户不感知为"功能"）。

| 编号 | 功能 | 类型 | 覆盖的生命周期阶段 | 一句话定义 |
|---|---|---|---|---|
| F1 | 身份与访问 | 支撑 | 用户：进入 | 邮箱验证码登录、会话管理 |
| F2 | 照护圈与成员 | 支撑 | 用户：建立协作 | 建圈、邀请、Owner/Caregiver 两角色 |
| F3 | 宠物档案 | 支撑 | 宠物：全程 | 基础信息、过敏、慢病、**用药清单**、紧急联系人、**紧急医疗授权** |
| F4 | 今日照护协作 | **核心** | 宠物：健康日常 | 任务模板 + 每日执行 + 完成人记录 + 卡片分享 |
| F5 | 健康时间线 | **核心** | 宠物：异常/慢病/沉淀 | ≤5 秒记录症状、体重、用药、就诊、照片 |
| F6 | 就诊准备 Summary | **核心** | 宠物：就医 | 从结构化数据拼装 Vet-ready 页，可勾选排除 |
| F7 | 临时分享 | **核心** | 宠物：交接/寄养 | 限时只读链接，可撤销，接收方免注册 |
| F8 | 数据生命周期 | 支撑 | 数据：全程 | 编辑、撤回、删除、导出 |

**横切能力（不计入功能数）**：

- T1 触达：每日摘要邮件（W4，Resend）；
- T2 会员兑换：founding 付款 → 终身身份（复用既有 `membership_claims` + email_hash）。

**为什么不更多**：每多一个功能就多一份 W1–W4 的实现与维护面。上表 8 个已覆盖三条生命周期的每个阶段且无孤岛（每个功能至少被一个阶段需要、每个阶段至少被一个功能覆盖）。候选功能（提醒推送、OCR、AI 摘要、多宠物、语音）全部有明确推迟位置，见 §8。

**为什么不更少**：去掉任何一个核心功能，照护生命周期就断一环——没有 F5 则 F6 无料可拼；没有 F7 则 F6 出不了门；没有 F4 则健康日常（占比最高的时间）无事可做，留存归零。

### 1.3 功能 × 生命周期 × 场景 对照（PRD 三场景归位）

| PRD 场景 | 生命周期阶段 | 功能链 |
|---|---|---|
| A 多人照护："今天谁喂过药" | 健康日常 | F2 → F4（→ T1 摘要邮件提醒不开 App 的那位） |
| B 就诊准备："完整病史 3 秒讲清" | 异常 → 就医 | F5 记录 → F3 用药清单 → F6 拼装 → F7 送达兽医 |
| C 临时交接："保姆只看今天" | 交接/寄养 | F7（sitter 视图 = 今日任务 + 紧急联系人含医疗授权人，不含病史） |

### 1.4 北极星能力地图（全生命周期 × Phase）

「为宠物提供全生命周期管理」的显式承诺。Phase 1 的 8 个功能只打验证靶心，但每个生命周期阶段都有归属能力、每个能力都有 Phase 标签，**全面性靠地图保证，工期靠 Phase 纪律保证**：

| 生命周期阶段 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| 领养/初到 | F3 档案 + 领养日事件 | — | — |
| 幼年 | 疫苗记录（F5） | 疫苗 due 提醒 | — |
| 成年日常 | F4 + F5 | — | — |
| 异常/急病 | F5 + 紧急医疗授权（F3） | — | — |
| 慢病/老年 | 用药清单 + 症状波动 | 体重趋势图、QoL 量表前置数据 | 生活质量量表 |
| 就医 | F6 + F7 | AI 辅助摘要、OCR 导入 | — |
| 交接/寄养 | F7 sitter 链接 | 实时推送 | 寄养模板包 |
| 临终/纪念 | — | — | 告别册/纪念页/数据赠予 |
| 横切 | 数据所有权（F8）、摘要邮件 | 多宠、推送 | 费用/保险理赔材料 |

（对标依据与竞品矩阵见 [团队审查报告](../research/DESIGN-REVIEW.md)，2026-08-16 复核。）

---

## 2. 技术架构（选型与理由）

```text
用户浏览器
   │
   ├── www.joinplanet.pet（Vercel，现有 Next.js）
   │      ├── /            营销页（现状不动）
   │      ├── /app/*       应用路由组（新增，登录后可用）
   │      └── /s/[token]   公开分享页（免登录，只读）
   │             │  Next.js rewrites: /api/* → api.joinplanet.pet（同源，绕开 CORS）
   │             ▼
   └── api.joinplanet.pet（现有 Go 二进制，扩展）
          ├── 既有 7 个端点（checkout/progress/intake/… 不动）
          ├── /api/v1/auth/*      F1
          ├── /api/v1/circle/*    F2
          ├── /api/v1/pet/*       F3（含 medications）
          ├── /api/v1/tasks/*     F4
          ├── /api/v1/timeline/*  F5（含附件）
          ├── /api/v1/share/*     F6 + F7（Summary 即一种 share kind）
          └── /api/v1/data/*      F8（导出/删除）
          PostgreSQL（同库新表，见 §3）  ·  Cloudflare R2（附件）
```

**关键决定与理由：**

| 决定 | 选择 | 理由 |
|---|---|---|
| 应用放哪 | 同一 Next.js 仓库 `/app` 路由组，不建第二个前端 | 单人开发者，一条部署流水线；营销页与 App 共用设计 token |
| 后端 | 扩展现有 Go 服务，按业务功能拆模块（auth.go / circle.go / pet.go / tasks.go / timeline.go / share.go / data.go） | 模块边界 = §1.2 的功能边界，代码结构跟着业务走 |
| 跨域 | Next rewrites 把 `/api/*` 代理到 Go 域名 | 浏览器只见同源，cookie 会话自然工作 |
| 认证 | 邮箱验证码/魔法链接 + httpOnly cookie 会话（7 天滑动续期） | 试点承诺要发邮件，Resend 基建本来就必须上；免密码摩擦最低 |
| 附件 | Cloudflare R2（S3 API），上传经 Go 代理签名 | 域名已在 Cloudflare；VPS 本地盘不可靠 |
| PDF | Phase 1 不做服务端 PDF：Summary 用打印优化网页 + 分享链接交付 | 接收方本就无需注册；服务端 PDF 推迟到有人真的抱怨 |
| PWA | manifest + 轻量 SW（app-shell 缓存），不做离线写 | 「安装到主屏」心智 > 真离线；离线写冲突不值工期 |

**未决问题（开工前确认）**：

1. Resend 账号 + `mail.joinplanet.pet` 的 SPF/DKIM（Cloudflare DNS）；
2. R2 bucket 与 `files.joinplanet.pet` 绑定；
3. Phase 0 门槛若未达标，本设计冻结不动工（ROADMAP 约定，写在这里防自我破例）。

---

## 3. 表设计（围绕业务功能）

### 3.1 设计方法

1. **先归一化到 3NF**：每个业务实体一张表、属性依赖主键、消除传递依赖；
2. **每张表都能回答"属于哪个功能"**（F1–F8），回答不了的不该存在；
3. **每处反范式都是显式决策**，进 §3.4 冗余清单并写明理由——冗余是买性能/演进性，不是偷懒。

### 3.2 功能 → 表 归属

| 功能 | 表 | 说明 |
|---|---|---|
| F1 身份与访问 | `users` `sessions` `login_codes` | 会话独立成表以支持撤销 |
| F2 照护圈与成员 | `circles` `circle_members` | 多对多 + 角色，必须独立实体 |
| F3 宠物档案 | `pets` `medications` | **用药独立成表**（见 3.3 决策）；过敏/慢病留在 pets JSONB |
| F4 今日照护 | `care_tasks` `task_logs` | 模板与每日执行分离——模板长存，执行每日产生 |
| F5 健康时间线 | `timeline_events` `attachments` | 事件可关联用药实体（可空外键） |
| F6 就诊准备 | （无新表） | 读 pets + medications + events 聚合；产物经 F7 交付 |
| F7 临时分享 | `share_links` | Summary / sitter / timeline 三种 kind 复用一表 |
| F8 数据生命周期 | （无新表） | 各表统一软删/硬删策略 + 导出查询 |
| T1 摘要邮件 | `digest_sends` | 仅防重发（circle × 日期 唯一） |
| T2 会员兑换 | `membership_claims`（既有） | users.email_hash ↔ claims.email_hash |

### 3.3 DDL 草图

```sql
-- F1 身份
users       (id, email UNIQUE, email_hash UNIQUE, display_name, created_at)
sessions    (id, user_id FK, expires_at, created_at)
login_codes (email, code_hash, expires_at, used_at)

-- F2 圈子
circles        (id, name, timezone, invite_code UNIQUE, created_at, created_by)
circle_members (circle_id FK, user_id FK, role 'owner'|'caregiver', joined_at,
                PRIMARY KEY(circle_id, user_id))
-- timezone：任务 time_of_day 按圈子本地时区解释（出差/寄养是目标场景）

-- F3 档案
pets         (id, circle_id FK, name, species, breed, birthday,
              allergies JSONB, conditions JSONB,   -- 低频事实，无独立流转
              emergency_contacts JSONB,            -- {primary, vet, authorized_decision_maker}
                                                   -- authorized：联系不上主人时有权做医疗决定的人——
                                                   -- 竞品全空白（调研需求6），Sitter 视图与 Summary 渲染
              notes, avatar_attachment_id FK NULL, created_by, created_at)
medications  (id, pet_id FK, name, dose, schedule, note,
              active BOOL, started_on, ended_on NULL, created_by, created_at)
-- 用药独立成表的理由：有生命周期（active→ended），
-- 被 F6 Summary 引用（"当前用药"= active 记录）、
-- 被 F5 事件关联（"开始服用 X" ↔ medication 实体）。

-- F4 今日照护
care_tasks (id, circle_id FK, pet_id FK,           -- 双外键：见冗余清单 R2
            title, time_of_day, repeat 'daily', note,
            active BOOL, created_by, created_at)
task_logs  (id, task_id FK, log_date, status 'done'|'skipped',
            by_user_id FK, at, note, UNIQUE(task_id, log_date))

-- F5 时间线
timeline_events (id, pet_id FK, type 'symptom'|'weight'|'medication'|'vaccine'
                 |'visit'|'note'|'photo', occurred_at, title, body,
                 medication_id FK NULL,              -- 可选关联用药实体
                 recorded_by FK, source 'manual'|'import', created_at)
attachments     (id, pet_id FK, event_id FK NULL, kind 'image'|'pdf',
                 r2_key, filename, size, uploaded_by, created_at)

-- F7 分享
share_links (id, pet_id FK, kind 'summary'|'sitter'|'timeline',
             token UNIQUE, expires_at, revoked_at NULL,
             created_by, created_at, view_count INT DEFAULT 0)

-- T1 摘要防重发
digest_sends (circle_id FK, send_date, PRIMARY KEY(circle_id, send_date))
```

**衔接现有资产**：已付款 founding member 注册时以 `email_hash` 查 `membership_claims` 自动兑换终身；`email_captures` 是试点账号种子；`pet_intakes` 的痛点预填为时间线第一条事件（新家庭打开不是空白）。

**删除策略（F8）**：用户可见对象（事件/任务/分享）**硬删**——隐私承诺是"删除"，软删只会积累暗数据；圈子/宠物删除走级联并先出导出确认页。

### 3.4 有意的冗余清单（每条都有买它的理由）

| # | 冗余 | 违反什么 | 为什么值得 |
|---|---|---|---|
| R1 | `users` 同时存 `email` 与 `email_hash` | 传递依赖（hash=f(email)） | 与既有 `membership_claims`/`email_captures` 用 hash 关联（支付域不解明文）；且避免对明文列做索引扫描 |
| R2 | `care_tasks` 同时挂 `circle_id` 和 `pet_id` | pet 已属于 circle（传递依赖） | 权限校验以 circle 为根且高频，省一跳 join；多宠演进时该冗余依然成立 |
| R3 | `share_links.view_count` 计数器 | 严格范式应为 `share_views` 明细表 | 公开页读路径零 join；10 个家庭规模不需要逐次审计，若将来要审计再加明细表不迁移 |
| R4 | `pets.allergies/conditions` 用 JSONB | 严格范式为独立表 | 无独立生命周期、总随档案整体读写、不参与关联——与 medications 的分界线正在于此：**有流转、被引用的实体必须归一化，纯档案事实可以冗余** |

除上述四条外，一律 3NF：`task_logs.by_user_id` 不冗余用户名（join 取），`timeline_events` 不冗余宠物名，`digest_sends` 不冗余发送内容。

---

## 4. 信息架构与屏幕清单

DESIGN.md 的四栏 IA 原样落地，加 onboarding 与公开页；屏幕标注承载的功能编号：

```text
/app/welcome    首次进入：创建宠物或输邀请码加入          F1→F2→F3
/app            Today      今日照护（默认首页）            F4
/app/timeline   Timeline   健康时间线                      F5
/app/share      Share      分享与交接                      F6+F7
/app/pet        Pet        宠物档案 + 成员管理             F2+F3+F8
/s/[token]      公开只读页（兽医/保姆打开，无需注册）      F7
```

| 屏幕 | 目的 | 主操作 | 空状态 |
|---|---|---|---|
| Today | 一眼回答"今天还有什么没做、谁做的" | 点完成/跳过（带人与时间） | 引导加第一个任务（喂药/遛弯模板一键加） |
| Timeline | 最近发生了什么，可追溯 | 一句话快速添加 + 拍照 | 引导记录"最近一次异常或体重" |
| Share | 把对的视图给对的人 | 生成限时链接（24h/72h/7天） | 示例卡：给兽医/给保姆分别长什么样 |
| Pet | 档案与谁在圈里 | 邀请第二位照顾者 | 邀请链接复制 + 二维码 |
| /s/[token] | 接收方 3 秒看懂 | 无（纯只读） | 过期/撤销页写"找 Devin 要新链接" |

**交互三原则**（PRD 产品原则落地）：

1. 记录必须 ≤5 秒：Timeline 首屏永远有一个聚焦输入框（"Milo 怎么了？"），回车即存，事后补类型；
2. 完成必须带人：任务完成自动记 by/at，不允许"无名氏完成"；
3. 每条健康信息可见来源：事件卡永远显示"谁记录 · 何时 · 手动/导入"。

---

## 5. 关键流程（happy path）

```text
邮件邀请码 → 登录（验证码）→ 创建 Milo
  → 模板加今日任务 → 把 Today 卡片分享进家人群（产品自传播时刻）
  → 邀请第二位照顾者 → 对方输邮箱验证码，30 秒上手
  → 记录一次症状 + 拍一张病历
  → 就诊前：生成 Vet-ready Summary 链接 → 兽医手机直接打开
```

**角色权限（一行写死，避免实现时含糊）**：

| 动作 | Owner | Caregiver | 临时链接接收方 |
|---|---|---|---|
| 记录任务 / 事件 / 上传 | ✓ | ✓ | — |
| 生成 / 撤销分享链接 | ✓ | ✗ | — |
| 邀请 / 移除成员、删除宠物、解散圈子 | ✓ | ✗ | — |

**提醒策略**：Phase 1 不做推送，但要接受一个事实——第二位照顾者（通常是另一半）不会主动开 App，PLANET 真正的竞争对手是家庭群聊。对策两条，都不需要推送基建：

1. Today 视图加「Share as image」：把今日任务卡导出成一张发群里很好看的图——骑在家人已经在截图转发的行为上（W2）；
2. 每日摘要邮件（Resend 已在架构内）：早上发给圈成员「Today for Milo · 待办 + 谁已完成」（W4，一天一封，不做实时）。

**Vet-ready Summary（Phase 1 = 确定性模板，无 AI）**：由结构化字段拼装——基础信息 / 过敏 / 当前用药（`medications` where active）/ 最近 30 天异常（symptom 事件聚合）/ 最近就诊与体重趋势 / 家人备注。生成前全字段可勾选排除（分享的最小集由用户决定）。页面复用 landing 页 vet-paper 的视觉（营销演示变成真货）。

**临时分享生命周期**：生成 → 有效期内可看 → 到期/撤销立即失效（查询时校验，无清理任务）→ 每次打开计 view_count → 撤销不可恢复但可再生成。Sitter 视图只含"今天该做什么 + 紧急联系人（含医疗授权人）"，不含病史。

---

## 6. 构建顺序（4 周，每周结束可试用，功能编号标注进度）

| 周 | 交付 | 试用动作 |
|---|---|---|
| W0.5 | Resend + R2 + schema（§3.3 全量）+ auth + `/app` 空壳 | 创始人自用 |
| W1 | F3 档案（含用药清单）+ F4 Today（单用户）+「Tell Devin」反馈按钮 | 家庭 #1 手动开通，每天真用 |
| W2 | F2 邀请成员 + F5 快速记录 + Today「Share as image」 | 家庭 #1 邀第二人；观察「记录≤5秒」与卡片进群聊的转发 |
| W3 | F5 附件上传（R2）+ F6 Summary 模板 + F7 分享链接 + 公开页 | 家庭 #1 真就诊或模拟交接一次（最重的一周，刻意为之） |
| W4 | F8 删除/导出 + T1 每日摘要邮件 + PWA 安装 + 空状态打磨 + 埋点补全 | 10 个家庭全量 + T2 founding 兑换终身 |

（图片上传从 W2 挪到 W3：附件是分享与 Summary 的前置，跟 W3 天然一组；W2 的重心是「第二个人进来了」。）

**Go 服务结构**（模块边界 = 功能边界）：

```text
server/lemon-webhook/
├── main.go      # 既有入口 + 新 mux 挂载
├── auth.go circle.go pet.go tasks.go timeline.go share.go data.go
└── db.go        # 既有 + 新查询
```

---

## 7. 埋点与验证指标（Phase 1 出口条件）

GA4（现有）+ 关键服务端事件；指标直接对应 PRD 成功标准：

1. **激活**：第二位照顾者被邀请率（加入家庭中 ≥2 人的比例）——北极星；
2. **留存**：周任务完成 ≥4 天的家庭占比；
3. **价值**：生成过 Summary 且分享链接被打开 ≥1 次的家庭占比；
4. **付费衔接**：founding 兑换数、试点转付费数。

Phase 1 结束时的 go/no-go：激活 ≥ 5/10 家庭，且 ≥ 3 个家庭在真实就诊/交接用过 Summary。达不到则回炉场景，不进 Phase 2。

（样本只有 10 个家庭，比例是方向性信号不是统计结论；更硬的判据是质性事件——真实就诊场景里被用过、被主动转发过。每周记录家庭原话，比看漏斗诚实。）

---

## 8. 明确推迟到 Phase 2+（防止范围爬升）

OCR/结构化导入、AI 摘要与自动时间线、语音记录、推送提醒（实时触达）、多宠物、数据导出全家桶、订阅付费墙、原生 App 决策。任何一项进入 Phase 1 的唯一途径：pilot 家庭用它换掉了第四周的打磨周。

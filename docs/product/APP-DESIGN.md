# PLANET App 设计规划（Phase 1 MVP）

日期：2026-08-16（2026-08-17 采纳[外部评估报告](../research/DESIGN-EVALUATION-20260817.md)结构性修订）
状态：设计定稿。**开发不再受订金门槛限制**（评估第十三节：要验证的是"免费给你，你用不用"，不是"愿不愿预付"）；founding 席位继续作为支持者通道并行运转
上游文档：[PRD](PRD.md) · [MVP 范围](MVP.md) · [设计方向](../design/DESIGN.md) · [路线图](../ROADMAP.md)

---

## 0. 一句话与边界

**做**：一个跨平台原生 App（**Expo / React Native，一套代码编译 iOS 与 Android**），让 2–4 人的家庭照护圈对一只宠物共享「今日任务 + 健康时间线 + 可撤销的临时分享」，就诊前一键生成 Vet-ready Summary。

**产品关系（2026-08-17 修正）**：App 与落地页是**完全独立的两套东西**——落地页（www.joinplanet.pet，Next.js）只做营销与获客；App 是独立代码库、独立构建、独立发布。二者不共享代码，只共享品牌与同一个 Go API。

**产品本质（评估采纳）**：不是 Pet Health Tracker，是多人共养时的 **Shared Pet Care System**，长期是 **The digital home for your pet**——越来越深地拥有这只宠物的一生数据，而不是横向扩品类（社区/商城/找医生/保险/AI 问诊/百科均不做）。

**商业模式（评估采纳）**：免费 = **Remember everything**（极其完整、极其好用——"完整"不等于"全面"，免费是核心任务零受阻，不是什么都有）；Pro = **Understand everything**（Pet Intelligence，见 §1.5）。founding 席位是 Phase 0 支持者特权，不是主转化引擎。

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

**为什么不更多**：每多一个功能就多一份 W1–W4 的实现与维护面。上表 8 个已覆盖三条生命周期的每个阶段且无孤岛（每个功能至少被一个阶段需要、每个阶段至少被一个功能覆盖）。候选功能（提醒推送、OCR、AI 摘要、多宠物、语音）全部有明确推迟位置，见 §9。

**为什么不更少**：去掉任何一个核心功能，照护生命周期就断一环——没有 F5 则 F6 无料可拼；没有 F7 则 F6 出不了门；没有 F4 则健康日常（占比最高的时间）无事可做，留存归零。

### 1.3 功能 × 生命周期 × 场景 对照（PRD 三场景归位）

| PRD 场景 | 生命周期阶段 | 功能链 |
|---|---|---|
| A 多人照护："今天谁喂过药" | 健康日常 | F2 → F4（→ T1 摘要邮件提醒不开 App 的那位） |
| B 就诊准备："完整病史 3 秒讲清" | 异常 → 就医 | F5 记录 → F3 用药清单 → F6 拼装 → F7 送达兽医 |
| C 临时交接："保姆只看今天" | 交接/寄养 | F7（sitter 视图 = 今日任务 + 紧急联系人含医疗授权人，不含病史） |

### 1.3.1 增长与 aha 模型（评估第六节采纳）

真正创造留存的是**多人照护**：就医半年一次、寄养一年几次，而喂药/喂饭/遛狗/清理每天发生。增长模型：

```text
Today 每天使用 → Timeline 自然积累 → 形成完整 Pet History
  → 某天生病 → "过去六个月的数据全在 PLANET" ← 真正的 aha moment
  → Summary 有了原料，Pro（理解）有了数据地基
```

由此推导开发重心的优先级：**Today > Timeline > Pet 三屏的打磨优先于一切新功能**——成败由 Today 决定，不是 Health。

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

### 1.5 商业分层：免费基础版 × Pro 订阅

> **修正记录（2026-08-16）**：此前设计把"订阅付费墙"推迟为 Phase 2 实现细节、从未定义免费/付费边界——这是目标性错误。正确目标：**基础版必须完整且好用；付费购买的是高级能力；转化发生在用户体验到价值之后的 App 内时刻，而不是读完落地页介绍时。**

**分层原则（五条，先于一切功能排期）：**

1. **核心日常闭环永久免费且做到 80 分**——F2 协作、F4 任务、F5 文字记录、F6 基础 Summary、F7 分享、F8 导出。这是习惯与信任的发动机，也是 Team Pet App / 11pets 免费基线上的生存线：基础体验不好，一切付费无从谈起；
2. **Pro 只卖高级能力**：AI 成本类（AI 摘要、OCR 导入）、规模类（多宠、附件配额）、分析类（趋势图、健康洞察）、精美输出类（纪念册精装版）；
3. **应急场景永不设卡**：sitter/紧急视图、就诊当天的 Summary，任何配额都不拦——生病时刻的 paywall 是信任自杀；
4. **分享即传播**：分享链接永不收费——接收方看到的免费产品就是最好的广告；
5. **数据所有权不可收费**：导出永久免费——信任叙事的基石，也是对标 11pets 信任崩塌的武器；
6. **免费层先行原则（2026-08-17 创始人定调）**：V1 把全部免费能力（含基础趋势图、到期清单、本地提醒、图片分享卡）完整交付吸引用户；Pro 能力（AI/OCR/多宠/无限附件/智能提醒/精装纪念册）在免费层验证跑通后才开发上架。

**边界表：**

| 能力 | 免费基础版 | Pro 订阅 |
|---|---|---|
| F2 圈子与成员（含邀请） | ✓ 不限 | — |
| F4 今日照护协作 | ✓ 不限 | — |
| F5 时间线记录（文字） | ✓ 不限 | — |
| F5 附件 | 20 张/月 · 单张 ≤10MB | 不限 · ≤50MB |
| F6 基础 Summary（模板版） | ✓ 不限 | — |
| F6 AI 辅助摘要（P2 上线） | — | ✓ |
| 基础体重趋势图（确定性，V1.5 免费） | ✓ | AI 健康洞察/关联分析 ✓ |
| OCR 病历导入（P2） | — | ✓ |
| F7 分享链接 | ✓ 不限 | — |
| 多宠（P2） | 1 只 | 不限 |
| F8 数据导出 | ✓ 永久 | — |
| 纪念册 / 告别册（P3） | 基础导出 | 精装版 |
| 疫苗/驱虫到期清单（V1.5 免费） | ✓ | — |
| 基础本地提醒（任务到点，V1.5 免费） | ✓ | 智能/自适应提醒 ✓ |
| T1 每日摘要邮件 | ✓ | ✓ |

**转化时刻（全部在 App 内，由使用强度触发）**：附件配额触顶、添加第二只宠物、点「AI 摘要」、打开趋势图、上传病历做 OCR——全是 power-user 时刻，不是 core-need 时刻。用户是"用得越来越深才付费"，不是"看了介绍就付费"。

**Pro 的最终形态：Pet Intelligence，不是功能加法（评估第八/九/十节采纳）**

- **AI 从 UI 中消失**：没有 "Ask PLANET AI" 聊天框。用户照旧一句话记录（"昨晚 Milo 吐了两次，今早没怎么吃"），Pro 在后台把自由文本结构化（Symptoms: Vomiting ×2 / last night；Appetite: reduced / this morning）——用户不再选类型、填次数、挑日期。这才是 AI 真正改变产品；
- **AI 做关联理解**：体重连降 × 呕吐两次 × 换药 → 就诊准备时自动选出相关事件。AI 只做 organize / retrieve / correlate / summarize / remind，**永远不做 diagnose / prescribe**；
- **免费用户每月 3 次 AI 额度**：让他体验一次"半年 Timeline 一键变成 Vet Summary"——转化力远大于展示 Pro 功能列表；
- **铺垫节奏**：第一版刻意做到**没有 AI 也非常好用**。AI 上线时才像 "PLANET suddenly became intelligent"，而不是"又一个套壳宠物 App"；
- Pro 清单随之升级：AI 结构化记录、AI 病历 OCR、AI 时间线整理、AI 智能搜索、AI 就诊准备、健康趋势、智能提醒、自动摘要、多宠、无限附件、高级报告。

**founding 席位与本分层的关系**：founding（一次性 S$29.99 起）是 Phase 0 的验证工具和支持者特权——终身含未来全部 Pro 能力，作为"早期相信"的对价。它不是主转化引擎；主引擎是上面的免费体验 → 习惯 → 高级能力时刻。落地页"试点优先、订金其次"的双路径与这个定位一致。

**分层的技术承接**：上表不是愿望清单，每一条付费边界都有唯一的技术裁决点——权益层（§4.2），Phase 1 建表建路径，Phase 2 接订阅时零改造。

---

## 2. 技术架构（选型与理由）

```text
iOS App ─┐                                  ┌─ 落地页 www.joinplanet.pet（Vercel，Next.js）
          ├─ Expo / React Native 一套代码   │    独立的营销站，只管获客（现状不动）
Android ─┘         │                        │
                   │ HTTPS + Bearer token   │
                   ▼                        │
          api.joinplanet.pet（现有 Go 二进制，扩展）
          ├── 既有 7 个端点（checkout/progress/intake/… 不动）
          ├── /api/v1/auth/*      F1（验证码登录 → 签发 token）
          ├── /api/v1/circle/*    F2
          ├── /api/v1/pet/*       F3（含 medications）
          ├── /api/v1/tasks/*     F4
          ├── /api/v1/timeline/*  F5（含附件）
          ├── /api/v1/share/*     F6 + F7（Summary 即一种 share kind）
          └── /api/v1/data/*      F8（导出/删除）
          PostgreSQL（同库新表，见 §3）  ·  Cloudflare R2（附件）
          公开分享页 /s/:token 为 Web（接收方不装 App 的前提）
```

```text
仓库结构：
joinplanet.pet/
├── www.joinplanet.pet/   落地页（Next.js，独立部署 Vercel，含公开分享页）
├── mobile/               App（Expo 项目，独立 package.json/构建，与落地页零代码共享）
├── server/               Go API（两端共用）
└── docs/
```

**关键决定与理由：**

| 决定 | 选择 | 理由 |
|---|---|---|
| App 客户端 | **Expo (React Native)**，一套代码编译 iOS + Android | 与仓库 TS/React 技术栈同构；EAS 云构建免本地双端环境；OTA 热修复对单人试点期极关键；expo-router 实现三 Tab IA |
| 与落地页关系 | **完全独立代码库**（同仓不同根 `mobile/`，零 import 共享，未来可整体迁出为独立 repo） | 落地页是营销、App 是产品，生命周期/发布节奏/依赖完全不同 |
| 通信 | App **直连** api.joinplanet.pet，HTTPS + Bearer token | 原生 App 无同源 cookie 约束，Next rewrites 方案随 PWA 一并作废；CORS 不适用于原生 |
| 认证 | 邮箱验证码 → 服务端 session 表签发 token，App 存 expo-secure-store（Keychain/Keystore） | 会话可撤销；验证码流程不变，交付从 cookie 改为 token |
| 后端 | 扩展现有 Go 服务，按业务功能拆模块（auth/circle/pet/tasks/timeline/share/data.go + entitlement.go） | 模块边界 = §1.2 功能边界；同一 API 服务落地页与 App |
| 附件 | Cloudflare R2，App 拿预签名 URL 直传（expo-image-manipulator 先压缩） | 既有决策不变 |
| 支付 | iOS App 内数字订阅**必须走 IAP**（Apple 规则）——Phase 2 Pro 经 RevenueCat/StoreKit 适配进 entitlements；落地页 founding 席位继续走 Lemon Squeezy（Web） | 原生路线使多计费适配器从"预留"变为**必需**，权益层设计正好承接 |
| 分发 | Phase 1 试点走 **TestFlight 公开链接 + Google Play 内部测试轨道**（100 installs 漏斗可达成），公开上架在 WAP 验证后再启动商店审核 | 商店审核周期不可控，不该挡住试点 |
| 触达 | 摘要邮件（Resend）照旧；原生使推送可行（Expo Push），但 Phase 1 纪律不变：不建通知闭环，借家庭群聊 | 推送是 Phase 2 选项，不是 Phase 1 需求 |

**未决问题（开工前确认）**：

1. Resend 账号 + `mail.joinplanet.pet` 的 SPF/DKIM（Cloudflare DNS）；
2. R2 bucket 与 `files.joinplanet.pet` 绑定；
3. Apple Developer 账号（US$99/年，TestFlight 必需）+ Google Play 开发者账号（US$25 一次性）。

组件/工具级选型见 [APP-TECH-STACK](APP-TECH-STACK.md)（Expo/RN 生态版）；各页布局结构见 [APP-LAYOUTS](../design/APP-LAYOUTS.md)，UI 规则以 [APP-UI-SPEC-V1](../design/APP-UI-SPEC-V1.md) 为准（其中 PWA 专项——Web Share API、网页 Bottom Sheet、44px 命中——按原生等价物落地：系统分享面板、原生模态手势、平台触控标准）。

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
| **横切：权益** | `entitlements` | **新增付费内容的唯一扩展点**，见 §4.2 |

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
                 data JSONB,                           -- 结构化负载：体重数值、疫苗 next-due 等，
                                                      -- 新事件类型不改表，见 §4.3
                 medication_id FK NULL,                -- 可选关联用药实体
                 recorded_by FK, source 'manual'|'import', created_at)
attachments     (id, pet_id FK, event_id FK NULL, kind 'image'|'pdf',
                 r2_key, filename, size, uploaded_by, created_at)

-- F7 分享
share_links (id, pet_id FK, kind 'summary'|'sitter'|'timeline',
             token UNIQUE, expires_at, revoked_at NULL,
             created_by, created_at, view_count INT DEFAULT 0)

-- T1 摘要防重发
digest_sends (circle_id FK, send_date, PRIMARY KEY(circle_id, send_date))

-- 横切：权益层（新增付费内容的唯一扩展点，裁决逻辑见 §4.2）
entitlements (id, user_id FK, feature_key TEXT,      -- '*' = 通配（founding 终身全含）
              source 'founding'|'pro_sub'|'pilot'|'manual',
              source_ref TEXT NULL,                  -- 授予来源 id（claim / subscription）
              granted_at, expires_at NULL,           -- NULL = 永久
              UNIQUE(user_id, feature_key, source))
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

## 4. 扩展性设计（前瞻性）

Phase 纪律回答"什么时候做"，本节回答"做了之后怎么长"。**限制管范围，不管架构**——所有已知的未来方向（新付费内容、新事件类型、新分享种类、多宠、OAuth、推送、换计费商）今天都埋好接缝，将来只做加法。

### 4.1 三条演进原则

1. **加法演进**：schema 变更只增不破（新表、新列、新枚举值），永不改写既有用户数据的语义；
2. **单一裁决路径**：任何"这个用户能不能用 X"只走一处代码（权益层 `can()`），禁止散落的 `if founding` / `if pilot`——新增付费内容时只动权益层与配置，不动业务模块；
3. **模块 = 功能的开闭单元**：新能力 = 新 Go 模块 + 新路由组 + （若付费）新 feature key，老模块不改。

### 4.2 权益层——"后续新增付费内容"的技术承接

- **裁决**：`can(user, key)` = 存在未过期的 `feature_key` 或 `'*'`（通配）权益。Phase 1 它只回答两件事：founding 通配（终身含未来全部 Pro）、pilot 授权（10 个家庭的门）；
- **授予**：权益只能由事件派生——既有 webhook ledger 的 `order_created` → 授 founding `'*'`；将来 `subscription_created / renewed / cancelled` → 授予 / 续期 / 过期对应键。**换计费商（Lemon Squeezy → Stripe）只换事件适配器，权益数据一行不动**；
- **配额**：附件 20 张/月等限额是代码配置（plan → limits 映射），不是用户数据——调量改配置发布，零迁移；
- **新付费内容的上线路径**：新 `feature_key` → 业务模块挂 `requireEntitlement(key)` → 归入某个 plan 配置。全程加法，`users` 表永远不知道"付费内容"的存在。

（这就是 §1.5"推迟的只是计费实现"的技术含义：订阅页面和计费流程是 Phase 2，但权益层的表与 `can()` 路径 **Phase 1 就建**——现在不建，将来就是穿透式改造。）

### 4.3 已知扩展点清单（今天埋的点 vs 将来怎么接）

| 未来方向 | 今天埋的点 | 将来怎么接（不动什么） |
|---|---|---|
| 新付费能力 | `entitlements` + `can()` | 新 key + 挂 gate，零用户数据迁移 |
| 新事件类型（疫苗 due、体重结构化、QoL 量表） | `type` CHECK + `data JSONB` | 加枚举值 + 定义 data 结构，不改表 |
| 新分享种类（寄养模板包、告别册链接） | `share_links.kind` 枚举 | 新 kind + 新渲染器 |
| 多宠解锁 | pets 本就是独立实体，仅 UI 锁 1/circle | 挂 `multi_pet` gate，schema 不动 |
| 第三方登录（Google OAuth） | users 无密码字段、以 email 为锚 | 新增 `auth_identities(user_id, provider, provider_uid)` 挂靠表 |
| 推送 / 新触达渠道 | T1 摘要走通知接口（channel 适配器） | 加 push 适配器，摘要生成逻辑复用 |
| 换计费商 / 上订阅 / 原生内购 | webhook 事件 ledger + 权益派生 | 写新 Billing Adapter（Lemon Squeezy/Web、App Store IAP、Google Play）。评估第十二节点名：Apple 要求数字解锁走 IAP，届时只需 `Transaction → Adapter → Entitlement`——业务代码不知道钱从哪付的 |
| API 演进 | `/api/v1/` 已版本化 | v1 只加字段不删改；破坏性变更开 v2 |

## 5. 信息架构与屏幕清单

**IA（评估第五节采纳：Share 是动作，不是空间）**——一级 Tab 只有三个高频空间，Share 变成出现在它有意义的地方的上下文按钮，全局「+」承载快速记录：

```text
/app/welcome    首次进入：创建宠物或输邀请码加入              F1→F2→F3
（上表路径 = Expo Router 屏幕名；/s/[token] 公开页保持 Web——接收方不装 App 是产品前提）
/app            Today      今日照护（默认首页）                F4
/app/timeline   Timeline   健康时间线（页头 [Share]）          F5 + F7
/app/pet        Pet        档案/成员/用药（[Prepare for vet] [Share with sitter]）  F2+F3+F6+F7
全局 +          + Note / + Symptom / + Weight / + Medication / + Photo   F5 快速记录
/s/[token]      公开只读页（兽医/保姆打开，无需注册）          F7
```

（用户不会"每天去看看 Share"——把低频动作从导航里拿掉，三个 Tab 更纯粹。）

| 屏幕 | 目的 | 主操作 | 空状态 |
|---|---|---|---|
| Today | 一眼回答"今天还有什么没做、谁做的" | 点完成/跳过（带人与时间） | 引导加第一个任务（喂药/遛弯模板一键加） |
| Timeline | 最近发生了什么，可追溯 | 一句话快速添加 + 拍照（全局 +） | 引导记录"最近一次异常或体重" |
| Pet | 档案、用药与谁在圈里 | 邀请第二位照顾者；[Prepare for vet] 生成 Summary | 邀请链接复制 + 二维码 |
| /s/[token] | 接收方 3 秒看懂 | 无（纯只读） | 过期/撤销页写"找 Devin 要新链接" |

（Share 不再有专属屏幕——生成 Summary、给保姆链接都是 Timeline/Pet 内的上下文动作，见 §5 IA。）

**交互三原则**（PRD 产品原则落地）：

1. 记录必须 ≤5 秒：Timeline 首屏永远有一个聚焦输入框（"Record something about Milo…"），回车即存为 Note，事后可选补类型/时间/附件；
2. 完成必须带人：任务完成自动记 by/at，不允许"无名氏完成"；
3. 每条健康信息可见来源：事件卡永远显示"谁记录 · 何时 · 手动/导入"。

**Today 与 Timeline 的数据边界（UI spec §31 采纳）**：日常任务完成**不**自动进入 Timeline（否则 Breakfast/Walk/Dinner 刷屏淹没健康记录）；Today 历史属于任务历史。Timeline 只保存用户主动记录的宠物事件 + 用药开始/停止等长期变化自动生成的医疗事件。

---

## 6. 关键流程（happy path）

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

## 7. 构建顺序（4 周，每周结束可试用，功能编号标注进度）

| 周 | 交付 | 试用动作 |
|---|---|---|
| W0.5 | Resend + R2 + schema（§3.3 全量，**含权益层**）+ auth + `can()` 裁决路径 + `mobile/` Expo 壳（三 Tab 骨架） | 创始人自用 |
| W1 | F3 档案（含用药清单）+ F4 Today（单用户）+「Tell Devin」反馈按钮 | 家庭 #1 手动开通，每天真用 |
| W2 | F2 邀请成员 + F5 快速记录 + Today「Share as image」 | 家庭 #1 邀第二人；观察「记录≤5秒」与卡片进群聊的转发 |
| W3 | F5 附件上传（R2）+ F6 Summary 模板 + F7 分享链接 + 公开页 | 家庭 #1 真就诊或模拟交接一次（最重的一周，刻意为之） |
| W4 | F8 删除/导出 + T1 每日摘要邮件 + TestFlight/内部测试轨道接入 + 空状态打磨 + 埋点补全 | 试点分发，跑 100 installs 漏斗（§8） |

**排期纪律（评估第四节的警告）**：问题从来不是开发能力，而是"把时间花在完成产品，而不是观察用户用什么"。W4 的摘要邮件/商店接入/导出都是可让位项——**三屏（Today/Timeline/Pet）打磨到漂亮、低摩擦、愿意每天打开，优先级高于上表任何一项**；第一版真正聚焦的只有 Pet / Today / Timeline / Share-Summary 四件事。

（图片上传从 W2 挪到 W3：附件是分享与 Summary 的前置，跟 W3 天然一组；W2 的重心是「第二个人进来了」。）

**Go 服务结构**（模块边界 = 功能边界）：

```text
server/lemon-webhook/
├── main.go      # 既有入口 + 新 mux 挂载
├── auth.go circle.go pet.go tasks.go timeline.go share.go data.go
├── entitlement.go   # 权益层：can() / requireEntitlement() / 配额配置——唯一裁决路径
└── db.go        # 既有 + 新查询
```

---

## 8. 埋点与验证指标（Phase 1 出口条件）

**北极星（评估第十三节采纳）：Weekly Active Pets，不是 WAU。** 一只宠物 = 2 个照顾者、8 个任务、3 条事件的活跃实体——以 Pet 为单位衡量才符合"数字档案"的产品本质。

**WAP 操作定义（UI spec §92）**：7 天内满足任一——≥3 次任务完成，或 ≥1 条时间线事件，或 ≥2 个照顾者有交互。

**安装漏斗（Phase 1 目标线）**：

```text
100 installs → 40 create pet → 20 create first task → 12 use 3+ days
→ 8 invite another caregiver → 5 use 2+ weeks
```

GA4（现有）+ 关键服务端事件：

1. **激活**：第二位照顾者被邀请率——北极星的前置环节；
2. **留存**：周任务完成 ≥4 天的宠物占比（WAP 的构成质量）；
3. **价值**：生成过 Summary 且分享链接被打开 ≥1 次的宠物占比；
4. **付费衔接**：founding 兑换数、免费→Pro 转化（P2 计费上线后：配额触达率、转化前中位数使用天数）。

**Phase 1 出口：漏斗走通到"5 只宠物持续使用 2+ 周"。** 达不到就回炉 Today/Timeline/Pet 三屏的摩擦——不加功能（评估的硬限制）。质性判据并行保留：真实就诊场景用过、被主动转发过、每周记录用户原话。

---

## 9. 明确推迟到 Phase 2+（防止范围爬升）

OCR/结构化导入、AI 摘要与自动时间线、语音记录、推送提醒（实时触达）、多宠物、数据导出全家桶、**Pro 订阅计费流程（分层边界在 §1.5 定死、权益层本体 Phase 1 已建（§4.2）——推迟的只是订阅页面与计费对接，不是扩展架构）**、原生 App 决策。任何一项进入 Phase 1 的唯一途径：pilot 家庭用它换掉了第四周的打磨周。

**评估的硬限制（2026-08-17）**：第一版**禁止**因为"全面"继续加功能。精力全部给 Today + Timeline + Pet 三屏——漂亮、极低摩擦、让人真的愿意每天打开。AI 等数据真的开始产生以后再进去，那时它才不是 gimmick，而是最强的付费层（Phase 1: PLANET remembers → Phase 2: PLANET understands → Phase 3: PLANET accompanies the pet throughout its life）。

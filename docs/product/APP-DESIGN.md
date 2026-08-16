# PLANET App 设计规划（Phase 1 MVP）

日期：2026-08-16
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

## 1. 技术架构（选型与理由）

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
          ├── /api/v1/auth/*      会话登录
          ├── /api/v1/circle/*    照护圈与成员
          ├── /api/v1/pet/*       宠物档案
          ├── /api/v1/tasks/*     今日照护
          ├── /api/v1/timeline/*  健康时间线 + 附件
          └── /api/v1/share/*     分享链接 + 公开只读
          PostgreSQL（同库新表，见 §2）
          Cloudflare R2（附件：图片/PDF）
```

**关键决定与理由：**

| 决定 | 选择 | 理由 |
|---|---|---|
| 应用放哪 | 同一 Next.js 仓库 `/app` 路由组，不建第二个前端 | 单人开发者，一条部署流水线；营销页与 App 共用设计 token |
| 后端 | 扩展现有 Go 服务，按文件拆模块（auth.go / tasks.go / …） | 支付、claim、邮箱数据已在库里；不引入第二套运行时 |
| 跨域 | Next rewrites 把 `/api/*` 代理到 Go 域名 | 浏览器只见同源，cookie 会话自然工作，现有 CORS 中间件降级为内网兜底 |
| 认证 | 邮箱验证码/魔法链接（一次性 code，httpOnly cookie 会话） | 试点承诺要发邮件，事务邮件基建（Resend）本来就必须上；免密码摩擦最低。验证码兜底（链接被邮箱客户端吞掉时手输 6 位数） |
| 会话 | 服务端 session 表 + httpOnly cookie（7 天滑动续期） | 可撤销、无 JWT 泄密面；PWA 场景够用 |
| 附件 | Cloudflare R2（S3 API），上传经 Go 代理签名 | 域名已在 Cloudflare；VPS 本地盘不可靠也不可扩展 |
| PDF | Phase 1 不做服务端 PDF：Summary 用打印优化的网页 + 「分享链接」交付 | 接收方本来就无需注册；服务端 PDF 推迟到有人真的抱怨 |
| PWA | manifest + 轻量 SW（app-shell 缓存），不做离线写 | 「安装到主屏」的心智价值 > 真离线；离线写冲突处理不值四周工期 |

**未决问题（开工前确认）**：

1. Resend 账号 + `mail.joinplanet.pet` 的 SPF/DKIM 记录（Cloudflare DNS 里加）；
2. R2 bucket 建在哪个 Cloudflare 账号、绑定域名 `files.joinplanet.pet`；
3. Phase 0 门槛若未达标，本设计冻结不动工（这是 ROADMAP 的约定，写在这里防止自我破例）。

---

## 2. 数据模型（新表草图）

沿用现有库；`email_hash`、幂等 webhook 等模式照抄现有实现。

```sql
users           (id, email UNIQUE, email_hash, display_name, created_at)
sessions        (id, user_id, expires_at, created_at)          -- 撤销用
login_codes     (email, code_hash, expires_at, used_at)        -- 魔法链接/验证码

circles         (id, name, timezone, invite_code UNIQUE, created_at)
                                                             -- timezone：圈子本地时区，
                                                             -- 任务 time_of_day 按它解释（出差/寄养跨时区是目标场景）
circle_members  (circle_id, user_id, role 'owner'|'caregiver', joined_at,
                 PRIMARY KEY(circle_id, user_id))

pets            (id, circle_id, name, species, breed, birthday,
                 allergies, conditions,
                 medications JSONB,        -- [{name, dose, schedule}]，Summary 的「当前用药」段直接读这里
                 emergency_contacts JSONB,
                 notes, avatar_key, created_by, created_at)
-- MVP：一个 circle 只建一只宠物（应用层约束，schema 不锁）

care_tasks      (id, circle_id, title, time_of_day, repeat 'daily',
                 note, active, created_by, created_at)
task_logs       (id, task_id, log_date, status 'done'|'skipped',
                 by_user_id, at, note, UNIQUE(task_id, log_date))

timeline_events (id, pet_id, type 'symptom'|'weight'|'medication'|'vaccine'
                 |'visit'|'note'|'photo', occurred_at, title, body,
                 recorded_by, source 'manual'|'import', created_at)
attachments     (id, pet_id, event_id NULL, kind 'image'|'pdf',
                 r2_key, size, uploaded_by, created_at)

share_links     (id, pet_id, kind 'summary'|'sitter'|'timeline',
                 token UNIQUE, expires_at, revoked_at NULL,
                 created_by, created_at, view_count)
```

**衔接现有资产**：

- 已付款的 founding member 注册时：以 `email_hash` 查 `membership_claims`（已有 `/claim` 逻辑），命中即终身标记，未来付费墙直接放行；
- `email_captures` 里的试点邮箱 = 首批账号种子，创始人手动发邀请码（concierge onboarding，人工是特性不是缺陷）；
- 健康时间线从 `pet_intakes`（购买/申请时提交的痛点）预填第一条事件，让新家庭打开就不是空白。

---

## 3. 信息架构与屏幕清单

DESIGN.md 的四栏 IA 原样落地，加 onboarding 与公开页：

```text
/app/welcome    首次进入：创建宠物（或输邀请码加入）
/app            Today      今日照护（默认首页）
/app/timeline   Timeline   健康时间线
/app/share      Share      分享与交接
/app/pet        Pet        宠物档案 + 成员管理
/s/[token]      公开只读页（兽医/保姆打开，无需注册）
```

每屏的「一句目的 + 主操作 + 空状态」：

| 屏幕 | 目的 | 主操作 | 空状态 |
|---|---|---|---|
| Today | 一眼回答"今天还有什么没做、谁做的" | 点完成/跳过（带人与时间） | 引导加第一个任务（喂药/遛弯模板一键加） |
| Timeline | 最近发生了什么，可追溯 | 一句话快速添加 + 拍照 | 引导记录"最近一次异常或体重" |
| Share | 把对的视图给对的人 | 生成限时链接（24h/72h/7天） | 示例卡：给兽医/给保姆分别长什么样 |
| Pet | 档案与谁在圈里 | 邀第二位照顾者 | 邀请链接复制 + 二维码 |
| /s/[token] | 接收方 3 秒看懂 | 无（纯只读） | 过期/撤销页写"找 Devin 要新链接" |

**交互三原则**（从 PRD 产品原则落地）：

1. 记录必须 ≤5 秒：Timeline 首屏永远有一个聚焦输入框（"Milo 怎么了？"），回车即存，事后补类型；
2. 完成必须带人：任务完成自动记 by/at，不允许"无名氏完成"；
3. 每条健康信息可见来源：事件卡永远显示"谁记录 · 何时 · 手动/导入"。

---

## 4. 关键流程（happy path）

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

**提醒策略（修订）**：Phase 1 不做推送，但要接受一个事实——第二位照顾者（通常是另一半）不会主动开 App，PLANET 真正的竞争对手是家庭群聊。对策两条，都不需要推送基建：

1. Today 视图加「Share as image」：把今日任务卡导出成一张发群里很好看的图——骑在家人已经在截图转发的行为上（W2）；
2. 每日摘要邮件（Resend 已在架构内）：早上发给圈成员「Today for Milo · 待办 + 谁已完成」（W4，一天一封，不做实时）。

**Vet-ready Summary（Phase 1 = 确定性模板，无 AI）**：由结构化字段拼装——基础信息 / 过敏 / 当前用药 / 最近 30 天异常（symptom 事件聚合）/ 最近就诊与体重趋势 / 家人备注。生成前全字段可勾选排除（隐私原则：分享的最小集由用户决定）。落地的页面复用 landing 页 vet-paper 的视觉（同一张"纸"从营销变成真货）。

**临时分享生命周期**：生成 → 有效期内可看 → 到期/撤销立即失效（查询时校验，无清理任务）→ 每次打开计 view_count → 撤销不可恢复但可再生成。Sitter 视图只含"今天该做什么 + 紧急联系人"，不含病史。

---

## 5. 构建顺序（4 周，每周结束可试用）

对齐 ROADMAP Phase 1；试点家庭从 W1 起真实使用：

| 周 | 交付 | 试用动作 |
|---|---|---|
| W0.5 | Resend + R2 + schema + auth + `/app` 空壳 | 创始人自用 |
| W1 | 宠物档案 + Today 任务（单用户）+「Tell Devin」反馈按钮 | 家庭 #1 手动开通，每天真用 |
| W2 | 邀请成员 + Timeline 快速记录 + Today「Share as image」 | 家庭 #1 邀第二人；观察「记录≤5秒」与卡片进群聊的转发 |
| W3 | 图片/PDF 上传（R2）+ 分享链接 + Summary 模板 + 公开页 | 家庭 #1 真就诊或模拟交接一次（最重的一周，刻意为之） |
| W4 | PWA 安装 + 空状态打磨 + 删除/导出 + 每日摘要邮件 + 埋点补全 | 10 个家庭全量 + 付费 founding 兑换终身 |

（修订：图片上传从 W2 挪到 W3——W2 的重心是「第二个人进来了」，附件是分享与 Summary 的前置，跟 W3 天然一组。）

**Go 服务结构**（从单 main.go 长出模块）：

```text
server/lemon-webhook/
├── main.go          # 既有入口 + 新 mux 挂载
├── auth.go  circle.go  pet.go  tasks.go  timeline.go  share.go
└── db.go            # 既有 + 新查询
```

---

## 6. 埋点与验证指标（Phase 1 出口条件）

GA4（现有）+ 关键服务端事件；指标直接对应 PRD 成功标准：

1. **激活**：第二位照顾者被邀请率（加入家庭中 ≥2 人的比例）——北极星；
2. **留存**：周任务完成 ≥4 天的家庭占比；
3. **价值**：生成过 Summary 且分享链接被打开 ≥1 次的家庭占比；
4. **付费衔接**：founding 兑换数、试点转付费数。

Phase 1 结束时的 go/no-go：激活 ≥ 5/10 家庭，且 ≥ 3 个家庭在真实就诊/交接用过 Summary。达不到则回炉场景，不进 Phase 2。

（样本只有 10 个家庭，比例是方向性信号不是统计结论；更硬的判据是质性事件——真实就诊场景里被用过、被主动转发过。每周记录家庭原话，比看漏斗诚实。）

---

## 7. 明确推迟到 Phase 2+（防止范围爬升）

OCR/结构化导入、AI 摘要与自动时间线、语音记录、推送提醒、多宠物、数据导出全家桶、订阅付费墙、原生 App 决策。任何一项进入 Phase 1 的唯一途径：pilot 家庭用它换掉了第四周的打磨周。

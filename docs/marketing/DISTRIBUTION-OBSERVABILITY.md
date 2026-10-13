# 分发观测手册(DISTRIBUTION-OBSERVABILITY)

> 目的:过审后流量必须有统一的周报口径——本手册是**分发周报的唯一口径源**:GA 事件怎么数、GSC 每周看什么、App Store 侧数字在哪取、E5 撞墙怎么算、周报长什么样。
> 边界:**只盘点现状与给口径,不改任何代码、不建任何后台配置、不做自动化管道**。GA 埋点改动随 T1 代码走([ITERATION-PLAN-2026-10-13](../ITERATION-PLAN-2026-10-13.md) §2)。
> 上游:[PRODUCT.md](../PRODUCT.md) §3.2(北极星 WAP 与漏斗)、[SAAS-PREP-2026-10-01](SAAS-PREP-2026-10-01.md) §E5(撞墙口径)、[LAUNCH-PLAYBOOK](LAUNCH-PLAYBOOK.md)/[TRAFFIC-PLAYBOOK](TRAFFIC-PLAYBOOK.md)(渠道结构)、[OUTBOUND-REDDIT-TARGETS](OUTBOUND-REDDIT-TARGETS.md)(Reddit 通道状态)。
> 事实基线日:2026-10-13(全部为本日实测/实读;后续以「回填」标注的格子按周更新)。

**阅读约定**:本文每个观测项固定三段——**现状**(实测到什么,带 `path:line` 或命令证据)/ **怎么看**(在哪取数、怎么算)/ **周报行格式**(抄进周报的那一行)。

---

## 1. GA 事件盘点表

### 1.0 埋点机制(先读,解释了为什么全站事件长一个样)

- **现状**:GA4 property `G-Z4M278ZGW3`(硬编码回退,`www.joinplanet.pet/app/layout.tsx:56`,可用 `NEXT_PUBLIC_GA_ID` 覆盖);gtag 脚本在该文件注入并 `config`(layout.tsx:73-88),`anonymize_ip: true`。全站唯一的发事件机制 = `AnalyticsEvents` 组件(document 级 click 委托,`www.joinplanet.pet/app/components/analytics-events.tsx:15-33`):任何带 `data-event` 属性的元素被点击时,发一条 GA4 事件,参数为 `event_category`(缺省 `engagement`,analytics-events.tsx:21)、`event_label`(可省)、`value`(可省)、`utm_attribution`(localStorage 里的 last-touch utm_source,analytics-events.tsx:25,31;utm 存取见 `www.joinplanet.pet/app/lib/utm.ts:33-45`,first-touch source 单独保留)。除委托器与 layout 的 config 外,全站无其他 `gtag(` 调用(已 grep 实证,零命中)。
- **怎么看**:GA4 后台 → 报告 → 互动 → 事件(或 管理 → 事件),搜事件名。数据延迟 24–48h。**注意**:GA4 与 UA 不同,`event_category`/`event_label` **不会自动成为报表维度**——要在探索/对比里按 label 拆分,需先在 GA4 管理 → 自定义定义里把 `event_label`(事件范围)注册为自定义维度;不注册就只能看事件总数。
- **周报行格式**:见 §1.3 漏斗行,不单列机制。

### 1.1 现有事件全清单(2026-10-13 grep 实测:36 个事件名 / 45 个埋点)

命令:`grep -rno 'data-event="[^"]*"' www.joinplanet.pet/app --include="*.tsx"`(+ `data-event={` 动态形式)。

| # | 事件 | category | label | 触发点(file:line) | 怎么算(周报口径) |
|---|---|---|---|---|---|
| 1 | `quick_demo_cta` | quick_demo | hero | app/page.tsx:60 | 漏斗顶:demo 区到达点击 |
| 2 | `quick_demo_start` | quick_demo | {vet\|meds\|sitter\|daily}(动态) | app/components/quick-demo.tsx:70 | §1.3 漏斗第 2 步;label=用例分布 |
| 3 | `open_app_cta` | app_link | hero | app/page.tsx:60 | web App 入口点击,§1.3 漏斗第 1 步 |
| 4 | `open_app_cta` | app_link | pilot_success | app/components/pilot-signup.tsx:45 | 报名成功后的 App 导流 |
| 5 | `open_app_cta` | app_link | faq | app/faq/page.tsx:369-371 | 按 label 拆页面 |
| 6 | `open_app_cta` | app_link | about | app/about/page.tsx:153-155 | 同上 |
| 7 | `open_app_cta` | app_link | pricing | app/pricing/page.tsx:238-240 | 同上 |
| 8 | `open_app_cta` | app_link | invite_join | app/invite/[code]/page.tsx:30 | 邀请落地页 → web App |
| 9 | `pilot_join_click` | pilot | support_form | app/components/pilot-signup.tsx:62-64 | 试点报名提交(服务端对应 `email_captures` source=`home_pilot`,见 §1.4) |
| 10 | `founding_deposit_click` | founding | support_card \| pilot_success(动态) | app/components/pilot-signup.tsx:89-91 | 创始席位点击 |
| 11 | `founding_deposit_click` | founding | pricing_page | app/pricing/page.tsx:248-250 | 同上,按 label 拆页面 |
| 12 | `prototype_tab` | prototype | {tab 名}(动态) | app/components/prototype-tabs.tsx:16 | 原型 tab 兴趣分布 |
| 13 | `prototype_add_moment` | prototype | timeline | app/components/prototype-tabs.tsx:36 | 原型内互动 |
| 14 | `prototype_vet_summary` | prototype | health | app/components/prototype-tabs.tsx:40 | 同上 |
| 15 | `prototype_invite` | prototype | people | app/components/prototype-tabs.tsx:44 | 同上 |
| 16 | `prototype_feedback` | prototype | prototype_feedback_link | app/components/prototype-tabs.tsx:26 | 同上 |
| 17 | `support_email_click` | support | cookies_page | app/cookies/page.tsx:195-197 | 支持邮箱点击 |
| 18 | `support_email_click` | support | support_page | app/support/page.tsx:197-199 | 同上 |
| 19 | `feedback_open` | feedback | (无) | app/tools/feedback-bubble.tsx:48-49 | 工具站反馈气泡打开 |
| 20 | `feedback_start` | feedback | (无) | app/tools/feedback-bubble.tsx:73-74 | 反馈实际开写(服务端对应 `email_captures` source=`tool_feedback`) |
| 21 | `tools_pick` | tools | pick_pet_card | app/tools/page.tsx:66 | 工具选择分布(三卡) |
| 22 | `tools_pick` | tools | pick_symptom_check | app/tools/page.tsx:86 | 同上 |
| 23 | `tools_pick` | tools | pick_care_schedule | app/tools/page.tsx:110 | 同上 |
| 24 | `tools_to_pricing` | tools | tools_to_pricing | app/tools/page.tsx:161 | 工具→pricing 转化 |
| 25 | `card_photo_upload` | card | (无) | app/tools/pet-card/page.tsx:318 | Pet Card 漏斗:传图(仅 start 前记一次) |
| 26 | `card_start` | card | (无) | app/tools/pet-card/page.tsx:365 | Pet Card 漏斗:开始(动态,started 前记) |
| 27 | `card_download` | card | download_image | app/tools/pet-card/page.tsx:429-433 | Pet Card 漏斗:产出 |
| 28 | `card_print` | card | print | app/tools/pet-card/page.tsx:433 | 产出形态分布 |
| 29 | `card_share_copy` | card | share_link | app/tools/pet-card/page.tsx:437 | 分享行为 |
| 30 | `card_to_pricing` | card | card_to_pricing | app/tools/pet-card/page.tsx:452 | 工具→pricing 转化 |
| 31 | `shared_make_own` | card | shared_make_own | app/tools/pet-card/page.tsx:729 | 分享接收方自建(病毒系数信号) |
| 32 | `sched_start` | schedule | (无) | app/tools/schedule/page.tsx:302 | Schedule 漏斗:开始 |
| 33 | `sched_add_preset` | schedule | {preset label}(动态) | app/tools/schedule/page.tsx:324 | 添加分布 |
| 34 | `sched_add_custom` | schedule | (无) | app/tools/schedule/page.tsx:354 | 自定义添加 |
| 35 | `sched_toggle` | schedule | (无) | app/tools/schedule/page.tsx:556 | 完成勾选(活跃度信号) |
| 36 | `sched_share_copy` | schedule | share_link | app/tools/schedule/page.tsx:437 | 分享行为 |
| 37 | `sched_print` | schedule | print | app/tools/schedule/page.tsx:441 | 产出形态分布 |
| 38 | `sched_to_pricing` | schedule | sched_to_pricing | app/tools/schedule/page.tsx:454 | 工具→pricing 转化 |
| 39 | `symptom_search` | symptom | (无) | app/tools/symptoms/page.tsx:83 | 症状工具:搜索 |
| 40 | `symptom_open` | symptom | {symptom id}(动态) | app/tools/symptoms/page.tsx:224 | 症状打开分布(SEO 词验证信号) |
| 41 | `symptom_open_page` | symptom | {id}(动态) | app/tools/symptoms/page.tsx:207 | 子页打开 |
| 42 | `symptom_full_guide` | symptom | {id}(动态) | app/tools/symptoms/page.tsx:136 | 完整指南点击 |
| 43 | `symptom_related` | symptom | {id}(动态) | app/tools/symptoms/page.tsx:149 | 相关症状点击 |
| 44 | `symptom_find_emergency` | symptom | (无) | app/tools/symptoms/page.tsx:68 | 急诊查找点击 |
| 45 | `symptom_to_pricing` | symptom | symptom_to_pricing | app/tools/symptoms/page.tsx:243 | 工具→pricing 转化 |

> 注:45 行 = 45 个埋点;去重后 36 个事件名(`open_app_cta`/`founding_deposit_click`/`tools_pick`/`support_email_click` 等跨页复用按 label 区分)。上表即全量,无遗漏(grep `data-event` 全量覆盖,含 `data-event={...}` 动态形式 3 处,均在上表)。

### 1.2 本轮新增事件(T1 落地后生效)

- **现状**:`app_store_cta` 由本轮 T1 定义([ITERATION-PLAN-2026-10-13](../ITERATION-PLAN-2026-10-13.md) §2 T1:「GA 事件埋点(`app_store_cta`)」),挂在 hero/pilot-success/faq/pricing/about 的 App Store 下载 CTA 上,指向 `https://apps.apple.com/us/app/id6813496739`(商店 ID `6813496739`,iTunes lookup 已实测 resultCount=1)。**截至 2026-10-13 写文时,www 仓 0 处 `apps.apple.com` 链接、0 处 `app_store_cta`(grep 实证)——T1 合并前本节为规划口径,T1 合并后按实际实现回填本表。**
- **怎么看**:同 §1.0(GA4 事件报表)。周报口径:周事件数;按 `event_label`(落地页位置)拆分看哪个位置最能导流;与 `open_app_cta` 并列看「App Store 直下 vs web App」的偏好比。**建议口径**(供 T1 对齐):`data-event="app_store_cta" data-event-category="app_store" data-event-label="{hero|pilot_success|faq|pricing|about}"`——与现有命名风格一致;最终以 T1 代码为准。
- **周报行格式**:`app_store_cta: N 次(hero a / pilot b / faq c / pricing d / about e),环比 ±x%`

**渠道归因口径(配合 app_store_cta)**:
- **现状**:utm 由 `lib/utm.ts` 在首屏捕获,localStorage 保存 last-touch + firstSource(utm.ts:33-45);GA 事件带 `utm_attribution`(仅 source 字段,analytics-events.tsx:25,31);pilot/intake 提交带完整 utm 落库 `email_captures`/`pet_intake`(`server/lemon-webhook/db.go:199-209`,source 值全集:`home_pilot`/`home_quick_demo`/`home_cocreate`/`tool_feedback`/`waitlist`/`post_payment`,grep 实证)。
- **怎么看**:渠道拆分看 GA4 报告 → 获客 → 流量获取(`utm_source`/`referral`);报名归因看 `email_captures` 表按 `utm` 字段分组(需 DB 只读权限,founder 手工)。**注意**:apps.apple.com 商店链接上的 utm 参数**测不回来**(ASC Analytics 不接收 web utm,苹果官方渠道归因仅限 Apple Ads)——商店下载的渠道归因只能在 landing 侧做:即「该会话点了 `app_store_cta` 时的 utm_source」。商店链接本身不必加 utm。
- **周报行格式**:并入 §5 模板「渠道归因」小行:`top utm_source: reddit n1 / x.com n2 / google n3 / direct n4`

### 1.3 核心漏斗(周报用,GA 侧)

- **现状**:landing 侧可观测的漏斗 = 到达 → demo → App 导流 → 报名 → 创始席位,事件已齐(§1.1 #1/2/3/9/10)。产品侧「安装→激活」漏斗以 [PRODUCT.md](../PRODUCT.md) §3.2:105-114 为准(100 installs → 40 create pet → 20 first task → 12 use 3+ days → 8 invite → 5 use 2+ weeks),**该漏斗在服务端/ASC 侧,landing GA 事件只是它的上半截**(installs 之前的部分)。
- **怎么看**:GA4 事件数按周窗(周一~周日 UTC)取,漏斗比 = 下游事件/上游事件(跨页事件无用户级串联,是近似漏斗;要用户级串联需 GA4 探索里建 funnel 报告,免费版可用,属可选增强,不在本轮)。
- **周报行格式**:
  ```
  GA 漏斗(周): open_app_cta N1 · app_store_cta N2 · quick_demo_cta N3 → quick_demo_start N4(转化 n4/n3)
               · pilot_join_click N5 · founding_deposit_click N6
  ```

### 1.4 报名/邮件计数(漏斗落库侧,与 GA 互为校验)

- **现状**:pilot 报名与 demo 投票不进 GA 漏斗而落 Postgres:`/email-capture` → `email_captures(email, email_hash, source, utm)`(server/lemon-webhook/main.go:66,db.go:209),`/intake` → `pet_intake`(main.go:65,db.go:199)。GA `pilot_join_click` 是点击数,`email_captures WHERE source='home_pilot'` 是成功数——两者差 = 提交失败/放弃。
- **怎么看**:DB 只读查询(手工,founder 侧):`SELECT count(*) FROM email_captures WHERE source='home_pilot' AND created_at >= 周 起点`(表结构见 db.go:199-209;列名以 prod schema 为准)。
- **周报行格式**:`pilot 邮件: N 封(周增),累计 M;GA 点击 n5 vs 落库 N(差 = 失败/放弃)`

---

## 2. GSC 核查清单(Google Search Console)

> **归属声明:GSC 后台全部为 founder 手工项**——仓库内无 GSC 验证 meta(grep `google-site-verification` 零命中),验证与授权在 Google 侧配置;本节只定义「看什么、怎么算」。

### 2.1 收录状态

- **现状**:站点 = `www.joinplanet.pet`;sitemap 由 `www.joinplanet.pet/app/sitemap.ts` 生成(含 `/`、/tools 三件、症状子页、/learn 文章、法务页,lastmod 手工冻结,sitemap.ts:17-31),robots 由 `app/robots.ts` 生成。内容面:learn 7 篇 + tools 3 件(2026-10-13 基线,ITERATION-PLAN §0);T3/T4 本轮再加一工具一文章。
- **怎么看**:GSC → 索引 → 网页(Page indexing):「已收录」页面数,对照「站点地图」提交数;每周记「已收录/已提交」两个数,收录数长期不涨 = 优先查 sitemap 覆盖与内链。
- **周报行格式**:`GSC 收录: 已收录 X / 已提交 Y(环比 +z 页)`

### 2.2 核心词排名(盯这些词,不盯长尾全集)

- **现状**:核心词 = 基线 P0([keyword-research-2026-09-29](../../www.joinplanet.pet/docs/keyword-research-2026-09-29.md):266-276)+ 二批 P1([KEYWORDS-EXPANSION-2026-10-01](KEYWORDS-EXPANSION-2026-10-01.md) §1):
  - `shared pet care app` → `/`
  - `pet care schedule template` / `dog vaccine schedule chart` → `/tools/schedule`
  - `pet symptom checker` → `/tools/symptoms`
  - `pet sitter instructions template` → `/tools/sitter-instructions`(**T3 本轮落地后才开始有排名**)
  - `puppy vaccine schedule` / `deworming schedule for dogs` → /learn 对应文
  - 二批 P1:`dog custody schedule`、`foster dog medication log`、`rescue dog first 30 days`、`multi-dog household feeding schedule`、`cat sitter instructions template`
- **怎么看**:GSC → 效果(Performance)→ 查询过滤中逐词查平均排名;或导出查询表 grep 核心词。**红线**(keyword-research:11):本站有 impression 前任何词的难度判断都只是 SERP 形态,GSC 数据出现后必须复核。
- **周报行格式**:`GSC 排名: shared pet care app #-- · pet symptom checker #-- · pet sitter instructions template #--(词 #位,「--」= 尚无 impression)`

### 2.3 每周看哪三个数

- **现状**:GSC 效果报表四指标(总曝光/总点击/平均 CTR/平均排名)里,周报固定取**三个**:①曝光(impressions)②点击(clicks)③核心词平均排名。CTR 不单列(由 ①② 推出)。
- **怎么看**:GSC → 效果,日期范围 = 上一个完整自然周(周一~周日),与 GA 周窗一致;三个数都取「环比上周」。
- **周报行格式**:`SEO 三数: 曝光 I(±x%) · 点击 C(±y%) · 核心词均排 P(±n)`

---

## 3. App Store 侧

### 3.1 商店页访问与转化(在哪看)

- **现状**:App 已上架:`PlanET: Shared Pet Care` v1.0,商店页 `https://apps.apple.com/us/app/id6813496739`(ITERATION-PLAN §0:8;本日实测 iTunes lookup US resultCount=1,SG 区 `averageUserRating=0`、`userRatingCount=0`、`currentVersionReleaseDate=2026-10-12T20:27:05Z`)。**周报所需数字全部在 ASC 网页后台,不依赖 API。**
- **怎么看**:App Store Connect → 我的 App → PlanET → **分析(Analytics)**:「App Store 页面访问数(Product Page Views)」= 商店页访问;「App 下载数(Downloads)」= 下载;转化率 = 下载 ÷ 页面访问(后台直接给)。数据滞后约 24–72h;可按区域(US/SG)拆分。**限制**:ASC Analytics 无法按 web 外链渠道拆分来源(见 §1.2 渠道归因口径),渠道归因看 GA 侧 `app_store_cta`。
- **周报行格式**:`ASC: 页面访问 P(±x%) · 下载 D(±y%) · 转化 d/p%;US a / SG b`

### 3.2 ASC API key 状态

- **现状(事实链,以仓内文档为准)**:2026-10-13 早间记录为 401 待查(ITERATION-PLAN:9:issuer 564deed7-…,kid AU635UB384,token 声明正确疑 key 被撤);**同日复核已定位并解决**(ITERATION-PLAN:50):401 系**误用 APNs key(AU635UB384)签 ASC API**——正确 ASC key 为 kid `7D2L694J82`(`~/secret/AuthKey_7D2L694J82.p8`),换钥后 API 正常,且确认 VER 1.0 = READY_FOR_SALE。自动化脚本(`scripts/asc.py`/`asc-submit.py`/`asc-resubmit.py`)是这把 key 的消费方。
- **怎么看**:周报数字**不依赖** ASC API(§3.1 全部后台手工看);key 只影响提审自动化。若后台数字也取不到(key 撤销类故障),回退 = founder 手工登录 ASC 网页看,口径不变。
- **周报行格式**:常态不占行;仅故障时记:`ASC key 异常(症状…),周报数字来自后台手工`

### 3.3 评论监控口径

- **现状**:上线 1 天,0 评分 0 评论(本日 iTunes lookup 实测);founder 待办里有「App Store 首批评价:自己设备下载留评,冷启动信任锚」(ITERATION-PLAN:51)。公开数据源无需鉴权:`https://itunes.apple.com/lookup?id=6813496739`(本日已实测可用)返回 `averageUserRating`/`userRatingCount`;评论区正文在 ASC 后台。
- **怎么看**:①**星级与评分数**:iTunes lookup(可自动化,只读公开);②**评论正文与回复**:ASC → 评分与评论(Ratings & Reviews),founder 手工;③口径:每周记均值与增量;新增 ≤3 星评论必须当周读原文并在周报摘 1–2 条原话(差评是 NEEDS-MINING 式需求信号的主要来源);回复动作不限时但每周复盘一次。**建议**(非既定制度,待 founder 认可):≤3 星评论 7 天内回复。
- **周报行格式**:`评价: 均值 r(n 条,周增 +k);新增差评 q 条(摘原话/已回/未回)`

---

## 4. E5 撞墙计数(活跃宠物 2/2 的账户数)

### 4.1 现状与口径

- **现状**:`GET /api/v1/me/usage` 数据源已在且已接线(`planet-api/internal/modules/identity/http.go:54` 路由,`:343-353` handler),产品侧入口 = 「账户 › 用量」页(QB2,[PRODUCT.md](../PRODUCT.md) §5.0:218)。free 档活跃宠物上限 = **2**(plans 表,迁移 0032 冻结,PRODUCT.md §5.0)。E5 要求「在 C 端数据周报里加一行『活跃宠物 2/2 的账户数』趋势」([SAAS-PREP-2026-10-01](SAAS-PREP-2026-10-01.md) §E5:109-113)。
- **口径(逐字取自执法代码)**:「撞墙账户」= 同时满足:①plan 为 free(无任何有效 subscriptions/entitlements 行即 free,`planet-api/internal/modules/entitlements/service.go:120-142` BestKey 逻辑,pro/founding/grant 均排除);②该用户活跃宠物数 ≥ 2,即 `CountActivePetsByOwner` 的谓词:`pet_ownerships o JOIN pets p ON p.id=o.pet_id WHERE o.owner_user_id=$1 AND o.valid_to IS NULL AND o.deleted_at IS NULL AND p.status IN ('active','deceased') AND p.deleted_at IS NULL`(`planet-api/internal/modules/pets/repo.go:407-410`)——**deceased 占额、archived/软删不占**,与用量页/执法完全同函数同口径(service.go:59,74:usage 的 `resources.pets_created.used` 就出自这一个函数)。单账户即时视图 = `/me/usage` 响应的 `resources.pets_created {used, limit}`(service.go:98-105)。
- **归属(不改,引用裁决)**:此数是 **C 端 pro 档「解锁第 3+ 只宠物」定价的需求证据,归 C 端主线数据,不占 SaaS/组织版筹备**(SAAS-PREP §1.2:48、§E5:113、§0.3)。周报里它叫「C 端 pro 立项证据」,不与 B 端混排。

### 4.2 怎么取数

- **现状**:**周度聚合当前无任何自动化**(本轮不做管道,遵守「只盘点不实施」)。单账户数据产品内可见;周度数需对 prod Postgres 跑一次只读 SQL,属 founder/持 DB 只读权限者手工项。
- **怎么看**(SQL 模板,谓词逐字同 repo.go:409;**表名以 prod 实际 schema 为准,执行前先核对**):

  ```sql
  -- E5 周查:free 档活跃宠物达 2 只上限的账户数(只读)
  SELECT count(*) AS at_cap_accounts
  FROM (
    SELECT o.owner_user_id
    FROM pet_ownerships o
    JOIN pets p ON p.id = o.pet_id
    WHERE o.valid_to IS NULL AND o.deleted_at IS NULL
      AND p.status IN ('active','deceased') AND p.deleted_at IS NULL
    GROUP BY o.owner_user_id
    HAVING count(*) >= 2
  ) caps
  -- plan 过滤:caps 里再排除持有有效 entitlements/subscriptions(非 free)的用户,
  -- 判定同 BestKey(service.go:120-142):subscriptions.status='active' 未删未过期,
  -- 或 entitlements.deleted_at IS NULL 未过期。
  ```
  分母(占比用)= 至少 1 只活跃宠物的 free 账户数(同谓词 `HAVING count(*) >= 1` 再减非 free)。第二观察项「撞墙后 7 日留存差」(SAAS-PREP §E5:112)口径 = 撞墙账户在 +7 天仍有 ≥1 次完成/记录动作的比例,减去未撞墙同口径比例;**先记撞墙数,留存差等样本 >0 再上**(现在必然是空集)。
- **周报行格式**:`E5 撞墙(C 端 pro 证据): N 户(占比 x%,分母=≥1 活跃宠 free 户),环比 ±n;7日留存差: 暂无样本`

---

## 5. 周报模板(一页,固定行,直接抄)

> 周窗 = 周一~周日(UTC),周一出报。来源缩写:ASC = App Store Connect 后台(§3.1);GA = GA4 `G-Z4M278ZGW3`(§1);GSC = Search Console(§2,founder 手工);E5 = prod 只读 SQL(§4,founder 手工);Reddit = [OUTBOUND-REDDIT-TARGETS](OUTBOUND-REDDIT-TARGETS.md) 执行状态表。`--` = 该周无数据/未取。

```markdown
# PLANET 分发周报 2026-Wxx(月日–月日)

## 商店下载(ASC,§3.1)
- 页面访问 P(环比 ±x%) · 下载 D(±y%) · 转化 d/p%(US a / SG b)
- 评价: 均值 r(n 条,周增 +k);新增差评 q 条(摘原话/已回/未回)

## landing 访问(GA,§1.0)
- sessions N(环比 ±x%);top utm_source: reddit n1 / x.com n2 / google n3 / direct n4

## GA 事件漏斗(GA,§1.3–1.4)
- open_app_cta N1 · app_store_cta N2 · quick_demo_cta N3 → quick_demo_start N4(转化 n4/n3)
  · pilot_join_click N5 · founding_deposit_click N6
- pilot 邮件: N 封(周增),累计 M;GA 点击 vs 落库差 = 失败/放弃

## SEO 三数(GSC,§2.3,founder 手工)
- 收录: 已收录 X / 已提交 Y(±z 页)
- 曝光 I(±x%) · 点击 C(±y%) · 核心词均排 P(±n);本周异动词: …

## Reddit 通道状态(§5 注;状态源 = OUTBOUND-REDDIT-TARGETS)
- 通道: 冻结(自 09-25)/ 已解冻(founder 手工首发成功日 = 解冻日);队列 #0–#6 在备
- 本周动作: (无 / 队列 #x 已发,存活?)/ 触点: (月帖/收件箱 状态)

## E5 撞墙(C 端 pro 证据,§4,founder 手工 SQL)
- N 户(占比 x%,分母=≥1 活跃宠 free 户),环比 ±n;7 日留存差: 暂无样本

## 待 founder 项(默认清单,随 ITERATION-PLAN §5 滚动)
1. Reddit 解冻: 手工发队列 #0(r/EpilepsyDogs 1wgcfgw)
2. E1: 批 cold email 三封并圈 3 家发送
3. E2: waitlist 文案批/不批
4. App Store 首评: 自己设备下载留评(冷启动信任锚)
5. (发生时)≤3 星评论回复 / GSC、E5 手工取数
```

**维护纪律**:口径变更(事件增删、ASC 指标变化、E5 判定调整)只改本手册对应三段并在文首基线日追加一行变更记录;周报本身不定义口径,只引用本手册。

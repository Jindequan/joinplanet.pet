# G2 · sitter 分享 kind(保姆视图)+ timeline 分享 kind — 系统性设计

> **设计稿 v2——已过审查门(2026-10-14 独立审查 verdict:pass,三项处置全部采纳并修入正文)。**
> v2 修订:①新增 §4.5「事实源与契约文档修订」为交付物(审查 P2:PRODUCT.md §4.6「匿名接收方只能读分享快照」与 APP-BEHAVIOR-CONTRACT §2.4「创建=快照物化」在活视图落地后将成为不实陈述);②§4.1 down 迁移去掉 `deleted_at IS NULL` 过滤,修复 down→up→再 down 二次重入失败(审查 P3,实证:全仓无 share_links.deleted_at 写入者,首轮回滚留下的软删行会被收窄 CHECK 卡死);③§4.2 时区解析改根修——TodayForPetShare 空窗口也回传解析后时区,sharing 层不再二次推导(审查 P3,实证:两链中段不同,defaultCareTimezone="Asia/Shanghai" 仅终段重合)。
> 归属:2.0 补足包 G2(docs/commerce/SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md §6.6,P0,免费不限)。
> 初始设计锚:docs/archive/APP-DESIGN.md(2026-08-16)F7 与「临时分享生命周期」段;现行事实源:docs/PRODUCT.md(§4.6 受控分享、§4.2 时区铁法、§0 层级红线)。
> 本文所有代码/文档断言均出自本 session 实读,出处随行标注。

---

## 0. 结论速览与一处对档案的修正

1. **新增两个分享 kind:`sitter`(活视图:保姆交接期「今天该做什么」)与 `timeline`(活视图:事实流限时跟随)。`share_links.kind` CHECK 约束由两值演进为四值**(`care_card | summary | sitter | timeline`),迁移含可逆回滚。
2. **对档案「三 kind」表述的修正**:APP-DESIGN.md:231/282 原文是「Summary / sitter / timeline 三种 kind 复用一表」,但实现落地时 sitter 位被 `care_card` 占据(冻结快照语义,且该语义是 **1.1 修复裁决**——APP-BEHAVIOR-CONTRACT.md §2.4:「care_card 为冻结快照,UI 呈现快照日期及保存说明,不称『今日/current』」)。**把 care_card 改成活视图=复活已裁决否决的方案(AGENT-CONSTITUTION §1.5),且直接违反快照契约**(service.go:133-135:「later edits…must not silently change what the recipient was shown」)。因此 G2 落地后是**四 kind 并存**,不是三 kind。此修正列开放问题 #1 待 founder 复核。
3. **sitter 的核心语义差异=活**:保姆链接的生命周期是「交接期(数天~数周)」,每次打开必须看到**当时**的今天。care_card 的冻结快照做不到(周五创建、周六打开看到的还是周五)——这正是 care_card 在 1.1 被裁为「不得自称今日」的根因。sitter 用**真活视图**诚实承载「今天」。
4. **零新表、零新调度器、零新领域主体**:两个新 kind 全部经既有 reader 接口(PetReader/MedsReader/EventReader/TodayReader,contracts/share_types.go:52-84)实时组装,不写任何地基表(匿名路径的 occurrence 物化复用 care_card 无快照行的既有按需物化,tasks/service.go:1742)。符合 PRODUCT §0「延伸层只接入地基 API,不改地基表」。
5. **免费不限量**:创建路径无任何配额检查(实读 service.go:112-207,只有 Guard 鉴权+幂等+插入),与订阅设计 §6.6「G2 sitter 分享=免费不限(分享即传播/应急不设卡)」一致。timeline kind 同理(分享即传播,APP-DESIGN.md:119 分层原则 4)。

---

## 1. 事实基线(本 session 实读)

| # | 事实 | 出处 |
|---|---|---|
| F1 | kind 枚举仅有 `care_card`/`summary`,Create 校验 `kind must be care_card\|summary` | planet-api/internal/modules/sharing/service.go:26-27,113-115 |
| F2 | CHECK 约束 `share_links_kind_check CHECK (kind IN ('care_card','summary'))` | migrations/0001_initial.up.sql:401 |
| F3 | 现行创建即**物化快照**;ViewByToken 对无快照行(空/`{}`)走**实时组装**分支(迁移期遗留路径) | service.go:139-152,297-311 |
| F4 | 过期/撤销/不存在一律 410 `SHARE_GONE`,不泄露;view_count 查看时递增,计数失败不阻断 | service.go:280-323 |
| F5 | 撤销=查询时即刻失效,无清理任务;「生成→有效期内可看→到期/撤销立即失效→撤销不可恢复但可再生成」 | APP-DESIGN.md:406;service.go:292-295 |
| F6 | TTL 档位 24/72/168/720/2160/8760/876000(小时);APP 表单只摆前四档 | service.go:31;APP/src/features/pets/sharing-section.tsx:354-359 |
| F7 | care_card 数据集=pet+date+tasks+emergency_contacts+med_decision_maker,注释明言「绝不含:过敏/慢病(属病史)/时间线/已结束用药历史」 | service.go:383-450 |
| F8 | care_card「今天」的时区解析链:任务组快照时区→Members.FamilyTimezone(primary family 优先)→Asia/Shanghai 兜底 | service.go:403-441 |
| F9 | TodayForPetShare 内部解析时区(primary family edge 的 families.timezone→首条规则时区→默认),物化当前 civil-day 窗口并返回行;`SharedTodayGroup.Timezone` 回传所用时区 | tasks/service.go:1703-1752;contracts/share_types.go:44-49 |
| F10 | Meds.ListForShare 返回**全部**用药(含已停,含 EndedOn),字段仅 name/dose/schedule/started_on/ended_on;**不含 note**(note 私域,可含病史语境) | meds/service.go:166-180;contracts/share_types.go:22-28 |
| F11 | timeline ListForShare=FactTypes 白名单(note/photo/symptom/weight/vet_visit/vaccine/deworm/medication/care_task_completed),按 occurred_at 倒序、sinceDays 滚动窗口、limit 截断 | timeline/service.go:779-796;APP-BEHAVIOR-CONTRACT.md §2.3「分享摘要 ListForShare 与记录页同口径」 |
| F12 | 匿名照片=查看时签 1 小时 URL(`photo_url`/`photo_thumb_url`),剥裸对象键;fail closed | service.go:325-381;contracts/share_types.go:64-70 |
| F13 | 公开页路由归属 web:`${publicWebBaseUrl}/s/${token}`,www.joinplanet.pet/app/s/[token]/page.tsx 是**匿名接收方主战场**(服务端渲染,no-store);按 kind 二分渲染,410 有专门状态卡 | APP sharing-section.tsx:253-257;www page.tsx:59-68,152-159 |
| F14 | APP 内 /share/[token](public-share-screen.tsx)为预览/兜底渲染,含 PDF 打印(summary 专属) | APP/app/share/[token].tsx:1-5;public-share-screen.tsx:264-433 |
| F15 | 创建入口唯一:宠物工作区「管理 › 分享」段头文本链→ModalSheet 表单(kind chips+TTL+summary 专属段落/复核步);归档宠禁新分享,deceased 联动全撤 | sharing-section.tsx:159-177,288-563;APP-BEHAVIOR-CONTRACT.md §1/§2 |
| F16 | 创建走 Idempotency-Key(重放可取回 token);审计 share_created/share_revoked 携带 kind | service.go:112-207,230-265 |
| F17 | 匿名查看有按 IP 限流 ViewPerMinute(app 注入) | sharing/http.go:14-15 |
| F18 | 席位语境:Pro+ 档「4 人=核心小家庭+保姆」;SAAS-PREP org 试点以 summary 交付领养人,sitter 切口=「个人把宠物交给无账号保姆」的获客钩子 | SUBSCRIPTION-LAUNCH-DESIGN §2;org-onboarding-onepage.md §3 |
| F19 | 迁移号已用到 0037;订阅设计 S2 计划用 0038(billing)——G2 迁移取施工时下一可用号,本文记 `00XX` | migrations/ 目录;SUBSCRIPTION-LAUNCH-DESIGN §6.6 S2 |

---

## 2. ① 用户旅程

### 2.1 sitter(保姆视图)——主旅程

- **谁**:发起=宠物 Owner(家庭 owner;照护者无权创建,F15 权限表);接收=保姆/朋友/邻居,**无 PLANET 账号,任何手机浏览器可用**(这是与「Pro 席位加一个 viewer」的本质区别:F18 的获客钩子正在于此——不消耗席位、不要求 iPhone、零注册成本)。
- **何时**:出差/度假/住院等交接前 1-2 天创建;交接期(典型 2-14 天)保姆**每天**打开 1-3 次,回答一个问题:「今天该做什么」。
- **从哪进**:PLANET App → 宠物工作区 → 管理 › 分享 → 「创建分享」→ Content view 选 **「保姆照护」**(2.0 起为默认项,见 §3.1)→ 选有效期(默认 168h/7 天)→ 创建 → 系统分享面板(WhatsApp/微信/iMessage)发出 `https://www.joinplanet.pet/s/{token}` → 保姆点击 → 免注册只读页。
- **到哪出**:交接结束,链接按 TTL 自然过期(410 死胡同:请向主人索取新链接)或 Owner 提前撤销(管理列表里的垃圾桶,既有交互);保姆侧无账号、无沉淀、无任何回写(只读红线,PRODUCT §4.6)。
- **每日循环(活视图的价值所在)**:周六早上保姆打开→显示家庭时区的周六任务清单+当前用药+紧急联系人;家里周六临时加了「下午加餐」→保姆再刷新即见;周日零点(家庭时区)后打开→自动翻到周日清单。
- **异常路径**:
  - 链接过期/被撤销 → www 410 状态卡(既有,page.tsx:156)「向分享者索取新链接」;APP 内为过期死胡同屏+mailto 支持(既有,public-share-screen.tsx:497-528)。
  - 当天没有任务 → 空态:「今天没有安排的照护事项」+紧邻紧急联系人区(无需操作≠无信息)。
  - 当前无用药 → 「暂无进行中的用药」。
  - 创建时宠物已归档/离世 → 409 `PET_ARCHIVED`/`PET_DECEASED`(既有守卫,F15);deceased 联动全撤既有。
  - 保姆跨时区(家庭在上海、保姆在纽约):页面顶部显示**解析后的日期**(如「10 月 14 日 · 家庭时区的今天」),日界跟随家庭,不跟保姆浏览器。

### 2.2 timeline(事实流跟随)——主旅程

- **谁**:发起=Owner;接收=需要**持续**了解近况的圈外角色:行为师/训练师、救助组织协调人(org 试点语境:寄养期间组织侧跟进)、长期寄养家庭、领养审核方。
- **何时**:建立长期跟进关系时创建一次,有效期内接收方随时回看;与 summary 的分工——summary 是**单次交付的定稿文件**(就诊/领养一次性交接),timeline 是**限时窗口内的持续跟随**(新记录自动出现,无需重发链接)。
- **从哪进**:同一创建入口(主路径唯一,§2.10——不按档案 APP-DESIGN.md:354 在 Timeline 页头另开第二入口)→ Content view 选 **「时间线」** → 选窗口(30/90/180/365 天,默认 90)→ 选择是否包含照片(默认关,与 summary 同)→ 选 TTL → 创建 → 发链接。
- **到哪出**:过期/撤销;期间家庭新写的记录(仅事实白名单,F11)在接收方下次打开时出现。
- **异常路径**:窗口内无记录→空态「这段时间还没有记录」;照片加载失败→静默降级无图(APP 既有三候选降级口径,public-share-screen.tsx:193-205);签名 URL 1 小时过期→刷新页面即重签(F12 机制天然支持)。

---

## 3. ② 交互规格

### 3.1 创建侧(APP ShareForm 扩展,sharing-section.tsx)

**控件**:
- Content view chips 由 2 项扩为 4 项:`保姆照护(sitter,默认)` / `照护卡快照(care_card)` / `健康摘要(summary)` / `时间线(timeline)`。§2.8 可点项 ≤7 达标(4 chips+1 TTL 组+2 按钮)。
- 默认 kind 由 care_card 改为 **sitter**:sitter 是 2.0 补足主角与最高频交接场景;care_card 降位为「存档快照」选项(开放问题 #2)。
- sitter 专属区:仅 TTL chips(24/72/168/720,默认 168)+脚注「保姆打开即可看到当天的照护安排与用药,实时更新;链接到期或撤销后立即失效」。无其他选项——**选项极简是产品判断**:保姆视图的内容集是安全白名单(§3.3),不应交给用户裁剪。
- timeline 专属区:窗口 chips(30/90/180/365,默认 90)+「包含照片」开关(默认关,复用 summary 的 include_photos 行与文案结构)+ TTL chips。**无复核步**(summary 的两步复核源于其在交付病史,含隐私再确认价值;timeline 无 profile/meds 段落,单步即可)。
- 创建成功反馈、链接复制、发送、列表行(kind 标签+过期+浏览数)、撤销确认:全部复用既有交互,仅新增两条 kind 标签文案。

**加载态**:创建按钮 busy(既有);列表 LoadingState(既有)。
**空态**:无分享=留白+段头创建入口(既有,2026-09-25 审计批 C 裁决)。
**错误态**:服务端错误 inline 显示+同幂等键重试(既有 fingerprint 范式,sharing-section.tsx:311-314);409 PET_ARCHIVED/PET_DECEASED 走通用错误文案+退出弹层路径。
**权限**:仅 Owner 可创建/撤销(F15;行为契约 §5「建宠、家庭治理、转移、分享创建=仅 owner」);viewer 打开宠物页 sharing-section 只读态(既有 readOnly 分支)。

### 3.2 接收侧(www.joinplanet.pet/s/[token] ——主战场;APP /share/[token] 预览)

**sitter 视图(新 SitterView 组件,www)**:
- 页头:pet 名+物种/品种+「Live care view」eyebrow+过期时间;**首屏第一屏=今日清单**(保姆的唯一问题)。
- 「今天」区:标题「今天该做的(Today · {解析后日期})」+任务列表(title+time_of_day+状态徽标 completed/skipped/pending+done_by_name,渲染口径同 care_card,page.tsx:100-122);页顶一句「本页实时更新,日期按家庭所在时区」——**活视图必须自称实时,不得出现 snapshot 字样**(与 care_card 的快照说明互为镜像,§1.5 一词一物)。
- 「当前用药」区:进行中的用药行(name+dose+schedule),空=「暂无进行中的用药」。
- 「紧急联系人」区:**结构化渲染 name/phone/email,phone 为 `tel:` 可点、email 为 `mailto:` 可点**(保姆的应急动作就是拨号;现 InfoCard 纯文本拼值不满足此场景——此为 sitter 视图专属组件,不改动 care_card/summary 的 InfoCard)。
- 「医疗决定人」区:同上结构化,`tel:` 可点。
- 页脚:「只读页面;有紧急情况请先联系医疗决定人」+Learn about PLANET(分享即传播的落点,F13 既有)。
- 加载态:服务端渲染,无客户端 loading(既有 readShare no-store 直出)。
- 空态:无任务=「今天没有安排的照护事项」(不显示空任务列表骨架);无联系人=「Not provided」(既有口径)。
- 错误态:410→既有 ShareState 卡;5xx/超时→既有「temporarily unavailable+稍后再试」卡(page.tsx:156-157)。
- 权限:无登录概念;token 即权限(256-bit 随机,service.go:124-128),统一 410 不泄露存活状态(F4)。

**timeline 视图(新 TimelineView 组件,www)**:
- 页头:同构+「Live timeline」eyebrow+窗口标签「Last {N} days」+过期时间。
- 事件流:倒序、按日分组;每条=类型标签(titleCase,既有 page.tsx:82-84)+日期+payload 摘要(既有 SummaryCard 的事件行渲染口径,page.tsx:141);include_photos 开启时照片走查看时签名 URL。
- 页顶一句「{pet 名}的新记录会自动出现在这里,直到链接过期」。
- 空态:「这段时间还没有记录」;错误态/加载态同 sitter。
- **不做分页**:与 summary 同口径,cap 200(§4.3);公开页保持零 JS 依赖。

**APP /share/[token] 预览(public-share-screen.tsx)**:SharedViewCard 增两 kind 分支——sitter:渲染 tasks(既有)+**medications 区条件由 `hasSummaryField('medications')` 扩为 `kind==='sitter'||hasSummaryField('medications')`**+联系人/决定人(既有)+「实时视图」标识(替换快照日期句);timeline:渲染 events 区(既有 describeEvent 注册表)+「实时」标识。PDF 打印仍仅 summary(保姆/时间线无打印诉求,不扩)。
**generateMetadata(www)**:kind 描述文案各配一条(sitter:「A live care view for {name}, shared privately through PLANET.」;timeline:「{name}'s recent care timeline, shared privately through PLANET.」),noindex 不变。

---

## 4. ③ 领域与数据影响

### 4.1 枚举迁移(CHECK 约束演进+回滚)

```sql
-- 00XX_share_kinds_sitter_timeline.up.sql
ALTER TABLE public.share_links DROP CONSTRAINT share_links_kind_check;
ALTER TABLE public.share_links ADD CONSTRAINT share_links_kind_check
    CHECK (kind IN ('care_card', 'summary', 'sitter', 'timeline'));

-- 00XX_share_kinds_sitter_timeline.down.sql
-- 回滚语义:新 kind 行是「短命只读凭证」而非用户资产;软删+撤销(可审计、可追溯、不物理销毁)后收窄约束。
-- 幂等重入(审查 P3 修订):UPDATE 刻意不带 deleted_at IS NULL 过滤——首轮回滚留下的已软删
-- sitter/timeline 行会被收窄后的 CHECK 拒绝(约束对全部行生效,不看 deleted_at),导致
-- down→up→再建→再 down 时约束创建失败。revoked_at 用 COALESCE 幂等;对已软删行重复
-- SET deleted_at=now() 无害。全仓现无任何业务路径写 share_links.deleted_at(实查:仅
-- revoked_at 写入者 sharing/repo.go:126、pets/repo.go:470、pets/service.go:1186;物理清理走
-- pets/purge.go:104 的 DELETE),本迁移是该列的唯一写入者,重入场景必须自知自洽。
UPDATE public.share_links
   SET revoked_at = COALESCE(revoked_at, now()),
       deleted_at = now()
 WHERE kind IN ('sitter', 'timeline');
ALTER TABLE public.share_links DROP CONSTRAINT share_links_kind_check;
ALTER TABLE public.share_links ADD CONSTRAINT share_links_kind_check
    CHECK (kind IN ('care_card', 'summary'));
```

- 不动 0001 baseline(schema_test.go 只约束 baseline 表集与禁 token,增量迁移走独立文件是仓库既有惯例——0002/0032/0035 同款)。
- 回滚不物理删除行:撤销+软删与既有 deceased/转移联动「share_links 全撤」同语义(行为契约 §1),BYTokenHash 的 `deleted_at IS NULL` 过滤(repo.go:57-60)使旧 token 立即 410。

### 4.2 服务端变更(sharing 模块,均为既有文件的窄扩展)

- **常量**:`KindSitter = "sitter"`、`KindTimeline = "timeline"`;Create 校验改为四值(service.go:113-115 处)。
- **快照语义按 kind 分流**:care_card/summary 维持「创建时物化」(F3 主路径不动);sitter/timeline **不物化**——`snapshot` 存默认 `{}`(列 NOT NULL DEFAULT '{}',migrations/0002),ViewByToken 既有空快照分支(F3)自然落到按 kind 实时组装。**创建时仍跑一次 dry-build 作校验**(继承「凭据只在视图可构建时签发」的既有不变量,service.go:133-138 注释语义;sitter 的 dry-build 顺带完成当日 occurrence 物化,与 care_card 现状等价)。
- **options 解析**:新增 `parseTimelineOptions`(`days` 默认 90、上限 365;`include_photos` bool;非法段拒绝——规则与 parseSummaryOptions 的 days 校验一致,service.go:92-94);sitter **拒绝非空 options**(白名单不可裁剪,见 §3.1)。
- **时区根修(审查 P3 修订)**:`sharedTodayRows`(tasks/service.go:1754-1779)在窗口无行时返回空组切片,导致空任务日 `group.Timezone` 缺失、sharing 层被迫走 F8 兜底链(成员服务家庭 tz→Asia/Shanghai)——与 TodayForPetShare 内部链(primary family edge→**首条规则 tz**→defaultCareTimezone="Asia/Shanghai",tasks/service.go:1712-1735)中段不同,规则时区≠primary 家庭时区且当日无任务时,展示日期与物化窗口的 civil day 可能差一日。**修法:空窗口时 `sharedTodayRows` 仍回传一个携带 PetID+Timezone 的空组**,使 sharing 层在任何情况下读到的都是物化所用的同一时区,二次推导彻底退役。此修同时让 care_card 无快照遗留行的实时组装路径变一致(其冻结快照主路径不经此处,行为契约 §2.4 口径不变);F8 兜底链保留为防御性死代码,不再是语义依赖。
- **buildSitter(新,白名单铁律)**:
  - `pet` = petBasic(识别所需:名称/物种/品种/性别/生日/体重,F7 既有字段集,零新增);
  - `date` = 查看时刻经 `TodayForPetShare` 所用时区解析的 civil date(F9:`group.Timezone` 即物化所用时区,按构造成一致——含上述空窗口根修后,无「无任务组」例外);
  - `tasks` = 该宠当日全部 occurrence(跨家庭合并,`TodayRowsForPetInWindow` 既有口径);
  - `medications` = Meds.ListForShare **过滤 active**(`ended_at IS NULL OR ended_at > 查看时刻`;F10 现状返回全部,G2 在 sharing 层过滤,不改 meds 契约——ListForShare 另有 summary 消费者需要含已停药的完整清单);
  - `emergency_contacts`/`med_decision_maker` = profile 原文(F7 既有)。
  - **显式排除(白名单外一律不给)**:allergies/conditions/notes(病史三件,F7 注释原文明言属病史)、events/时间线详情、已结束用药、med 的 note 字段(F10:契约本就不含)、家庭成员名单、家庭时区标识符(只给解析后的 `date`,不泄漏地区)、一切内部 ID(petBasic 无 id,F7 既有)。
- **buildTimeline(新)**:`pet`+`events`=EventReader.ListForShare(petID, opts.Days, 200)(F11:FactTypes 白名单+倒序+滚动窗口,活视图下 sinceDays 相对查看时刻即「最近 N 天」)+`event_days`;照片经既有 `sharedEventPayload`/`signSharedEventPhotos`(F12:include_photos 才留、查看时签名、剥裸键、fail closed)——**零新隐私机制,全部复用已审计口径**。
- **ViewByToken**:live 分支 switch 增两 kind(F3 的 default→410 保底保留:未知 kind 永远 410)。
- **不变**:路由形状(http.go:19-23 四端点零增减)、幂等/审计/限流/410 语义、TTL 档位、Guard(归档禁创建)、RevokeForPet 联动。
- **与 Occurrence-Event 主体的关系**:只读。sitter 的「今天」消费 Today 既有物化(匿名按需物化是 care_card 无快照行已走的路径,F9/tasks/service.go:1742,幂等);timeline 消费 events 只读投影。**不建任何平行业务主体,不写地基表**(PRODUCT §0 红线)。
- **无新调度器**:过期=查询时校验(F5),活视图不存在快照保鲜问题——活语义反而消灭了「快照过期重物化」这类潜在调度需求。

### 4.3 客户端契约与 i18n

- APP `Share['kind']` 联合类型扩为四值(planet-api.ts:131;`ShareViewResponse` 随动 :354);createShare 入参类型随动(:495)。
- www `ShareResponse.kind` 与类型分支(page.tsx:57,158)扩为四值,新增 SitterView/TimelineView。
- i18n:新增 key(4 个 kind 选项标签、sitter/timeline 脚注、空态与实时视图文案、metadata 描述)**全语言同步补齐**(AGENT-CONSTITUTION §3.9;APP 侧 t() 单源,APP/src/lib/i18n.ts)。
- **零新依赖**:服务端纯 SQL+既有接口;APP 复用既有组件;www 复用既有 share 样式类——两仓 package.json 不动(核查:www page.tsx 仅用 next/link 与既有 fetch;APP 复用 ChoiceChips/ModalSheet 等,sharing-section.tsx 既有 import 集)。

### 4.4 容量与安全注记

- 活视图查询成本高于快照服读(今日物化+三表读);既有 ViewPerMinute 按 IP 限流(F17)覆盖,无需新限流。 TodayForPetShare 单宠物窗口查询是窄查询(pet_id 索引,F9 既有路径)。
- 三视角(AGENT-CONSTITUTION §4.1):攻击者——token 256-bit 随机+sha256 存储,枚举/存活探测统一 410(F4);越权——匿名只读+白名单组装,响应无内部 ID/裸对象键;小白——过期死胡同有明确下一步(索要新链接);开发者——幂等重放取回 token(F16)、物化幂等、签名 URL 短时。

### 4.5 事实源与契约文档修订(交付物,随代码同车——审查 P2 增补)

活视图语义落地后,两处现行表述将成为不实陈述,**必须随 G2 施工同步修订**,否则事实源与实现互相矛盾(PRODUCT.md:7 自declare 唯一事实源;本仓契约登记纪律的「改动前先读」存在反向义务——改完要写回):

| 文档/位置 | 现行表述 | 修订要点 |
|---|---|---|
| docs/PRODUCT.md §4.6(:186) | 「`care_card` 提供当前照护信息和今日行动…;`summary` 按选定范围生成健康摘要…匿名接收方**只能读分享快照**,不能写入家庭数据」 | kind 清单补 `sitter`(活视图:家庭时区的今日照护+进行中用药+紧急联系人,不含病史)与 `timeline`(活视图:事实流限时跟随);「只能读分享快照」改为「只能读分享视图(care_card/summary 为创建时快照,sitter/timeline 为查看时实时组装的只读视图)」;「不能写入家庭数据」红线原文保留 |
| docs/APP-BEHAVIOR-CONTRACT.md §2.4(:80) | 「外部分享:创建=**快照物化**+token 仅返回一次」 | 补:「快照物化仅 care_card/summary;sitter/timeline 创建不物化(snapshot 存 '{}'——空对象走既有活组装分支),查看时组装;410/撤销/幂等/限流口径四 kind 一致」;§2.4 同段补 sitter 的 active 用药过滤与白名单排除项,作为匿名响应的契约边界 |

- 修订属文案级(不改任何裁决语义);「分享即传播/免费不限」等既有裁决原文不动,只做枚举与语义补全。
- 施工波验收时以本节为 checklist:两文档 diff 未随车 = G2 未完成(AGENT-CONSTITUTION §1.3 证据制)。

---

## 5. ④ 验收

### 5.1 e2e 断言点(服务端,planet-api 集成测试风格)

1. **白名单安全回归(最重要)**:创建 sitter→匿名查看→断言响应含 `pet/date/tasks/medications/emergency_contacts/med_decision_maker`,且**不含** `allergies/conditions/notes/events` 及任何 `photo.key/thumb_key`/内部 id。
2. **活语义**:sitter 创建后新增一条今日任务→再查看→新任务出现(对照:summary 快照不变——双联断言钉死两种语义的分界)。
3. **时区**:家庭 tz=Asia/Shanghai,在 UTC 20:00(=上海次日 04:00)查看→`date` 与 tasks 为上海 civil day;跨时区保姆浏览器不改结果(服务端解析);**当日无任何任务时 `date` 仍按同一时区解析**(钉死空窗口时区回传根修,防两链中段漂移回归)。
4. **active 过滤**:停用一个用药(ended_at=过去)→sitter 视图不含它,timeline/summary 不受影响(若选 medications 段)。
5. **timeline**:FactTypes 口径(scope=management 类事件如 transfer 不出现);窗口外事件不出现;include_photos=false 时 payload 无 photo 引用、true 时有 `photo_url` 且无裸键;创建后新事件出现(活)。
6. **生命周期**:TTL 过期→410;撤销→410;view_count 递增;sitter 非空 options→400;非法 days(>365)→400;归档宠创建→409 PET_ARCHIVED(既有断言随 kind 参数化扩两值)。
7. **幂等**:同 Idempotency-Key 重放取回同 token(既有断言参数化扩两 kind)。

### 5.2 真实栈走查步骤(AGENT-CONSTITUTION §4.4 口径)

1. `bun run db:migrate` 应用 00XX;`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='share_links_kind_check'` 确认四值。
2. 本地起 API+www:`POST /api/v1/pets/{id}/shares`(kind=sitter,ttl=168)→ 复制 token → **手机浏览器**开 `http://www.local/s/{token}`(或宿主地址):核对 §3.2 sitter 页五维(正常/空任务/410/5xx/tel: 可点)。
3. 双账号并排:Owner A 创建+撤销;账号 B(caregiver)确认无创建入口(权限)。
4. 走查一条逆向流:撤销后同 token 复开=410;管理列表中该分享消失或标记撤销(既有列表行为)。
5. timeline 同法走查,含「创建→写新事件→刷新可见」活语义与照片开关两态。
6. 回滚演练(含二次重入,审查 P3 修订后必须覆盖):回滚 00XX→约束收窄+存量 sitter/timeline 行 revoked+软删→旧 token 410;**随后重放 up→再建一条 sitter→再 down→约束必须再次创建成功**(验证 UPDATE 无 deleted_at 过滤后,首轮回滚残留的软删行不再卡死收窄 CHECK)。
7. 免费复核:free 档账号连续创建 sitter/timeline 各 10 条→无任何配额拦截(对照 `GET /me/usage` 无分享计数维度)。
8. 事实源落实(§4.5 checklist):PRODUCT.md §4.6 与 APP-BEHAVIOR-CONTRACT §2.4 的修订 diff 已随车合入——两文档仍写「只能读分享快照/创建=快照物化」= 未完成。

### 5.3 免费归属复核(铁律)

- 创建路径零配额检查(实读 F1/service.go:112-207);分享类永不收费(APP-DESIGN.md:119 分层原则 4;SUBSCRIPTION-LAUNCH-DESIGN §6.6:「G2 sitter 分享=免费不限(分享即传播/应急不设卡)」);timeline kind 同属分享类→免费不限。**本设计不引入任何与 plans/entitlement 的耦合点。**

---

## 6. 不做清单(本期明确不做,防蔓延)

1. **保姆回写**(勾选完成/写记录):匿名只读红线(PRODUCT §4.6);受控回写=V2.5「外部照护角色」既定排期(PRODUCT §8)。
2. **care_card 语义翻新或退役**:冻结快照语义是 1.1 裁决(事实基线 §0.2);退役需用户裁决+数据迁移,不在 G2。
3. **Timeline 页头第二分享入口**:主路径唯一(AGENT-CONSTITUTION §2.10);2026-09-28 hierarchy-pass 已把分享收进宠物页「管理」组,不回摆。
4. **公开页分页/搜索**:cap 200 与 summary 同口径;公开页保持零 JS。
5. **sitter 推送/实时通知**(档案 Phase 2「实时推送」):活视图按打开即新,推送属 V2 通知服务排期。
6. **TTL 新档位**:保姆 720h=30 天已覆盖典型交接;API 既有 2160+ 档位不进 UI(与现状一致)。

## 7. 开放问题(需 founder/施工波复核)

1. **四 kind 并存 vs 档案「三 kind」**:本设计保留 care_card(冻结快照)并新增 sitter/timeline,与 APP-DESIGN.md:231「三 kind」字面不符。保留依据=1.1 冻结语义裁决+快照契约;若 founder 拍板收束三 kind,则需另行设计 care_card→sitter 的迁移与「存档快照」能力取舍(超出 G2)。
2. **创建表单默认 kind 改为 sitter**:轻量默认值变更,建议随 G2 落地(sitter=2.0 补足主角);若认为默认应保守,保留 care_card 默认仅加选项,零额外成本。
3. **迁移取号**:0038 若被订阅 S2(billing 三行数值)先行占用,G2 顺延取下一可用号(纯施工排序,无设计影响)。

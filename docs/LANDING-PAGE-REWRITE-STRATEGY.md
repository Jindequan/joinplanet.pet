# PLANET Landing Page 重写战略与设计方案

> **状态：已被新版叙事方向取代。** 本文保留作为商业验证、定价与研究依据；首页创意与信息结构请以 [`LANDING-PAGE-NARRATIVE-DIRECTION.md`](./LANDING-PAGE-NARRATIVE-DIRECTION.md) 为准。PLANET 首页不是传统收费 Landing Page，也不以说服付款为首要目标。

> 日期：2026-08-13  
> 范围：产品定位、用户心理、营销转化、商业模式、页面结构、英文文案、视觉方向、数据验证  
> 结论性质：研究与设计方案，不包含本轮页面实现

---

## 0. 决策摘要

### 一句话战略

PLANET 不再先卖“宠物一生的全能操作系统”，而先占据一个具体、紧急、可交付的用户任务：

> **Turn scattered pet records into one clear vet-ready summary.**  
> 在就诊前几分钟，把散落的宠物资料整理成一份清楚、可核对、可打印、可分享的摘要。

家庭协作是第二层价值；长期时间线与数据所有权是留存和品牌价值；“专业宠物模型”和长期陪伴愿景只放在路线图，不参与首屏转化。

### 本轮最重要的五个决定

1. 首页唯一主目标改为 `Build my vet summary`，不再同时引导用户看故事、看套餐、试三个工具和购买永久会员。
2. 首屏直接展示真实可用的 Vet Summary 成品或交互预览，不能继续只展示概念界面。
3. 冻结新的 Lifetime Membership 首页预售；已购用户保留权益并单独沟通。
4. 用“免费预览 → 一次性 Vet Visit Pass → 验证后家庭订阅”的 Offer Ladder 验证付费。
5. Phase 0 北极星不是访问、邮箱或 PDF 生成，而是 **Verified Vet Handoff：摘要真实用于一次就诊或交接**。

### 为什么必须这样改

- Team Pet、DogLog 已经直接占据“家庭共享照护、任务、提醒”心智；多人协作是真需求，但不是空白。
- 11pets、Vet Record、VitusVet、GreatPetCare 和诊所 App 已覆盖大量记录、提醒、分享能力；“all-in-one”无法形成差异。
- 最大替代品不是另一个创业公司，而是 WhatsApp、相册、Notes、邮箱、Drive 和纸张。PLANET 必须在几分钟内产出明显更好的结果，用户才有迁移动机。
- 用户在健康事件中购买的是掌控感、称职感和交接安心，不是数据库。
- 当前页面同时使用 “lifetime” 与 “core features for at least 24 months”，会被理解为文字游戏，直接损伤信任。
- `docs/MARKET-VALIDATION-PLAN.md` 说 `/demo` 已上线，但当前 `app/` 没有 `/demo` 路由；策略、文档和真实交付需要先统一。

---

## 1. 研究方法与证据边界

本方案由四条研究线合并：

1. 用户心理与行为设计：焦虑、损失规避、照护者身份、信任形成、医疗场景伦理。
2. 增长营销与 CRO：价值主张、JTBD、CTA、页面漏斗、SEO、实验矩阵。
3. 商业战略：ICP、竞争替代、Offer、定价、留存、风险与验证门槛。
4. 产品与代码审计：线上页面、本地草稿、现有工具、支付、埋点、图片资产和文档一致性。

报告使用三种标签：

- **事实**：来自当前代码、线上页面、官方竞品页面、App Store、公开研究或公开讨论。
- **推断**：由事实推导出的产品或营销判断。
- **待验证**：必须通过真实用户行为、付款或就诊使用才能确认，不能写成页面事实。

关键边界：市场规模、痛点讨论和 caregiver burden 能证明问题存在，但不能证明用户一定会为 PLANET 付费。

---

## 2. 当前 Landing Page 诊断

### 2.1 线上版本问题

线上页面仍以创始人故事和 Lifetime Membership 为主：

- 首屏讲 “I just wanted to remember him”，先要求用户理解创始人，再理解自己的问题。
- 页面同时售卖记忆、AI、健康、家庭、交接、自然关系和永久会员，认知范围过宽。
- 用户需要经过很长的情绪叙事，才能看见具体结果。
- 产品尚未完整交付，但支付与限量稀缺被放在核心位置。
- `0/100` 或极低创始会员数可能形成反向社会证明。
- 部分图片带有评分、评论、信任人数或未来功能暗示；没有真实证据时不能作为线上证明。

### 2.2 本地草稿问题

本地 `app/page.tsx` 已经把痛点提前，是正确方向，但仍不够：

- Hero CTA 是 `See how PLANET works`，只是滚动，不是价值动作。
- 首屏视觉仍是概念产品图，不是可使用的真实摘要。
- Vet Summary、家庭协作、whole-life profile 仍在争夺同一层级。
- “in one tap” 忽略了资料输入成本，可信度不够。
- 页面没有真实 sample PDF、FAQ、隐私控制、导出/删除说明、Terms/Privacy 入口或使用证据。
- 仍直接销售 Lifetime，Offer 与最新产品共识冲突。
- 测试文件仍断言旧页面内容，页面重写时必须同步更新。

### 2.3 资产问题

现有视觉温暖、统一，但存在三类风险：

1. 概念图中的 UI 不是当前真实产品，容易制造“已经上线”的误解。
2. `cover1.png` 等图中带有 “50% off forever”、五星评论和安全/备份承诺；若无事实支撑必须移除或重新制作。
3. 多张图同时使用不同宠物、不同 Logo 和不同产品信息架构，削弱产品真实感。

建议保留真实创始人宠物照片作为人格信任资产；核心产品视觉全部改成同一只示例宠物、同一套真实 UI 和可点击成品。

---

## 3. 定位与产品叙事

### 3.1 推荐定位

**类别：** owner-controlled pet care handoff / vet visit preparation tool  
**不是：** 宠物社交、宠物诊断、诊所门户、通用家庭任务工具、宠物版 Notion  
**核心任务：** 把散落信息变成可供下一位照护者快速使用的结果  
**第一接收者：** 兽医  
**第二接收者：** 伴侣、家人、sitter、寄养方  

推荐定位句：

> **PLANET turns scattered pet records into one clear vet-ready summary—ready to review, print, or share.**

### 3.2 价值主张层级

#### 第一层：立即结果

> Before the appointment, turn medications, allergies, symptoms, and recent history into one clear page.

#### 第二层：交接安心

> Give each person the part they need without handing over your whole account.

#### 第三层：主人控制

> Keep a portable copy across clinics, devices, and life changes.

#### 第四层：长期愿景

> Over time, the summary becomes a living, source-linked care timeline.

### 3.3 不应再作为首页主张的内容

- “Professional pet intelligence/model”
- “AI understands their whole life”
- “Protect their health”
- “Keep them close after loss”
- “The operating system for every pet family”
- “The only app...”
- “Vet-approved” 或 “a page your vet understands”
- 未经实测的 “5 minutes” 和 “one tap”

在完成真实可用性测试前，首屏用 `in minutes`；当真实用户中位完成时间低于 5 分钟后，再升级为 `in five minutes`。

---

## 4. ICP 与用户任务

### 4.1 主 ICP

英语市场、30–50 岁、拥有 7 岁以上或慢性病/长期用药犬猫的家庭：

- 未来 30 天内要就诊、复诊、换诊所或转诊；
- 至少两个人参与照护；
- 资料散落在相册、聊天、邮箱、纸张和不同诊所；
- 已经发生过忘记日期、药名、剂量、症状变化或重复照护；
- 愿意为了降低遗漏和交接风险采取行动。

### 4.2 触发事件分层

| 层级 | 触发事件 | 商业角色 |
|---|---|---|
| S1 | 未来 7–30 天要就诊、转诊、换医院 | 最高首次转化，应主导首页 |
| S2 | 慢病、长期用药、多人轮班 | 最高留存与潜在 LTV |
| S3 | 旅行、寄养、临时 sitter | 高分享、低频，适合一次性 Pass |
| S4 | 普通健康宠物、简单提醒 | 免费替代强，只做内容/工具获客 |

### 4.3 Jobs to Be Done

**功能任务**

> 当我要带宠物去看兽医时，我想快速整理药物、过敏、症状和历史，以免在诊室临时翻手机或凭记忆回答。

**情绪任务**

> 我想确认没有漏掉可能影响照护的重要细节，并感觉自己已经做好准备。

**社会任务**

> 我希望兽医和家人把我视为一个信息可靠、准备充分的照护者。

**次级任务**

> 当我把宠物交给别人时，我想发一个清楚的文件或链接，对方不需要下载新 App 或注册账户。

### 4.4 排除人群

- 期待 AI 诊断、在线问诊或用药建议；
- 只想保存可爱照片或找宠物社交；
- 只需要简单疫苗提醒；
- 没有近期健康或交接触发的泛宠物主人。

兽医现阶段是接收者和验证者，不是购买者；不要首期开发 B2B 诊所工作台。

---

## 5. 用户心理与说服策略

### 5.1 用户真正购买什么

用户不是购买“数据管理”，而是在购买：

- **掌控感：** 信息终于在手里，不再依赖记忆或某家诊所。
- **称职感：** 我能替不会说话的宠物把情况讲清楚。
- **减负：** 不必每次重新拼凑和解释。
- **交接安心：** 下一位照护者拿到的是可执行的信息。

### 5.2 核心失败记忆

首屏应该激活用户已经发生过的具体经历：

> Your vet asks when it started. Your answer is somewhere in your camera roll.

这比抽象的 “Their whole world. One place.” 更能产生自我识别。品牌标语可以保留在 Logo、Footer 或最终愿景段，不承担首屏解释任务。

### 5.3 决策阻力与页面证据

| 阻力 | 必须提供的证据 |
|---|---|
| 这只是愿景吗？ | 首屏真实 Demo 或可打开的示例摘要 |
| 整理是不是很麻烦？ | 最少必填项、可跳过、三步流程、实测完成时间 |
| 兽医会不会看？ | 真实 PDF 排版与字段结构；不声称兽医认可 |
| 会不会乱给医疗建议？ | 只整理、不诊断；用户逐行确认；保留来源和日期 |
| 数据安全吗？ | 存储、保留、删除、导出、训练用途的清楚说明 |
| 对方会不会被迫注册？ | 展示真实接收方页面和无注册流程 |
| 新产品会不会消失？ | PDF/JSON 导出、停服导出承诺、备份和版本历史 |
| 为什么现在付款？ | 购买当前可交付结果，不是遥远路线图 |
| 为什么信任创始人？ | 真实身份、真实宠物、已完成/未完成清单、直接联系方式 |

### 5.4 伦理原则

- 不用宠物死亡、预期性悲伤或内疚逼迫付款。
- 不用虚假倒计时、虚假评分、虚假客户数或含糊限量。
- 不把记录行为描述成医疗处置；紧急信号必须优先提示联系兽医。
- 不默认公开健康或联系信息；分享应可撤销、过期、最小权限。
- 不把未来 UI 当作已交付产品。
- 不用 `lifetime` 包装实际只有 24 个月保证的服务。
- 营销同意、产品账户、摘要分享分别授权。

---

## 6. 页面信息架构

整页只服务一个主漏斗：

```text
高意图访问
→ 看见自己的失败场景
→ 看见真实摘要成品
→ 开始填写
→ 生成预览
→ 下载或分享
→ 购买 Pass
→ 真实用于就诊/交接
→ 返回更新 / 升级家庭计划
```

### 6.1 Navigation

保留：

- How it works
- Example summary
- Privacy
- Pricing
- 主按钮：Build a vet summary

`Free tools` 降级到 `Resources`，不要与主 CTA 抢注意力。

### 6.2 Hero：具体场景 + 单一结果

**Eyebrow**

> For senior pets, ongoing care, and the people who share it

**H1 推荐 A（清楚型）**

> Turn scattered pet records into one clear summary for the vet.

**H1 推荐 B（情境型）**

> Your vet asks when it started. Your answer is somewhere in your camera roll.

**Lead**

> Add the medications, symptoms, allergies, records, and notes you already have. PLANET turns them into one clear page you can review, print, or share.

**Primary CTA**

> Build my vet summary

**Secondary CTA**

> View an example PDF

**Microcopy**

> No diagnosis. No account required to preview. You control what gets shared.

只有当 Demo 确实纯本地运行时，才可以写 `Nothing stored in this demo.`

**Hero 视觉**

首屏右侧直接展示一份真实摘要，而不是完整 Dashboard：

- Why we’re here today
- Allergies
- Current medications
- Recent changes
- Relevant history
- Vaccines/preventatives
- Owner notes

用户可以点击 `View full sample`，看到 PDF/打印版与接收方版。

### 6.3 Problem Mirror：问题镜像

**标题**

> When they ask when it started, you shouldn’t have to guess.

**正文**

> The vaccine card is a photo. The blood test is in an email. Medication changes are buried in a chat. PLANET helps you put the important parts in order before the appointment starts.

**三张小场景卡**

- Medication list in Notes
- Lab result in email
- Symptom photos in camera roll

**收束**

> The information exists. It just isn’t ready when the appointment starts.

避免绝对化的 `Every vet visit starts from zero`。

### 6.4 How It Works：三步

**1. Add what matters**

> Start with why you’re going, current medications, allergies, and recent changes. Skip anything you don’t know.

**2. Review one clear page**

> PLANET organizes your information. You stay in control and can edit every line.

**3. Bring it your way**

> Print the PDF, email it ahead, or share a read-only link. The recipient doesn’t need an account.

### 6.5 Product Proof：结果证明

**标题**

> Built to be scanned, not studied.

**支撑点**

- Why you’re here today
- Allergies and current medications near the top
- Recent symptoms and changes
- Relevant history, vaccines, and preventatives
- Dates and source notes you can verify

此处可以提供：

- `Open sample summary`
- `Print preview`
- `See the recipient view`

不要写 `a page your vet understands`，除非得到真实兽医评审。

### 6.6 Outcome Expansion：从就诊扩展到交接

三张结果卡：

1. **Walk into the visit prepared**  
   用最少翻找，清楚说明本次主诉和近期变化。
2. **Give a sitter one clear handoff**  
   只分享饮食、用药、日常、警示和紧急联系人。
3. **Keep a copy across clinics**  
   搬家、转诊或换设备时依然能导出完整副本。

### 6.7 Data Control：数据与分享

**标题**

> Your pet’s history should travel with you.

**正文**

> Download a complete copy whenever you want. Shared links can be revoked. We explain what is stored, for how long, and how to delete it—in plain language.

只有功能真实实现后才能上线以下承诺：

- PDF / JSON export
- Revocable links
- Expiration date
- Version history
- Account deletion
- Data retention policy
- AI training opt-in/opt-out

### 6.8 Family Collaboration：第二价值层

**标题**

> One record, fewer “did anyone…?” messages.

**正文**

> Give your partner or sitter the part they need: today’s medications, routines, warning signs, and emergency contacts—without handing over your whole account.

这一段只解释复用与留存，不再把“谁遛狗”当核心差异。

### 6.9 Trust：透明状态 + 创始人故事

顺序：

1. `Available today`：真实可用的功能。
2. `In active testing`：正在测试的功能。
3. `Later`：路线图愿景。
4. 创始人真实照片、宠物、姓名和联系方式。
5. 真实用户或兽医反馈；没有就不放 testimonial。

创始人故事建议缩为：

> I started PLANET after realizing how much of my dog’s story lived in photos, messages, receipts, and memory. I’m building the tool I wanted before the next appointment—not a replacement for the vet, but a better way to arrive prepared.

### 6.10 Offer：单一、当前可交付

建议先测试，不直接锁死一个价格。

#### 免费

- 查看完整 sample
- 填写真实资料并生成预览
- 不要求信用卡

#### Vet Visit Pass

价格 A/B：`US$5` vs `US$9`

- 1 只宠物
- 1 份 PDF 下载
- 1 个只读分享链接
- 30 天内可更新
- 30 天内升级年费时全额抵扣
- 清楚退款规则

#### 验证后 Household

- `US$49/year` 或 `US$5.99/month`
- 2 只宠物
- 家庭成员不按席位收费
- 无限摘要、交接、时间线、提醒、分享与导出

#### 可选 Concierge

- `US$29–49/次`
- 人工把一包旧病历整理成结构化摘要
- 明确不是诊断或医疗意见

不建议首版做三个 SaaS 套餐、按人头计费或复杂多宠加价。

### 6.11 FAQ

至少回答：

1. Is PLANET a veterinary service?
2. Does PLANET diagnose my pet?
3. Will my vet need an account?
4. Can I print the summary?
5. Who owns the information?
6. Can I export or delete everything?
7. What is stored in the free preview?
8. What happens after the Pass ends?
9. Can a family member help update it?
10. What is available today?

### 6.12 Final CTA

**标题**

> Be ready to tell the whole story.

**CTA**

> Build my vet summary

不要在最后重新引入 Lifetime 稀缺或新的 CTA。

---

## 7. CTA 体系

所有 CTA 围绕同一条价值链：

| 阶段 | CTA |
|---|---|
| Landing 主动作 | Build my vet summary |
| 降低风险 | View an example PDF |
| 表单进行中 | Preview Milo’s summary |
| 价值完成 | Download the PDF |
| 分享 | Create a read-only link |
| Pass 付费 | Unlock download & sharing |
| 后续留存 | Keep Milo’s record up to date |

禁止同时出现：`See plans`、`See how`、`Join founding 100`、`Try a free tool`、`Read the story` 五条同权路径。

---

## 8. 视觉与交互方向

### 8.1 设计气质

- 温暖但不幼稚；
- 安静但不空泛；
- 医疗信息精确，生活内容有人情味；
- 像一份值得保存的家庭记录，而不是宠物社交媒体。

### 8.2 色彩

- 奶油白：`#FAF7F2`
- 暖黑：`#353833`
- 深绿：`#244A3C`
- Sage：`#78927F`
- 温和琥珀：健康提示，不使用恐吓红
- 红色仅用于真正的紧急/危险状态

### 8.3 字体

- 标题可保留克制的 serif，建立记录/编辑感；
- 正文使用 humanist sans；
- 正文最小 16px、行高至少 1.5；
- 医疗标签可使用轻量 mono/uppercase，但不能影响扫读。

### 8.4 核心视觉原则

1. 一份真实摘要胜过三张全功能概念图。
2. 同一只示例宠物贯穿首屏、表单、摘要、接收方视图。
3. 必须明确 `Sample data`，避免假装是真实客户。
4. 功能状态用 `Available / Testing / Planned` 标注。
5. 移除没有证据的五星、评分、客户数、安全和永久折扣标识。

### 8.5 移动端

- Hero 首屏先文案、CTA，再显示摘要关键片段；
- 关键 CTA 高度至少 48px；
- Summary 优先展示 Why now、Allergies、Medications；
- 表单分段而非长达 15 字段的一屏；
- 支持保存进度，但必须说明数据存储方式；
- Share recipient 首屏不弹注册，不先挡住内容。

### 8.6 可用性

- 不只靠颜色表达状态；
- 用户可跳过未知字段；
- 表单允许稍后补充；
- 提供 sample 以降低空白页焦虑；
- 摘要每一行可编辑；
- 严重症状场景优先提供当地兽医/急诊提示，不用产品流程拦截。

---

## 9. SEO 与内容策略

### 9.1 首页关键词

- pet vet visit summary
- organize pet medical records
- pet medical record organizer
- vet-ready pet records

**Title**

> Pet Vet Visit Summary & Medical Record Organizer | PLANET

**Description**

> Organize your pet’s medications, allergies, symptoms, and medical history into a clear vet-ready PDF. Download or share without requiring your vet to sign up.

### 9.2 高意图页面

- `/pet-vet-visit-summary`
- `/pet-medical-records`
- `/senior-dog-medication-tracker`
- `/pet-sitter-instructions`
- `/transfer-pet-records-to-new-vet`
- `/pet-medical-record-template`

每个页面解决一个真实触发任务；不要批量生产薄内容。

### 9.3 技术 SEO

- canonical
- Open Graph / Twitter metadata
- sitemap.xml / robots.txt
- SoftwareApplication / Product schema
- 真实 FAQPage schema
- 示例 PDF 的可索引 HTML 版本
- 图片明确 width/height，使用 WebP/AVIF
- 医疗内容标注作者、审阅日期、权威来源和免责声明

症状工具属于高风险健康内容，需要 AVMA、FDA、大学兽医学院等一手来源审阅，不能只靠营销文案。

---

## 10. 数据漏斗与埋点

### 10.1 北极星

> **Verified Vet Handoffs**：用户生成并下载/分享摘要，且后续确认真实用于一次就诊或交接。

### 10.2 漏斗

```text
Qualified landing session
→ example viewed
→ summary started
→ first meaningful field completed
→ preview generated
→ PDF unlocked
→ PDF downloaded / link shared
→ recipient opened
→ confirmed used at vet
→ returned to update
```

### 10.3 事件

- `lp_primary_cta`
- `summary_sample_view`
- `summary_start`
- `summary_first_field`
- `summary_preview`
- `summary_generate`
- `summary_download`
- `summary_share_create`
- `summary_share_open`
- `vet_pass_checkout`
- `vet_pass_paid`
- `caregiver_invite`
- `caregiver_first_action`
- `vet_use_confirmed`
- `refund_requested`

事件必须带：来源页面、campaign、实验版本、设备、宠物场景（就诊/慢病/交接）、是否首次用户。不要采集具体疾病或健康文本到分析系统。

---

## 11. 实验矩阵

按顺序测试，不能同时改定位、价格、流量和 CTA 后再归因。

| 优先级 | 假设 | A | B | 主指标 | 护栏 |
|---|---|---|---|---|---|
| P0 | 具体就诊任务更强 | All-in-one | Vet Summary | summary start | 跳出率 |
| P0 | 直接做比滚动更强 | See how | Build my summary | summary start | 表单完成率 |
| P0 | 真实产物提升信任 | 概念 UI | 真实摘要 | CTA / preview | LCP |
| P0 | 先体验后收费更强 | Lifetime | Preview + Pass | 付款且生成 | 退款率 |
| P1 | 高痛点人群更强 | Pet families | Senior/chronic | 激活率 | 总流量损失 |
| P1 | 结果文案更强 | One calm place | Ready for vet | 完成率 | 理解度 |
| P1 | 数据控制降低风险 | 无说明 | Export/delete | 付款率 | 隐私页退出 |
| P1 | 退款前置提升购买 | 隐藏 | CTA 附近 | checkout | 退款/拒付 |
| P2 | 创始人故事应后置 | Hero 后 | Trust 后 | 付款 | 页面深度 |
| P2 | 低销量进度伤信任 | 0–N/100 | 隐藏 | checkout click | 访谈反馈 |

### 建议判断阈值

在至少 500 个高意图 session 后判断：

- Hero → summary start ≥ 12%
- Start → preview ≥ 35%
- Preview → download/share ≥ 25%
- Preview → Pass ≥ 3%
- 分享链接打开率 ≥ 40%
- 付费用户提交真实资料 ≥ 60%
- 付费用户真实就诊使用率 ≥ 30%
- 第二位照护者邀请率 ≥ 30%

这些是实验阈值，不是市场事实，达到后仍需访谈解释原因。

---

## 12. 30 天验证路线图

### Day 1–3：只招高意图用户

招募 15 名未来 30 天确有以下事件的主人：

- 就诊或复诊
- 换诊所/转诊
- 新确诊或长期用药
- 旅行/寄养/临时 sitter

问过去行为：上次怎么准备、花了多久、漏过什么、谁参与、当前替代、实际付过什么钱。不要问“你会不会用”。

### Day 4–7：交付真实一页摘要

- 上线真实可填写、预览、打印的摘要；
- 接收方能无注册查看；
- Landing 只卖这个结果；
- 确认严重症状安全提示和免责声明；
- 补齐 Privacy、Terms、退款和数据保留说明。

### Day 8–14：Concierge + 真实付款

- 为 10 名真实用户人工整理；
- 至少 5 笔真实付款；
- 测试 US$5 vs US$9；
- 记录整理耗时、用户修改次数、兽医真正查看的字段；
- 不发送未经用户确认的健康资料。

### Day 15–21：只测价值主张

- A：Prepare for the vet in minutes
- B：Keep family care in sync

价格、渠道和产品保持不变。流量优先来自高意图搜索、老年/慢病照护内容和明确问题讨论，不用泛宠物可爱内容判断产品。

### Day 22–30：验证真实使用和年费意愿

- 摘要有没有真实带进诊室；
- 接收方是否打开、打印或回复；
- 用户回来修改过什么；
- 是否愿意升级 US$49/year；
- 价格阻力、信任阻力还是产品阻力。

### Go 条件（全部满足）

- ≥10 笔真实付款；
- 摘要完成人群中 ≥10% 买 Pass；
- ≥5 份真实用于就诊或交接；
- 分享链接打开率 ≥40%；
- ≥3 个家庭激活第二位照护者；
- 10 名付费用户中 ≥4 名愿升级 US$49/year，或给出可行动的价格阻力。

### Pivot 规则

- Pass 有付费、年费无意愿 → 一次性工具 / Concierge。
- PDF 使用高、分享低 → 单人 Vet Visit Prep。
- 分享高、兽医使用低 → Sitter / Emergency Handoff。
- 两者都低 → 停止开发 All-in-one。

---

## 13. 实施优先级

### P0：Landing 重写前必须完成

1. 明确停止或保留 Lifetime 的商业决定；清理互相矛盾的权益文案。
2. 做出真正可用的 Vet Summary 路径，而不是只保留遗留 CSS 和文档描述。
3. 确定 Demo 的真实数据处理方式。
4. 生成一份统一、可打印、可分享的 sample。
5. 补齐 Privacy、Terms、退款、导出/删除和免责声明。
6. 重新制作不含虚假证明和未交付功能的核心视觉。

### P1：页面实现

1. 重构 `app/page.tsx` 为单一 Vet Summary funnel。
2. 实现 Hero 内的真实 sample/preview。
3. 建立 Summary start/preview/download/share 埋点。
4. 更新 metadata、OG、schema、sitemap、robots。
5. 更新渲染测试，删除旧页面断言。
6. 做 375px、768px、1440px 三档视觉和可用性验证。

### P2：验证后

1. Household subscription。
2. 家庭第二人激活路径。
3. 来源可追溯时间线、版本历史和完整导出。
4. Sitter / Emergency 模板。
5. 迁移工具与长期数据信任品牌。

---

## 14. 公开依据

- [PLANET 当前线上页面](https://www.joinplanet.pet/)
- [Team Pet：家庭协作、健康记录与提醒](https://teampetapp.com/)
- [DogLog：多人共同记录和提醒](https://doglogapp.com/)
- [Vet Record：宠物病历与分享](https://vetrecord.app/)
- [11pets：病历、照护、导出](https://www.11pets.com/en/news/export-data)
- [11pets App Store](https://apps.apple.com/us/app/11pets-pet-care/id1232470530)
- [PetDesk App Store](https://apps.apple.com/us/app/petdesk/id631377773)
- [VitusVet App Store](https://apps.apple.com/us/app/vitusvet-pet-medical-records/id955252538)
- [宠物主人与兽医的信息交换研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC7850489/)
- [慢性/重病宠物照护者负担研究](https://pubmed.ncbi.nlm.nih.gov/28870976/)
- [AAHA：Pet sitter 交接信息指南](https://www.aaha.org/resources/preparing-for-the-unexpected-essential-pet-sitter-instructions/)
- [Zoetis：就诊准备信息清单](https://www.zoetispetcare.com/resources/vet-checklist)
- [宠物主人获取病历的公开讨论](https://www.reddit.com/r/Pets/comments/okcb74/being_refused_of_our_pets_medical_records/)
- [Lemon Squeezy 退款与拒付规则](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks)
- [EU 数字服务消费者规则](https://europa.eu/youreurope/business/dealing-with-customers/consumer-contracts-guarantees/consumer-guarantees/index_en.htm)

---

## 最终判断

PLANET 现在最需要的不是更多愿景，而是一个被用户真实使用的楔子。

这个楔子不是“保存宠物的一生”，也不是“全家一起养宠”，而是：

> **在用户最怕忘、最需要交接的时候，把混乱变成一份可带走、可核对、可分享的清晰记录。**

当这个结果被真实用于诊室、被接收方打开、被家庭再次更新时，长期时间线、协作和订阅才有商业基础。Landing Page 应把这个真实价值发生的顺序原样呈现出来。

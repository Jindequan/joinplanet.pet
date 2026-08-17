# PLANET 最终产品与商业架构（Product + AI + Cost System）

> 来源：外部架构方案（2026-08-17 原文照存，未删改）。
> 采纳地位：产品形态、AI 架构、Credits/成本系统、套餐与商业原则的**唯一权威（canonical）**。
> 已对本仓库既有文档做的对齐：ROADMAP 阶段重映射（V1 Personal / V1.5 Together / V2 Intelligence）、APP-DESIGN §1.5 配额改字节制与免费双宠、每日摘要邮件改为"只在有用时通知"、PRD 增补 Pro/Family 定价。冲突裁决记录见 ROADMAP 头部注记。

---

可以。前一版解决的是“做什么”；这次要把它升级成一套真正可运营的 **产品 + 服务 + AI + 成本系统**。

其中有两个关键变化：

第一，**Credits 不能简单等于 Token**。Token 是供应商成本单位，用户不应该理解，也无法保证不同模型之间公平。PLANET 应该维护自己的“AI 成本预算层”。

第二，PLANET 不能成为“宠物信息 CRUD”。真正的产品核心应该从：

> 用户录入数据 → 系统保存数据

升级成：

> **PLANET 持续观察、整理、连接、提醒、准备，把散落的数据变成照护服务。**

下面我把完整方案定下来。

---

# PLANET 最终产品与商业架构

## 一、先重新定义 PLANET：不是数据管理，而是持续照护系统

整个产品应该围绕一个循环工作：

**Observe → Record → Understand → Act → Follow up → Remember**

即：

```text
宠物发生事情
    ↓
记录 / 上传
    ↓
PLANET 理解并结构化
    ↓
连接已有历史
    ↓
告诉用户现在值得关注什么
    ↓
转成照护 / 提醒 / 就诊准备
    ↓
产生新的结果
    ↓
永久进入宠物历史
```

所以最终模块不是一堆孤立功能，而是下面这个系统：

```text
                         PLANET

                    Pet Knowledge
                         │
        ┌────────────────┼────────────────┐
        │                │                │
      Today           Timeline           Pet
   今天怎么办       发生过什么        它现在是什么状态
        │                │                │
        └──────────────┬─┴────────────────┘
                       │
                Intelligence Layer
                       │
          ┌────────────┼────────────┐
          │            │            │
       Organize      Connect      Prepare
       整理数据       建立联系      准备下一步
          │            │            │
          └────────────┼────────────┘
                       │
              Reminder / Vet / Share
```

这才是最终产品形态。

---

# 二、Event：统一数据模型，但绝对不能统一表单和 Card

你的判断是对的。

底层应该统一：

```text
PetEvent
├─ type
├─ occurred_at
├─ recorded_by
├─ note
├─ attachments
├─ source
└─ typed_payload
```

而用户层面必须是不同体验。

现有设计已经采用统一 `timeline_events + data JSONB` 的方向，这个底层可以继续。

最终建议先定义 7 类 Event：

| Event             | 录入方式        | Timeline 表现      | 后续联动                 |
| ----------------- | ----------- | ---------------- | -------------------- |
| Note              | 自由文本/照片     | 极简 Story         | AI 可结构化              |
| Symptom           | 症状、次数、程度、时间 | Health Card      | 关联症状历史/Vet           |
| Measurement       | 体重、体温等      | Metric Card      | 趋势                   |
| Vet Visit         | 原因、医院、诊断、处理 | Large Visit Card | Medication/Follow-up |
| Medication Change | 开始、调整、停止    | Medication Card  | Today Routine        |
| Vaccine           | 疫苗、日期、下次日期  | Vaccine Card     | Reminder             |
| Document          | 病历、检查单、PDF  | Document Card    | OCR/Vet              |

但是用户不需要先理解这 7 个类型。

Timeline 最上面仍然只有：

```text
┌────────────────────────────────┐
│ Record something about Milo…   │
│                            📷  │
└────────────────────────────────┘
```

这是 **Quick Capture**。

下面再提供：

```text
Symptom   Weight   Vet Visit   More
```

给明确知道自己要记录什么的人。

所以产品同时拥有：

> **自然录入路径 + 专业结构化路径**

而不是二选一。

---

# 三、真正现代的录入体验：Composer，而不是 Form

以后不要把页面设计成：

```text
Event Type: [ ]
Date: [ ]
Title: [ ]
Description: [ ]
Severity: [ ]
Attachment: [ ]
Save
```

这是数据库管理后台。

PLANET 应该从用户正在做的事情出发。

例如用户输入：

> Milo 昨晚吐了两次，今天早上不太吃东西

Phase 1 没 AI：

```text
Saved

Milo 昨晚吐了两次，
今天早上不太吃东西

[ Add details ]
```

用户点击 Add details 才展开结构化字段。

AI 上线后：

```text
Saved

Health
Vomiting ×2
Last night

Appetite
Reduced
This morning

Original note
“Milo 昨晚吐了两次……”
```

下面：

```text
Looks right ✓
Edit
```

这就是同一个 UI 随能力升级。

**不用重新设计产品。**

---

# 四、各种功能必须通过“结果”互相联动

这是整个系统最关键的部分。

不要出现：

> Medication 是 Medication
> Task 是 Task
> Timeline 是 Timeline
> Vet 又是 Vet

它们应该互相产生下一步。

### Medication → Today

用户新增：

```text
Apoquel
16mg
daily
08:00
```

保存以后不要结束。

PLANET 接着问：

```text
Apoquel added.

Take once daily · 08:00

Add this to Milo's daily care?

[ Add to Today ]
```

确认后：

```text
Medication
    ↓
Care Routine
    ↓
Today
    ↓
Completion History
```

同时 Medication 开始本身进入 Timeline：

```text
Aug 17
Started Apoquel · 16mg daily
```

但每天吃药的 completion 不污染 Timeline。

---

# 五、Symptom → History → Vet，是另一条闭环

用户记录：

```text
Vomiting ×2
```

PLANET 不应该只显示：

> Saved.

而应该在 Event Detail 下自然出现：

```text
Related history

Vomiting
Aug 17 · ×2
Aug 09 · ×1
Jul 28 · ×2

3 records in the past 30 days

[ View history ]
```

这里“3 次记录”完全可以由确定性数据库完成，不需要 AI。

以后 AI 再增加：

```text
✦ PLANET noticed

Vomiting has been recorded 3 times
during the past 30 days.

Medication was changed on Aug 7.

Based on 4 records

[ Review records ]
```

注意它没有说：

> Milo 得了什么病。

而是在帮助用户**看到自己容易遗漏的关联**。

然后提供：

```text
[ Prepare for vet ]
```

于是：

```text
Symptom
   ↓
Related History
   ↓
Vet Preparation
   ↓
Summary
```

服务自然连起来了。

---

# 六、Vet Visit 之后也不能结束

这是非常典型的服务机会。

用户就诊回来上传：

```text
vet_report.pdf
```

AI OCR 得出：

```text
Visit
Aug 20

Diagnosis
Gastritis

Medication
Apoquel changed 16mg → 8mg

Follow-up
Aug 27
```

这时候 PLANET 不应该只是生成一张漂亮 Card。

而应该接着处理：

```text
PLANET found 2 things to update

1. Apoquel
   16mg → 8mg

   [ Update medication ]

2. Follow-up
   Aug 27

   [ Add reminder ]
```

用户点两下。

系统自动完成：

```text
Vet Document
     ↓
Visit Event
     ↓
Medication Update
     ↓
Today Routine Update
     ↓
Follow-up Reminder
```

这才叫：

> **服务。**

用户真正付钱购买的不是“OCR”。

而是：

> **我上传完病历，剩下的 PLANET 帮我处理好了。**

---

# 七、因此最终 AI 不是一堆 AI 功能，而是一个 Intelligence Layer

不要出现：

```text
AI OCR
AI Search
AI Summary
AI Analyze
AI Chat
AI Insights
```

六个互相独立的产品入口。

内部可以有这些 Capability，但用户只感受到：

# PLANET understands Milo.

内部架构：

```text
                    AI Orchestrator

          ┌──────────────┬──────────────┐
          │              │              │
     Interpreter     Retriever       Extractor
     理解用户记录      找历史上下文      读文档
          │              │              │
          └──────────────┼──────────────┘
                         │
                    Context Builder
                         │
          ┌──────────────┼───────────────┐
          │              │               │
      Correlator       Composer       Planner
      找关联关系        生成解释         下一步
```

用户永远只有一个 PLANET。

不是七个 AI Agent。

---

# 八、建立一个真正的 Pet Knowledge Layer

这是以后 AI 好不好用的根。

LLM 不应该每次收到：

> 这里是 Milo 全部 3 年的数据，你自己看。

这样贵、慢，而且效果越来越差。

应该维护一个实时的 **Pet State Projection**：

```text
Milo Current State

Identity
├─ Golden Retriever
├─ 7y
└─ 5.9kg

Health
├─ Allergies
├─ Active conditions
└─ Recent symptoms

Medication
├─ Apoquel 16mg
└─ since Jul 12

Care
├─ Breakfast 08:00
├─ Walk 18:00
└─ medication adherence

Recent
├─ 3 significant events
├─ last vet visit
└─ recent weight change
```

这是程序根据结构化数据维护的。

AI 请求的时候再：

```text
Pet State
+
当前 Event
+
检索到的相关 Events
+
必要 Documents
```

组合成 Context。

这样同时解决：

* AI 成本；
* 响应速度；
* 准确性；
* 长期上下文；
* 数据越来越多的问题。

---

# 九、AI 永远不能悄悄修改健康事实

这是产品信任边界。

AI 可以说：

```text
I found a possible medication change:

Apoquel
16mg → 8mg

Source
Greenwoods Vet · Aug 20

[ Confirm update ]
```

不能自己直接改。

尤其：

* Diagnosis
* Medication
* Allergy
* Vaccination
* Emergency data

全部要求：

> **User Confirmation 或明确可信结构化来源。**

AI 自己生成的内容必须保留：

```text
source_event_ids
source_document_ids
model
generated_at
confidence
```

UI 才能展示：

```text
Based on 4 records
```

这会成为 PLANET 非常重要的可信度差异。

---

# 十、AI 的“价值感”来自四种体验，而不是聊天

我会把它定义成四个用户能感受到的品牌能力。

### PLANET remembers

用户不用重复过去的信息。

例如进入 Vet：

> “最近发生了什么？”

PLANET 已经准备好了。

### PLANET organizes

用户扔进去：

* 一句话；
* 一张照片；
* 一个 PDF；

系统替他整理。

### PLANET connects

告诉用户：

```text
This medication started 2 days
before the first recorded vomiting event.
```

注意只是时间关系，不做医学因果判断。

### PLANET prepares

系统把过去的信息变成接下来能直接使用的东西：

* Today routine；
* Reminder；
* Vet Summary；
* Care Card；
* Follow-up。

这四件事比一个：

> Ask PLANET anything

有价值很多。

---

# 十一、Today 也不能只是 Todo List

最终 Today 应该是一个 **Care Board**。

顶部：

```text
Good morning, Milo.

3 of 5 cared for
```

下面：

```text
UP NEXT

08:00
Apoquel
16mg

[ Done ]
```

然后：

```text
TODAY

✓ Breakfast       Amy · 08:13
✓ Morning walk    Devin · 09:21

○ Apoquel         12:00
○ Dinner          18:00
```

如果今天有真正值得用户知道的信息：

```text
For Milo

Weight recorded yesterday
5.9kg

[ View trend ]
```

未来 Pro：

```text
✦ PLANET Insight

Milo's weight has moved down
across the last 3 measurements.

Based on 3 records
```

**没有重要信息就不展示 AI Card。**

不要为了证明“我们有 AI”天天给用户输出废话。

---

# 十二、Timeline 不是 List，是 Story + Data

Timeline 应该支持三种视觉层次。

普通事件：

```text
09:12
Weight · 5.9kg
```

重要事件：

```text
╭────────────────────────────╮
│ HEALTH                     │
│                            │
│ Vomiting                   │
│ Twice · Moderate           │
│                            │
│ [photo]                    │
│                            │
│ Devin · 20:31              │
╰────────────────────────────╯
```

大型事件：

```text
╭────────────────────────────╮
│ VET VISIT                  │
│                            │
│ Greenwoods Veterinary      │
│                            │
│ Gastritis                  │
│                            │
│ Medication changed         │
│ Follow-up · Aug 27         │
╰────────────────────────────╯
```

而且 Card 本身就可以成为上下文入口。

例如 Vet Card 下面：

```text
2 updates waiting

[ Review ]
```

这比传统列表高级得多。

---

# 十三、现在解决最现实的问题：AI Credits 到底怎么设计

这里不要做：

> 1 Credit = 1000 Token。

**绝对不要。**

不同模型的 Token 价格差距巨大，而且输入、输出价格也不同。比如当前 GPT-5 mini 官方价格是输入 $0.25/百万 token、输出 $2/百万；GPT-5.4 mini 则是 $0.75 / $4.50。Gemini 2.5 Flash-Lite 当前是 $0.10 / $0.40，而 2.5 Flash 是 $0.30 / $2.50。([OpenAI Developers][1])

PLANET 内部应该建立两层：

```text
用户
PLANET Credits
      ↓
内部
Cost Budget USD
      ↓
模型
Tokens / Images / Documents
```

我建议定义：

> **1 PLANET Credit = 最多 $0.003 的 AI 供应商成本预算。**

注意：

这不是告诉用户的兑换价格。

这是内部成本控制单位。

---

# 十四、为什么 $0.003 合理

假设 Smart Record 使用 Gemini 2.5 Flash-Lite：

```text
2000 input
500 output
```

当前官方价格下，大约只需要 **$0.0004**。([Google AI for Developers][2])

较重一点的 OCR / extraction：

```text
6000 input equivalent
1000 output
```

大约 **$0.001**。

如果一个需要更高质量的任务使用 GPT-5 mini：

```text
8000 input
1000 output
```

约 **$0.004**；20k 输入 + 2k 输出约 **$0.009**。([OpenAI Developers][1])

所以模型路由可以设计成：

| 操作                      | Credits | 推荐执行                     |
| ----------------------- | ------: | ------------------------ |
| Smart Record            |       1 | Flash-Lite               |
| AI Search               |       1 | Flash-Lite / mini        |
| OCR / page              |       1 | Flash-Lite               |
| Trend Explanation       |       2 | Flash / mini             |
| Vet Preparation         |       3 | mini                     |
| Deep Timeline Synthesis |       5 | mini / stronger fallback |

这里不是说每次都花满对应成本。

而是为每类能力划定**最大预算**。

---

# 十五、真正保证不亏：AI Gateway 必须先“预授权成本”

每一次 AI Request：

```text
User action
    ↓
estimate context
    ↓
calculate maximum cost
    ↓
reserve credits
    ↓
Model Router
    ↓
call
    ↓
actual usage
    ↓
Usage Ledger
```

例如：

```text
Vet Preparation
3 credits
= $0.009 internal ceiling
```

Router 发现：

> 当前上下文如果调用模型可能花 $0.014。

它不能硬调。

而应该：

```text
reduce retrieved context
↓
use pet projection
↓
select relevant events
↓
compress context
↓
route cheaper model
```

确保：

```text
Estimated Cost <= Credit Budget
```

这才是真正的“不会失控”。

---

# 十六、必须建立 Usage Ledger

不要只存：

```text
credits_remaining = 183
```

必须有不可变消费流水：

```text
ai_usage

user_id
household_id

feature
provider
model

input_tokens
output_tokens
cached_tokens

estimated_cost_usd
actual_cost_usd

credits_reserved
credits_charged

request_id
created_at
```

这样以后你才能回答：

> 一个 Pro 用户平均到底让我花多少钱？

甚至可以精确看到：

```text
OCR           $63/month
Smart Record  $21
Vet Summary   $18
AI Search     $14
```

之后套餐才能基于真实 Cost Curve 调整。

---

# 十七、Model Router 怎么做

不要把产品绑定死：

```text
PLANET = GPT-5 mini
```

而是按能力定义 Quality Class。

```text
FAST_STRUCTURED

BALANCED_REASONING

HIGH_VALUE_SYNTHESIS
```

例如：

```text
Smart Record
→ FAST_STRUCTURED
→ Gemini Flash-Lite

OCR
→ FAST_STRUCTURED
→ Gemini Flash-Lite

AI Search answer
→ BALANCED
→ GPT-5 mini / Gemini Flash

Vet Summary
→ BALANCED

复杂多月综合
→ HIGH_VALUE
```

模型可以换。

功能不会变。

---

# 十八、但“成本优化”绝不能等于“用户都用最差模型”

正确逻辑应该是：

```text
简单任务
cheap model
       ↓
schema validation
       ↓
confidence good?
   yes       no
    ↓         ↓
 finish    escalate
             ↓
        stronger model
```

这叫：

> **Quality Escalation**

而不是：

> Cheap First at All Costs。

用户得到的仍然是高质量服务。

只是系统不拿 $0.02 的模型去做一个：

> 把“5.9kg”转 JSON

的工作。

---

# 十九、免费用户到底会让你花多少钱

这必须算上限，而不是看平均。

我建议最终 Free：

```text
2 active pets
2 family members

500MB media

10 AI credits/month
```

R2 Standard 当前存储是 **$0.015 / GB-month**，互联网出站流量免费，而且 Cloudflare 还提供每月 10GB Storage、100 万 Class A、1000 万 Class B 的免费池。([Cloudflare Docs][3])

所以一个真正把 500MB 全部占满的 Free 用户：

```text
Storage
≈ $0.0075/month
```

AI：

```text
10 × $0.003
= maximum $0.03
```

再给：

```text
database / requests / mail reserve
≈ $0.01–0.02
```

所以应该把：

> **Free variable-cost envelope 定在约 $0.05–0.06 / active account / month。**

这是你的内部经营指标，不是用户看到的东西。

---

# 二十、“保证所有白嫖用户都不让我亏”数学上不可能

这一点必须讲清楚。

如果：

```text
1,000,000 free users
0 paid users
```

只要你给任何：

* Storage；
* AI；
* Email；
* Compute；

就必然有成本。

所以真正可保证的不是：

> 免费用户本身赚钱。

而是：

# **单个免费用户的最大亏损被严格封顶。**

然后：

```text
Paid Contribution Margin
        ↓
Free Tier Subsidy Pool
```

整体业务保持盈利。

---

# 二十一、建立 Free Subsidy Pool

建议财务模型：

```text
Paid Net Revenue
      ↓
Operating Cost
      ↓
AI / Storage
      ↓
Free Tier Subsidy
      ↓
Profit / Reserve
```

可以设置内部规则：

> 每月最多把付费用户 Contribution Margin 的 **10–15%** 用来补贴 Free 用户。

如果有 100,000 个 Free 用户，每人真的都吃满 $0.06：

```text
$6,000/month
```

但这属于极端上界。

真实用户绝大多数：

* 不会用满 500MB；
* 不会用满 AI；
* 不会每天活跃。

真正重要的是你从第一天记录真实 COGS。

---

# 二十二、免费 AI 还要防白嫖机器人

对用户友好不意味着没有 Abuse Control。

Free AI Credits 应该在：

```text
Email verified
+
Pet created
```

之后解锁。

甚至可以设计成：

```text
5 credits immediately
+
5 credits after meaningful usage
```

例如产生 3 条真实 Pet Records 后发放。

不要允许：

```text
匿名访问
→ 无限注册
→ AI API Proxy
```

同时：

* Rate limit；
* Account/device abuse detection；
* API 不暴露 provider key；
* 每日 AI burst cap。

正常用户几乎感受不到。

机器人无法薅 API。

---

# 二十三、不要用供应商“免费 AI API”处理用户健康数据来省钱

例如 Google Gemini 当前 Free Tier 明确与 Paid Tier 存在数据处理差异：免费层内容可用于改进 Google 产品，而付费层不用于此用途。([Google AI for Developers][2])

PLANET 涉及：

* 宠物医疗记录；
* 用户联系方式；
* 家庭关系；
* 医疗 PDF；

所以生产环境应该以**付费 API 的数据处理政策**作为基线。

不要为了省几美元 API 费伤害产品的隐私信任。

---

# 二十四、Media 成本模型

媒体不要按：

> 20 photos/month

限制。

统一按：

```text
Stored Bytes
```

Free：

**500 MB**

Pro：

**10 GB**

Family：

**50 GB**

因为 R2 当前 Standard Storage 是 $0.015/GB-month，所以即使全部用满，理论存储成本大约分别是：

```text
Free
$0.0075

Pro
$0.15

Family
$0.75
```

互联网 egress 本身由 R2 免费提供。([Cloudflare Docs][3])

这比 AI 成本小得多。

因此不要为了几毛钱存储把用户逼得很难受。

---

# 二十五、图片处理策略也能同时提升 UX 和降成本

用户上传照片：

```text
Original
    ↓
Client optimization
    ↓
Stored master
    ↓
Thumbnail / display variants
```

建议：

```text
最大长边 2560px
高质量 JPEG/WebP/HEIC
```

不要把手机 48MP、15MB 原图直接长期存。

医疗图片要保持足够细节，所以不要压得过头。

UI 配额只统计：

> 用户优化后 Master 文件大小。

Thumbnail 不向用户计配额。

这样公平。

---

# 二十六、第一版不做 Video

Image + PDF。

视频非常容易同时引入：

```text
Storage
Bandwidth
Transcoding
Streaming
Preview
Upload recovery
```

而照片和 PDF 已覆盖绝大部分当前需求。

以后如果大量用户真的要记录：

> seizure / gait / coughing video

再设计专门的 Medical Clip，而不是直接放开视频网盘。

---

# 二十七、Email 也需要成本意识

Resend 当前 Free 是 3,000 emails/月；付费起步 $20/50,000 封，额外约 $0.90/1000。([Resend][4])

所以我会修改原来“每天给所有用户发 Daily Digest”的设计。

第一版单用户根本不需要 Daily Digest。

未来 Family 以后优先：

```text
Push / in-app
```

Email 作为 fallback / 用户订阅偏好。

不要每天发送：

> Milo today…

如果什么都没发生。

更好的 UX 和更好的成本结构是一致的：

> **Only notify when useful.**

---

# 二十八、最终套餐，我建议重新定成这版

以下是**经营模型用的 USD-equivalent 目标价**，实际 App Store / SGD SKU 后面按区域设定，不是汇率承诺。

|                    |      Free |        Pro |         Family |
| ------------------ | --------: | ---------: | -------------: |
| 月价                 |        $0 |  **$4.99** |      **$8.99** |
| 年价                 |         — | **$39.99** |     **$79.99** |
| Active Pets        |         2 |          5 |             10 |
| Members            |         2 |          6 |             10 |
| Text / Events      | Unlimited |  Unlimited |      Unlimited |
| Tasks              | Unlimited |  Unlimited |      Unlimited |
| Reminders          | Unlimited |  Unlimited |      Unlimited |
| Basic Vet Summary  | Unlimited |  Unlimited |      Unlimited |
| Share              | Unlimited |  Unlimited |      Unlimited |
| Export             | Unlimited |  Unlimited |      Unlimited |
| Media              |    500 MB |      10 GB |          50 GB |
| AI Credits / month |    **10** |    **250** | **700 shared** |
| Credit rollover    |        No |    1 month |        1 month |
| AI Intelligence    |     Trial |       Full |           Full |
| Archived Pets      | Unlimited |  Unlimited |      Unlimited |

为什么我把 Pro 从之前的 $3.99 拉到 $4.99：

Lemon Squeezy 当前基础费率为 5% + $0.50/笔，订阅另加 0.5%，国际交易还可能增加 1.5%；低价订阅会被固定 $0.50 明显侵蚀。([Lemon Squeezy Docs][5])

Apple Small Business Program 当前符合条件的开发者则是 15% IAP commission。([Apple Developer][6])

所以经营模型不要假设：

> 我卖 $4.99 就收到 $4.99。

统一用一个保守值：

> **只按售价的 75% 作为可支配净收入做预算。**

这样 Web / App Store / 国际支付都有缓冲。

---

# 二十九、套餐到底亏不亏，可以直接算

### Pro

```text
Price                       $4.99
planning net × 75%          $3.74

MAX AI:
250 × $0.003                $0.75

MAX R2 storage:
10GB × $0.015               $0.15

DB/API/email/support reserve ~$0.30
----------------------------------
remaining                   ~$2.54
```

即使 AI 和存储全部吃满，仍然有明显余量。

### Family

```text
Price                       $8.99
planning net × 75%          $6.74

MAX AI:
700 × $0.003                $2.10

MAX storage:
50GB                        $0.75

infra/mail/support reserve  ~$0.50
----------------------------------
remaining                   ~$3.39
```

因此这个套餐不是靠：

> “希望用户别用满”

才能赚钱。

**即使使用量接近额度上限，模型仍然成立。**

这才是正确的限额设计。

---

# 三十、Rollover 怎么防止产生隐性负债

Pro：

```text
250/month
max wallet = 500
```

Family：

```text
700/month
max wallet = 1400
```

为什么允许滚一个月？

因为用户宠物这个月健康，几乎没用 AI，下个月看医生时可能突然需要：

* OCR；
* Summary；
* Search。

直接过期会让人觉得订阅费浪费。

但系统内部需要把未使用 Credit 对应的成本预算保留成：

```text
AI liability reserve
```

下一月用掉以后再释放。

这样财务上也不会假装全部已经“赚到了”。

---

# 三十一、Archived Pet 永远不占数量

这条继续坚持。

如果 Milo 去世：

```text
Milo
2012–2026

Archived / Memorial
```

用户后来收养 Coco。

**绝不能让用户删除 Milo 才能添加 Coco。**

只有：

```text
Active Pets
```

计配额。

Archived：

* 永久可查看；
* 永久可导出；
* 永久不占 Pet Slot；
* 已有媒体仍保留。

这是非常重要的品牌价值。

---

# 三十二、降级同样不能扣押数据

例如：

```text
Pro
5 active pets

↓ cancel

Free
2 active pets
```

用户选择两只继续 Active。

剩下三只：

```text
Archived / read-only
```

仍可：

* 查看；
* 分享现有记录；
* 导出；
* 下载媒体。

不能新增。

**已有数据永远不是人质。**

---

# 三十三、产品的最终数据架构也需要升级

最终不建议只有：

```text
pets
events
tasks
```

而应该形成：

```text
Canonical Data
├── pets
├── events
├── medications
├── care_tasks
├── task_logs
├── documents
└── attachments

Projection Layer
├── pet_current_state
├── health_summary
├── care_status
└── trend_metrics

Intelligence
├── ai_artifacts
├── ai_suggestions
├── event_links
├── embeddings
└── ai_jobs

Commerce
├── entitlements
├── usage_ledger
├── credit_wallets
├── credit_transactions
├── storage_usage
└── plan_limits
```

三个层次非常重要：

> **事实 / 派生状态 / AI 解释不能混在一起。**

---

# 三十四、AI Artifact 不要覆盖原数据

例如 AI 生成：

```text
Milo's weight has declined
across the last three measurements.
```

存：

```text
ai_artifact

kind = trend_insight

source_ids = [
 weight_event_1,
 weight_event_2,
 weight_event_3
]

generated_text = ...
model = ...
generated_at = ...
```

当其中一个 Weight 被用户改掉：

```text
invalidate artifact
↓
regenerate
```

而不是让旧 AI 结论永远挂在那里。

---

# 三十五、Event Link 是以后 PLANET 越来越聪明的重要结构

例如：

```text
Vomiting Event
       │
       ├─ related_to → Apoquel Change
       │
       └─ followed_by → Vet Visit
```

注意：

`related_to` 不等于医学因果。

只是：

> 时间、用户或 AI 发现值得一起查看。

以后用户打开一次 Vet Visit，就可以看到：

```text
Before this visit

Aug 17
Vomiting ×2

Aug 16
Reduced appetite

Aug 07
Medication changed
```

用户不需要自己翻 Timeline。

这就是数据“联动”后的价值。

---

# 三十六、最终不要设计 AI Chat 首页

我仍然强烈反对：

```text
Ask PLANET
________________
```

占一个主要页面。

Chat 可以存在。

但应该藏在：

```text
Search Timeline
```

或者：

```text
Ask about Milo's history
```

这种具体上下文。

例如用户问：

> Milo 上一次使用 Prednisone 是什么时候？

PLANET：

```text
Jun 3, 2026

Prednisone was marked as stopped
after the Greenwoods Vet visit.

[ View record ]
```

这比：

> “你好，我是 PLANET AI，我能为你做什么？”

强太多。

---

# 三十七、最终用户体验应该是这样的

早上：

```text
PLANET

Good morning, Milo.

Up next
Apoquel · 08:00

[ Done ]
```

用户点 Done。

结束。

---

晚上 Milo 吐了。

用户输入：

```text
昨晚吐了两次
```

PLANET 自动整理：

```text
Vomiting ×2
Last night
```

再告诉他：

```text
Milo has 2 other vomiting records
in the past 30 days.

[ View history ]
```

没有吓他，也没有诊断。

---

第二天看医生。

打开：

```text
Prepare for vet
```

PLANET 已经把：

```text
Why we're here
Recent symptoms
Medication
Weight
Previous visits
```

准备好。

用户不是“生成报告”。

而是：

> **PLANET 已经准备好了，我确认一下。**

这两个体验差别巨大。

---

看完医生回来：

上传病历。

PLANET：

```text
I found 2 updates.

Apoquel
16mg → 8mg

[ Update ]

Follow-up
Aug 27

[ Remind me ]
```

两下完成。

---

三个月后：

用户搜索：

> Milo 上次连续呕吐是什么时候？

答案直接从他自己的历史出来。

这时候用户感受到的已经不是：

> 这个 App 功能很多。

而是：

> **这个 App 一直在帮我照顾 Milo。**

---

# 三十八、因此 PLANET 最终应该只有六个用户心智

不是 30 个 Feature。

```text
TODAY
What needs care now?

RECORD
What happened?

TIMELINE
What has happened?

PET
What do we know about Milo?

PREPARE
What should I have ready?

SHARE
What does this person need to know?
```

AI 全部在这六个心智背后工作。

---

# 三十九、Roadmap 也应该按这个系统拆

### V1 — Personal PLANET

只有：

```text
1 user
1 pet
```

但是把基础产品做到极好：

**Today + Typed Events + Timeline + Medication + Health Profile + Vet Preparation + Care Card + Image/PDF + Export。**

AI 不参与核心流程。

现有设计里的数据所有权、基础 Summary 和 Share 免费原则继续保留。

---

### V1.5 — PLANET Together

开放：

```text
multiple pets
family members
shared Today
attribution
member notifications
```

Free 就支持：

```text
2 pets
2 members
```

让“共同照护”本身是真正可用的免费价值。

---

### V2 — PLANET Intelligence

不是添加 AI 页面。

而是逐步打开：

```text
Smart Capture
Document Understanding
Smart Search
Context Connection
Vet Preparation
Insights
Follow-up Assistant
```

这时候才推出真正的 Pro。

---

# 四十、最后把商业原则也正式定下来

我建议以后所有产品决策都不能违反这几条：

> **核心照护不收费。**
> 用户自己的文字数据不限量。
> 基础记录、Today、Medication、Reminder 不收费。
> 基础 Vet Summary 不收费。
> Emergency 不收费。
> Care Card / Share 不收费。
> Export 不收费。

付费购买的是：

> **规模、资源、自动化和 Intelligence。**

也就是：

```text
More pets
More family
More storage
AI organization
AI search
AI OCR
AI synthesis
AI connections
AI preparation
Advanced analytics
```

这比：

> 免费版本故意做残废，再收费解锁正常功能

健康得多。

而且商业上并不意味着亏钱：通过 **500MB Free Media + 10 Credits + AI Cost Gateway + Usage Ledger + 付费套餐最大成本预算**，可以把免费用户的边际成本压到一个明确、可预测的范围；R2 当前成本尤其低，真正需要严格控制的其实是 **AI，而不是用户的数据本身**。([Cloudflare Docs][3])

**最终我认为 PLANET 的核心护城河也不是 AI 模型。**

而是：

> **多年持续积累的 Pet Knowledge + Care History + Household Context，以及 PLANET 围绕这些数据自动完成照护、整理、连接、提醒和准备的能力。**

模型可以从 Gemini 换成 OpenAI，也可以以后换成别的；用户和 Milo 之间积累下来的那套上下文，才是真正不可替代的东西。

[1]: https://developers.openai.com/api/docs/models/gpt-5-mini "https://developers.openai.com/api/docs/models/gpt-5-mini"
[2]: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn "https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn"
[3]: https://developers.cloudflare.com/r2/pricing/ "https://developers.cloudflare.com/r2/pricing/"
[4]: https://resend.com/docs/knowledge-base/what-is-resend-pricing "https://resend.com/docs/knowledge-base/what-is-resend-pricing"
[5]: https://docs.lemonsqueezy.com/help/getting-started/fees "https://docs.lemonsqueezy.com/help/getting-started/fees"
[6]: https://developer.apple.com/app-store/small-business-program/ "https://developer.apple.com/app-store/small-business-program/"

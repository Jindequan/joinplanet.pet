# PLANET App UI / UX / Layout 全方位设计方案 v1.0

> 来源：外部设计规格（2026-08-17 原文照存，未删改）。
> 采纳决定：结构与规则全量采纳（IA 锁定 Today/Timeline/Pet＋、数据边界、交互规则、组件库、页面树、五问纪律）。
> 平台修订（2026-08-17 晚）：App 采用 **Expo / React Native，一套代码编译 iOS + Android**，与落地页完全独立——原文中 PWA/Web 表述按原生等价物落地（Web Share API→系统分享面板、网页 Bottom Sheet→@gorhom/bottom-sheet、Haptics 从可选变为 expo-haptics、44px→平台触控标准）；/s/:token 与 /invite/:code 保持 Web（接收方不装 App 是产品前提）。
> 配色：App 默认采用本文蓝白 token 原值（暖色映射为备选，见 DESIGN.md §3）；App 字体用 SF Pro/系统 sans 原案。
> 本文件为 UI 层的唯一权威（canonical）。

---

下面这版我按**可以直接交给前端实现**的粒度来定：一级 IA、页面布局、Design System、交互规则、状态、数据流、多人协作、异常处理、PWA、未来 AI 接入全部统一起来。核心不再继续摇摆。


# PLANET App UI / UX / Layout 全方位设计方案

**版本：v1.0**  
**目标平台：Mobile-first PWA**  
**核心体验：Today / Timeline / Pet + Quick Record**  
**设计目标：温暖、可信、简单、长期可使用，而不是 Dribbble 式展示型 UI。**

---

# 1. 产品体验定义

PLANET 不应被设计成：

- 宠物商城
- 宠物医疗后台
- 宠物社交 App
- AI Chatbot
- Todo List

PLANET 的产品心智应该是：

> **The digital home for your pet.**

产品围绕三个长期问题：

1. **Today：今天 Milo 需要什么？**
2. **Timeline：Milo 最近和过去发生了什么？**
3. **Pet：关于 Milo，我需要长期知道和管理什么？**

再通过一个全局动作：

> **＋：刚刚发生了什么？**

完成信息进入系统。

现有产品定义已经形成「今日照护 + 健康时间线 + 临时分享 + Vet Summary」闭环，这个核心不需要推翻。

一级导航固定：

```text
Today        Timeline        Pet
                 ＋
```

**Phase 1 不增加第四个 Tab。**

Share 永远作为上下文动作，不成为一级目的地。这与当前三 Tab + 全局快速记录方向一致。

---

# 2. 整体 UX 原则

## 2.1 一个页面只回答一个问题

### Today

> 今天还有什么没做？

Primary Action：

**完成任务**

---

### Timeline

> Milo 发生过什么？

Primary Action：

**记录**

---

### Pet

> Milo 是谁？长期重要信息是什么？

Primary Action：

**查看与管理宠物长期资料**

---

### Quick Record

> 刚发生了什么？

Primary Action：

**立即保存**

---

# 3. 视觉语言

视觉从用户提供的三组参考中取以下元素：

- 蓝白、轻盈、大留白；
- 宠物是视觉中心；
- 大圆角和柔和 Surface；
- Floating Navigation；
- 信息 Card 化；
- 清晰的数据层级。

但明确舍弃：

- 电商感；
- Cartoon Font；
- 大量 Paw 装饰；
- 五颜六色 Event；
- 医疗 Dashboard 感；
- 夸张阴影；
- 扇形 FAB；
- 为展示而存在的大面积插画。

最终视觉关键词：

> **Soft / Calm / Caring / Premium / Trustworthy**

---

# 4. Color System

## 4.1 基础色

| Token | 色值 | 用途 |
|---|---:|---|
| `bg` | `#F5F8F9` | App Background |
| `surface` | `#FFFFFF` | Card / Sheet |
| `surface-soft` | `#EDF6F9` | Secondary Surface |
| `border` | `#DFE7EA` | Divider / Border |
| `text` | `#152126` | 主文字 |
| `text-secondary` | `#65727A` | 次级文字 |
| `text-tertiary` | `#99A3A8` | 弱提示 |

## 4.2 Brand Blue

| Token | 色值 |
|---|---:|
| Brand 100 | `#DDF3FB` |
| Brand 300 | `#9ADCF3` |
| Brand 500 | `#47B9E2` |
| Brand 700 | `#147FA8` |

蓝色主要用于：

- Tab Active；
- Progress；
- Link；
- Selection；
- Floating ＋；
- Feature Highlight。

**大型主 CTA 不一定使用蓝色。**

例如：

```text
Primary CTA
background: #152126
text: white
```

这会比整 App 到处蓝色更高级。

---

# 5. Semantic Colors

| 场景 | 色值 |
|---|---:|
| Success / Done | `#57A879` |
| Warning / Attention | `#D89A3A` |
| Health / Symptom | `#D75E67` |
| Medication | `#318EB3` |
| Neutral Event | `#7E8A90` |
| AI / Pro | `#796BEA` |

颜色不能成为唯一的信息表达方式。

例如异常：

```text
● Symptom
Vomiting ×2
```

必须同时存在文字语义，而不是单纯红色。

---

# 6. AI 色彩预留

Phase 1 不使用 AI Purple。

Phase 2 所有 AI 生成内容统一：

```text
#796BEA
```

并明确带：

```text
✦ PLANET Insight
```

让用户区分：

- 用户原始记录；
- 确定性系统数据；
- AI 推导内容。

这是未来可信度设计的一部分。

---

# 7. Typography

不使用卡通字体。

推荐：

```text
iOS: SF Pro
Web fallback: Inter / system-ui
```

字号：

| 类型 | Size | Weight |
|---|---:|---|
| Hero | 32 | 600 |
| Page Title | 28 | 600 |
| Section | 18 | 600 |
| Card Title | 16 | 600 |
| Body | 15–16 | 400 |
| Caption | 13 | 400 |
| Micro | 12 | 500 |

避免大面积 Bold。

医疗和健康信息需要稳定、可扫读。

---

# 8. Spacing System

采用 4pt 基础单位：

```text
4
8
12
16
20
24
32
40
48
```

页面：

```text
Horizontal padding: 16px
Section gap: 24–32px
Card padding: 16–20px
Card internal gap: 8–12px
```

所有 Touch Target：

```text
≥ 44 × 44
```

---

# 9. Radius System

```text
Hero            28px
Large Card      24px
Normal Card     18px
Input           16px
Button          16px
Chip            999px
Avatar          Circle
```

禁止随意出现：

```text
10 / 12 / 14 / 19 / 23 / 30
```

这种没有体系的 Radius。

---

# 10. Shadow

尽量不依靠 Shadow 建立层级。

默认：

```text
background contrast
+
spacing
+
border
```

优先于 Shadow。

必要时：

```text
0 2px 12px rgba(20, 35, 45, 0.05)
```

Floating Navigation：

```text
0 8px 28px rgba(20, 35, 45, 0.10)
```

---

# 11. App Shell

```text
┌──────────────────────────────┐
│ Safe Area                    │
│                              │
│ [avatar] Milo            ••• │
│                              │
│                              │
│        PAGE CONTENT          │
│                              │
│                              │
│                              │
│ ╭──────────────────────────╮ │
│ │ Today Timeline   ＋   Pet│ │
│ ╰──────────────────────────╯ │
│                              │
└──────────────────────────────┘
```

## Header

左：

```text
[Pet avatar] Milo
```

Phase 1：

不可切换。

Phase 2 多宠：

点击打开 Pet Switcher。

右：

```text
•••
```

菜单：

- Account
- Feedback
- Privacy
- Terms
- Sign out

### 不显示 Notification Bell

Phase 1 没有真正通知中心，就不制造一个没有内容的入口。

---

# 12. Floating Tab Bar

尺寸：

```text
height: 64
left/right: 12–16
bottom: safe-area + 8
radius: 26
```

结构：

```text
Today    Timeline     ＋     Pet
```

Active：

```text
soft-blue background
+
dark icon
+
label
```

Inactive：

```text
#7E8A90
```

中央 ＋：

```text
52 × 52
Brand 500
```

轻微高于 Navigation Bar 4–6px。

不要做扇形展开。

点击后直接 Bottom Sheet。

---

# 13. Welcome / Authentication

当前设计里创建 / 加入与认证容易同时出现。应该拆开。

## Step 1：Authentication

```text
PLANET

Their whole world.
One place.

Email

[ you@example.com            ]

[ Continue                   ]
```

发送验证码：

```text
We sent a code to
devin@example.com

[ _ _ _ _ _ _ ]

Resend in 28s
```

行为：

- 输入最后一位自动验证；
- 登录和注册完全统一；
- 不询问“是否注册”。

---

# 14. Invite Deep Link

如果用户通过：

```text
/some-invite-link
```

进入：

流程不是：

```text
登录
→ Create or Join?
→ Join
```

而是：

```text
Invite
→ 验证 Email
→ Preview circle
→ Join
```

Preview：

```text
You're invited to care for Milo

[Milo photo]

Shared by Devin

[ Join Milo's care circle ]
```

---

# 15. 创建宠物

只做最小 Onboarding：

```text
What's your pet's name?

[ Milo ]
```

```text
What kind of pet is Milo?

[ Dog ]
[ Cat ]
[ Other ]
```

```text
Add a photo

[ Camera / Library ]

Skip
```

完成：

```text
Meet Milo.

[ Start caring ]
```

Breed / Birthday / Allergy / Medication：

**全部后补。**

不要首登填写健康问卷。

---

# 16. Today —— 产品成败页

Today 必须是最有情绪价值、最高频、最低摩擦页面。

---

# 17. Today Hero

推荐：

```text
╭──────────────────────────────╮
│ TODAY                        │
│ Saturday · Aug 17            │
│                              │
│ Good morning, Milo.          │
│                              │
│ 3 of 5 complete          60% │
│ ● ● ● ○ ○                   │
│                              │
│                    [Milo]    │
│                              │
│                       ↗      │
╰──────────────────────────────╯
```

背景：

```text
Brand 100
→ very light gradient
```

右侧展示真实宠物照片。

不要每天使用一张巨大照片导致内容被压下去。

Hero Height：

```text
145–170px
```

---

# 18. Today 任务信息架构

按 Daypart，而不是机械时间列表：

```text
Morning

08:00
Breakfast                      ✓
Amy · 8:03

09:00
Apoquel 16mg                   ✓
Devin · 9:04


Afternoon

12:00
Walk                           ○


Evening

18:00
Dinner                         ○
```

好处：

- 时间扫描更自然；
- 不需要所有项目做复杂 Card；
- 任务很多时仍然稳定。

---

# 19. Task Row

推荐高度：

```text
64–72px
```

结构：

```text
08:00       ○
            Walk
            Daily
```

完成：

```text
08:00       ✓
            Walk
            Devin · 08:13
```

可选：

Medication 使用：

```text
MED
```

或者药丸 icon。

不要每种任务五颜六色。

---

# 20. 完成任务 UX

点击未完成：

```text
○ Walk
```

立即变成：

```text
✓ Walk
Devin · just now
```

同步执行：

1. Check scale 120ms；
2. Row subtle spring；
3. Hero progress 动画；
4. Toast：

```text
Walk completed              Undo
```

Toast 4 秒。

**禁止 Confirm Modal。**

---

# 21. 多人同时完成

多人照护时必须优雅处理竞争状态。

场景：

```text
Devin 点完成
Amy 同时点完成
```

客户端：

先 optimistic update。

服务端：

以 `task_id + log_date` 为唯一事实。

第二个请求拿到已有结果时：

客户端不弹：

```text
ERROR / ALREADY COMPLETED
```

而是自然更新：

```text
✓ Walk
Amy · 08:13
```

或显示服务器最终记录人。

这是协作型产品必须做的 reconciliation。

---

# 22. Skip

不要把：

> 长按

作为唯一 Skip 方法。

推荐：

### Swipe

```text
← Skip
```

以及 Task Detail：

```text
Skip for today
```

Skip 后：

```text
Skipped (1) ▾
```

折叠到底部。

用户可 Restore。

---

# 23. Add Care Task

Today 页面底部：

```text
+ Add care task
```

点击 Bottom Sheet：

```text
Add to Milo's routine

Breakfast
Dinner
Medication
Walk
Custom
```

选 Medication：

如果已有 Medication：

```text
Apoquel 16mg

When?
08:00

[ Add to routine ]
```

---

# 24. Today Empty State

```text
Nothing on Milo's schedule yet.

What does Milo do every day?

[ Breakfast ]
[ Medication ]

[ Walk      ]
[ Custom    ]
```

点击模板即创建。

绝不出现：

```text
No Tasks
```

---

# 25. Today 完成态

全部完成：

Hero 状态改成：

```text
All cared for today.
```

Success 色只做轻微视觉反馈。

不要撒花、烟花或者大规模 confetti。

---

# 26. Share Today Card

Hero 右下角：

```text
↗
```

点击：

```text
Share today's care
```

Preview：

```text
Milo · Today

✓ Breakfast · Amy
✓ Apoquel · Devin
○ Walk
○ Dinner

PLANET
```

生成 Image / Web Share API。

目标：

直接进入：

- WhatsApp
- Messages
- LINE
- Telegram
- 微信浏览器系统分享

这是“骑在家庭已有沟通习惯上”的设计，与现有产品方向一致。

---

# 27. Timeline —— 宠物长期数据资产

Timeline 不是：

> 病历列表

而是：

> Milo 的可追溯生活记录。

因此顶部文案不要：

```text
Milo 怎么了？
```

而改：

```text
Record something about Milo…
```

中文：

```text
记录 Milo 的近况…
```

---

# 28. Timeline Layout

```text
Timeline

╭──────────────────────────────╮
│ Record something about Milo… │
│                         📷   │
╰──────────────────────────────╯

[ All ] [ Health ] [ Weight ]
[ Visit ] [ Photo ]

TODAY

20:31
╭──────────────────────────────╮
│ Health                       │
│ Vomited twice after dinner   │
│                              │
│ 📎 1 photo                   │
│ Devin · 20:31                │
╰──────────────────────────────╯

18:13
Weight · 5.9 kg
Devin

YESTERDAY

Vet visit
...
```

---

# 29. Timeline 信息密度

不是所有 Event 都 Card 化。

## Compact Row

适合：

- Weight
- Note
- Simple measurement

例如：

```text
09:02    Weight
         5.9 kg

         Devin
```

## Large Card

适合：

- Symptom
- Visit
- 带照片
- 长备注
- 重要医疗事件

避免：

> 一年 500 条记录 = 500 个巨大 Card。

---

# 30. Timeline 类型设计

用户层面不要直接暴露数据库 Enum。

用户看到：

```text
All
Health
Weight
Visit
Photo
```

Medication Change：

属于 Health。

Note：

属于 All，不一定需要独立 Filter。

---

# 31. Today 与 Timeline 不自动完全混合

这是很重要的数据边界。

**普通 Care Task Completion 不自动进入 Timeline。**

否则：

```text
Breakfast
Walk
Dinner
Breakfast
Walk
Dinner
...
```

会淹没健康记录。

Today 历史属于 Task History。

Timeline 只保存：

> 用户主动认为值得记录的 Pet Event。

例外：

Medication 创建 / 停止等长期变化，可以自动生成 Timeline Event。

---

# 32. Timeline Quick Input

用户直接输入：

```text
Milo 昨晚吐了两次，早上没怎么吃饭
```

Phase 1：

保存为 Note：

```text
Note
Milo 昨晚吐了两次……
```

然后：

```text
Add details
```

可选补：

- Type
- Occurred time
- Attachment

不强迫。

这样真正符合现有「≤5 秒记录」原则。

---

# 33. Phase 2 AI 与这个入口兼容

未来 Pro：

同一句：

```text
昨晚吐了两次，早上没怎么吃饭
```

AI 自动建议结构：

```text
Symptom
Vomiting ×2
Last night

Appetite
Reduced
This morning
```

UI 不改变。

这就是正确的 AI 扩展方式。

---

# 34. Timeline Event Detail

点击 Event：

```text
Vomiting

Aug 17 · 20:31

Vomited twice after dinner.

[ Photo ]

Recorded by Devin
Manual record

Edit
Delete
```

Edit 和 Delete 不放在 List 上。

Delete 二次确认。

---

# 35. Quick Record

全局 `＋` 严格定义：

> **Record what happened.**

而不是万能 Create。

点击：

```text
╭──────── Quick record ────────╮
│                              │
│ 📝 Note                      │
│ ♥  Symptom                   │
│ ⚖  Weight                    │
│ +  Vet visit                 │
│ 📷 Photo                     │
│                              │
╰──────────────────────────────╯
```

---

# 36. Quick Record 不包含

禁止：

```text
Add task
Add caregiver
Add medication profile
Create share
Export
```

这些都是管理动作。

---

# 37. 为什么 Medication 不放 Quick Record

因为：

```text
Medication
```

存在两种完全不同语义：

1. Milo 正在服用什么药；
2. Milo 今天吃了什么药。

长期 Medication：

```text
Pet → Medications
```

日常服药：

```text
Today → Care Task
```

Medication 的开始 / 停止：

由 Medication 模块生成 Timeline Event。

避免用户理解混乱。

---

# 38. Quick Record Form

Symptom：

```text
What happened?

[ Vomited twice             ]

Severity
[ Mild ] [ Moderate ] [ Severe ]

Occurred
Now                       ›

[ Save ]
```

Severity：

Optional。

默认：

```text
Now
```

---

# 39. Photo Upload

点击 Photo：

```text
Camera
Photo Library
```

选择后立即显示 Local Preview：

```text
[ Photo ]

Uploading…
```

用户可以先填 Caption。

推荐数据流：

```text
1. Create upload session
2. API 返回 signed upload URL
3. Browser → R2
4. Upload complete
5. Create attachment record
6. Bind to timeline event
```

如果失败：

保留本地 Preview。

提示：

```text
Upload failed
Retry
```

不清空用户输入。

---

# 40. Pet —— 宠物长期入口

Pet 页绝不能变成设置后台。

它首先应该回答：

> **This is Milo.**

---

# 41. Pet Hero

```text
          [ Milo photo ]

              Milo

   Golden Retriever · 7y 2m

      5.9 kg       Male

[ Prepare for vet           ]

Share Milo's care        →
```

Pet Photo 是整个页面视觉中心。

---

# 42. Pet Overview

下面只放 Summary Card：

```text
Health profile
╭──────────────────────────────╮
│ Allergies                 ›  │
│ Chicken · severe             │
│                              │
│ Conditions                ›  │
│ Atopic dermatitis            │
╰──────────────────────────────╯
```

```text
Medications
╭──────────────────────────────╮
│ ● Apoquel                    │
│   16 mg · Daily              │
│                         ›    │
╰──────────────────────────────╯
```

```text
Care circle
╭──────────────────────────────╮
│ [D] [A]                      │
│ Devin · Amy                  │
│                              │
│ Invite caregiver         +   │
╰──────────────────────────────╯
```

```text
Emergency & Vet            ›
```

```text
Data & Privacy             ›
```

原布局把 Profile、Medication、Family、Emergency、Data 全部铺开，在移动端会过载。

因此一级 Pet 必须只是 Overview。

---

# 43. Pet 二级 IA

```text
Pet
│
├─ Health Profile
├─ Medications
├─ Care Circle
├─ Emergency & Vet
└─ Data & Privacy
```

URL：

```text
/app/pet
/app/pet/profile
/app/pet/medications
/app/pet/circle
/app/pet/emergency
/app/pet/data
```

---

# 44. Health Profile

```text
Health Profile

Basic

Species
Dog

Breed
Golden Retriever

Birthday
May 12, 2019


Health

Allergies
Chicken · Severe

Conditions
Atopic dermatitis

Current weight
5.9 kg
Updated Aug 14
```

Current Weight：

**从最新 Weight Event 派生。**

不要同时在 Pet 表和 Timeline 存两份当前重量。

---

# 45. Medications

```text
Medications

ACTIVE

╭──────────────────────────────╮
│ ● Apoquel                    │
│                              │
│ 16mg                         │
│ Once daily                   │
│ Since Jul 12                 │
│                          ›   │
╰──────────────────────────────╯

PAST

Prednisone
Ended Jun 3

[ + Add medication ]
```

---

# 46. Add Medication

```text
Medication

Name
[ Apoquel ]

Dose
[ 16mg ]

Schedule
[ Once daily ]

Started
[ Today ]

[ Save ]
```

完成后：

```text
Add Apoquel to Milo's daily care?

16mg · once daily

[ Add to Today ]

Not now
```

Medication 与 Task 是不同实体，但 UX 自然连接。

---

# 47. Medication 生命周期

Add Medication：

自动产生 Timeline Event：

```text
Started Apoquel
16mg · once daily
```

End Medication：

产生：

```text
Stopped Apoquel
```

这样 Timeline 有医疗意义，但不会塞每日重复服药记录。

---

# 48. Care Circle

```text
Care circle

Owner

[D] Devin
Owner


Caregivers

[A] Amy
Caregiver


[ Invite caregiver ]
```

Owner 可：

- Invite
- Remove
- Generate Share

Caregiver 不可：

- Manage Members
- Delete Pet
- Revoke global shares

保持现有 Owner / Caregiver 权限模型。

---

# 49. Invite Caregiver

点击：

```text
Invite someone to care for Milo
```

生成：

```text
https://joinplanet.pet/invite/...
```

UI：

```text
[ QR ]

Anyone with this invite can
join Milo's care circle.

[ Share invite ]

Copy link
```

邀请完成后：

用户头像进入 Care Circle。

---

# 50. Emergency & Vet

```text
Emergency & Vet

Primary contact
Devin
+65 ...

Vet
Greenwoods Veterinary
+65 ...

Medical decision contact
Li Ping
+65 ...

If Devin cannot be reached,
Li Ping can make medical decisions.
```

这种信息必须使用普通、稳定的视觉语言。

不要红色大块警示 UI。

---

# 51. Data & Privacy

```text
Data & Privacy

Export Milo's data       ›

Download photos          ›

Active private links     ›

Delete Milo              ›
```

Delete：

红色只在进入 Danger Zone 后出现。

而不是 Pet Overview 第一屏直接看到：

```text
Delete Pet
```

---

# 52. Prepare for Vet

这是 PLANET 最重要的中低频价值时刻。

入口：

```text
Pet → Prepare for vet
```

而不是单独 Share Tab。

---

# 53. Prepare for Vet Step 1

```text
Prepare for vet

Help your vet understand
what's been happening with Milo.

Why are you visiting?

╭──────────────────────────────╮
│ Milo has been vomiting      │
│ since last night…           │
╰──────────────────────────────╯

Continue
```

---

# 54. Step 2：Choose Information

```text
Include in summary

✓ Pet profile

✓ Allergies

✓ Active medication

✓ Health events
  Last 30 days

✓ Weight

✓ Recent visits


[ Preview summary ]
```

允许逐项排除。

这符合当前 Summary 的隐私与确定性模板设计。

---

# 55. Vet Preview

```text
MILO

Vet Summary

WHY WE'RE HERE

Vomiting since last night.


IMPORTANT

Allergy
Chicken · Severe


ACTIVE MEDICATION

Apoquel
16mg · Daily


RECENT CHANGES

Aug 17
Vomiting ×2

Aug 16
Reduced appetite

Aug 09
Weight · 5.9kg
```

用户：

```text
Edit selection

Share private link

Print
```

---

# 56. Vet 信息排序

兽医不是来阅读 Milo 一生的。

优先级：

```text
1. Why we're here
2. Allergy
3. Current medication
4. Recent changes
5. Weight
6. Visits
7. Family note
```

不要先放：

```text
Breed
Birthday
Photo
Owner introduction
```

这些只能是辅助信息。

---

# 57. Share Care

UI 不叫：

```text
Sitter Share
```

统一产品语言：

> **Care Card**

因为对象可能是：

- sitter；
- 家人；
- 朋友；
- 邻居；
- 临时寄养者。

---

# 58. Care Card Flow

```text
Share Milo's care

[Milo]

Keep Milo's routine
with someone you trust.

Duration

[ 24 hours ]
[ 3 days ]
[ 7 days ]

Includes

✓ Today's care
✓ Emergency contact
✓ Vet
✓ Medical decision contact

Health history stays private.

[ Create private link ]
```

这一句必须高可见：

> **Health history stays private.**

---

# 59. Public Care Card

```text
CARING FOR MILO

[Milo]

TODAY

08:00
Breakfast + Apoquel            ✓

18:30
Evening walk


IF SOMETHING FEELS WRONG

Call Devin
+65 ...

Greenwoods Veterinary
+65 ...


MEDICAL DECISION CONTACT

Li Ping


Private · Read-only
Expires Sunday

powered by PLANET
```

没有：

- App Navigation；
- Account；
- Timeline；
- Health History；
- Cookie Popup。

---

# 60. Public Vet Page

```text
MILO

Vet Summary

Prepared by family
Aug 17


WHY WE'RE HERE

...


IMPORTANT

...


RECENT CHANGES

...


Private link
Expires in 71 hours

powered by PLANET
```

视觉更偏：

```text
white
+
very light blue
+
neutral typography
```

而 Care Card 可以稍微更温暖。

---

# 61. Share Link State

状态：

```text
Active
Expired
Revoked
```

Expired：

```text
This private link has expired.

Ask Milo's family
for a new link.
```

Revoked：

同样不解释内部机制。

---

# 62. 页面 Loading

禁止全屏 Spinner。

使用 Skeleton：

```text
██████████

██████████████
████████

████████████
███████
```

只在：

- 首次 Route Loading；
- 首次数据加载

出现。

---

# 63. Optimistic UI

高频操作全部 Optimistic：

- Task complete
- Undo
- Timeline create
- Task skip
- Task restore

流程：

```text
User Action
     ↓
Local UI Immediately Changes
     ↓
Request
     ↓
Success
    / \
   /   \
done   failure
        ↓
rollback
        ↓
toast
```

用户不能等待请求完成才看到 Checkmark。

---

# 64. Error Design

禁止：

```text
Something went wrong
```

作为唯一错误。

例如：

### Task

```text
Couldn't update Walk.

[ Retry ]
```

### Upload

```text
Photo couldn't be uploaded.

[ Retry ]
```

### Summary

```text
We couldn't create this summary.

Your records are safe.

[ Try again ]
```

---

# 65. Offline

Phase 1 不做 Offline Write，与现有技术边界保持一致。

离线：

顶部出现轻 Banner：

```text
Offline
Some information may be outdated.
```

用户打开 Quick Record 后：

如果网络断开：

不应假装已保存。

可以保留输入 Draft：

```text
Not saved yet.
Reconnect to save this record.
```

恢复网络后用户手动 Save。

不做复杂 Sync Queue。

---

# 66. 多人协作数据刷新

Today 属于实时敏感界面。

Phase 1 不一定需要 WebSocket。

推荐：

```text
Page focus
→ revalidate

window foreground
→ revalidate

mutation success
→ invalidate Today

每 30–60 秒
→ optional background refresh
```

多人家庭规模只有 2–4 人，没有必要一开始引入复杂实时基础设施。

---

# 67. 数据更新原则

分三类：

## A. 高频

Task Completion

```text
Optimistic
```

## B. 中频

Timeline Event

```text
Optimistic insert
```

## C. 低频关键数据

Pet / Medication / Emergency

```text
Submit
→ server success
→ update
```

关键健康档案不需要假 optimistic。

---

# 68. 推荐前端 Server State 模型

建议：

```text
TanStack Query
```

管理：

```text
Today
Timeline
Pet
Medications
Care Circle
Share
```

Local State：

只管理：

```text
Bottom Sheet
Form
Current Filter
Modal
Draft
```

不要为了这些引入巨大 Global Store。

---

# 69. Query Key 建议

```text
pet:{petId}

today:{petId}:{date}

timeline:{petId}

medications:{petId}

circle:{circleId}

shares:{petId}
```

Mutation 后只 invalidate 相关 Query。

---

# 70. Today 数据流

```text
GET Today
   ↓
care_tasks
+
task_logs(date)
   ↓
UI derives:
pending
done
skipped
progress
```

不需要服务器返回：

```text
3/5
```

这种可简单派生状态。

---

# 71. Task Mutation

逻辑：

```text
POST task completion
```

客户端先插入：

```text
status = done
by = currentUser
at = now
```

服务器返回 authoritative record。

再替换 optimistic record。

---

# 72. Timeline Pagination

必须 Cursor Pagination。

不是：

```text
page=1
page=2
```

Timeline：

```text
GET /timeline?before=<cursor>
```

向下触底：

加载更早记录。

这样一年后仍然稳定。

---

# 73. 图片加载

Timeline Thumbnail：

```text
thumbnail / resized image
```

不直接加载 10MB 原图。

详情：

再加载较大版本。

原图：

只在下载 / 打开时请求。

---

# 74. Collaboration Consistency

建议为以下 mutable 数据增加：

```text
updated_at
```

必要时以后增加：

```text
version
```

用于：

- Pet Profile；
- Medication；
- Tasks；
- Timeline Event。

如果两个 Caregiver 同时编辑重要资料：

后者保存发现旧 version：

```text
Milo's profile was updated by Amy.

Review the latest version.
```

不要静默覆盖。

Phase 1 可以只对低频 Profile 做简单 Last-write-wins，但接口结构预留版本更稳妥。

---

# 75. Timezone

Care Task 时间解释：

> Circle Timezone

而不是用户当前设备时区。

例如：

Milo 在 Singapore。

Devin 在 Japan。

08:00 Breakfast：

仍然是：

```text
08:00 Singapore
```

如果设备时区不同，可轻量显示：

```text
Milo's time · Singapore
```

不要自动移动 Milo 的日程。

---

# 76. Date Handling

后端存：

```text
UTC timestamp
```

UI：

按 Circle Timezone 展示。

Task `log_date`：

必须是 Circle Local Date。

避免跨时区当天任务错位。

---

# 77. Motion System

控制在：

```text
Tap                 100–150ms
Row update          150–180ms
Card transition     180–220ms
Bottom Sheet        280–320ms
Hero transition     300–350ms
```

Spring 仅用于：

- Check；
- FAB；
- Bottom Sheet；
- Avatar / small interactions。

---

# 78. Haptic

原生未来可以：

```text
Task complete → light
Delete → warning
```

PWA 不依赖 Haptic。

没有也不能破坏反馈。

---

# 79. Bottom Sheet

Quick Record、Add Task、Filter 等：

统一 Bottom Sheet。

行为：

- Drag Down Close；
- 点击 Mask Close；
- Form Editing 时防误触关闭；
- Keyboard 出现时自动适配；
- 保留 Safe Area。

---

# 80. Keyboard UX

Timeline：

打开即：

```text
focus input
```

但进入 Timeline 页面时**不要强制弹键盘**。

用户主动点击输入框才弹。

Save：

成功后：

```text
keyboard dismiss
+
new item inserted
```

---

# 81. Accessibility

必须支持：

- minimum 44px touch；
- `prefers-reduced-motion`；
- screen reader labels；
- Icon 不单独传达语义；
- 文字对比度；
- Dynamic Text；
- Error 不只靠红色；
- Success 不只靠绿色。

---

# 82. Responsive

主设计宽：

```text
375–430px
```

Desktop：

```text
max-width: 720px
margin: auto
```

保持单列。

不要专门设计 Dashboard Desktop。

Floating Bar：

固定于 Container 底部。

---

# 83. 情绪设计

PLANET 可以有情绪，但不要幼稚。

Today：

早上：

```text
Good morning, Milo.
```

晚上：

```text
A quiet evening with Milo.
```

全部完成：

```text
All cared for today.
```

宠物生日：

未来：

```text
Milo turns 8 today.
```

语言短而克制。

---

# 84. Pet Photos

照片承担情绪价值。

至少出现：

### Today

中等头像 / Hero。

### Pet

大照片。

### Share

小头像。

### Invite

大头像。

不要用大量宠物插画代替真实宠物照片。

用户真正关心的是：

> 自己的 Milo。

---

# 85. Icons

统一一套：

推荐：

```text
Lucide
```

或：

```text
SF Symbols-like line icon
```

Stroke：

统一。

不要混：

- Emoji；
- Filled Icon；
- Outline Icon；
- Cartoon Icon。

Emoji 只可在 Empty State 极少使用。

---

# 86. Content Language

避免工程语言：

不要：

```text
Timeline Event
Caregiver Role
Generate Sitter Link
Medication Entity
```

用户语言：

```text
Record
Family
Share Milo's care
Medication
```

后端模型不暴露给用户。

---

# 87. Confirmation Strategy

不应该确认：

```text
Complete task?
Save note?
```

应该确认：

```text
Delete pet?
Remove caregiver?
Delete health record?
Revoke private link?
```

原则：

> 可撤销操作 → 不确认  
> 不可撤销 / 高风险 → 确认

---

# 88. Toast

只用于反馈：

```text
Saved

Walk completed        Undo

Private link created

Invite copied
```

不要用 Toast 展示长信息。

---

# 89. Empty States

Empty State = 功能教学。

Today：

```text
What does Milo do every day?
```

Timeline：

```text
Milo's story starts here.
```

Medication：

```text
No active medications.
```

Care Circle：

```text
Caring together is easier.
Invite someone you trust.
```

---

# 90. Analytics

核心事件：

```text
auth_completed

pet_created

task_created
task_completed
task_skipped
task_undo

timeline_created
timeline_photo_uploaded

caregiver_invite_created
caregiver_joined

vet_prepare_started
vet_summary_previewed

share_created
share_opened
share_revoked

data_exported
```

---

# 91. UX Funnel

核心 Funnel：

```text
Login
 ↓
Pet Created
 ↓
First Care Task
 ↓
First Completion
 ↓
Second Active Day
 ↓
Invite Caregiver
 ↓
Timeline Record
 ↓
Summary / Care Share
```

不要只看：

```text
Signup
```

---

# 92. North Star

比 WAU 更适合的是：

> **Weekly Active Pets**

Active Pet 可定义为：

7 天内满足任一：

```text
≥ 3 care completions
OR
≥ 1 timeline event
OR
≥ 2 caregivers interacted
```

后期再调。

当前文档把邀请第二位照顾者与持续任务完成视为关键验证信号，这个方向正确。

---

# 93. AI Phase 2 不增加 AI Tab

未来禁止新增：

```text
AI
```

作为第四 Tab。

AI 应进入现有工作流：

### Quick Record

自然语言 → 自动结构化。

### Timeline

自动整理、关联。

### Pet

趋势 Insight。

### Vet

自动 Summary。

### Search

自然语言检索。

---

# 94. PLANET Insight Card

未来：

```text
╭──────────────────────────────╮
│ ✦ PLANET Insight             │
│                              │
│ Milo's weight decreased      │
│ 4.9% over the last 9 days.   │
│                              │
│ Based on 4 records           │
│                              │
│ View records                 │
╰──────────────────────────────╯
```

必须显示来源：

```text
Based on 4 records
```

不能制造黑盒判断。

---

# 95. Free / Pro UI

Free 不要满屏：

```text
PRO
PRO
PRO
PRO
```

免费核心体验保持完整。

Pro 入口只在自然触发点出现：

```text
Analyze this timeline
✦ Pro
```

或者：

```text
Import medical record
✦ Pro
```

现有免费 / Pro 原则明确要求核心协作、记录、基础 Summary、分享和数据导出免费，这部分应该维持。

---

# 96. 最终页面树

```text
/app

├── welcome
│   ├── auth
│   ├── create-pet
│   └── join-circle
│
├── today
│   ├── task-detail
│   └── add-task
│
├── timeline
│   ├── record
│   └── event-detail
│
├── pet
│   ├── profile
│   ├── medications
│   │   └── medication-detail
│   ├── circle
│   ├── emergency
│   └── data
│
├── prepare-vet
│   ├── reason
│   ├── select
│   └── preview
│
└── share-care
    └── preview
```

Public：

```text
/s/:token
```

---

# 97. UI Component Library

第一版组件不要无限扩展。

需要：

```text
AppHeader
FloatingTabBar
PetAvatar
PetHero

SectionHeader
Card
ListRow

PrimaryButton
SecondaryButton
IconButton

Chip
StatusBadge

TextInput
TextArea
NumberInput
DateTimeField

Progress
TaskRow
TimelineRow
TimelineCard
MedicationCard
CaregiverRow

BottomSheet
Dialog
Toast
Skeleton

EmptyState
ErrorState
OfflineBanner
```

基本足够完成 Phase 1。

---

# 98. Design Token 原则

组件禁止：

```css
color: #xxxxxx
padding: 17px
border-radius: 19px
```

全部走 Token：

```text
color.brand.500

space.4

radius.card

type.body

shadow.floating
```

否则开发两周后视觉一定开始漂移。

---

# 99. Phase 1 页面优先级

不要同时高保真画完整 App。

顺序：

## P0

1. App Shell
2. Today
3. Timeline
4. Quick Record
5. Pet Overview

这五个确定 Design System。

---

## P1

6. Medication
7. Care Circle
8. Prepare for Vet
9. Care Card
10. Public Share

---

## P2

11. Data & Privacy
12. Account
13. Error / Empty / Loading
14. PWA Install

---

# 100. 最终产品体验

用户第一次：

```text
打开 PLANET
→ 创建 Milo
→ 加 Breakfast
→ 加 Walk
```

第二天：

```text
打开
→ ✓ Breakfast
→ ✓ Walk
```

某天：

```text
Milo 吐了
→ ＋
→ Symptom
→ 5 秒保存
```

一个月后：

```text
Prepare for vet
→ Milo 最近一个月重要情况已经在那里
→ 分享给医生
```

临时出门：

```text
Share Milo's care
→ 72h Care Card
→ 发给朋友
```

一年后：

用户不是拥有一个“宠物 Todo App”。

而是拥有：

> **Milo 一整年的生活与健康记录。**

这才是 PLANET 真正的数据资产和用户迁移成本。

---

# 101. 最终设计纪律

以后任何新功能进入产品前，都问五个问题：

### 1.

它属于：

```text
Today
Timeline
Pet
```

哪一个？

答不上来，不做。

### 2.

它是：

```text
Record
Manage
Share
Understand
```

哪类动作？

### 3.

它是否值得占一级 UI？

绝大多数答案应该是：

> 不值得。

### 4.

它是否让 Today 变复杂？

如果是：

优先下沉。

### 5.

它需要 AI 吗？

如果没有 AI 同样成立：

先做确定性版本。

---

# 最终结论

PLANET 的 UI 不应该通过“功能很多”表现全面。

而应该通过：

```text
统一的 IA
+
稳定的信息层级
+
极低的记录成本
+
可靠的数据状态
+
自然的多人协作
+
优秀的宠物视觉表达
```

表现完整。

最终一级架构正式锁定：

```text
┌─────────────────────────────────┐
│                                 │
│             PLANET              │
│                                 │
│      Today   Timeline   Pet      │
│                ＋                │
│                                 │
└─────────────────────────────────┘
```

其中：

**Today = 留存**  
**Timeline = 数据资产**  
**Pet = 身份与信任**  
**＋ = 数据入口**  
**Share = 传播**  
**Vet Summary = 高价值时刻**  
**AI = 未来理解层**

后续所有设计都围绕这套结构演进，不再调整一级 IA。
# 外部评估报告（2026-08-17）

> 来源：创始人转发的外部设计评估（原文照存，未删改）。
> 结论：批准项目继续；硬限制 = 第一版禁止因"全面"继续加功能，精力全部给 Today + Timeline + Pet 三屏。
> 采纳情况：定位重塑 / IA 三 Tab / Pro=Pett Intelligence / WAP 北极星 / 订金门槛取消，均已落入 [APP-DESIGN.md](../product/APP-DESIGN.md) 与 [ROADMAP](../ROADMAP.md)。

---

整体判断：**方向是合理的，而且"先免费产品 → 再 AI 订阅"比文档当前的 founding/付费验证路线更适合这个产品。** 但我会改一个词：

> 不是「免费 + 超级全面」  
> 而是 **「免费 + 极其完整、极其好用的基础产品」**。

"全面"和"完整"差别很大。

你现在这份设计，我给 **产品逻辑 8/10、Phase 1 范围控制 6.5/10、未来 AI 商业化潜力 8.5/10**。

---

# 一、这个产品真正成立的地方

你现在已经不是在做一个普通的：

> Pet Health Tracker

而是在做：

> **多人共同养宠时的 Shared Pet Care System.**

文档的一句话定义其实非常准确：

> 2–4 人家庭照护圈，共享「今日任务 + 健康时间线 + 临时分享」，就诊时生成 Vet-ready Summary。

这个定位比"宠物健康管理 App"强很多。

因为它有一个天然的数据闭环：

**今天发生什么 → 谁做了什么 → 宠物发生什么 → 长期积累 → 就医/寄养时调用这些数据**

现在的四个核心功能其实形成了：

```text
Today
  ↓
Timeline
  ↓
Pet Memory / Health History
  ↓
Summary / Share
```

文档里 F4～F7 正好覆盖这个闭环。

这是这份设计最值钱的部分。

所以我不建议你再往：

- 宠物社区
- 宠物商城
- 找医生
- 保险
- AI 问诊
- 宠物百科

这些方向扩。

**PLANET 应该越来越深地拥有"这只宠物的一生数据"。**

---

# 二、你提出的"两步走"，我非常赞成，但应该重新定义

我建议你正式把产品战略改成：

## Phase 1：The Best Free Pet Care App

目标不是赚钱。

目标是：

> **让用户愿意把 PLANET 当作这只宠物的数字档案。**

免费版做到：

- UI 很漂亮
- 操作非常轻
- 没广告
- 不乱弹 Paywall
- 不锁核心数据
- 不限制家庭协作
- 能记录宠物一生
- 能分享
- 能导出
- 能管理日常照护

这跟你文档自己的商业原则实际上高度一致。

文档已经写了：

> 核心日常闭环永久免费；应急场景永不设卡；分享不收费；数据导出永久免费。

**这个原则不要动。**

它甚至可以成为 PLANET 的品牌价值观。

---

# 三、但是不要追求"超级全面"

这里是我认为你现在最容易走偏的地方。

假设你说：

> 我要先把所有宠物功能都免费做完。

那么很容易变成：

```text
疫苗
驱虫
体重
饮食
饮水
排泄
运动
睡眠
过敏
疾病
药物
预约
医生
费用
保险
提醒
相册
纪念日
训练
日记
社交
地图
……
```

最后会变成典型的：

> **功能很多，但没有一个强烈使用理由。**

你的文档其实已经意识到了这一点，所以 Phase 1 才只保留 8 个能力，并明确推迟 OCR、AI、语音、推送、多宠等功能。

我认为这里原来的设计反而是对的。

所以：

### 免费 ≠ 什么都有

应该是：

### 免费 = 用户完成核心任务绝对不受阻

这是两个完全不同的产品哲学。

---

# 四、我会进一步砍 Phase 1

你现在 Phase 1 实际还是偏重。

四周内准备做：

```text
Auth
Circle
Pet Profile
Medication
Today
Task
Timeline
Attachments
Summary
Share
Export
Delete
Email Digest
PWA
Entitlements
```

文档的排期就是这么规划的。

从开发角度你当然做得出来。

问题不是开发能力。

而是：

> **你会再次把大量时间花在"完成产品"，而不是观察用户究竟用什么。**

这件事尤其需要警惕。

我会把第一版真正聚焦在：

### 1. Pet

建立宠物身份。

名字、头像、生日、品种、疾病、过敏、药物。

### 2. Today

今天：

```text
08:00 💊 Apoquel        Devin ✓
09:00 🍚 Breakfast      Amy ✓
18:00 🚶 Walk           —
20:00 💊 Apoquel        —
```

这是每天打开 PLANET 的理由。

### 3. Timeline

```text
Today

20:31
Vomited after dinner
📷 photo

18:13
Walk · 31 min
Devin

08:06
Apoquel · 5mg
Amy
```

这是产品的数据资产。

### 4. Share / Summary

把这些数据真正带出 App。

这四个已经足够。

---

# 五、当前 IA 我反而有一个比较大的意见

文档目前：

```text
Today
Timeline
Share
Pet
```

前三个里面：

- Today：高频空间
- Timeline：高频/中频空间
- Pet：长期空间
- Share：**动作**

所以 **Share 不太适合作为一级 Tab。**

用户不可能每天：

> "今天我去看看 Share。"

Share 是上下文动作。

例如 Timeline：

```text
Timeline                    [Share]

Last 30 days
...
```

Pet：

```text
Milo

Medical
Medication
Allergies

[Prepare for vet]
[Share with sitter]
```

所以长期我更倾向：

```text
Today     Timeline     Pet
```

甚至就三个 Tab。

然后全局 `+`：

```text
+ Note
+ Symptom
+ Weight
+ Medication
+ Photo
```

这会比四个 Tab 更纯粹。

---

# 六、真正决定这个 App 成败的是 Today，不是 Health

这也是我对当前设计最重要的判断之一。

你现在文档同时试图证明三个场景：

1. 多人照护
2. 就医准备
3. 临时交接

其中真正能创造留存的是：

# 多人照护

因为：

就医可能半年一次。

寄养可能一年几次。

但是：

```text
喂药
喂饭
遛狗
清理
训练
滴眼药
刷牙
测血糖
```

每天发生。

所以产品增长模型应该是：

```text
Today
    ↓
每天使用
    ↓
自然积累 Timeline
    ↓
形成完整 Pet History
    ↓
某天生病
    ↓
突然发现：
"卧槽，我过去六个月的数据全在 PLANET。"
```

这才是巨大的 aha moment。

因此文档里：

> "没有 F4，健康日常无事可做，留存归零"

虽然"归零"属于尚未验证的假设，但方向是对的。

---

# 七、然后才进入你真正应该赚钱的 Phase 2：AI

这里我非常赞成你的判断：

> 第一版不要 AI。

甚至应该刻意做到：

# 没有 AI 也非常好用。

之后 AI 出现的时候，用户才会感觉：

> "PLANET suddenly became intelligent."

而不是：

> "这是又一个套 ChatGPT 的宠物 App。"

---

# 八、但 Pro 不能只是"AI Summary + OCR"

这是目前文档未来设计中最需要升级的地方。

你现在 Pro 基本是：

- AI Summary
- OCR
- 趋势
- 多宠物
- 更多附件

这些可以收费。

但它们还不够形成一个很强的：

> **$4.99 / $6.99 / $9.99 monthly**

订阅理由。

真正的 AI Pro 应该成为：

# Pet Intelligence

不是一个 AI Chat。

而是持续理解这只宠物。

例如用户每天已经产生：

```text
8/1 vomiting
8/3 reduced appetite
8/5 weight 6.1kg
8/7 medication changed
8/9 vomiting
8/14 weight 5.8kg
```

普通 PLANET：

> 保存这些记录。

PLANET AI：

> **理解这些记录之间存在关系。**

然后出现：

```text
Milo · Health Insight

Weight
↓ 6.1 → 5.8 kg
-4.9% in 9 days

Recent changes
• Vomiting recorded twice
• Appetite decreased
• Medication changed Aug 7

Prepare for your vet
4 relevant events have been selected.

[Review summary]
```

注意：

**不是诊断。**

文档已经明确把 AI 诊断、风险评级、用药建议排除在边界外。

这应该长期坚持。

AI 做：

> organize / retrieve / correlate / summarize / remind

而不是：

> diagnose / prescribe

---

# 九、甚至可以让 AI 从整个产品 UI 中"消失"

这是我特别建议你的。

不要搞：

```text
✨ Ask PLANET AI
```

然后一个 ChatGPT 聊天框。

太俗了。

AI 应该藏在产品里面。

例如：

用户输入：

> 昨晚 Milo 吐了两次，今天早上没怎么吃饭

普通版：

```text
Note
昨晚 Milo 吐了两次，今天早上没怎么吃饭
```

Pro：

后台自动变成：

```text
Symptoms
• Vomiting ×2
  Last night

Appetite
• Reduced
  This morning

Original note:
昨晚 Milo 吐了两次……
```

用户甚至不用：

> 选择 Event Type  
> 填次数  
> 选日期  
> 填 symptom

这才是 AI 真正改变产品。

---

# 十、Pro 最终应该卖的是"减少管理宠物的脑力"

我会重新定义：

### PLANET Free

**Remember everything.**

帮你记录。

### PLANET Pro

**Understand everything.**

帮你理解。

整个商业化瞬间就清楚了。

Free：

```text
Today
Timeline
Pet Profile
Medication
Family
Basic Health Records
Basic Summary
Sharing
Export
```

Pro：

```text
AI structured logging
AI medical-record OCR
AI timeline organization
AI smart search
AI vet preparation
Health trends
Smart reminders
Automatic summaries
Multiple pets
Unlimited files
Advanced reports
```

而且可以给免费用户：

> 每月 3 次 AI

不要完全不给。

让他体验一次 AI 把半年 Timeline 整理成 Vet Summary，转化效果可能远高于展示一个 Pro 功能列表。

---

# 十一、你的付费墙原则已经设计得很好

这一点我基本不改。

尤其：

> 就诊当天 Summary 不收费  
> Sitter / Emergency 不收费  
> Share 不收费  
> Export 不收费

这是非常正确的产品价值观。

因为用户最脆弱的时候：

> 宠物生病了。

如果这时候显示：

> Upgrade to PLANET Pro  
> ¥48/month

用户会立刻讨厌这个品牌。

应该是：

```text
Your vet summary is ready.

Milo
Last 30 days
...

Share with vet
```

AI 高级整理可以收费。

**基本医疗信息访问绝不能收费。**

---

# 十二、还有一个架构层面的冲突：PWA → App 内购

现在文档 Phase 1 明确：

> PWA，暂时不做原生 iOS / Android。

如果你第二步说的"订阅内购"指 App Store IAP，那么后面你实际上需要规划一个原生 App / RN / Swift 客户端。

Apple 当前规则仍要求：如果 iOS App 内通过订阅解锁数字功能，通常需要使用 In-App Purchase；自动续期订阅也正是 StoreKit 的标准场景。

所以我建议现在服务端保持：

```text
User
  ↓
Entitlement
  ↑
 ├ LemonSqueezy / Web
 ├ App Store
 └ Google Play
```

你文档现在的 `entitlements + can()` 设计恰好是对的。

以后：

```text
App Store Transaction
        ↓
Billing Adapter
        ↓
Entitlement
        ↓
AI Pro
```

业务代码不知道钱从哪付的。

这部分架构我建议**保留，不要删。**

---

# 十三、我反而建议你取消现在的「5 个订金才能开发」限制

文档现在写的是：

> 10 个试点申请 + ≥5 个订金/付费，否则不开工。

这和你现在的新战略已经冲突了。

因为你现在不是在验证：

> "有人会不会预付一个尚不存在的宠物 SaaS？"

你真正应该验证：

> **免费给你，你到底会不会持续使用？**

这是完全不同的问题。

所以新的 Phase 1 KPI 应该是：

```text
100 installs
    ↓
40 create pet
    ↓
20 create first task
    ↓
12 use on 3+ days
    ↓
8 invite another caregiver
    ↓
5 use for 2+ weeks
```

最重要的不是注册量。

而是：

# Active Pet

我甚至建议北极星指标改成：

> **Weekly Active Pets**

而不是 Weekly Active Users。

一个 Pet：

```text
2 caregivers
8 tasks
3 timeline events
```

这其实是一个活跃实体。

这非常符合 PLANET 产品本质。

---

# 十四、最终我建议你把整个项目重新理解成这个东西

不是：

> 一个功能超级全面的宠物 App。

也不是：

> 一个 AI 宠物助手。

而是：

# **The digital home for your pet.**

里面保存：

```text
Milo
├── Identity
├── Family
├── Today
├── Health
├── Medication
├── History
├── Photos
└── Memories
```

Phase 1：

> PLANET remembers.

Phase 2：

> PLANET understands.

Phase 3：

> PLANET accompanies the pet throughout its life.

这时候你文档里原来那个"宠物全生命周期"才真正成立，而不是靠不停加功能来实现。你现在文档的生命周期地图已经有这个雏形，从幼年、成年、慢病、就医、寄养一直延伸到临终和纪念。

**所以我会批准这个项目继续做。**

但给你一个硬限制：

> **第一版禁止因为"全面"继续加功能。**

你现在应该把精力放在 **Today + Timeline + Pet 三个页面做到非常漂亮、极低摩擦、让人真的愿意每天打开**。

AI 等这些数据真的开始产生以后再进去。

那时候 AI 才不是 gimmick，而会成为 PLANET 最强的付费层。

# DRAFT — 待 founder 批准后实施,本文件只是草稿

> 规格:SAAS-PREP-2026-10-01 §E2。落点:landing(`www.joinplanet.pet/app/page.tsx`)narrative 流末段,**#support 与 #invitation 之间**(page.tsx:162–171 之间)。纯前端一段+既有表单管道,diff 可整体还原。founder 不批就先跑 E1,本段不上。

---

## E2 Waitlist 段文案草稿

**Eyebrow:** `Caring for more than your own?`

**Heading:** `Rescues, foster networks and big-hearted households — *tell us you're out there.*`

**Intro paragraph:**

> PLANET was built for families, but the same timeline works when the family is a rescue with forty animals in foster homes — or your own crew of three dogs and a guinea pig. If that's you, we'd love to hear who you are. Free, as always; we read every reply.

**Form:**

| Field | Type | Notes |
|---|---|---|
| Email | email, required | 沿用既有表单管道(PilotSignup 同款) |
| What best describes you? | select, required | `A rescue or shelter` / `A foster network or foster home` / `A breeder` / `A multi-pet household` / `Something else` |

**Submit button:** `Join the list`

**Thank-you microcopy (post-submit):** `Got it. When org support opens, you'll hear it here first.`

---

## 实施注记(给 founder 拍板用)

- 文案基调对齐现有 landing 叙事(第一人称、building in public、em-dash),见 `app/page.tsx:159` founder 段。
- 下拉选项即 SAAS-PREP §E2 五选项(rescue/foster/breeder/multi-pet/other);breeder 选项同时是 E3 被动收集,不另建任何面。
- 观察窗/kill criteria(SAAS-PREP §E2 原文):两周 0 提交或提交全为个人邮箱 → 段下线,还原 diff;≥3 个组织域名提交 → 主动 outreach 1–2 家并入 E1。
- 本段不出现任何「组织版即将上线」的承诺——waitlist 语义是「告诉我们你是谁」,不是排队购买。

# App 页面布局速览

> 2026-08-17：布局/交互/UI 规则以 [APP-UI-SPEC-V1](APP-UI-SPEC-V1.md) 为唯一权威（原文照存，canonical）。本文件是开发用的速览版，已对齐 spec；两者冲突时以 spec 为准。
> 本轮对齐修正的四处：① 快速记录去掉 Medication、加 Vet visit（spec §37 语义拆分）；② Pet 页降为 Overview + 二级页（spec §42-43）；③ 顶栏不放通知铃铛（spec §11）；④ Timeline 输入文案改为"Record something about Milo…"（spec §27）。
> `F#` 对应 [APP-DESIGN](../product/APP-DESIGN.md) 功能编号。移动优先，桌面单列 max 720px。

## 0. App 外壳

```text
┌──────────────────────────────┐
│ [avatar Milo]           •••  │   左：宠物名（Phase 1 不可切换）；右：菜单
├──────────────────────────────┤
│         页面内容（滚动）        │
├──────────────────────────────┤
│ ╭──────────────────────────╮ │
│ │ Today  Timeline   ＋   Pet│ │   浮动 Tab Bar（radius 26，中央＋ 52×52）
│ ╰──────────────────────────╯ │
└──────────────────────────────┘
```

- 无通知铃铛（Phase 1 没有通知中心，不做空入口）；
- `•••`：Account / Feedback / Privacy / Terms / Sign out。

## 1. welcome（认证与建宠拆开，spec §13-15）

```text
认证（登录注册合一）：         邀请深链（spec §14）：
  Email → [Continue]           Invite → 验证 Email → Preview circle
  → 6 位码（末位自动验证）       "You're invited to care for Milo"
                                 → [Join]

建宠（最小 onboarding）：
  名字 → Dog/Cat/Other → 照片(可跳过) → "Meet Milo."
  Breed/Birthday/过敏/用药全部后补，不做健康问卷
```

## 2. /app（Today）——成败页

```text
╭ Hero（145–170px，Brand-100 极浅渐变，右下宠物照片小图＋↗分享）╮
│ TODAY · Saturday · Aug 17                                   │
│ Good morning, Milo.                                         │
│ 3 of 5 complete   ●●●○○                                     │
╰─────────────────────────────────────────────────────────────╯
Morning                          ← 按 Daypart 分组，不按机械时间列表
  08:00  ✓ Breakfast      Amy · 8:03
  09:00  ✓ Apoquel 16mg   Devin · 9:04
Afternoon
  12:00  ○ Walk
Evening
  18:00  ○ Dinner
Skipped (1) ▾                    ← 折叠区，可 Restore；Skip=左滑或详情页
[+ Add care task]                ← Bottom Sheet 模板：Breakfast/Dinner/Medication/Walk/Custom
```

- 完成即乐观更新（无确认弹窗）+ Toast 带 Undo；全部完成 Hero 变 "All cared for today."（不撒花）；
- 空状态 = 模板卡即建任务（"What does Milo do every day?"）；
- ↗ = Share today card（生成图 / Web Share API，直发家人群）。

## 3. /app/timeline

```text
Timeline
╭ Record something about Milo…            📷 ╮   ← 常驻聚焦输入（≤5 秒）
╰─────────────────────────────────────────╯
[All][Health][Weight][Visit][Photo]           ← 用户语言筛选，不暴露 DB enum
TODAY
20:31  ╭ Health 卡（大卡：症状/就诊/带照片/长备注）╮
       │ Vomited twice after dinner            │
       │ 📎1 photo · Devin · 20:31              │
       ╰────────────────────────────────────────╯
18:13  Weight · 5.9 kg · Devin                 ← 紧凑行（体重/简note）
YESTERDAY …
```

- **数据边界（spec §31，重要）**：日常任务完成**不**自动进 Timeline（否则淹没健康记录）；只有用药开始/停止等长期变化自动生成事件；
- 空状态："Milo's story starts here."

## 4. /app/pet——Overview + 二级页（spec §42-43）

```text
        [Milo 大照片]              ← 页面视觉中心
             Milo
  Golden Retriever · 7y2m
  5.9 kg（派生自最新体重事件）· Male
[ Prepare for vet ]
Share Milo's care →
─────────────────────────────
Health profile      ›   （过敏/慢病）
Medications         ›   （active/past，建档后问"加进 Today？"）
Care circle         ›   （Owner/Caregiver + Invite——北极星动作）
Emergency & Vet     ›   （primary/vet/医疗决定人；平静视觉，不红色警示）
Data & Privacy      ›   （导出/下载照片/活跃链接/删除——红色只进 Danger Zone）
```

二级路由：`/app/pet/{profile|medications|circle|emergency|data}`。

## 5. 全局＋：Quick Record（spec §35-38）

```text
╭ Quick record ────────────╮
│ 📝 Note   ♥ Symptom      │
│ ⚖ Weight  + Vet visit   │
│ 📷 Photo                 │
╰──────────────────────────╯
```

- **不含 Medication/Add task/邀请/分享**（管理动作不进＋）——用药的长期语义走 Pet→Medications，今日服药走 Today 任务，开始/停止自动生成 Timeline 事件；
- 表单最小化：默认时间=Now，Severity 可选，Save 后键盘收起+乐观插入。

## 6. /s/[token] 公开页（免注册，无导航无 cookie 弹窗）

```text
Vet Summary（白+极浅蓝+中性排版，打印友好）：
  MILO · VET SUMMARY · Prepared by family
  WHY WE'RE HERE → IMPORTANT(过敏) → ACTIVE MEDICATION
  → RECENT CHANGES → Weight → Visits        ← 兽医优先级排序（spec §56）
  Private link · Expires in 71h · powered by PLANET

Care Card（ex-Sitter，稍暖）：
  CARING FOR MILO · shared by Devin · expires Sunday
  TODAY: 任务+状态
  IF SOMETHING FEELS WRONG: Devin → Vet → 医疗决定人
  Health history stays private.
```

- 过期/撤销：不解释内部机制，只说"Ask Milo's family for a new link"。

## 7. Prepare for vet 三步流（spec §53-55）

```text
reason（为什么就诊，一句话）→ select（逐项勾选包含内容）→ preview（编辑选择/私链/打印）
```

## 布局总原则

1. 一页一问题：Today=还有什么没做；Timeline=发生过什么；Pet= Milo 是谁；＋= 刚发生什么；
2. 记录 ≤2 次点击可达，输入默认 Now；
3. 完成与记录永远带人名时间；
4. 空状态即教学，绝不出 "No Tasks"；
5. 可撤销操作不确认，不可逆操作才确认（spec §87）。

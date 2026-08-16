# App 页面布局草稿（仅结构，不含视觉）

> 日期：2026-08-17 · 对应 [APP-DESIGN](../product/APP-DESIGN.md) §5 IA（三 Tab + 全局＋，Share 为上下文动作）
> 约定：移动优先（PWA 主场），桌面 = 同结构居中单列（max 720px），不另做桌面布局。`F#` 对应功能编号。

## 0. App 外壳（所有 /app 页共用）

```text
┌──────────────────────────────┐
│ 顶栏（固定）                   │
│  [Milo ▾]         [🔔] [⋯]   │   宠物切换 / 通知入口 / 更多菜单
├──────────────────────────────┤
│                              │
│         页面内容（滚动）        │
│                              │
├──────────────────────────────┤
│  Today   Timeline   (＋)  Pet │   底部 Tab；＋为居中悬浮的快速记录
└──────────────────────────────┘
```

- 单宠期 `[Milo ▾]` 不可切换（P2 多宠解锁后启用）；
- `[⋯]` 菜单：账号、退出、Tell Devin、Terms/Privacy。

## 1. /app/welcome（登录 + 引导）

```text
┌──────────────────────────────┐
│        PLANET orbit           │
│   Their whole world. One place.│
│                              │
│  ┌─────────┐  ┌─────────┐   │
│  │ 加入照护圈 │  │ 创建新宠物 │   │   ← 两分支卡片，平级入口
│  └─────────┘  └─────────┘   │
│                              │
│  （任一分支先进邮箱 → 验证码）    │
│  你的邮箱 [………………]  [Send]     │
│  验证码   [＿ ＿ ＿ ＿ ＿ ＿] →  │   F1：6 位码，两用途（登录/注册合一）
│                              │
│  分支A·加入：输入邀请码 → 进圈    │   F2
│  分支B·创建：宠物名 → 物种/品种   │   F3 最小档案，生日可选
│            → 生日(可选) → 完成  │      全部可跳过、事后补
└──────────────────────────────┘
```

## 2. /app（Today）——默认首页，成败屏

```text
┌ 顶栏 ────────────────────────┐
│ Today · Sat, Aug 17  [⇪ Share]│   右上：导出今日卡片图（进家人群）
│ ┌──────────────────────────┐ │
│ │ ●●●○○   3 of 5 done      │ │   今日进度行（点=任务，可点）
│ └──────────────────────────┘ │
│                              │
│ 08:00  ●  Breakfast   Amy ✓  │   行结构：时间｜状态点｜标题｜完成人
│ 09:00  ●  Apoquel 16mg Devin✤│   ✤=完成但有备注；整行可点看详情
│ 12:00  ○  Walk           —   │   未完成：点行=完成；长按/右缘=跳过
│ 18:00  ○  Dinner          —  │
│                              │
│ ── Skipped ──                 │   折叠区（今天跳过的，可恢复）
│                              │
│ [+ Add a task]                │   模板：喂药/喂饭/遛弯/自定义+时间
└──────────────────────────────┘
```

- 数据：`care_tasks × task_logs(today)`；完成走乐观更新；
- 空状态：三张任务模板卡任点一张即建第一个任务。

## 3. /app/timeline

```text
┌ 顶栏 ────────────────────────┐
│ Timeline · Milo        [↗ Share]│  页头分享=分享时间线视图（F7）
│ ┌──────────────────────────┐ │
│ │ Milo 怎么了？……          📷│ │   常驻聚焦输入（≤5 秒记录），📷=拍照记录
│ └──────────────────────────┘ │
│ [All][Symptom][Med][Visit]   │   筛选 chips（横向滚动）
│ [Photo][Weight]               │
│                              │
│ ── Today ──                   │   按日分组，向下滚=更早
│ 20:31  ⚠ Vomited ×2    Devin  │   行结构：时间｜类型标｜标题｜记录人
│ 18:13    Walk 31min     Amy   │   ⚠=症状类加重标记；📎=有附件
│ ── Yesterday ──               │
│ 09:02  ⚖ 5.9 kg        Devin │   ⚖=体重（读 data JSONB 数值）
│ …                             │
└──────────────────────────────┘
```

- 点行 = 事件详情（来源/时间/附件/编辑/删除）；
- 空状态：引导记录"最近一次异常或体重"。

## 4. /app/pet（档案 + 成员 + 数据）

```text
┌ 顶栏 ────────────────────────┐
│ Milo                    [Edit]│
│ [头像] Milo · 金毛 · 7y2m · 5.9kg│
│ [Prepare for vet] [Share sitter]│  ← 两个上下文动作按钮（F6 / F7）
│                              │
│ ── Profile ───────────────    │
│  Allergies    Chicken (重)    │
│  Conditions   Atopic dermatitis│
│                              │
│ ── Medication ────────────    │
│  ● Apoquel 16mg · daily · since Jul │  ●=active；灰点=ended
│  [+ Add medication]           │   F3：建档即问"要加进今日任务吗"
│                              │
│ ── Family ────────────────    │
│  [D] Devin · Owner            │
│  [A] Amy   · Caregiver        │
│  [+ Invite a caregiver]       │   ← 北极星动作（复制链接/二维码）
│                              │
│ ── Emergency ─────────────    │
│  Primary     Devin · +65 …    │
│  Vet         Greenwoods · +65…│
│  Authorized  李萍（联系不上时    │   ← 紧急医疗授权（差异化字段）
│              的医疗决定人）      │
│                              │
│ ── Data ─────────────────     │
│  [Export my data]  [Delete pet]│   F8：导出=JSON+照片清单；删除=级联+确认
└──────────────────────────────┘
```

## 5. 全局＋：快速记录（底部抽屉，任何页唤起）

```text
┌───── 底部抽屉 ──────┐
│ + Note + Symptom + Weight + Medication + Photo │  类型行（横滑）
│ ───────────────── │
│ （选中类型后展开最小表单，回车即存）           │
│  Note:      一行文本 → Save                   │
│  Symptom:   文本（+可选 轻/中/重）→ Save       │
│  Weight:    数字键盘 + kg/lb → Save           │
│  Medication:名称+剂量+频次 → Save（建档+可选入今日任务）│
│  Photo:     拍照/选图 → 压缩上传 → 一句话(可选)  │
└──────────────────┘
```

- 所有类型默认"现在"为发生时间，可事后在详情改——5 秒纪律的实现。

## 6. /s/[token]（公开只读，免注册）

**Summary 视图（kind=summary，打印友好）：**

```text
│ MILO · VET SUMMARY             │
│ 金毛 · 7y · Prepared by family · Aug 17 │
│                                │
│ Why we're here    家人一句话    │
│ Allergies         …            │
│ Medication        Apoquel 16mg daily │
│ Recent changes    近30天症状/体重事件列表 │
│ Visits & weight   最近2次就诊 + 体重趋势行 │
│                                │
│ read-only · 71h 后过期 · powered by PLANET │
```

**Sitter 视图（kind=sitter）：**

```text
│ CARING FOR MILO · shared by Devin · expires Sunday │
│                                │
│ Today's care                   │
│  08:00 Breakfast + Apoquel ✓   │
│  18:30 Evening walk (gentle)   │
│                                │
│ If something feels wrong       │
│  Call Devin first → Greenwoods Vet │
│  Authorized: 李萍               │
│                                │
│ powered by PLANET              │
```

- 无导航、无登录、无 cookie 横幅；过期/撤销页只写"链接已失效，找分享人要新链接"。

## 布局总原则（从评估报告导出）

1. 每屏只有一个主操作（Today=完成任务；Timeline=快速记录；Pet=邀请）；
2. 记录路径任何入口 ≤2 次点击到达（全局＋ 一次、聚焦输入框零次）；
3. 完成与记录永远带人名和时间，UI 不允许"无名氏"状态出现；
4. 空状态即引导（模板卡、示例行），不出现纯空白页。

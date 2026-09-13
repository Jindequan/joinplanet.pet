# PLANET App — UX 规格与方法论

状态：2026-09-14 · 与 [PRODUCT.md](../../docs/PRODUCT.md) 对齐

本文是原生 App 每页「展示什么、如何展示、支持什么操作、交互与动效」的设计依据。视觉 token 以 `mobile-v3` 为冻结基准；交互以本文为准。

---

## 1. 方法论框架

### 1.1 页面准入问题（Jobs-to-be-Done）

每个页面必须能在一句话内回答 PRODUCT 定义的 Tab/路由问题。若不能，该页不应存在或应合并。

| 层级 | 问题 |
|------|------|
| 今天 | 此刻要为宝贝做什么？ |
| 请求 | 谁在等我回应，接下来谁来做？ |
| 记录 | 我们一起陪它经历了什么？ |
| 宠物 | 宝贝是谁、怎么照护？ |
| 更多 | 我们是谁、怎么在一起？ |

次级路由继承父问题的一个子任务，不得引入平行主问题。

### 1.2 信息架构原则

1. **单一主焦点（Visual Hierarchy）** — 每屏只有一个「主对象」：Today 的下一件待办、Timeline 的当日分组、Pet 的档案 hero、Family 的名称与角色。其余为次级。
2. **渐进披露（Progressive Disclosure）** — 详情、备注、历史日期、危险操作默认折叠或置于二级入口；首屏只呈现决策所需信息。
3. **邻近与相似（Gestalt）** — 同一任务的操作（完成/跳过）同组；跨宠物信息用 avatar + 名称锚定，不用额外标签堆砌。
4. **选择成本（Hick's Law）** — 首屏可点选项 ≤7；更多选项进 cascade / sheet / 子页。
5. **目标尺寸（Fitts's Law）** — 主操作最小 44×44pt，Today「完成」为全宽主按钮；destructive 操作远离主路径。

### 1.3 交互反馈

| 事件 | 反馈 |
|------|------|
| 主操作成功 | 乐观 UI → 轻触觉 `success` → Toast 一句 |
| 可逆操作 | 原位置撤销，无需进详情 |
| 网络失败 | 结构保留 + 离线队列条 + 重试 |
|  destructive | ConfirmDialog + 输入确认（账户删除） |
| 加载 | 骨架或居中 spinner，不空白闪屏 |

### 1.4 动效语义（Motion）

遵循 iOS HIG「有意义、不拖慢」与 Material Motion 三轴：

| 类型 | 用途 | Token |
|------|------|-------|
| **Enter** | 区块首次出现 | `motion.enter` 220ms，opacity 0→1 + translateY 8→0 |
| **Press** | 可点击 affordance | scale 0.97，`motion.fast` 140ms |
| **Emphasis** | 完成/状态切换 | 进度条宽度 spring；卡片 opacity 0.65 表已完成 |
| **Continuity** | Sheet / Modal | 自底滑入，backdrop fade |

禁止：无意义的 bounce、全页 parallax、>400ms 阻塞交互的动画。

### 1.5 布局模式

```
┌─ Tab 页 ─────────────────────────┐
│ TabPageHero（eyebrow + title + subtitle + trailing）│
│ ScopeCascade（多家庭/多宠物时）   │
│ Extension 条（Handoff 等，可选）    │
│ ── 主内容区（1 焦点 + 列表） ──   │
│ FAB（仅当无 header 主操作时）      │
└──────────────────────────────────┘

┌─ Stack 子页 ─────────────────────┐
│ BackHeader + PageHeader           │
│ 分区 MoreGroup / Card             │
└──────────────────────────────────┘
```

---

## 2. 五项主入口

### 2.1 今天 `TodayScreen`

**问题：** 此刻要为宝贝做什么？

| 区域 | 内容 | 依据 |
|------|------|------|
| Hero | 日期 eyebrow +「今天」+ 动态 subtitle | 时间锚定 + 进度感知 |
| Trailing | 环形进度或日历入口 | 有任务时进度优先（目标可视化） |
| Scope | ScopeCascade | 多实体时必须可见范围 |
| 协作状态 | 请求/责任状态摘要 | 保留当前任务上下文，不复制请求收件箱 |
| 主焦点 | FeatureCard：下一件待办 | 单焦点，Fitts 大按钮 |
| 次级 | UpcomingRow 列表 | 按时间序，非 chip 横滑 |
| 空态 | 未完成开通 → SetupJourney（唯一教练，登录后直接落今天）；今天无安排 / 历史无记录 → EmptyState |

**操作：** 完成（toggle/undo）、跳过（sheet：标记跳过 / 这次不做）、日期切换（周条 + 更早 picker）、离线同步条点击重试；在历史日期记录事件或安排临时照护时，写入日期沿用当前所选日，并在确认按钮明确显示该日期。

**动效：** FeatureCard enter；完成时 `haptic success` + 乐观状态；进度条 width spring。

### 2.2 请求 `RequestsScreen`

**问题：** 谁在等我回应，接下来谁来做？

| 区域 | 内容 |
|------|------|
| Hero | eyebrow「协作」+ title「请求」+ 说明 |
| Scope | ScopeCascade，限定当前家庭或宠物 |
| 主体 | 单项请求、批量交班、继续安排和待同步状态 |
| 空态 | 没有家庭时引导去家庭管理；没有请求时明确说明当前没有待回应事项 |

**操作：** 我来做、我也不行、给其他人；进入 `/requests/[requestId]` 查看同一条责任链；批量交班按事项选择后统一处理。

**规则：** 请求中心是照护协作的唯一收件箱；Today 只显示事项上的请求状态，不复制另一份请求列表。

### 2.3 时间线 `TimelineScreen`

**问题：** 我们一起陪它经历了什么？

| 区域 | 内容 |
|------|------|
| Hero | eyebrow「记录」+ title「时间线」+ subtitle 条数/范围 |
| Scope | ScopeCascade（非 pet 路由锁定时） |
| 主体 | 按日分组 heading + EventCard 流 |
| FAB | 「记一笔」→ EventComposer |

**操作：** 分页加载、编辑、删除（confirm）、记一笔（composer sheet）。

**动效：** 分组 stagger enter；FAB press scale；composer bottom sheet。

### 2.4 宠物 `PetsScreen`

**问题：** 宝贝是谁、怎么照护？

| 区域 | 内容 |
|------|------|
| Hero | eyebrow「工作区」+ title「宠物」+ subtitle（数量/待办） |
| Trailing | 「添加」按钮（唯一添加入口） |
| 列表 | 行：avatar 64 + 名 + 品种/年龄 + 状态 + chevron |
| 次级 | 已删除折叠区 |

**操作：** 行点击一律进宠物工作区；添加 → `/pets/new` 整页。待办数仅作状态，Today 入口是档案上的 `PendingCareBanner`。

**交互规则：** 去掉与 header 重复的 FAB；有待办时行上显示待办数，点击仍进工作区。

### 2.4 更多 `MoreScreen`

**问题：** 我们是谁、怎么在一起？

| 区域 | 内容 |
|------|------|
| Identity | 渐变身份卡（名 + 邮箱） |
| 管理 | 家庭 |
| 监测 | 趋势 |
| 配置 | 设置 |
| 账号 | 显示名、语言 |
| 危险 | 退出 / 删除账户 |

**操作：** 内联编辑 + sheet 选择器；destructive 二次确认。默认家庭/宠物在设置页。

---

## 3. Stack 子页规格（摘要）

### 3.1 认证 `AuthScreen`
- 两步：邮箱 → 验证码；自动提交 6 位；dev code 预填。
- 单栏居中，品牌 display + 说明一句。

### 3.2 宠物工作区 `PetDetailScreen`
- Hero：大 avatar + 名 + 物种/年龄。
- Tab 条只留 **档案 / 照护**。用药史并入照护；分享并入档案，不再占工作区 Tab。
- 档案：基本信息（中文生日、绝育）+ 健康档案 + 时间线入口 + 对外分享；体重行打开时间线体重记录。趋势只从「更多」进入。今日待办只留 `PendingCareBanner`。
- 照护：上方计划（模板「定点给药」生成 Today），下方用药史账本。二者同页、不混名。快捷模板只预填表单，必须点「创建计划」后才写入，避免误触改变周期安排。
- 分享：`care_card` 为今日行动；`summary` 必须选 30/90/180/365 天范围。负责人只影响 Today 排序，不承诺推送。
- 危险：归档 / 删除在底部，远离主路径。转移所有权在档案「记录与对外」。
- 旧路由 `/medications`、`/sharing` 重定向到照护 / 档案。

### 3.3 家庭 `FamiliesScreen` / `FamilyDetailScreen`
- 列表：单一「新建」入口（header action）+ 虚线「收到邀请码」行；行内只用 list 接口数据（名 + 角色 · 时区城市），不为每行额外请求统计。
- 详情：Hero（名 + 你是{角色} · 时区城市 + 成员/宠物计数 + 主按钮）→ 成员 → 宠物 → 管理 → 危险区。没宠物时主按钮是「添加宠物」，有宠物才是「邀请成员」。
- 邀请：`InviteSheet` 大号邀请码 + 系统分享 + 复制；打开 sheet 不自动生成新码。创建家庭后进入添加宠物（3 分钟主路径），不自动弹邀请。邀请码已播种缓存，有宠物后从详情邀请。
- 邀请码语义：服务端只存哈希，无法回读明文 → 最近生成的码缓存在管理员设备当前会话（原生 SecureStore，Web sessionStorage，29 天）；打开 sheet 展示缓存码、**查看无副作用**，「重新生成」是显式操作并明示旧码立即失效。创建家庭返回的码直接播种缓存，不重复生成；缓存写失败不能把已创建家庭伪装成失败。
- 创建：名称 + `TimezoneField`（行内显示当前值，点开可搜索的完整时区 sheet）。
- 加入：邀请码固定 10 位，输满自动预览（防抖 450ms + 竞态保护，输入中途不报错）；预览 API 出于隐私只返回照护上下文（邀请人名/宠物名/加入权限，不含家庭名）→ 预览卡显示邀请人、宠物和「加入后权限：可以参与照护 / 只查看」，主按钮「加入 {邀请人} 的家庭」。
- 空态：教育 copy + 新建/加入双路径。
- 术语：owner 统一叫「家庭管理员」（terminology.ts），全站不再出现「圈主」。

### 3.4 趋势 `TrendsScreen`
- Hero + Scope + 范围 chips（1m/3m/6m/1y）；BackHeader 承担说明，不再叠 PageHeader。
- 完成率 card + 按 pet 体重 chart；空态解释需要体重记录。

### 3.5 设置系 `SettingsScreen` / notifications / deleted-families
- PageHeader + MoreGroup 分区；默认家庭/宠物；推送未开通时不展示通知入口（避免死开关）。已删除家庭只在设置恢复，家庭列表只链过去。
- 通知偏好始终按家庭读取和写入；多个家庭且未选定时只显示“先选择家庭”，不渲染可写开关，避免把偏好误写到空家庭范围。

### 3.6 表单页（new/edit/join/transfer/assignments）
- BackHeader + 单列表单 + 底部主提交；字段按填写顺序，必填在前；push 页不再放「取消」（BackHeader 已有返回）。添加宠物只有整页，不用 sheet。
- 单选统一 `ChoiceChips`（触觉 + radio 语义 + 按压态）；日期统一 `DateField`（原生选择器，iOS spinner sheet）；宠物物种用 `SpeciesPicker` 插画大卡。
- 只有一个候选时不渲染选择器（如仅一个家庭时创建宠物直接显示归属说明）。
- 高后果选择（转移宠物 / 转让管理员）用带头像/图标的候选卡片而非小 chip，确认按钮带上所选对象名。
- 生成的一次性凭证（分享链接 / 邀请码）必须提供系统分享 + 复制，不允许只出现在 Toast。

### 3.7 公开分享 `PublicShareScreen`
- 只读快照；无编辑；过期/撤销态明确。

---

## 4. 组件契约

| 组件 | 用途 |
|------|------|
| `TabPageHero` | 五项主入口统一页头 |
| `PageHeader` | Stack 子页标题区 |
| `BackHeader` | 返回 + 标题 |
| `ScopeCascade` | All/Family/Pet 三级 cascade |
| `GlassBar` | 与底栏一致的毛玻璃面 |
| `PressableScale` | 统一 press 微交互 |
| `FadeInView` | 区块 enter |
| `EmptyState` | 空态三要素：标题/说明/行动 |
| `ModalSheet` | 表单与选择器；宿主屏幕失焦自动关闭（RN Modal 挂窗口层，否则深链/推送跳转后会盖住新页面） |
| `ConfirmDialog` | destructive 确认 |

---

## 5. 验收清单

- [x] 每 Tab 能一句话回答准入问题（与 `docs/PRODUCT.md` 五项准入问题及 `TabPageHero` 文案一致）
- [x] 无重复主操作入口（Today 次要工具、协作替代动作和 More 重复入口均已收束；由前端产品契约守门）
- [x] 多家庭/多宠物页有 `ScopeCascade`（Today、请求、记录、宠物和趋势等范围页统一使用）
- [x] 主操作 ≥44pt，destructive 有 confirm（共享组件与页面级契约守门覆盖）
- [x] 完成/错误有触觉或 Toast（网络失败保留结构并提供重试；关键完成动作有 success haptic）
- [x] 首屏 enter 动效 ≤220ms，不阻塞交互（`motion.normal=220`，`FadeInView` 支持系统 reduced-motion；交互不依赖动画完成）
- [x] 对照 mobile-v3 色彩与圆角 token（统一主题 token，页面不再自建视觉变量）

2026-09-14 验收证据：前端产品契约 34/34、Playwright 桌面/移动 E2E 62/62、TypeScript、Lint、Expo Doctor 和 Web export 均通过；E2E 额外覆盖能力接口与激活计划读取连续网络失败后的可见重试、通知能力加载态不误报为“不支持”，以及认证服务 404 的可恢复提示；iOS Simulator 已完成登录键盘态与主入口首屏复核，系统通知中心自定义动作按钮仍因当前 SpringBoard 不暴露而单列为环境阻塞。
2026-09-14 设置页补充：通知能力读取中显示任务级加载提示，设置摘要同步显示“正在读取通知能力…”，避免缓存默认值造成错误的“不提供设备推送”判断；相关桌面/移动回归与生产 Web 发布 `dpl_e8YLFq2rzemRfCzwB57erjFa7nFs` 通过。
2026-09-14 设置页描述同步：能力读取中 PageHeader 与摘要保持同一状态文案；TypeScript、Lint、相关 E2E 4/4 和生产 Web 发布 `dpl_6zSVGDMS3BcQhfCGWx8YWMpfvMq3` 通过。

---

## 7. 全路由矩阵

| 路由 | 准入子问题 | 主焦点 | 主操作 | 动效 |
|------|-----------|--------|--------|------|
| `auth` | 我是谁 | 品牌 display + 单字段 | 继续 / 验证 | orbit 装饰静态 |
| `(tabs)/index` | 今天要做什么 | FeatureCard | 完成/跳过 | enter stagger + 完成 haptic |
| `(tabs)/requests` | 谁在等我回应 | 请求卡片 / 责任链 | 我来做 / 我也不行 / 给其他人 | 状态反馈 + 请求链连续性 |
| `(tabs)/timeline` | 经历了什么 | 日分组 EventCard | 记一笔 FAB | 分组 stagger + FAB scale |
| `(tabs)/pets` | 宝贝是谁 | Pet 行列表 | 添加 / 进工作区 | 行 stagger + scale |
| `(tabs)/more` | 我们是谁 | Identity 卡 | 分区导航 | 区块 stagger |
| `trends` | 长期趋势 | 完成率 + 体重图 | 范围切换 | 内容 fade-in |
| `families/*` | 家庭治理 | 家庭名/成员 | 新建/邀请/转移 | 行 press opacity |
| `pets/[id]/*` | 怎么照护 | Hero + Tab | Tab 切换 / 编辑 | Tab segmented |
| `settings/*` | 偏好与数据 | MoreGroup | toggle / 链接 | sheet 滑入 |
| `share/[token]` | 只读快照 | 照护卡内容 | 无写操作 | 静态 |

### 7.1 禁止模式（反模式清单）

- 同一操作双入口（header 按钮 + FAB 同时「添加」）
- 首屏 >3 层标题嵌套
- 无 scope 的多实体列表
- 完成操作无反馈（无乐观 UI / 无 toast / 无 haptic）
- 全宽 chip 横滑替代 cascade 选 scope
- 动效 >400ms 或阻塞手势

---

## 8. 实现状态

| 模块 | 规格 | 实现 |
|------|------|------|
| 方法论 + Tab 规格 | ✅ | ✅ |
| Motion 基础设施 | ✅ | ✅ |
| 五项主入口 TabPageHero | ✅ | ✅ |
| Today 动效/触觉 | ✅ | ✅ |
| Timeline/Pets 去冗余 | ✅ | ✅ |
| Trends 布局 | ✅ | ✅ |
| Stack 子页逐项对齐 | ✅ | ✅ |
| 组件层（Care/Meds/Composer/Setup/Handoff/EventCard） | ✅ | ✅ |
| ModalSheet slide 动效 | ✅ | ✅ |
| 共享组件（Button/MoreRow/BackHeader/TextField/ProgressBar） | ✅ | ✅ |
| Timeline FlashList 虚拟列表 + 滚动加载 | ✅ | ✅ |
| Android 毛玻璃/动效调优 | ✅ | ✅ |
2026-09-14 运行时配置复核：API 与公共站点基址会去除尾斜杠，桌面/移动尾斜杠配置用例 2/2、全量 E2E 62/62、前端契约 34/34、TypeScript 与 Lint 通过；生产 Web 发布 `dpl_9c6D3MfXaZZhYT5AnqN3xprmyCyo` Ready。

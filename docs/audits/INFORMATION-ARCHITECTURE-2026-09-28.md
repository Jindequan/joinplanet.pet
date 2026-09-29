# 信息架构审计 2026-09-28

**问题**：功能配置是否合理？入口与功能是否重复冗杂？是否一目了然、易用好上手？
**方法**：五路只读外派（Today/More/Trends · 宠物域 9 页 · 家庭/账户/设置 13 页 · 请求/记录/分享 7 面 · 跨页入口重复矩阵 grep 驱动），本体逐条复核高价值结论。
**范围**：`APP/` 37 个路由。**不审**：视觉/设计语言（间距字号几何，已由 `DESIGN-LANGUAGE-CONSISTENCY-2026-09-25.md` 8 批 31 页裁决落地）、已在 `DEFECT-LEDGER.md` 登记的功能缺陷。标 `[新]` = 本轮首见，`[已登记]` = 台账已有。

---

## 一、总判定

**骨架成立，四类残留。** 对象工作区模型（列表 → 工作区 → 子页）是对的，五 Tab 分工清楚，无内容墙、无第二套任务系统、无与「更多」页重复的 ⋯ 菜单（`grep` 零残留，`BackHeader.menu` 已成死 prop 但仍有 4 处传参）。

残留集中在四类，按影响排序：

| # | 结构性问题 | 性质 | 严重度 |
|---|---|---|---|
| 1 | **「记录」有两个家** —— 宠物域保留完整第二个 Records 面，而全局 Records 不接受 `pet_id`，单宠记录唯一入口在 Trends（4 击，全域最差触达） | 归属错/跨页重复 | 高 |
| 2 | **请求类对象无出口** —— 照护请求与交班批次发出去收不回来（前后端均无撤回端点），而共享与转移都有；且「请求」一词覆盖 6 种对象、4 套交互纪律 | 缺动词 + 术语 | 高 |
| 3 | **家庭信息在宠物域泛滥** —— 详情页同屏三份，成员 roster 三份副本且邮箱披露口径互相矛盾 | 页内冗杂/跨页重复 | 高 |
| 4 | **教学文案回潮** —— 已判死的常驻教学/祈使句至少 14 处重新长回来 | 违例 | 中 |

外加三类归属矛盾（用药史、恢复已删对象、Care 路由双职）与一批 B 类冗余入口（4 处）、2 个死入口、1 个死组件族。

---

## 二、四个结构性问题（详证）

### 2.1 「记录」有两个家

- 宠物域保留 `/pets/[petId]/timeline`（`APP/app/pets/[petId]/timeline.tsx:5-8`），渲染的是与全局 Records **同一个组件**的锁定态（`APP/src/features/timeline/screen.tsx:228` `lockedToRoutePet`），功能 100% 重复，仅 scope 锁死。
- **宠物工作区内确实零 record 入口**（`src/features/pets/` + `app/pets/` grep `/records`、`push('...timeline')` 零命中；`pet-overview-tab.tsx:113-116` 注释留痕），法条在页内已落实。
- 但**全局 Records 不接受 `pet_id`**：`timeline/screen.tsx:74-80` 只解析 `compose / family_id / familyId / focus_date / focus_task_id`。因此「按 scope 选择器过滤到某只宠物」**只能手动、不能深链**。
- 结果是单宠记录的唯一可达路径是 Trends 每宠卡片的 `View records`（`trends/screen.tsx:220`，全仓唯一 push 点）→ 从宠物详情出发要 5 击（返回 → 更多 → Trends → 卡片 → 记录）。

**建议（二选一，需 founder 裁）**
- **A（推荐）**：全局 Records 加 `pet_id` 深链支持（`screen.tsx:74-80` 加一个参数），Trends 的按钮改指 `/(tabs)/timeline?pet_id=…`，删除 `/pets/[petId]/timeline` 路由与 `lockedToRoutePet` 整支（约 200 行 + 专属页头 + 专属空态 CTA），`_layout.tsx:139` 同步删。同时收敛全域最差触达。
- B：承认单宠记录页是第二个正典面 —— 与现行法条冲突，不推荐。

> 旁证：`APP-PAGE-MAP.md:121` 仍记「回到具体宠物记录」，与「记录唯一入口」法条冲突，本问题的 Trends 按钮即源于此条旧口径。

### 2.2 请求类对象无出口，且术语覆盖 6 种对象

**（a）无出口状态（已本体复核）**：`planet-api/internal/modules/carecoord/http.go:14-33` 全部 18 条路由**零 cancel/withdraw**。对照：转移有 `DELETE /api/v1/transfers/{id}`（`transfers/http.go:18`）、共享有 `POST /api/v1/pet-share-requests/{id}/cancel`（`petshares/http.go:16`）。前端 client 同样无对应方法（`core/api/planet-api.ts:609-690`）。
→ 发起人发出照护请求或交班批次后**无法撤回**，只能等对方回应或等过期。这正是 `PRODUCT.md:212` 禁止的「没有出口的状态」。

**（b）「请求」覆盖 6 种对象**：照护请求、交班批次、宠物共享、宠物转移、家庭 admin 转移、默认负责人（值班）。前 3 种在请求中心（3 种卡片 3 种交互），后 3 种在家庭/宠物域。用户问「还有谁在等我」时，页头只答前 3 类中的 2 类，底栏徽标只答 2 类（L91 已登记）。

**（c）四类请求四套交互纪律**：共享＝行内即点按钮；单条照护请求＝整卡可点、动作进详情；批次＝**卡体不可点**、只有右上 Details 文字链、动作进详情；转移＝icon-only 钮 + ConfirmDialog。同一语义（回应一个家人发来的请求）有 4 套确认强度。
→ 建议把「决策代价分档」写成法条（何时行内即点、何时进详情、何时必须确认弹层）。

**（d）「继续转交」同屏两个钮**（`requests/[requestId]`）：`Ask someone else instead`（`panel.tsx:1296-1306`）与行尾 `Delegate` 文本链（`:1339-1353`）回调落到同一个 `setComposer`，差别仅 `kind` 推导 → 用户看到两个钮、一个后果。

### 2.3 家庭信息在宠物域泛滥

**同屏三份**（宠物详情，多家庭宠物）：
1. hero 家庭行（`pet-workspace-hero.tsx:98-101`）
2. `FamilyContextCard` 家庭 chips + 教学句（`detail-screen.tsx:316-327`）
3. `FamilyLinksSection` 关联家庭行卡（`pet-overview-tab.tsx:172-177` / `pet-family-links.tsx:111-148`）

语义分别是「当前照护家庭」「可切换家庭」「已关联家庭」，**必须解释才懂差别**。本域「需要解释的元素」共约 30 项，其中 9 项与家庭关系有关。

**成员 roster 三份副本，披露口径互相矛盾**：
| 位置 | 邮箱 | 说明 |
|---|---|---|
| 家庭详情（正典，`family-groups.tsx:25-65`） | **不进扫读层** | 刻意裁掉，`family-groups.tsx:59-63` |
| 宠物页 `FamilyLinksSection`（只读副本，`pet-family-links.tsx:149-183`） | 无 | 注释自称「只留身份句」（`:124-125`）却渲染了整个 roster —— **注释与实现矛盾** |
| 计划负责人页（`assignments-screen.tsx:234-236`） | **进扫读层** | 与家庭页口径相反 |

**建议**：roster 只在家庭页（正典）；宠物页只留「去家庭」链接。家庭关系收敛为一个家。

### 2.4 教学文案回潮

`PRODUCT`/`E1-E8` 已判「常驻教学副题一律删」，但下列至少 14 处重新存在（`[新]`）：

| 位置 | 文案性质 | 证据 |
|---|---|---|
| 家庭详情 成员/宠物/管理组 | **5 条祈使句教流程**（"Add a pet first, then invite members…" 等） | `families.json:41,46,52,54,56`；`family-groups.tsx:99-105`；`detail-screen.tsx:328-335` |
| 家庭时区编辑弹层 | `timezoneEditHint` —— **建家页同款已删，此处回潮** | `family-sheets.tsx:70` vs `form-screen.tsx:128-129` |
| 照护页 三态权限说明句 | 常驻句子（readOnly/needOwner/archived） | `care-section.tsx:200-206` |
| 用药段 两态说明句 | 同上 | `medications-section.tsx:95-99` |
| 转移页 | 页头副题 + 正文 `transferVsShareBody` **同页两句教学** | `transfer-screen.tsx:176,229-231` |
| 分享段 | `sharingIntro` / `readOnlyShareBody` / `allFamiliesLinked` | `sharing-section.tsx:172,88-91` |
| 记录页 只读范围 | 两行常驻说明 | `timeline/screen.tsx:658-668` |
| 批次卡 + 批次 composer | 教学句 + 标题下第二句 | `batch-panel.tsx:541-543,1047-1049` |
| 公开分享页 | 3 处免责/教学句 | `public-share-screen.tsx:238,389` |
| 建宠 setup 卡 | 祈使教学句（称 batch1 已裁保留卡点说明，**存疑待裁**） | `today.json:138,140,143`；`setup-journey.tsx:92-95` |
| 负责人页 | viewer 说明 / 无可指派成员 | `assignments-screen.tsx:307-309,335-336` |
| 多家庭选择器 | `pets.multiFamilyCaption` | `pet-workspace-hero.tsx:182-184` |
| 宠物列表三段 | 两句纯教学段说明 | `pets/screen.tsx:232-235` |
| auth 邮件表单 | 营销句 `no password to remember` —— **批8 已从 hero 删除同句** | `auth.json:25` vs `auth/screen.tsx:305-309` 注释 |

---

## 三、三类归属矛盾

### 3.1 用药史住在照护计划页，权限却来自宠物档案

- 段名 `Medication history`（`medications-section.tsx:94`），权限参数 `canManageRecords`（`:33`）。
- 同屏的计划段权限参数是 `canManagePlans`（`care-section.tsx:55`）。
- 详情页注释自己写明语义：`detail-screen.tsx:191-193`「**Medication history is part of the Pet record, not a Family task**」。
→ 段名（history）、权限（record）、所在页（plan）三者互相矛盾；同一屏两种权限体系，用户无法判断"为什么这个能改那个不能"。
**建议**：二选一 ——（a）并入 Overview 健康档案卡（与体重/过敏同族，记录语义一致，推荐）；（b）保留在 Care 但正名为「用药与计划」并删掉 history 措辞。

### 3.2 恢复已删对象两套结构

| 对象 | 住处 | 形态 |
|---|---|---|
| 已删家庭 | `/settings/deleted-families`（独立路由） | 设置族；只有删除日期，**无剩余保护期天数**（宠物侧有） |
| 已删宠物 | 宠物列表底部 toggle 内折叠（`pets/screen.tsx:343-405`） | 业务列表族；含 `%{days} days left` |
| 归档宠物恢复 | 宠物详情危险区（`pet-overview-tab.tsx:187-193`） | 第三个层级 |

同一「30 天窗口 + 恢复」能力，三种结构、三个层级、两套字典键。
**建议**：立法统一（回收站统一进 Settings，或统一在对象列表内折叠），并统一键名族；家庭侧补剩余天数。

### 3.3 照护路由一页两件事（+ 悬空 Step 3）

`/pets/[petId]/care` 同时是：(a) 工作区 Care 页签（`care.tsx:24`）；(b) 建宠后的照护设置向导，6 个业务态分支（`care.tsx:40-209`），靠 `setup=1` 开关切两页。
且向导页头有 `Step 3` eyebrow（`care.tsx:95,105,125…`），而激活流与建宠流都不显示步骤号（`activation/screen.tsx:88-105`、`setup-journey.tsx:43-77`）→ **伪进度**。
**建议**：向导搬去 `/activation` 域（那里已是同流程宿主，`setup-journey.tsx:60` 就是它的调用方），care 路由只留工作区页签。

---

## 四、入口重复矩阵

**方法**：`grep -rn "router\.push\|router\.replace\|<Link\|href="` 全仓 138 处命中逐条归类。
**判定口径**：**A 合理多入口**（不同上下文各有其位）／**B 冗余重复**（同上下文两个入口，或某个无人会走）／**C 口径不一**（同一件事两处名称/行为不同）。

### 4.1 判定为 B 的清单（建议删一个）

| # | 能力 | 入口 | 为什么是冗余 |
|---|---|---|---|
| B1 | 编辑宠物档案 | 页头 gear（`detail-screen.tsx:288-297`）↔ 卡内按钮（`pet-overview-tab.tsx:246-266`） | **空档案态两者同时可见**（`profileHasContent` 与卡内空态判定同口径）。注意：`profile-helpers.ts:49-52` 注释显示这是**有意**保留（"空档案保留 gear"）——但两个入口同屏同目标，按「职责明确」仍属冗余，**需 founder 裁** |
| B2 | 认领「我来做」 | 行内 pill（`cards.tsx:583`）↔ 同对象的 ArrangeSheet 项（`cards.tsx:134`） | 两者绑**同一回调** `handlers.onClaim`，同一时刻同一动作两个入口。注释 `cards.tsx:374-377` 表明行内钮是后补的 affordance 修复，菜单项是上一版遗留 |
| B3 | 家庭详情「添加宠物」 | hero 文字链（`family-hero.tsx:137-140`）↔ 同屏 Pets 组空行（`detail-screen.tsx:329-335`） | owner 且零宠时两条同时可见，**目标字符串完全相同** |
| B4 | 恢复已删对象 | 见 §3.2 | 同能力三层级 |

### 4.2 判定为 C 的清单（口径需统一）

| # | 事项 | 不一致处 |
|---|---|---|
| C1 | 「我来做」 | `core.careAccept`（en "I'll do it"）**同时**是「认领」与「接受」两个语义；而「认领」本身在 Today 走 `core.careAccept`、在请求详情走 `care.claimAction` —— 拆分意图写在注释里（`panel.tsx:1308-1310`），但**两个键五语文案逐字相同**，只制造了漂移面 |
| C2 | 邀请 CTA | 三条入口直开邀请弹层（带 `?invite=1`），`assignments-screen.tsx:317` **不带**，只落到家庭页让用户再找一次；文案也不同源（`inviteMembers` vs `pets.inviteMembersCta`） |
| C3 | 恢复已删 | 见 §3.2 |
| C4 | `deleted` 一词两义 | `/account/deleted` = 账号消亡终态；`/settings/deleted-families`、`pets.showDeletedPets` = 可恢复回收站 |
| C5 | 「谁在负责」 | `handoff` 一词覆盖默认负责人（`core.handoff*`）、批量交班、单件转交三种能力；默认负责人区的按钮文案直接用 "I'll do it"（`terminology.ts:56-58`），但该区标题是 "Default owner"，语义不成立 |

### 4.3 判定为 A 的（不要改，防下轮误报）

进入 Today（12 入口，仅 L80 那条失效）｜建宠 7 入口｜建家 6｜加入家庭 5｜进入照护页 5｜配额数字 3（预检阻断原因，法条允许，且 `humanBytes`/`USAGE_RESOURCE_LABELS` 单源）｜请求响应 3｜批量交班响应 3｜转移 2（第二处是「撤回」的家）｜单件转交 2（发起 Today / 续链 Requests，`today-rows.ts:239-250` 注释已立法）｜通知设置 2（深链预选家庭）｜记录新增 2（条件互斥，注释自证）｜`/requests/[requestId]` 与 `/handoffs/[batchId]` 渲染同组件但详情页额外提供请求链，构成有效增量。

---

## 五、死入口 / 死组件

| 对象 | 状态 | 证据 |
|---|---|---|
| `/pets/[petId]/medications` | **死入口**：纯 Redirect 到 care，**仍注册**（`_layout.tsx:136`），`src/` 内零导航引用（仅 e2e 截图清单） | `app/pets/[petId]/medications.tsx:5` |
| `/pets/[petId]/sharing` | **死入口**：纯 Redirect 到详情，仍注册（`_layout.tsx:137`），同上 | `app/pets/[petId]/sharing.tsx:5` |
| `src/features/digest/digest-overview.tsx` | **死组件**：import 反查零命中，组件名仅剩"已删除"注释 | `digest-overview.tsx:36`；`today-lists.tsx:303` |
| ↳ 连带孤儿 | 整个 `digest` i18n 命名空间（22 行 × 5 语）、`planetApi.families.digest`、`queryKeys.digest` 唯一消费方都是该死组件 | `i18n/*/digest.json`；`planet-api.ts:442`；`keys.ts:51` |
| `BackHeader.menu` | **死 prop**：签名有、实现丢弃，但仍有 4 处传参 | `back-header.tsx:9-29`；`form-screen.tsx:285`、`activation/screen.tsx:49,58,91` |
| `pets.guidedSubtitle` + 6 处 `?guided=1` | 孤儿键 + 死参数（L73/L74 已登记，不重复） | — |

**对照**：L73 所述「垫片路由删除」完成三分之二 —— `activation/welcome`、`activation/setup-care`、`(tabs)/family` 三个已彻底消失，上述两个 pets 垫片仍存活。

---

## 六、其余逐页问题（摘）

**Today**：圆环 n/m 与三段段头计数**完全互推**（二选一即可）；瞬态拦截态同屏三处说同一件事（`today-screen-states.tsx:19-26`）；「有请求待回应」共 4 个呈现面；宠物概览与家庭页 `FamilyTodayCard` 同题（该删一份）；一次性照护只能在 Today 建（宠物照护页无 `once`）；今日全域无直达宠物工作区入口（头像 decorative）；只读范围横幅无动作。

**More**：`Trends` 行挂在 `Manage` 组下（组名不覆盖只读报告）；`families` 查询唯一消费者是行间错误条（伪依赖）；**me 失败即整页错误态 → 三个静态目的地全部不可达**。

**Trends**：顶部完成率（`careStats`，按时口径）与每卡计数（`care_task_completed` 事件过滤）**两套口径同屏不可对账**（已复核 `screen.tsx:80,91` vs `:309,313`）；空态 "in this scope" 引用**已删除的 scope 控件**；`View records` 是单宠记录第二入口（见 §2.1）；曲线无 x 轴、delta 无区间锚。

**宠物域**：`Care` 页模板网格**位置随状态翻转**（有/无计划两个位置）；「Custom」icon-only 且 label 是行话；单次计划**不可编辑**（只能删了重建）；计划描述字段创建侧折叠/编辑侧常显；计划卡与用药行同屏复述用药名+剂量；导出是全域唯一出口却住在宠物管理组。

**家庭域**：`New` 按钮在标题变成 "N families" 后失去对象；`Records` 组名与 `Family records` 行名近义；`Transfer admin` vs `Pet ownership transfers` 需解释；通知偏好**一个能力三套入口机制**（settings 行 + 家庭页 Manage 行 + 页内家庭选择器）；成员 0 分支不可达（死码）；只读成员同屏两句身份。

**账户/设置**：`Usage` 行塞进 `Profile` 组（用量≠资料）；`Plan limits` 用语暗示付费档（MVP 不做付费）；`Quick links` 组名无语义（把通知偏好与数据恢复拼一组）；`Deleted families` 是家庭数据恢复却住 settings；**无用户头像修改**；**无隐私/条款/版本入口**（上线合规面空缺）。

**请求中心**：共享分区**不受视图筛选约束**，而页头计数按筛选归零 → 选「Sent by me」时屏上仍有可 Accept 的共享请求、页头 waiting=0；「我发出的」批次在活动/历史切分**之后**再分组 → 同一 batch 可能被切成两张卡；请求中心**没有发起入口**（发起只在 Today）；批次列表卡不可点整卡（单条卡可点）；可达性洞：**今日待办全部逾期时批量交班入口随 Up next 段头消失**，而数据侧仍有 ≥2 件可交班。

**记录域**（重设计判定：**方向对，是这轮最好的一处改版** —— 一行一事实、行卡零按钮、编辑/删除收进详情、显式路径闭合）：遗留五处 —— 左滑删除**零可视提示**（原生端只有手势，读屏用户不可发现）；web 右键菜单退化成**单选项**仍保留 ⋯ 形态；页头 `N records` 在有下一页时**整体消失**；只读范围两行教学句；详情页头复用列表页名 "Records" 无单数口径。

**分享/邀请**：分享行**不可再复制链接**（复制只在刚创建的回执卡上），创建成功态也**没有撤销**（撤销只在列表行）；归档宠不撤匿名链接（L96）；邀请**双路由**同功能（`/invite/[code]` 与 `/families/join` 渲染同一组件）；邀请码生成 4 处入口。

**auth**（生产 web 首屏 `none` 态）：**5 句陈述、0 个动作**，是全仓最糟的一屏；email 态页头标题与表单卡标题同句重复；验证码步骤 4 句堆叠；`01/02` 步骤胶囊是装饰（流程自动推进）。

---

## 七、法条总检

| 法条 | 判定 |
|---|---|
| 记录唯一入口 = 全局 Records | **域内 ✓**（宠物页零入口已落实）/ **域整体 ✗**（第二 Records 面 + 全局不收 pet_id） |
| 一个数字只有一个家 | ✓（宠物数、家庭名单、Records 计数、配额均单一出口，已逐条核实）；**Today 圆环与段头计数互推**为页内违例；toast「N more waiting」在非家页面出现请求数 |
| 页头结论句后禁第二句 | ✗ 三处：`transfer` 页头副题、`care` setup 页头三行、瞬态拦截态副题 |
| 职责明确 = 功能只住一页 | ✗ 四处：Care 双职、roster 三份、解绑双家、记录双家 |
| 常驻教学副题一律删 | ✗ **14+ 处回潮**（见 §2.4） |
| 底栏 icon-only | ✓ |
| 无与「更多」100% 重复的 ⋯ 菜单 | ✓ 零残留（`DotsThree` 仅剩图标语义映射） |
| 装饰图标=伪数据 | ✓ 仅 `CareTemplateIcon` 两个类别共用同一图标（`care-section.tsx:387,390`） |
| scope 选择器只留 Today/Records | ✓ 本页合规；宠物详情家庭 chips 待裁 |
| 日期选择器只在首页 | ✗ 单宠 Records 锁定态自带 CalendarSheet（`timeline/screen.tsx:606-614,910-921`）—— 随 §2.1 一并解决 |
| 破坏性门槛只在删除流程内、Delete 行常开 | ✓（家庭/宠物/账户三处已核，符合 2026-09-27 令） |
| 照护归属（完成放开/移交限主 owner） | ✓（`assignments-screen.tsx:110-117` 与裁决一致） |

---

## 八、建议处置序

**现在就改（边界清晰、成本小）**
1. **补照护请求与批次的撤回端点**（§2.2a）——「没有出口的状态」是 MVP 硬规则，且前后端同改、面小。
2. **清教学文案回潮**（§2.4，14 处）——纯删句，五语同步，不动按钮/校验/a11y。
3. **删两个死入口 + digest 死组件族**（§5）——删除优于兼容。
4. **收敛 B 类冗余入口**（§4.1 的 B2/B3）——删一个，各一处。
5. **去重 Today 圆环与段头计数**（§6 Today）。

**需 founder 裁（法条冲突或口径选择）**
6. **记录两个家**（§2.1）——建议 A 案（全局 Records 加 `pet_id`，删宠物域那条路由），同时修掉全域最差触达。
7. **用药史归属**（§3.1）——并入健康档案，或正名为「用药与计划」。
8. **恢复已删对象统一结构**（§3.2）——回收站进 Settings 还是进对象列表。
9. **Care 路由双职拆分**（§3.3）——向导搬去 `/activation` 域。
10. **家庭关系收敛方案**（§2.3）——roster 只留家庭页 + 删除邮箱披露分歧。
11. **术语收口**（§4.2 C1/C5）——「I'll do it」拆分、`handoff` 一词三义。

**不要动（已判定合理，防下轮误报）**：§4.3 全部 A 类多入口；`ui-lab`（dev 工具）；公开分享页只读无写动作；记录域不提供完成/撤销（法条要求，撤销以 `care_task_undone` 事实呈现）。

---

## 九、本次审计的局限

- 所有「无人会走这个入口」均为**条件互斥 + 视觉优先级的推断**，无埋点可验证真实点击分布。
- 读屏可发现性（如左滑删除）为代码推演，**未跑真实读屏**。
- 未对照 `APP/docs` 与 `APP-PAGE-MAP.md` 全量回写；已知漂移三处（`:60,68` Today 描述已删控件、`:64` More 显示家庭数已删、`:121` 与「记录唯一入口」冲突）已在正文点名。
- 本轮不审视觉层，`DESIGN-LANGUAGE-CONSISTENCY-2026-09-25.md` §六 标注的 **Pets 域 7 页 codex 终审仍未出**，本报告对宠物域为独立复审，可并轨。

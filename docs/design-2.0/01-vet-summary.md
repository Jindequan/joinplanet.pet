# G1 · 就诊准备 Summary 完全体（vet-ready 独立形态 + 生成前全字段勾选排除）

> **设计稿 v2——已过审查门。**（v1 独立审查 2026-10-14：P1×1 / P2×1 / P3×4 全部处置，见文末修订记录。）
> 日期：2026-10-14。设计人：G1（2.0 功能包设计波）。
> 初始设计锚：`docs/archive/APP-DESIGN.md`（2026-08-16）F6 定义、§6「Vet-ready Summary（Phase 1=确定性模板）」、§1.5 分层原则。
> 现行事实源：`docs/PRODUCT.md`（§0 红线、§3.3 F6 现状、§4.6 受控分享、§4.7 页面质量基线）。
> 2.0 编排：`docs/commerce/SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md` §6.5/§6.7（G1 = P0 补足项；就诊准备基础版免费）。
> 本文不改任何产品代码；全部断言的代码出处见文中 `path:line` 引用。

---

## 0. 现状事实盘点（先读再写的依据）

以下每一条都在本轮实读核验，是本设计全部决策的事实底座：

**服务端（planet-api/internal/modules/sharing/）**

- kind 只有两种：`care_card` / `summary`。校验在两处——服务层 `service.go:113`（`kind must be care_card|summary`）与数据库 `migrations/0001_initial.up.sql:401` 的 `share_links_kind_check CHECK (kind IN ('care_card', 'summary'))`。
- `summary` 的 options 是 jsonb、服务层校验（`service.go:67-105`）：`sections`（合法值仅 `profile|medications|events`，:98）、`days`（默认 90，上限 365，:89-93）、`include_photos`、`reason`（≤300 字符，:95-97）。**数据库对 options 无任何 CHECK 约束**（`0001_initial.up.sql:392`：`options jsonb NOT NULL DEFAULT '{}'`）。
- **冻结快照语义**：创建时先把公开视图物化成 `snapshot` jsonb（`service.go:133-152`，注释原文「A share is a handoff snapshot」）；匿名查看优先读快照（`service.go:298-311`）；照片签名只发生在呈现层、不改写快照字节（`service.go:325-330`）。迁移期无快照的旧分享才走实时组装（`service.go:303-310`）。
- 权限：创建/撤销仅 Owner（`service.go:136,155` 经 `RequirePet(needOwner=true)`；`contracts.go:123`）；归档宠不可新增分享（`service.go:107` 注释 + `RequirePetInTx(..., true, true)` mutable 检查）。
- **分享路径零配额**：`grep -rniE "entitlement|quota" planet-api/internal/modules/sharing/` 零命中、exit=1（v2 复跑修正命令；v1 原录的 grep 缺 `-E`，BRE 下匹配字面量，不构成证据——审查已纠错）。匿名查看仅有 IP 级防滥用限流（`http.go:84-86` `ViewPerMinute`），不是配额。
- 幂等：创建绑定 Idempotency-Key，RequestHash 含 options 全文（`service.go:160-161`）；token 明文仅创建响应返回一次（`http.go:50-54`），列表/查看端点永不回显。
- 用药数据：`meds.ListForShare` 返回**全部**用药（active 在前、ended 在后，`meds/repo.go:60-66` 的 `ORDER BY ended_on IS NOT NULL, started_on DESC`）——原设计「当前用药 where active」实际未做过滤，只做了排序。`SharedMed` 无 ID（`contracts/share_types.go:22-28`）。
- 事件数据：`timeline.ListForShare` 按 `FactTypes` 白名单投影（`timeline/registry.go:58-68`：note/photo/symptom/weight/vet_visit/vaccine/deworm/medication/care_task_completed），`sinceDays` 窗口 + 上限 200 条（`service.go:483` 调用处传 200；实现 `timeline/service.go:777-794`）。`SharedEvent` 无 ID（`contracts/share_types.go:30-35`）。
- 审计：`share_created` metadata 只含 share_id/kind/family_ids（`service.go:45-60`），options 不进审计。

**客户端（APP）**

- 唯一创建入口在宠物工作区 Overview「管理」组的 `SharingSection`（`APP/src/features/pets/pet-overview-tab.tsx:200-202`，`readOnly=!canManagePet`）。表单是 ModalSheet 两步流（编辑→文字复述审阅），**段级勾选已存在**（profile/medications/events 三个 Switch，`sharing-section.tsx:454-487`），**条目级（逐条）排除不存在**。
- 时间线页**没有**分享入口（`grep -rn "share" APP/src/features/timeline/screen.tsx` 仅命中样式注释）；但页头组件 `TabPageHero` 已有 `trailing` 动作槽（`tab-page-hero.tsx:25`）。
- 公开页有三个渲染面，**两端的键处理模式并不相同**（v2 更正）：www `/s/[token]`（Next.js server component，`www.joinplanet.pet/app/s/[token]/page.tsx:129-146`）的 SummaryCard 对 Allergies/Conditions/notes/medications/events 是**无条件渲染**，键缺省时以 `Not provided` / `None recorded` / `No timeline events in this period.` 兜底（`InfoCard` 实现见 `page.tsx:124-127`）；APP `/share/[token]`（`APP/app/share/[token].tsx` → `public-share-screen.tsx:183-186` 的 `hasSummaryField`）才是**按键存在分支**。summary PDF 打印（`settings/summary-pdf.ts` `buildSummaryPdfHtml`，`hasSection` 同为按键判断）。生成的链接指向 www（`sharing-section.tsx:256` `${appConfig.publicWebBaseUrl}/s/${token}`，缺省 `https://www.joinplanet.pet`，`core/config.ts:24`）。
- i18n 五语：en/zh/ja/es/pt（`summary-pdf.ts` 头注）。

**landing vet-paper 视觉（营销演示）**

- 结构：`www.joinplanet.pet/app/page.tsx:131`——纸头（PLANET · VET SUMMARY / 宠物名 / Prepared by his family · 日期 / SAMPLE 徽记）、`vet-alert` 过敏条（含「No known drug allergies」空态写法）、WHY WE'RE HERE（就诊原因）、`vet-columns` 两列（当前用药 / 近期变化）、页脚免责（Organized from family records. Review and correct before sharing.）。
- 样式：`globals.css:732-743`——白纸 39px padding、1px 边框 `#d8ddd6`、左旋 1.5°、Georgia 衬线大标题、7px 大写字距 eyebrow、clay 色左边框 alert、两列 grid、hairline 分隔；窄屏降级 `globals.css:932-933`（去旋转 `transform:none` + `vet-columns` 单列）。

**产品裁决链**

- PRODUCT §3.3 自认：F6「独立『就诊准备』形态未单列交付」——G1 就是补这个差距。
- 订阅设计 §6.7：G1 就诊准备基础版**免费**；Pro 深化（保存多份自定义模板）本期不做；分享/应急/导出类永不收费。
- 原设计 §1.5 原则 3：「应急场景永不设卡——sitter/紧急视图、就诊当天的 Summary，任何配额都不拦」。
- 原设计 §6 六段定义：基础信息 / 过敏 / 当前用药（active）/ 最近 30 天异常（symptom 聚合）/ 最近就诊与体重趋势 / 家人备注，「生成前全字段可勾选排除（分享的最小集由用户决定）」，页面复用 landing vet-paper 视觉。

---

## 0.5 关键裁决：演进 `kind='summary'`，不新增 `vet_summary` kind

**推荐并采用：方案 A——同一 kind 内演进**（options 扩展 + 快照新键 + `template:"vet"` 模板标识）。

| 维度 | A. 演进 summary（采纳） | B. 新 kind='vet_summary'（否决） |
|---|---|---|
| DDL/CHECK 迁移 | **零迁移**。options 本是 jsonb 无约束（`0001:392`），新键自然落位；`share_links_kind_check` 不动 | 需一条迁移重建 CHECK（`0001:401`），外加 service kind 枚举（`service.go:113`）、审计 metadata、`shareDTO`、两端渲染的 kind 分支从二元变三元 |
| 公开页渲染复用 | 冻结快照 +「按键存在才渲染」是 **APP 端**（`public-share-screen.tsx:183-186`）与 PDF（`summary-pdf.ts` `hasSection`）的既有模式；**www 端现行是无条件渲染 + `Not provided`/`None recorded` 兜底**（`page.tsx:124-146`，v2 更正）——因此 www 的 vet 分支是**全新条件代码**（按快照 `template` 键 + 各段键存在分支），且 **legacy SummaryCard 路径一行不动**；旧快照无新键 → 走原兜底渲染，向后兼容由 e2e #3 快照等价断言 + 「渲染只信快照键」规则保障 | 需要第三个组件分支（VetSummaryCard），与 SummaryCard 长期双轨并存 |
| 产品概念 | F6 在事实源里是**一个**功能（PRODUCT §3.3）；care_card/summary 两分正对应 landing 两种演示物（handoff-phone / vet-paper） | App 内出现「健康摘要」与「就诊准备」两个高度相似入口，数据面 90% 重叠，用户分流困惑 |
| 生命周期 | TTL 档位/撤销/过期/幂等/view_count 完全同构，无行为差异可归属新 kind | 新 kind 没有任何独有行为，只是标签 |
| 旧客户端兼容 | 旧三值 sections 必须也保留合法（1.0 已发布客户端只发 `profile/medications/events`，停收即断旧版本 App） | 同样要保留旧 summary 全部行为，等于「演进+新增」两份成本 |

**「独立形态」的正确表达层**：入口（独立 composer 路由 + 就诊预设）、快照标识（`data.template:"vet"`）、公开页视觉（vet-paper）——独立在**体验层**，不在**凭证类型层**。这与原设计 §5「Share 是动作不是空间」一脉相承：分享凭证类型只有「临时照护卡 / 健康摘要」两种，就诊准备是健康摘要的就诊场景完全体。

**残余风险与吸收方式**：同一 kind 下新旧两种 options 形状并存。吸收=① sections 合法值取新旧并集；② 快照渲染严格按键存在分支、禁止按 options 猜测；③ `template` 键写进**快照 data**（物化结果），渲染只信快照不信 options（ViewByToken 也确实不回显 options，`service.go:272-278`）。

---

## 1. 用户旅程

**主旅程（正常路径）**

```text
谁：宠物 Owner（仅 Owner 可创建——现行权限不动，service.go:136）
何时：就诊前 1–3 天准备，或候诊室现场（后者决定流程必须快：预设默认值一步可生成）
从哪进：
  入口 1（主）：宠物工作区 Overview →「就诊准备」行动行 → /pets/[petId]/vet-summary
  入口 2（次，P1 可延后）：时间线页头 TabPageHero trailing 槽「就诊准备」
    （动线依据：原设计 §1.3 场景 B「F5 记录 → F3 用药清单 → F6 拼装 → F7 送达」——
     用户往往刚在时间线记完症状，就地生成摘要是最短路径）
到哪出：
  生成 → 链接复制/系统分享面板（沿用 createdNote + RnShare 模式，sharing-section.tsx:181-206）
  → 兽医手机打开 www /s/[token]（vet-paper 视觉，免注册）
  → 兽医或主人点「打印」出 A4 PDF（vet-paper 纸面版）
  → TTL 到期或 Owner 撤销后 410 死胡同（现行语义不变）
```

**旅程中的关键动作序列**：进入 composer（自动拉取档案/用药/事件，列表即所见）→ 逐段开关 + 逐条勾选（默认=就诊预设全开）→ 填就诊原因（可空）→ 选时间窗（默认 30 天）→ 审阅步（逐段计数复述）→ 创建 → 链接交付。

**异常路径（全部必须有出口）**

| 异常 | 行为 |
|---|---|
| 新宠物零记录 | 各段显示「暂无记录」；symptoms/visits 段空态给「去时间线记录」引导链接；仍可生成（含基础信息+过敏自述的骨架摘要） |
| 非 Owner（caregiver/viewer） | 入口不渲染（沿用 `readOnly` 模式，pet-overview-tab.tsx:200-202）；直捣路由时服务端 403（现行 Guard 行为） |
| 宠物已归档 | 入口隐藏；服务端 `PET_ARCHIVED`（现行，service.go:107） |
| 宠物 deceased | 沿现行 RequirePet 语义（本期不特殊处理；复盘用走导出） |
| 断网/超时 | 表单草稿保留在页面；重试复用同幂等键（fingerprint 范式，sharing-section.tsx:311-314）；不做离线队列——分享创建是即时在线动作，不是 §6.4 的事实记录类 |
| 创建成功但响应丢失 | 幂等重放返回原 token（现行 `IDEMPOTENCY_REPLAY` 机制不变，service.go:168-185） |
| 五个内容段全关 | 拒绝创建，错误「至少选择一段内容」（沿用 `sectionsRequiredError` 模式）。**计入最小集合的内容段 = 过敏与慢病 / 当前用药 / 近期症状 / 就诊与体重 / 家人备注五段**（`allergies|medications|symptoms|visits|notes`）；basics 与 contacts 是身份/联系信息，不计入——仅开这两段等于交付一张没有任何健康内容的「就诊准备」，无意义且误导接收方（白名单与 400 口径见 §3.2） |
| 过期/撤销链接被打开 | 410 → 死胡同页「找分享人要新链接」（现行，www `page.tsx:156`、APP `public-share-screen.tsx:498-527`） |
| 家人在用户勾选期间并发改了档案 | 过敏/慢病按 name 匹配排除（见 §3.4），name 漂移最多导致「多排除/少排除同名条」；创建是单请求内物化，不存在半完成状态 |

**免费/付费红线在本旅程的落点**：全程零配额、零付费墙、零次数限制（复核见 §4）。

---

## 2. 交互规格

### 2.1 页面与控件

**新路由页 `/pets/[petId]/vet-summary`（VetSummaryComposer）**——用路由页而非 ModalSheet。理由：七段 + 逐条勾选的长度超出弹层容量，PRODUCT §4.7「表单能完成」基线要求内容可滚动且底部主按钮常驻；现有 ShareForm ModalSheet 三段已是舒适上限（sharing-section.tsx:413-563）。

```text
┌ VetSummaryComposer（Screen + 滚动 + 底部固定动作条）
│ 页头：就诊准备 · {宠物名}（BackHeader 返回宠物工作区）
│ ┌─ 0 恒在标识（不可关，无开关控件）
│ │   宠物名 / 物种（页面骨架与聊天工具链接预览必需——www page.tsx:19-25
│ │   的 og:title 用 pet.name，剥掉即断预览）
│ ├─ 1 档案基础 basics —— Switch，默认开
│ │   内容预览：性别 / 绝育 / 生日 / 当前体重（petBasic 字段，service.go:520-532）
│ ├─ 2 过敏与慢病 allergies —— Switch + 条目 checkbox，默认开、默认全选
│ │   列表 = profile.allergies + profile.conditions（name 行，条数通常 ≤5）
│ ├─ 3 当前用药 medications —— Switch + 条目 checkbox，默认开、默认全选（仅 active）
│ │   段内开关「包含已停用用药」med_history，默认关（原设计「where active」对齐；
│ │   开后列出 ended 用药并标注停用于日期）
│ ├─ 4 近期症状 symptoms —— Switch + 条目 checkbox，默认开、默认全选
│ │   列表 = 窗口内 type=symptom 事件（title/detail + 日期）
│ ├─ 5 就诊与体重 visits —— Switch + 条目 checkbox，默认开、默认全选
│ │   vet_visit 列表（title/clinic/summary + 日期）
│ │   weight 序列（日期 + kg；≥2 条时给首尾 Δ 与 Δ%，确定性算术，无任何推断）
│ ├─ 6 家人备注 notes —— Switch，默认关（自由文本隐私面大，由用户主动打开）
│ ├─ 7 紧急联系与医疗决定人 contacts —— Switch，默认开
│ │   （来源 profile 两字段；就诊场景兽医需要知道「谁能签字」——care_card 已有
│ │    同源数据 service.go:447-448，零新查询）
│ ├─ 就诊原因 reason ——多行 TextField，≤300 字（沿用现行上限 service.go:95）
│ ├─ 时间窗 days —— ChoiceChips 30/90/180/365，vet 预设默认 30（原设计「最近 30 天异常」）
│ ├─ 有效期 ttl_hours —— ChoiceChips 24/72/168/720，默认 168（沿用现行档位与默认）
│ └─ 底部动作条：〔审阅〕次按钮 + 〔生成链接〕主按钮（busy 态禁用双钮）
└ 审阅步（同页第二步，非弹层）：逐段计数复述卡（「过敏 3 条 · 已选 2」/
  「症状 4 条 · 已选 3 · 近 30 天」/「照片：不含」）+ 免责脚注 + 〔返回修改〕/〔确认生成〕
   ★ 空态文案确认（P1 修订）：审阅步必须原样展示各**已包含**空段的公开页空态文案
     ——尤其「过敏与慢病」段为空时展示「No known drug allergies」原句。该句是
     向兽医作出的肯定临床陈述，必须经 Owner 在审阅步目视确认后才随快照定稿；
     被排除的段在审阅步显示「不含此段」，公开页整段不渲染（三态规则见 §2.3）
```

**勾选即预览**：条目级勾选列表本身展示真实数据（每条过敏、每条用药、每条症状的原文与日期）——用户勾选时看到的就是将交付的内容，**不另做服务端 preview 端点**（避免新 API 面；服务端 `buildSummary` 仍是唯一物化口径）。

**生成成功态**：沿用 `createdNote` 模式（mint 底提示面 + 复制链接 + 「发送给接收方」系统分享，sharing-section.tsx:181-206）。

**分享列表区分**：`shareDTO` 增加 `template` 字段（服务端从 `share.Options` 提取，缺省 `legacy`；**不回显 exclude 明细**）。列表行 eyebrow 由二值变三值标签：「照护卡 / 健康摘要 / 就诊准备」——撤销场景下 Owner 需要知道撤的是哪张（sharing-section.tsx:216-221 现为二值分支）。

### 2.2 空态 / 错误态 / 权限 / 加载态（五维齐全）

| 维度 | 规格 |
|---|---|
| 空态 | ① 各内容段无数据：「暂无记录」+（symptoms/visits 专属）「去时间线记录」链接；② 仍可生成骨架摘要；③ 审阅步对空段显示「（无记录）」而非隐藏——接收方需要明确知道「没记」与「没勾」都存在 |
| 错误态 | ① 校验错误：行内红字（至少一段 / reason 超长——服务端已有 400 `options.reason max 300`，service.go:96）；② 创建失败：底部动作条上方错误行 + 重试（幂等键保留）；③ 数据拉取失败：整页 QueryErrorState + 重试（composer 三依赖 profile/meds/events 任一失败都不许静默生成——排除决策必须基于真数据） |
| 权限 | Owner-only：入口按 `canManagePet` 隐藏（现状模式）；服务端 Guard 兜底 403；viewer 连入口都不可见 |
| 加载态 | 进入时三路并行拉取（react-query 复用现有 profile/meds/timeline 键），段区骨架屏；生成中主按钮 busy + 文案「正在生成快照…」 |
| 并发/重复 | 双击防抖（busy）；同 payload 重试复用同幂等键；payload 变化轮换键（fingerprint 范式，sharing-section.tsx:311-314 原样迁移） |

### 2.3 匿名端（接收方）交互

**三态渲染规则（P1 修订，vet 模板的硬规则）**——每个可排除段在公开页有三态，**禁止混淆**：

```text
① 有内容（键存在且非空）   → 渲染列表/正文
② 无记录（键存在但为空）   → 渲染该段的空态文案（中性事实陈述）
③ 未含（键缺省=Owner 排除）→ 整段 DOM 不出现——不渲染空态文案、不渲染任何
                              关于该维度的陈述（包括「None recorded」——那同样
                              是家庭没有作出的断言）
```

| 段 | ① 有内容 | ② 无记录（键存在且空） | ③ 未含（键缺省） |
|---|---|---|---|
| 过敏与慢病（vet-alert 条） | 列出过敏/慢病 | `No known drug allergies`（landing 原句；经审阅步 Owner 确认，见 §2.1） | **过敏条整条不出现**——绝不落入「No known」分支 |
| 当前用药 | 药名 + 剂量/频次（ended 标注停用日期） | `None recorded` | 段不出现 |
| 近期症状 | 症状列表（标题/细节/日期） | `None recorded in this period` | 段不出现 |
| 就诊与体重 | 就诊列表 + 体重序列（含 Δ） | `None recorded in this period` | 段不出现 |
| 家人备注 | 正文 | （可空文本，无 ② 态） | 段不出现 |
| 紧急联系与医疗决定人 | 姓名/电话 | `Not provided` | 段不出现 |
| 就诊原因（reason） | 正文 | `Not stated`（非必须信息） | 无 ③ 态（reason 本就可选） |

规则依据：`No known drug allergies` 是肯定临床陈述（影响兽医用药决策），只有当家庭**显式包含**该段且档案确无记录时才成立；「未含」是隐私决定，公开页不得把它翻译成任何临床语义。此规则同时约束三个渲染面（www / APP / PDF），并把 www 现行「无条件渲染 + 兜底」模式隔离在 legacy 路径内（legacy SummaryCard 一行不动，v2 更正见 §0/§0.5）。

- **vet-paper 视觉**（`template:"vet"` 快照驱动）：复用 landing 的结构与样式语言（page.tsx:131 / globals.css:732-743）——纸头（PLANET · VET SUMMARY / 宠物名 / Prepared by the family · 生成日期）、clay 左边框过敏条（按上表三态）、WHY WE'RE HERE=reason、CURRENT MEDICATION / RECENT CHANGE（体重 Δ）两列、逐段时间线区、页脚免责（Organized from family records. Review with a veterinarian before making care decisions——与 www 现行 footer 口径合并，`page.tsx:142`）。
- 移动端适配：vet-paper 的 `transform: rotate(-1.5deg)` 纸感保留在 www 桌面；窄屏去旋转、全宽单列（vet-columns 已有 1fr 降级，globals.css 响应式段）。
- **APP `/share/[token]`** 同步加 vet 分支（`SharedViewCard` 按 `view.data.template` 切版式），PDF（`buildSummaryPdfHtml`）出 vet 纸面 A4 版——三端（www / APP 屏 / PDF）一个模板三种介质，营销演示变真货的完整闭环。
- 过期/撤销/限流死胡同、view_count 计数、`noindex` 元数据策略全部沿用现行（`page.tsx:9-37`、`http.go:82-93`）。

### 2.4 交互红线（继承+新增）

- 生成流程步数 ≤3（勾选 → 审阅 → 链接），候诊室场景一步可完成（默认预设即合理摘要，直接审阅+确认）。
- 逐条勾选默认**全选**（默认值不替用户做排除决定——「最小集由用户决定」是排除权，不是默认裸奔）。
- 所有列表行可读出内容与日期；不做的：拖拽排序、按事件类型二次过滤（克制，无第二用例）。

---

## 3. 领域与数据影响

### 3.1 表与迁移：零新表、零迁移、零 CHECK 变更

- `share_links` 不动：`options`/`snapshot` 均 jsonb 且无形状约束（`0001:392`、`0002_share_snapshots.up.sql`）；kind CHECK 不动（§0.5 裁决 A 的最大红利）。
- 无新调度器、无后台任务：快照即时物化（现行模式），到期即查询时失效（`service.go:292-295`）。
- **PRODUCT §0 红线复核**：零平行业务主体——本设计是 Occurrence/Event 主体的纯读取投影 + 既有 share_links 的语义扩展，不新建任何实体。

**回滚路径与已知降级（P3 修订补录，工程原则 9）**——「零迁移」的另一面是回滚无 DDL 可退，降级发生在协议与渲染层，逐面记录：

| 回滚面 | 行为 | 定性 |
|---|---|---|
| 服务端回滚到旧 `parseSummaryOptions` | 旧 struct `json.Unmarshal` 忽略未知键（template/exclude/med_history），但新七值 sections 命中旧校验 `unknown section`（`service.go:98-103`）→ **新建 vet 分享 400 明确失败**；新建 legacy 分享不受影响 | 可接受：失败明确、无半完成状态 |
| 服务端回滚后查看存量 vet 快照 | `ViewByToken` 快照优先（`service.go:298-311`），快照非空即原样返回 data（含 `template` 键，旧 DTO 对 data 透传）→ 数据面无损 | 可接受 |
| 渲染端（www/APP）回滚到旧版 | vet 快照落入 legacy **无条件兜底渲染**：过敏条显示 `Not provided`、事件区 `0 recorded changes` 等——不崩溃、无数据泄漏（快照内本就只有被包含的内容），但 §2.3 三态规则失效，被排除段会被兜底文案「画出来」；暴露面受 TTL 限制（vet 预设默认 168h） | **已知降级，标注可接受**：仅发生在「新版已放量→紧急回滚」窗口 |
| 彻底关闭存量 vet 分享 | Owner 侧正常撤销（列表入口不依赖新字段也可撤）；运营兜底谓词 `kind='summary' AND options->>'template'='vet' AND revoked_at IS NULL` 批量撤销 | 关闭出口存在 |

### 3.2 options JSON 形状草案（`kind='summary'`, `template:'vet'`）

```jsonc
{
  "template": "vet",                    // 新：渲染模板标识；缺省 = legacy（旧客户端兼容）
  "sections": ["basics","allergies","medications","symptoms","visits","notes","contacts"],
                                         // 新七值；旧值 profile|medications|events 永远合法（1.0 客户端仍发旧值）
  "days": 30,                            // vet 预设默认 30（legacy 默认 90 不变，service.go:79）
  "reason": "食欲下降三天",               // ≤300 chars，不变
  "med_history": false,                  // 新：是否物化已停用用药（默认 false = 仅 active）
  "exclude": {                           // 新：条目级排除明细（物化时剔除；仅存 owner 侧，公开端点不回显）
    "allergy_names": ["对某洗发水过敏"],   // jsonb 数组条目无 ID，按 name 匹配（见 3.4）
    "condition_names": [],
    "medication_ids": ["uuid..."],        // medications 有稳定 ID
    "event_ids": ["uuid..."]              // pet_events 有稳定 ID（需投影扩展，见 3.3）
  }
  // include_photos 仅 legacy 路径保留；vet 模板六段无照片对象（symptom/vet_visit/weight
  // payload 均不含照片，照片是独立 photo 事件类型，registry.go:36-46），vet 下该键忽略
}
```

服务端 `parseSummaryOptions` 扩展（`service.go:75-105`）：合法 sections = 新旧并集；`template` ∈ {`vet`,`legacy`(缺省)}；`exclude` 各数组设上限（条目数 ≤200，与事件上限同量级）防 options 膨胀。

**最小内容集合校验（P3 修订补全口径）**：

- `template:"vet"` 时，`sections` 与 `allergies|medications|symptoms|visits|notes` 五个内容段的交集必须非空，否则 400 `VALIDATION_FAILED`，消息 `options.sections must include at least one content section (allergies|medications|symptoms|visits|notes)`（错误族沿用 `httpx.ErrValidation` 现行口径）。basics/contacts 不计入——身份与联系信息不构成健康摘要。
- 行为差异如实记录：现行服务端对**空 sections 是回退默认三段而非报错**（`service.go:86-88`），拒绝只发生在 APP 端前置校验（`sharing-section.tsx:368-371`）。vet 模式把该约束下沉到服务端强制（双保险）；**legacy 模式的回退行为一字不动**（1.0 客户端依赖它）。

### 3.3 快照 data 形状草案（物化结果，`buildSummary` 扩展）

```jsonc
{
  "template": "vet",                  // 渲染端唯一可信依据（不看 options）
  "pet": { "name","species" },        // 恒在标识
  "basics": { "sex","neutered","birth_date","weight_g","breed" },   // 段关=整键不出现
  "allergies": [...], "conditions": [...],   // 排除的条目不在数组里（真排除，非渲染隐藏）
  "medications": [...],               // 默认仅 active（EndedOn 为 nil）；med_history=true 才含 ended
  "symptoms": [ {"occurred_at","title","detail"} ],
  "visits":    [ {"occurred_at","title","clinic","summary"} ],
  "weight":    { "points":[{"occurred_at","weight_g"}], "delta_g":null, "delta_pct":null },
                                      // 窗口内序列；≥2 点时 delta 为首尾确定性差值，否则 null
  "notes": "...",                      // 段关=键不出现
  "contacts": { "emergency_contacts":[...], "med_decision_maker":{...} },
  "reason": "...",
  "generated_at": "..."               // 快照生成时间（接收方判断时效的必需事实，现由 share.created_at 承担，此处随快照冻结）
}
```

- **排除语义=物化时剔除**：被勾掉的段/条目不进快照字节。这是隐私承诺的落点——PDF、公开页、任何下游都无从渲染「被排除的内容」。
- **接口小改两处**（唯一触碰 contracts 的地方）：`SharedEvent` 与 `SharedMed` 增加 `ID string json:"-"`（`contracts/share_types.go:22-35`）——`json:"-"` 使 ID **只在服务端内部可见**，`buildSummary` 物化各段时剥除（快照与匿名 DTO 形状与现行完全一致，内部 UUID 不泄露——对齐既有纪律：planet-api 呈现层剥裸对象键的注释 `sharing/service.go:325-330`（「等于把存储布局泄漏给匿名页」）、APP 公开屏「载荷不含宠物 id（不泄露内部 ID）」注释 `public-share-screen.tsx:211-212`。v2 更正：v1 误引 www `page.tsx:5-8`，该处实为 noindex/token 隐私注释）。`EventReader.ListForShare`/`MedsReader.ListForShare` 投影带出 ID。
- legacy 路径行为零变化：不发 `template` 或发旧三值的请求，走现行 `buildSummary` 分支原样物化（allergies+conditions+notes 合并 profile 段、events 混合列表、include_photos 语义）。

### 3.4 排除匹配的语义裁决

| 条目 | 标识 | 并发语义 |
|---|---|---|
| 用药 | medication ID | 稳定；家人并发删药=想排除的条已不存在，无副作用 |
| 事件 | event ID | 稳定；同上 |
| 过敏/慢病 | **name 字符串匹配**（profile jsonb 条目无 ID） | 同名多条时全部排除（语义=「按名称排除」，可解释）；name 极少重复，不为它发明 ID——待 profile 条目未来获得稳定 ID 时自然升级 |

### 3.5 API 形状（全部为既有端点的参数扩展，无新端点）

| 端点 | 变化 |
|---|---|
| `POST /api/v1/pets/{id}/shares` | 请求体不变（kind/ttl_hours/options）；options 接受 §3.2 新键。响应不变（share+token） |
| `GET /api/v1/pets/{id}/shares` | `shareDTO` 增加 `template` 字段（从 options 提取，不回显 exclude） |
| `GET /api/v1/shares/{token}` | 响应 Data 为 §3.3 快照；含 `template` 键。限流/410 语义不变 |
| 审计 | `share_created` 不变（options 明细不进审计，排除明细以 share_links.options 行留存可查） |

### 3.6 免费归属与应急红线复核（§1.5 原则 3/4 的落地）

- G1 全部能力（七段、条目排除、vet-paper 三端、PDF）= **免费、不限次数、不限档位**（订阅设计 §6.7：G1 基础版免费；「保存多份自定义模板」类深化才是潜在 Pro 项，本期不做、本文不设计）。
- **就诊当天任何配额不拦**：结构性保证——分享创建路径无 entitlement 调用（本轮 grep 实证零命中）。本设计**明确禁止**后续把 share 创建挂到任何 usage 计量键上；这不是「给应急场景开豁免口」，而是该路径压根不设卡。匿名查看的 IP 限流是防滥用（`http.go:84`），保留。
- 免费协作闭环不受影响：legacy summary/care_card 入口与行为原地不动；本设计只做加法。

### 3.7 依赖核查（红线合规声明）

已核查 `APP/package.json`（expo 54 全家桶、react-query、phosphor 等）与 `www.joinplanet.pet/package.json`（next 15/react 19/tailwind）：**本设计零新增依赖**——服务端是 Go stdlib json 扩展；APP 复用现有组件（Screen/Switch/ChoiceChips/TextField/react-query）；www 复用现有 vet-paper CSS 类与 InfoCard 模式。

---

## 4. 验收

### 4.1 e2e 断言点（双账号 + 匿名第三视角）

1. **排除即剔除**：勾掉「过敏」段 + 勾掉 1 条症状 → 数据库 `snapshot` jsonb 无 `allergies` 键、`symptoms` 数组少 1 条（psql 直接断言快照字节，不是 UI 断言）。
2. **vet 视觉驱动**：`GET /shares/{token}` 返回 `data.template="vet"`；www `/s/{token}` 渲染 vet-paper 版式（纸头/过敏 alert 条/两列/免责页脚四要素齐）；APP `/share/[token]` 同版式；PDF 含同四要素。
3. **旧链接不回归**：用 1.0 客户端语义（旧三值 options）创建的 summary，www/APP/PDF 渲染与改造前逐字节等价（快照按键分支的回归保障）；已存在的生产快照在新版下打开正常。
4. **权限**：caregiver 账号看不到入口；直调 `POST /shares` 得 403；归档宠创建被拒。
5. **幂等**：创建超时后同键重放拿回原 token；改 options 后重试不 409（fingerprint 轮换）。
6. **撤销/过期**：撤销后匿名端 410；TTL 24h 档到期后 410。
7. **列表区分**：并存的 legacy summary 与 vet summary 在分享列表分别标「健康摘要」「就诊准备」；撤销的是目标那张。
8. **空态旅程**：新建宠物零记录 → composer 各段「暂无记录」→ 仍可生成骨架摘要 → 公开页正常渲染空段文案。
9. **默认值旅程**：不改任何勾选直接生成 → 七医疗段全含、窗口 30 天、仅 active 用药、不含照片、notes 不含。
10. **零配额断言**：免费档、超额存储/宠物数的账号创建 vet summary 成功（配额任何维度都不拦）；代码断言可执行形态：`grep -rniE "entitlement|quota" planet-api/internal/modules/sharing/` 零输出且 exit=1（与 §0 证据同命令，施工门复现；v1 原文的「无 entitlements import」措辞不可执行，v2 修正）。
11. **排除态公开页三态断言（P1 修订新增）**：勾掉「过敏与慢病」段 → www 公开页与 APP 公开屏**均不出现**过敏条元素与 `No known drug allergies` 字样（DOM 断言，非仅文案断言）；PDF 同样不含该句。对照：段开且档案无过敏记录 → 三端出现 `No known drug allergies`（且该句在审阅步已被 Owner 目视确认过）。其余段同法抽查一处（如勾掉 medications → 段消失，而非 `None recorded`）。
12. **最小集合 400（P3 修订新增）**：仅勾 basics+contacts 提交 → 400 `VALIDATION_FAILED`、消息含 `at least one content section`；legacy options 空 sections → 服务端仍回退默认三段（回退行为回归断言，`service.go:86-88` 口径不变）。

### 4.2 真实栈走查步骤（施工门跑的命令，非本文跑）

```bash
# 服务端（新增用例：vet options 解析/旧值并集兼容/排除物化/vet 内容段全空 400/
#   legacy 空 sections 回退回归/ID 剥除/三态物化——空数组键 vs 键缺省两种快照形状）
cd planet-api && go test ./internal/modules/sharing/... && go vet ./...
# 零配额证据复现（与 §0 同命令，期望零输出、exit=1）
grep -rniE "entitlement|quota" planet-api/internal/modules/sharing/
# APP（composer 页 + 公开屏 vet 分支 + i18n 五语键）
cd APP && bun run precheck && bun run build:web
# www（/s/[token] vet-paper 分支；legacy SummaryCard 一行不动的回归由 e2e #3 保障）
cd www.joinplanet.pet && bun run build
# 移动端验收（PRODUCT §4.7）：iOS Simulator / Android Emulator 截图覆盖
#   composer 空态/正常态/错误态/键盘态/长文案态 + 公开页 vet 版式（含排除态三态抽查）
```

本文作为设计稿**未运行**上述任何检查（不改代码红线）；上述为施工波的验收清单。

### 4.3 免费/付费归属复核结论

G1 全量能力免费（§3.6）；与订阅设计 §6.7 的 G1 行、§1 铁律「就诊摘要快照/分享永不收费」逐条对上，无冲突项。

---

## 附：边界与明确不做（防范围爬升）

- 不做服务端 preview 端点（勾选列表即预览）；不做模板保存/多份预设（潜在 Pro 项，另行立项）；不做疫苗/驱虫段（G3 到期清单的域，交付后复核是否并入第八段）；不做 photo 事件进 vet 摘要（无对象，见 §3.2）；不做条目拖拽/高级过滤；不引入 AI 任何字样（档位表已撤）。
- 时间线页头入口标 P1：若与 scope 过滤器争槽位则让位（TabPageHero trailing 现为空置，tab-page-hero.tsx:25，加一个 icon 按钮成本可控，但不阻塞 G1 验收）。

## 附：开放问题（需 founder / 施工波复核）

1. 时间线页头入口是否随 P0 同车（本设计倾向：P0 只做宠物工作区入口，P1 补时间线）。
2. 过敏/慢病按 name 匹配排除的语义（同名全排除）是否接受；或接受「过敏段仅段级排除」的降级。
3. `med_history`（含已停用用药）默认关是否符合复诊场景预期（慢病复诊家庭可能期望默认开）。
4. contacts 段（紧急联系+医疗决定人）为本文新增的第七段（原设计六段之外）——兽医「谁能签字」用例成立但是设计裁量，需 founder 确认。

## 附：修订记录

**v2（2026-10-14，独立审查处置完毕，全部 P1/P2/P3 六项已修）**

- **P1（医疗安全语义）**：§2.3 新增三态渲染硬规则与各段三态文案表——键缺省（Owner 排除）= 整段 DOM 不出现，空数组（无记录）才允许 `No known drug allergies` 等空态文案；§2.1 审阅步补「空态文案确认」（肯定临床陈述须经 Owner 目视确认后随快照定稿）；§4.1 新增 e2e #11（排除态 DOM 断言：勾掉过敏段 → 三端均不出现过敏条与该句）；§4.2 服务端用例补三态物化（空数组键 vs 键缺省两种快照形状）。
- **P2（论据失实）**：§0/§0.5 更正——www SummaryCard 现行为**无条件渲染 + `Not provided`/`None recorded` 兜底**（`page.tsx:124-146`），按键分支只是 APP/PDF 的既有模式；据此明确 www vet 分支是全新条件代码、legacy SummaryCard 路径一行不动，「向后兼容」结论改由 e2e #3 快照等价断言 + 「渲染只信快照键」规则承担。
- **P3×4**：① §0 零配额证据命令修正为 `grep -rniE "entitlement|quota" planet-api/internal/modules/sharing/`（v2 已复跑：零输出、exit=1），§4.1 #10 与 §4.2 同步改为可执行断言；② §3.3 「内部 ID 不泄露」纪律引用更正为 `sharing/service.go:325-330` 与 `public-share-screen.tsx:211-212`（v1 误引 www `page.tsx:5-8`）；③ §1/§3.2 枚举最小内容集合白名单（allergies|medications|symptoms|visits|notes 五段）与 400 `VALIDATION_FAILED` 口径，如实记录现行服务端对空 sections 是回退默认三段（`service.go:86-88`）而非报错、legacy 回退行为不变，§4.1 新增 e2e #12；④ §3.1 新增回滚矩阵：服务端回滚 → 新建 vet 分享 400 明确失败、存量快照照常可读；渲染端回滚 → vet 快照被 legacy 兜底降级渲染（不崩溃/无泄漏/受 TTL 限制，三态规则失效为已知降级），并给出运营批量撤销谓词 `options->>'template'='vet'`。另：§0 landing 样式补窄屏降级行号 `globals.css:932-933`。

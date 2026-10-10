# App Store 元数据事实源（v1.0）

创建：2026-09-28。**本文件是 App Store 上架文案的唯一事实源**；ASC 表单与 API 写入都只是它的投影。
英文（`en-US`）为主语言，本节文案即截图与商店页的共同来源。改动先改本文件，再改 ASC。

---

## 一、截图（6 张，iPhone 6.5" = 1284×2778）

产物：`APP/store-screenshots/iphone-6.5/*.png`；管线与设计规格见 `APP/store-screenshots/README.md`。
**2026-10-08 起（App Review 2.3.10 整改）成品图不含状态栏**——首版手绘的仿 iOS 状态栏被判
「non-iOS status bar image」，已从管线整体移除；恢复前提是真机/模拟器实拍带 OS 状态栏的原图，
禁止手绘（详见 README「已知约束与取舍」）。

| # | 屏幕 | Headline | Sub |
|---|---|---|---|
| 1 | Today | Always know what's next | Today's care at a glance |
| 2 | Family | No more “did you feed him?” | One shared list for the whole family |
| 3 | Medications | Never miss a dose again | Track meds, doses, and end dates |
| 4 | Trends | Catch changes early | Weight trends and care over time |
| 5 | Records | Every moment, kept | Vet visits, vaccines, photos, notes |
| 6 | Requests | Hand off care in one tap | Ask for help, or take over |

文案取材于用户原声（`MARKET-RESEARCH-2026-09.md` §4）：双喂/漏药/渐进恶化三条真实断裂点，分别对应 2/3/4 三张。

**iPad：当前无可用截图（阻塞）。** 应用宽屏布局判据是 `Platform.OS === 'web' && viewportWidth >= 960`（`APP/src/features/today/screen.tsx:115` 等 4 处），**原生 iPad 恒走手机单列布局**，因此从 web 构建按 iPad 尺寸拍出的图不代表 iOS 构建，不能提交。两条出路（择一，属产品决策）：
- `app.json` 的 `ios.supportsTablet` 置 **false**（v1 只发 iPhone）——与「iPad 布局零验证记录」的现状一致，推荐；
- 或先补原生 iPad 走查与真机截图（需先有可用模拟器/真机）。

---

## 二、英文商店文案（en-US）

### Name（≤30）
```
PlanET: Shared Pet Care
```
24 字符。**已定（founder 2026-09-28）**：商店名与设备上显示的名字统一为 **PlanET**（与 Baloo2 圆体字标一致，`app.json` 的 `name` 已同步，不再用全大写 `PLANET`）。

### Subtitle（≤30）
```
Never forget your pet's care
```
29 字符。

### Keywords（≤100 字符，含逗号与空格）
```
pet,care,reminder,medication,schedule,dog,cat,family,shared,vaccine,weight,log,vet,sitter
```
89 字符。**注意**：ASC 允许超长保存但会在提交时标 `invalid` 并阻断提交——写入后必须复查长度。

### Promotional Text（≤170）
```
One shared list for the whole family. Track meds, walks, vet visits, and weight — so nothing gets missed, and nobody double-doses.
```
135 字符。

### Description（≤4000）
```
PLANET keeps your pet's care in one place — and keeps everyone who helps out on the same page.

WHY FAMILIES USE PLANET
When more than one person cares for a pet, things slip. Did you already feed him? Was that pill this morning or last night? PLANET replaces the sticky notes, the group chat, and the guessing with one shared list that shows what's done and what's next.

WHAT YOU GET
• Today — everything due today for every pet, in one list. Tap to complete, adjust the time, or hand it to someone else.
• Shared care — invite the people who help. Everyone sees the same list, updated the moment something is done.
• Medications — track doses, schedules, and end dates. Stop and restart a course without losing the history.
• Records — vet visits, vaccines, deworming, weight, symptoms, notes, and photos. A real history for every pet, searchable by pet or by family.
• Trends — weight curves and care completion over time, so small changes surface before they become serious.
• Reminders — daily nudges for what's due, sent to the person who's on it. No more relying on memory.
• Sharing — give a sitter, a friend, or your vet a temporary read-only link that expires on its own.

BUILT FOR REAL HOUSEHOLDS
• Multiple pets, multiple caregivers
• Works for cats and dogs alike
• Five languages: English, 中文, 日本語, Español, Português
• Your data stays yours — export a pet's full record at any time

Start with one pet and one routine. PLANET handles the rest.
```

### What's New（1.0.0）
```
First release.
```

---

## 三、与语言无关的字段

| 字段 | 值 | 备注 |
|---|---|---|
| Bundle ID | `pet.joinplanet.app` | 建 ASC 记录时必须选**完全一致**的 ID |
| 版本 | 1.0.0 | `MARKETING_VERSION` |
| 主类别 | **推荐 Lifestyle** | 备选 Health & Fitness（同类产品两种都有用）——**待确认 ASC 现填值** |
| 次类别 | Health & Fitness | |
| 隐私政策 URL | https://www.joinplanet.pet/privacy | **每个 locale 都必须填**，只填主语言会在提交时被拦 |
| 支持 URL | https://www.joinplanet.pet/support | **已补（2026-09-28）**：`/support` 页已上线并返回 200（内容页壳 `app/components/content-page.tsx` + `app/support/page.tsx`），ASC 可直接填；邮箱 `support@joinplanet.pet` 仍是页面上的联系渠道 |
| 营销 URL | https://www.joinplanet.pet | |
| 版权 | `© 2026 PLANET` | |
| 年龄分级 | 4+ | 无第三方内容、无用户生成内容、无广告 |
| 内容权利 | 「不包含第三方内容」 | ASC → App Information，**静默阻断项之一** |

**三个经典静默阻断项**（提交前逐条确认）：①隐私政策 URL 逐 locale 齐全；②Content Rights 已声明；③Primary Category 已选。

### 审核备注（Review Notes，供 ASC 填写）

> 2026-09-29 修正：早先版本写了「无需账号即可浏览」「演示数据自动加载」——**与 iOS 实际行为不符**（App 需 Apple 登录，无内置演示数据）。元数据与实际行为不符是 2.3.1 拒审项，以下为照实版本。

```
Sign in with any Apple ID — Apple sign-in is the only sign-in method, and no account approval or payment is needed.

After signing in, the app walks you through three quick steps: create a family, add a pet, and pick a daily care routine. Everything else is reachable from there:

• Today — tasks due today; tapping Complete marks them done (undo within 7 days).
• Family — shows everyone who shares the care; you can invite a second member.
• Records — vet visits, vaccines, medications, photos; Trends shows weight over time.
• Requests — hand a task to another caregiver, or take one over.

Data is per-family and never shared across accounts. Deleting the account anonymizes identity. Support: support@joinplanet.pet
```

---

## 四、多语言

应用内已支持 en / zh / ja / es / pt（本轮已审计五语质量：新增键全部有自然译文，术语与 App 字典对齐）。**商店页本地化已交付**：`zh-Hans` / `ja` / `es-ES` / `pt-BR` 四语套装见 [docs/appstore-localizations.md](appstore-localizations.md)（Name/Subtitle/Keywords/Promo/Description，字符数已逐一实测）。隐私政策 URL 各 locale 统一指向站点 `/privacy`；截图按 ASC 规则其余 locale 继承 en-US。

---

## 五、待办清单（上架前）

- [x] **已解决（2026-09-28）** 商店名口径：定案 `PlanET`（§二 Name）。`APP/app.json` 的 `expo.name` 已改；站点侧同步于 `www.joinplanet.pet` 的 `app/lib/seo.ts`（`SITE_NAME` → `og:site_name`，页面 `<title>` 的品牌名同源）与 `app/layout.tsx` 的默认标题。
- [x] **已解决（2026-09-28）** 支持 URL：`https://www.joinplanet.pet/support` 已上线返回 200，见 §三 支持 URL 行。
- [ ] 确认 ASC 的主类别/次类别实际值
- [ ] 决定 iPad 路线（`supportsTablet: false` 或补原生验证）
- [ ] 发布前用脚本复核 Keywords 长度 ≤100（写入后 ASC 不即时拦截）
- [ ] `whatsNew` 与版本号在提审时对齐

---

## 五·五、v1.1 whatsNew 预填（2026-09-30 起草，提审 v1.1 时粘贴 ASC）

- en: Inviting a second caregiver is now part of first-time setup. Archived care plans can be restored. Shared-pet requests now send push notifications. Photo uploads are more reliable on weak networks. System permission prompts are localized in all five languages — plus dozens of fixes across Today, Records and family management.
- zh: 首次设置新增「邀请第二位照顾者」一步；归档的照护计划可以恢复了；共享请求会推送提醒；弱网下照片上传更可靠；系统权限弹窗完成五语本地化——并修复了今天、记录与家庭管理中的大量细节。
- ja: 初回セットアップに「2人目のケア担当を招待」ステップを追加。アーカイブしたケアプランを復元可能に。ペット共有リクエストのプッシュ通知に対応。弱い回線でも写真アップロードがより安定。システム権限ダイアログを5言語にローカライズ——ほか、今日・記録・ファミリー管理の細かい修正多数。
- es: Invitar a un segundo cuidador ahora forma parte de la configuración inicial. Los planes de cuidado archivados ya se pueden restaurar. Las solicitudes de mascotas compartidas envían notificaciones push. Las subidas de fotos son más fiables con red débil. Los avisos de permisos del sistema ya están en cinco idiomas — además de decenas de correcciones en Hoy, Registros y gestión familiar.
- pt: Convidar um segundo cuidador agora faz parte da configuração inicial. Planos de cuidados arquivados podem ser restaurados. Pedidos de pets compartilhados agora enviam notificações push. Uploads de fotos são mais confiáveis em redes fracas. Os avisos de permissão do sistema estão localizados em cinco idiomas — além de dezenas de correções em Hoje, Registros e gestão familiar.

（长度均在 ASC whatsNew 上限内；提审时如有新增用户可见面，按实增删。）

## 六、提交记录

**2026-09-29 已提交审核**（`submittedDate 2026-09-29T10:35:07Z`），v1.0 状态 **WAITING_FOR_REVIEW**。提交前逐项回读确认：

| 项 | 值 |
|---|---|
| build | **83**（VALID；`TARGETED_DEVICE_FAMILY=1`，v1 仅 iPhone） |
| 类别 | 主 Lifestyle · 次 Health & Fitness |
| 内容版权 | `DOES_NOT_USE_THIRD_PARTY_CONTENT` |
| 价格 | 免费（价格表已建，USA 基准全地区继承） |
| 截图 | iPhone 6.5″（1284×2778）6 张，en-US 集 |
| 五语元数据 | appInfo name/subtitle/privacyPolicyUrl + versionLocalizations keywords/promo/description/supportUrl/marketingUrl |
| 审核备注 | 照实版（"Sign in with any Apple ID…"）；`demoAccountRequired=false` |
| 审核联系人 | Devin Jin · +8618217150781 · jindeq@126.com |

**后续注意**：①审核期间**截图被锁**、新 locale 不能加，但**文字元数据可改**；②若要改截图或加语言，需先在 ASC 撤出审核（版本转 `DEVELOPER_REJECTED`）→ 改完重提，队列位置重置；③结果邮件发 Apple ID 邮箱，通常 ≤48h；④v1.1 起 `whatsNew` 才会有值（首发版本该字段不存在）。

## 六·五、2026-10-07 首审反馈与 2026-10-08 整改

**Apple 反馈**（Review date 2026-10-07，审核设备 iPad Air 11″ M3，Submission `38c84ca8-3aa7-4897-a7f6-6cc0a4cc6598`）：

- **Guideline 2.1(b) Information Needed**：要求说明商业模式（四问：付费内容给谁用 / 在哪买 / 已购内容有哪些 / 哪些付费内容绕过 IAP 解锁）。触发源判定=营销 URL 指向的落地页有 Founding Seat（S$29.99 起，Lemon Squeezy 收款）。**事实面：App 全功能免费、无 IAP（ASC IAP 列表为空）、无订阅；Terms §5 明文「membership unlocks nothing inside the app: the free core is the same for everyone」**——回复稿见下。
- **Guideline 2.3.10 Accurate Metadata**：截图含「non-iOS status bar image」（`make-store-screenshots.py` 手绘的仿 iOS 状态栏）。

**整改（2026-10-08 全部经 ASC API 完成）**：

| 项 | 处置 |
|---|---|
| 截图 | 用 build-83 同代 raw（git `1d73ec0`）重合成去状态栏版 6 张；API 原序删除→替换上传，`assetDeliveryState` 全 COMPLETE（服务器显示顺序 records/today/family/requests/medications/trends 未动） |
| 版本状态 | 编辑后自动 REJECTED → `PREPARE_FOR_SUBMISSION`；build 83 重新挂载（`GET /appStoreVersions/{id}/build` 子资源验证在位；**版本 GET 的 `relationships.build.data` 回显不可靠，勿据此误判**） |
| 重提审 | `python3 scripts/asc-resubmit.py check`（只读盘点）→ 确认 Resolution Center 已回复 2.1(b) 后 `python3 scripts/asc-resubmit.py submit --yes`——**前置条件=Resolution Center 已回复 2.1(b)**——无公开 API，需在 ASC 网页手动发 |

### 2.1(b) 回复稿（Resolution Center 用，2026-10-08 定稿）

```
Thank you for the questions. Here are the details of our business model.

PlanET (version 1.0) is a completely free app. There is no in-app purchase, no subscription, and no paid content of any kind. Every feature in the app — the shared care list, today's tasks, medication tracking, records, trends, reminders, and sharing — is fully available to every user at no cost. Nothing in the app is locked, gated, or upgraded by payment.

1. Who are the users that will use the paid content, subscriptions, features, and services in the app?
No one — there is no paid content, subscription, feature, or service in the app. Every user has full, free access to everything the app offers.

2. Where can users purchase the content, subscriptions, features, and services that can be accessed in the app?
Nowhere — nothing in the app can be purchased, and no purchases are offered inside the app.

3. What specific types of previously purchased content, subscriptions, features, and services can a user access in the app?
None. The app does not access, display, or unlock any previously purchased content or services.

4. What paid content, subscriptions, or features are unlocked within the app that do not use In-App Purchase?
None. There is nothing that unlocks by payment of any kind.

For completeness, regarding our marketing website (joinplanet.pet): it offers an optional, one-time "founding membership" contribution that funds development, processed on the website by a third-party merchant of record. As our Terms state, the membership "is support for the build and a founding-member standing, not the purchase of product features. Today it unlocks nothing inside the app: the free core is the same for everyone." It is not a subscription, it grants no content, feature, service, or functionality within the iOS app, and nothing in the app references, links to, or depends on it.

We have also revised the app's screenshots per Guideline 2.3.10 — the status bar images have been removed, and the screenshots now show the app in use on iPhone. Thank you — please let us know if any additional information would help complete the review.
```

## 六·六、2026-10-10 真实模拟器实拍批（founder 指令）

2.1(b) 回复已由 founder 发出；重提审被 409（Version is not ready）连环拦，根因清单与处置：

| 根因 | 处置 |
|---|---|
| 灵动岛 iPhone 中等显示屏槽为空（ASC 新必填槽，1206×2622/1179×2556） | **真实模拟器实拍 6 张替换**：Xcode 27 beta + iPhone 17 Pro（iOS 27.0）+ 1d73ec0 worktree Release 构建 + 本地后端（planet_shots 库）英文演示种子 + keychain 注入会话 + idb ui 导航。真状态栏+灵动岛，founder 验收口径 |
| care_plans.family_id 被拒审转态清空（today 查询按 ci.family_id 过滤） | SQL 补回（种子脚本漏项已修：`scripts/seed-demo-en.sql` 同步） |
| App 销售范围（appAvailabilityV2）资源被清空 | **API 无创建路由（POST 全 404/405）——唯一解=ASC 网页「定价与销售范围」保存一次（待 founder）** |
| App 审核（侧边栏红点） | 待 founder 网页核对 |

其它：iPhone Duo 槽（`APP_IPHONE_DUO`）已撤空待真拍——本地 Xcode 27.0 beta 无 Duo 设备类型（需 27.1）；该槽 2026-10-05 起可传、2027-04 起强制。6.5″ 槽保持无状态栏合成图（合规：无伪造系统 UI）。真截图资产：`APP/store-screenshots/iphone-6.3-sim/`；种子：`scripts/seed-demo-en.sql`。

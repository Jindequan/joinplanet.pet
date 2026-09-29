# App Store 元数据事实源（v1.0）

创建：2026-09-28。**本文件是 App Store 上架文案的唯一事实源**；ASC 表单与 API 写入都只是它的投影。
英文（`en-US`）为主语言，本节文案即截图与商店页的共同来源。改动先改本文件，再改 ASC。

---

## 一、截图（6 张，iPhone 6.5" = 1284×2778）

产物：`APP/store-screenshots/iphone-6.5/*.png`；管线与设计规格见 `APP/store-screenshots/README.md`。

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

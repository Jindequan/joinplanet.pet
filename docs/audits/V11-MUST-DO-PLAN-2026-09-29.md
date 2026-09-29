# v1.1 必做批施工单（2026-09-29）

> **门禁状态（2026-09-30 凌晨更新）**：Codex 只读核对跑完 1.77M token 调查后，在输出终表前被中继 429 打断（重试仍 429）。四条关键中间结论已从其日志完整提取并**采纳修订**（L79 原语换 InviteSheet／L83 拆类型不收窄／L86 确定性选人／L87 按操作分键，均见各施工卡「Codex 修订」注）；⑤ 已本体亲核兜底（reminders/alerts 有真实推送投递 `notify/scheduler.go:166/266`，仅 digest 死）。**临时门禁=新上下文子代理对修订版做对抗复核**；Codex 终审欠账登记，恢复后对终版 diff 补门，补门未过前不 push。

来源：DEFECT-LEDGER 第十一节（2026-09-28 C 端体检，L79–L104）。founder 令「do，1.1 必须要做的事情」。
范围 = **P1 全量（L79/80/81/82/83/86/87/91）+ L99**（P2 但海外观感硬伤 + 可能出现在审核员面前，founder 点名必须）。
**明确不做**：其余 P2/P3（L84/85/88/89/90/92–98/100–104）不在本批；无 DB 迁移；不发版（v1.1 打包另行走 Xcode Cloud，本批只改代码）。

与在审 v1.0（build 83，WAITING_FOR_REVIEW）完全隔离：本批改动只进仓库，不影响在审构建；ios/ 改动（L99）也要到 v1.1 构建才生效。

## 三处已拍默认（founder 可推翻，推翻即回炉）

| # | 默认裁定 | 依据 |
|---|---|---|
| L83 | **删除「每日照护摘要」开关行**（`notifications-screen.tsx:196-204` 一带），后端 `digest` 偏好字段保留不动 | in-app 摘要面已在 09-28 IA 清缴整族删除（`planet-api.ts:419` 自注零消费方）；唯一投递通道邮件默认 off、调度器整档跳过 → 开关无任何可观测效果，触犯「点了没反应的按钮=不该存在的按钮」。真实投递通道（推送摘要）立项时开关回归 |
| L86 | **注销时归档宠所有权自动移交剩余家庭 owner**；注销人=唯一成员时归档宠随账号终结（无从移交，物理事实）；注销页确认文案同步改写（现文案「只有宠物所有者可以恢复」在该路径为假） | 归档宠=纪念态，家人保留纪念优先于删号洁净；移交后反归档/恢复的 owner 门不再坍塌。守卫是否扩到「归档宠存在即拦截」**不采纳**——给删号人强加清理义务过苛 |
| L91 | **双管齐下**：①后端 petshares 创建时 `NotifyUser` 推送（复用 care_requests 既有 APNs 通路与失效清理）②前端底栏徽标类目补 `shareIncoming`，且徽标与 Requests 页头计数**收敛为同一单源函数**，两处只消费 | 徽标/页头不同源=「页头说 1 件事底栏是空的」；共享请求零触达=确认制半边瘫痪。法条核对点：「一数一家」允许底栏徽标（既有先例=careRequest/handoff），本项是把**两个家合成一个家**，不是新增复述 |

## 波次派工（同仓并行以文件所有权不相交为界；2026-09-30 门禁修订后五波文件互不相交，A1/A2/A3/B1/B2 可全并行）

| 波次 | 代理 | 仓库 | 文件所有权（不得越界写） |
|---|---|---|---|
| A1 | 后端组 | planet-api | `lifecycle/`、`petshares/`、通知测试；L86+L91 后端 |
| A2 | 前端机械可靠性组 | APP | `today/screen.tsx`（L80）、`core/photo-upload.ts` + `ui/components/modal-sheet.tsx` + `ui/components/unsaved-changes-guard.tsx`（L81，opt-in 解耦）+ `timeline/composer.tsx`（L81 竞态+L87）、L87 其余清单文件（care-plan-form/care-plan-edit/medications-section/family-sheets/account/sharing-section）、对应 e2e |
| A3 | 原生本地化组 | APP ios/ + app.json | `ios/PLANET/Info.plist`、`ios/PLANET/*.lproj/InfoPlist.strings`、`project.pbxproj`、`app.json` 插件串 |
| B1 | 邀请入口组 | APP | `core/activation/`（`screen.tsx` ready 拦截 + 新 kv 完成标记文件）、`setup-journey.tsx`（只读参照）、对应 e2e；**只消费 InviteSheet，不得改 `invite-sheet.tsx` 本体** |
| B2 | 产品正确性组 | APP | `care-section.tsx`/`care-plan-card.tsx`、`notifications-screen.tsx` + `core/api/planet-api.ts`（仅 L83 拆类型）、`floating-tab-bar.tsx`、`web-workspace-rail.tsx`、`requests-screen.tsx`、`core/notifications/contract.ts`、注销文案 `src/i18n/*/account.json`、对应 e2e |

**i18n 命名空间纪律（防跨波同文件双写）**：A2 只动 settings.json、B1 只动 activation.json（或 today.json）、B2 只动 account.json 与删除的 digest 键（settings.json 的 digestRow/digestDesc 删除归 B2——B2 是唯一动 settings.json 的波次，A2 确认无新文案则不碰）。**e2e 公共 helper 只准追加式改动并在报告里声明**；任何代理**不得执行 git commit/checkout/stash**（提交由本体统一收口）。

## 逐项施工卡

### L79 邀请第二位照顾者入口（B1，设计重）——**Codex 修订：原语从 petshares 换成家庭邀请 InviteSheet**
- Codex 结论：petshares 是跨家庭宠物访问原语——只有目标家庭 owner 能接受、只授予宠物访问权、**不使对方成为家庭成员**，用于「邀请照顾者」语义错误。正确原语=已存在的 `src/features/families/invite-sheet.tsx`（邀请码+caregiver/viewer 角色+系统分享+重新生成，重试幂等键语义齐全）+ `families.refreshInvite`。hero 底部邀请钮已是 icon-first（Users glyph + `families.inviteMembers`，`family-hero.tsx:136-147`），**无需升级**。
- 落点：`setup-journey.tsx:55-77`（三分支穷尽、无邀请段）；`today-rows.ts:218-222`（单人家庭交班被门控——邀请解决后自然消解，本批**不**改门控）。
- 做法：**门禁修订——宿主从 SetupJourney 换到 activation ready 拦截**。状态机实锤：activation 只有 4 相（`core/activation/state.ts` deriveActivationPhase），照护一完成 phase=ready 即卸载跳转（`activation/screen.tsx:72` Redirect；`setup-care-screen.tsx:44` 完成即 replace 离场；today 宿主 `today/screen.tsx:255`+`today-lists.tsx:113` 同门），**SetupJourney 挂着时不可能「齐活」，原方案零渲染窗口**。修订做法：`activation/screen.tsx` ready 分支拦截——`phase==='ready' && !kv邀请步完成标记` 时先渲染邀请步（内嵌既有 InviteSheet，familyId/familyName 由宿主注入，role 默认 caregiver）再 Redirect；跳过/关闭即写 kv 标记（新文件，持久化），保证「跳过后重进不再出」可测且只打扰一次。hero 邀请钮已是 icon-first，不动。
- 法条核对：无教学文案（步骤副题只准一句动作语义）；新文案五语字典键齐（B1 命名空间=activation.json）；`check:design` 过。
- 验收：e2e——首次 ready 时邀请步出现，可完成可跳过；跳过后重进不再出；既有 activation 各相 e2e 不回归。

### L80 深链/推送丢目标日期与高亮（A2）
- 落点：`today/screen.tsx:65-66,81-95,135-138`（写 focus 的 effect 不随 scopeKey 重跑、清理 effect 挂载即执行且后声明者胜出）。同库正确范式=`timeline/screen.tsx:109-118`（ref + 一次性 setParams）。
- 做法：照 timeline 范式重写 focus 承载，深链参数挂载一次落位、不被清 effect 抹掉。
- 验收：e2e——Records 详情「打开照护任务」与 `?focus_date=` 深链落到**目标日**且高亮目标卡； Today 冷启动不受影响。

### L81 照片直传无超时 + 弹层锁死（A2）——**门禁修订：真取消原语 + opt-in 解耦**
- 落点：`photo-upload.ts:184-188`（web fetch 无 signal）、`:192-196`（原生 uploadAsync）；`modal-sheet.tsx` 五路关闭前提 `!busy`（:85/:118/:151/:166/:211-213，**33 个文件消费此基座**）；`unsaved-changes-guard.tsx:129` busy 直接 return（同 guard :81/:148 联动）；composer 卸载补偿 `composer.tsx:581-586`。
- **门禁勘误**：仓内 expo-file-system@~19 legacy 已有真取消原语 `createUploadTask` + `UploadTask.cancelAsync`（`node_modules/expo-file-system/build/legacy/FileSystem.d.ts:167-186`）。Promise.race 方案**弃用**——留僵尸连接（iOS NSURLSession ~60s 才死），且超时后 abandon 先落、僵尸 PUT 后落会在 R2 复活孤儿对象且台账已销。
- 做法：①web=AbortController + 15s；②原生=改 `createUploadTask`，超时 `cancelAsync()` 真断连→置败解锁→错误可见可重试（重试走既有票据复用）；③busy 与弹层关闭解耦做成 **opt-in 新 prop**（默认保持现语义，仅 composer 显式启用，禁止全局翻转基座契约）；④语义定死并注释：上传中关闭=先 `cancelAsync()`/abort → abandon 票据 → **保留草稿**（时序必须 cancel 在 abandon 前，闭合 `composer.tsx:581-586` 的在途竞态）；⑤guard busy 分支同单元改掉。
- 验收：e2e——`route.abort()` 模拟弱网：失败 toast 可见、弹层可关、可重试、重试不产生孤儿对象；正常上传既有 e2e 全绿；其他 32 个弹层消费方零行为变化（改的是 opt-in 默认关）。

### L82 计划归档无恢复入口（B2）
- 落点：后端已备 `tasks/service.go:1074`（`care_plan_restored` 审计）与 `:1123-1132`（两条恢复入口）；前端 `care-plan-card.tsx`/`care-section.tsx` grep `restore` 零命中；停药自动归档 `meds/service.go:437-440`。
- 做法：照护段归档计划分组内提供恢复动作（icon-first，次级入口长在作用对象旁=归档卡自身）；恢复后 toast 反馈（对齐同级暂停/恢复既有 toast 模式 `care-section.tsx:57,142`）。
- 验收：e2e——归档→恢复往返；恢复后计划回活跃列表；审计动作落库。

### L83 摘要死开关（B2）——默认裁定见上表；**Codex 修订：拆类型，不收窄**
- Codex 结论：`NotificationPrefs` 是**响应**类型，后端仍会返回 `digest` 字段，整体收窄=响应契约造假。正解：保留 `NotificationPrefs` 响应类型原样，另拆 `NotificationPrefsUpdate`（不含 digest）作为更新体类型。
- 做法：删 `notifications-screen.tsx:196-204` digest 行与 `savingKind` digest 分支；更新体走 `NotificationPrefsUpdate`；字典键 `settings.digestRow/digestDesc` 五语同删（check:i18n 过）。后端字段/端点不动。
- 验收：设置通知页无该行；e2e 无回归；五语键集对齐；typecheck 过。

### L86 注销孤儿归档宠（A1 后端 + B2 前端文案）——默认裁定见上表；**门禁修订：补插行半步 + 候选池实形 + 文案真落点**
- 实现勘误（门禁）：`pets.current_owner_user_id` 不是物理列，是派生子查询（`pets/repo.go:31-35`）——只改 `ended_reason` 宠物依然无主。必须两步：终结旧 ownership 行 **+ INSERT 新 pet_ownerships 行**（owner=继任者，valid_from=now()）。
- 候选池实形：守卫保证注销时自建家庭单成员→同事务内家庭被删（`lifecycle/service.go:47-61/68`）、链接被撤（`:82-87`）→**仅存于自建家庭的归档宠必然无候选**（fallback=随账号终结，正确）；有候选的场景=经 petshares 接受产生的共链家庭（`petshares/repo.go:149` 建 family_pet_links，该类链接 `:82-87` 不撤）。确定性选人=存活共链家庭的现任 owner，`ORDER BY joined_at ASC, user_id ASC` 双键防并列。
- 文案落点勘误：真落点=`src/i18n/*/account.json` 的 `confirmDeleteConsequence`（消费点 `account/screen.tsx:268`，现文「名下资源按服务端保护期处理」）——改写为移交/终结两去向照实陈述（不新增教学句）。**`src/i18n/zh/pets.json:59`「只有宠物所有者可以恢复」在宠物删除路径上陈述仍为真，禁改。**
- 做法：注销事务内按上述两步+规则移交；集成测试钉住三路径：唯一候选移交成功且可被其恢复 / 自建家庭宠无候选随账号终结 / owner-名下有成员家庭拒删路径不回归。
- 验收：见上；另有共链家庭时断言选了 joined_at 最早者；前端文案五语。

### L87 幂等键失败不轮换（A2）——**Codex 修订：个别挂点要按操作+范围分键，不只 fingerprint**
- Codex 结论：个别挂点**一个键服务两个操作**——部分失败后改内容重试，fingerprint 轮换也救不了，必须**按操作+范围各持一键**。门禁勘误（例子改准）：composer 里真正一键两操作的是 **EventForm 的 update(:313)/create(:322) 共用同一 commandId ref**（照片上传走票据 objectID 不消费幂等键，别按错误示例修出多余抽象）。
- 落点（ledger 清单，代理以 grep 复核为准）：`composer.tsx:674/688/710`、`care-plan-form.tsx:186`、`care-plan-edit.tsx:136`、`medications-section.tsx:368/402`、`family-sheets.tsx:48`、`account/screen.tsx:79`、`sharing-section.tsx:383`。正确范式=`settings/screen.tsx:99-103` 与 `invite-sheet.tsx:48-56`（fingerprint/失败保留键）。
- 做法：逐挂点判定——单操作挂点改 fingerprint 范式；多操作共用键的拆成每操作一键（键名带操作域）。同 payload 重试复用键（幂等保持）、payload 变化才轮换。
- 验收：e2e——保存失败→改内容→重存成功不 409；同内容连点不产生双条目；照片+正文组合场景不互相踩键。

### L91 共享请求零触达（A1 后端 + B2 前端）——默认裁定见上表
- 落点：后端 petshares 模块零 `NotifyUser`（对照 care_requests 通路）；前端 `floating-tab-bar.tsx:47-56`、`web-workspace-rail.tsx:59-68`（徽标两类）、`requests-screen.tsx:103-104`（页头含 shareIncoming）。
- 做法：①后端请求创建时推送目标 owner（载荷类目/深链对齐既有通知契约 `core/notifications/contract.ts`；失效 token 清理复用）②前端新建单源计数函数（careRequest+handoff+shareIncoming），徽标与页头同消费；徽标点击落 Requests 页。
- 验收：后端测试——创建共享请求触发一次推送、载荷断言；e2e——pending share 存在时徽标数=页头数（同源断言），深链落 Requests。

### L99 系统权限弹窗硬编码中文（A3）
- 落点：`app.json` expo-image-picker 插件串（photosPermission/cameraPermission，中文）；`ios/PLANET/Info.plist:55-58` 同两键；全仓无 `*.lproj`。
- 做法：①`app.json` 两串改英文（未来 prebuild 的基底语言）②`Info.plist` 同改英文③新增 `ios/PLANET/{en,zh-Hans,ja,es,pt}.lproj/InfoPlist.strings`（NSCameraUsageDescription/NSPhotoLibraryUsageDescription，en=zh-Hans 以外四语真翻译）④`project.pbxproj` 登记 variant group + knownRegions——**手工改 pbxproj 属高风险区，改完必须 `plutil -lint` 全部 .strings/.plist + 尽可能 xcodebuild list 验证工程可解析**；真机构建验证随 v1.1 build 84。
- 验收：静态——五语 .strings 齐且键与 Info.plist 一致、plutil 全绿、typecheck 不涉及；运行时验证登记为 build 84 出包后的 TestFlight 检查项。

## 全批验收门（缺一不过）

1. APP：`typecheck` + `lint` + `check:i18n` + `check:design` 全绿；`test:e2e` en 主线全绿（改到路由须同步 `scripts/control-sweep.cjs` 清单——该文件有 09-28 遗留未提交改动，见下）。
2. planet-api：全量集成测试绿；无迁移、无契约破坏（`DisallowUnknownFields` 字段面不变）。
3. **复审门不可省**：全部落地后 code-reviewer 过一遍（前科：实现代理连续三批自产 P1）。
4. 新文案 100% 走五语字典；祈使句教学文案零新增；icon-first 合规。
5. 收尾提交：~~09-28 遗留两文件单独落库~~（**已完成**，APP 仓 commit 90eb1b0，两仓 working tree 干净）→ 本体统一按波次分 commit 落库本批；docs 仓落施工单+台账销号。**代理一律不执行 git commit/checkout/stash。**

## 遗留登记（不阻塞本批）

- L99 运行时验证、原生手势回归 → v1.1 build 84 TestFlight 轮。
- L98（web 手动刷新）、L88/89/90、L84/85、L92–L97、L100–L104 → 下批候选，founder 裁。

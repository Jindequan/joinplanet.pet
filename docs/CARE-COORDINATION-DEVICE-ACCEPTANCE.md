# 照护协作移动端验收跑本

状态：2026-09-15

当前证据：服务端协作验收通过；`./scripts/ios.sh` 已按原生 CocoaPods workspace 构建、安装并启动 `pet.joinplanet.app`，且脚本退出后 Metro 仍由 launchd 托管并持续返回 `packager-status:running`；iPhone 17 Pro Max Simulator 已实际渲染 PLANET 登录页，无开发服务器红屏。普通照护请求和批量交班的 Expo/APNs 模拟推送均已成功送入该设备；通知 category、Android channel 和客户端动作路由已有代码覆盖。2026-09-10 复测时，单项与批量通知模拟脚本退出码均为 0。通知动作路由同时修正为：点击“我来做”直接提交接手并回到同一请求上下文，点击“我也不行”进入继续转交，点击“给其他人”进入成员选择器。2026-09-13 在 Android Emulator 已完成通知栏卡片展示，并用三条真实照护请求分别点击三个系统动作；服务端回读状态为 `delegated`、`declined`、`accepted`，请求 ID 与结果一一对应。随后以请求 `25148cac-ffc8-433f-9aca-16798673db64` 完成断网点击与恢复后自动重放，API 日志记录 HTTP 200 的 accept，重新读取状态为 `accepted`。服务端现在为单项请求/批次推送设置稳定 `threadId`，iOS 模拟推送脚本同步写入 `thread-id`，避免多个请求被 SpringBoard 合并为无法逐项处理的摘要卡。单项和批量行动通知正文现在附带“打开 PLANET 处理”，应用内来人请求卡已覆盖系统按钮不可见时的主动作兜底，并由 Web/移动 E2E 验证。独立 XCTest 已用正确的顶部下拉打开 Notification Center，并对 PLANET 通知执行长按；SpringBoard 可见通知卡，但没有暴露自定义照护动作按钮，当前 XCTest 点击通知卡后未观察到 PLANET 进入前台，尚不能区分 SpringBoard 点击语义与应用冷启动路由问题，因此这条仍按未验收处理。当前主机 iOS 侧只有 `simctl` 命令行接口，没有可操作的 Simulator.app 无障碍界面；iOS 通知中心/锁屏按钮仍待可操作 UI 环境验收。本轮不安装实体手机，不提前宣称 P0 已通过。

2026-09-15 环境复核：`PlanetBuildCheck`（iOS 26.5，UDID `903172A5-BC93-4635-9877-7C335901B4FB`）仍可由 `simctl` 启动并截图；尝试打开宿主机 Simulator.app 返回“Unable to find application named 'Simulator'”，因此当前主机没有可操作的 Simulator 窗口。通知类别注册、DeliveredNotifications payload 和应用内兜底继续可验证，系统通知按钮保持未验收。

2026-09-15 本地协同复测：`./scripts/acceptance-care-coordination.sh` 服务端协同验收通过，并用其真实输出的 `request_accept_id=4f04787b-ac0a-44a7-9428-78057be00a66` 与 `care_handoff_batch_id=96be976f-d631-4b2e-b1bc-528bda0ac3bf` 向 `PlanetBuildCheck` 发送单项/批量通知；`acceptance-care-notification-inspect.sh` 分别确认运行时注册的 action 与 DeliveredNotifications payload ID。该结果补强“服务端责任链 + 通知送达 + 类别注册”证据，仍不替代系统通知按钮点击验收。

2026-09-13 22:09 复测补充：在同一 iOS 26.5 Simulator 重新构建 XCTest，并用 `simctl push` 发送带 `category=care_request`、稳定 `thread-id` 和业务对象 ID 的通知；`acceptance-care-notification-inspect.sh` 同时确认运行时 `Categories.plist` 含 `care_accept`、`care_decline`、`care_delegate`。SpringBoard 无障碍树在展开/长按后仍只出现 `ListCell`、`ShortLook.Platter.Content.Seamless` 等通知容器，没有三枚 `care_*` action button；点击通知卡或尝试查找系统 `Open` 控件也未取得 PLANET 前台证据。该结果与 payload/category 已注册的证据相互独立，故 iOS 系统按钮和通知点击继续保持“未验收”，不把 XCTest 的 UI 限制转写成产品通过。

2026-09-13 23:15 隔离复测补充：为排除 Expo/React 链路，在同一 iOS 26.5 Simulator 临时构建了只使用 `UserNotifications` 的原生控制应用；应用启动后注册同样的三枚 `UNNotificationAction`，授权后退出，再用 `simctl push` 发送 `care_request`。SpringBoard 日志明确记录 `new actions: 3`，但 Notification Center 的无障碍树仍只显示通知卡和系统的 `Options / View / Clear`，没有自定义动作按钮。该控制实验不属于仓库交付物，仅用于证明当前 iOS 26.5 Simulator 的系统通知 UI 行为不能作为 PLANET 动作按钮的验收环境；PLANET 的应用内来人请求卡仍是系统按钮不可见时的可用兜底。

2026-09-13 补充：iOS Debug 在移动端 Today 首屏布局改动后再次通过 CocoaPods workspace 构建、安装并启动；客户端通知注册结果已暴露到“通知设置”：成功登记、系统权限未开、登记失败和重新检查分别有明确状态；退出登录会等待注册完成并删除当前设备令牌。该证据证明失败可诊断、账号切换不会遗留设备绑定，但不替代下面要求的可操作 Simulator/Emulator 通知展示与按钮点击验收。

2026-09-13 再补充：iOS 原生目标加入 `UIScene` manifest 与 `SceneDelegate`，React 窗口在场景连接时复用并挂载到 `UIWindowScene`。同一构建已在 iOS 26.5 与 iOS 27.0 Simulator 启动到登录页；此前 iOS 27 的 `NoSceneLifecycleAdoption` 系统级退出已消失。通知中心按钮仍需可操作 UI 环境单独验收。

发布配置要求：预览/生产环境必须注入 `EXPO_PUBLIC_EAS_PROJECT_ID`。仓库不提交或猜测 EAS UUID；动态 Expo 配置会把该变量写入 `extra.eas.projectId`，缺失时设备页会明确显示登记失败，而不是把通知设置误报成已生效。

本地 Debug/Simulator 构建例外：缺少 EAS project id 时仍会申请系统通知权限，但不会登记远端 Expo token，便于用 `simctl push` 验证通知中心；预览/生产构建仍保持上述 fail-closed 规则。授权弹窗已在 iOS Simulator UI 自动化中通过。

补充证据：`./scripts/acceptance-care-notification-inspect.sh care_request` 与 `./scripts/acceptance-care-notification-inspect.sh care_handoff_batch` 已从该 Simulator 的 `DeliveredNotifications.plist` 读到对应的 PLANET 通知和 category。该检查证明系统通知存储收到了正确类别与内容，但不替代通知中心/锁屏按钮的视觉和点击证据。

动作契约检查：`./scripts/verify-notification-contract.sh` 会编译并校验单项/批量的 category、三个动作标识及默认打开路径，并同时检查 Go 服务端实际发送的 category/kind；它已加入 CI，防止服务端推送类别、原生按钮标识与客户端路由分叉。

通知分类和 Expo 原生通知 delegate 现在都在 App 启动阶段初始化，不依赖用户先完成登录；首次收到照护推送时，类别注册和冷启动响应都会先进入系统/Expo 的原生链路，JS 加载后再消费待处理响应。设备验收仍需证明冷启动、锁屏和离线点击后的真实系统 UI 与服务端责任链一致。

客户端处理通知响应后会消费 Expo 的 last response，并以通知请求 ID + 动作 ID 做匹配；因此重启不会重复执行旧动作，处理期间到达的新动作也不会被旧响应的清理操作误删。

通知动作打开成员选择器后会消费 `care_action` / `care_batch_action` 深链参数；取消选择后再次进入 Today，不会被旧参数重复弹出转交流程。

批量安排通知样本：`./scripts/acceptance-care-batch-notification-sim.sh <care_handoff_batch_id>`。它使用 `care_handoff_batch` 原生 category，按钮为“我来做 / 我也不行 / 给其他人”；具体事项选择和成员选择仍在 App 内完成。

点击“我也不行”后，App 会先记录批量拒绝，再直接打开“继续安排这段照护”的成员选择器；不能把批量拒绝留在没有下一步的状态。

如果成员关闭了选择器，批量状态卡仍会对“当前成员已拒绝、尚无下一位、事项尚未完成”的项目显示“继续安排”入口；已经创建下一环或已经完成的项目不会被重新带回选择器。

目标：验证系统通知行动卡、责任转接和离线重放在可操作的 Simulator/Emulator（或另行授权设备）上形成完整闭环。该验收只验证产品行为，不验证商业指标。

## 参与者与准备

- 设备 A / 账号 A：当前照护负责人或请求发起人；
- 设备 B / 账号 B：接收照护请求的人；
- 设备 C / 账号 C：用于拒绝后的继续转交；
- 三个账号加入同一 Family，并都能看到同一只 Pet；
- 为同一项 Care Occurrence 配置明确的到期时间和当前负责人；
- A、B、C 都允许通知，记录三台设备的系统版本、App 版本和推送 token 注册结果。

每个场景开始前，先确认上一条请求已经完成、拒绝或过期，避免旧请求影响判断。

## 服务端前置验收

在占用移动端运行环境前，先运行：

```bash
./scripts/acceptance-care-coordination.sh
```

通过后再进行本文件的真实通知验收。该脚本覆盖请求幂等、接手、临时照护完成、拒绝、转交、转交后的完成，以及“事项先完成则自动取消开放请求”；它不替代设备上的通知展示、按钮点击、冷启动与断网重放测试。

## 场景 1：通知卡片直接接手

Simulator 可用服务端验收输出的真实 `request_accept_id` 发送本地 APNs 样本（实体设备若另行授权，才走真实推送令牌）：

```bash
./scripts/acceptance-care-notification-sim.sh <request_accept_id>
```

如果系统弹出“Open in PLANET?”，先在 Simulator 上确认打开，再继续执行锁屏/通知中心和三个行动按钮的记录；不要把 `simctl push` 成功或确认框截图当成行动卡按钮已验收。

0. 让 B 保持在 Today 前台；确认仍能看到协作通知，Android 通知进入“照护协作”高优先级频道。
1. A 在 Today 发起“给 B”的照护请求，并写入一条上下文备注。
2. B 在锁屏/通知中心收到包含“我来做 / 我也不行 / 给其他人”的行动卡。
3. B 点击“我来做”。
4. B 在 Today 点击“我做完了”，再让 A 与 B 刷新 Today。

预期：

- 请求状态为 `accepted`；
- Occurrence 当前负责人变为 B；
- B 即使只是临时接手者、没有被加入照护计划的长期协作者名单，也能完成这一次 Occurrence；
- 完成事实中的执行人是 B，而不是请求发起人 A；
- A、B 看到同一个负责人和同一条照护事实；
- 重复点击或重新打开通知不会产生第二条请求或第二次负责人变更。

证据：B 的通知截图、A/B Today 截图、请求详情 JSON、Occurrence 当前负责人和事件列表。

## 场景 2：通知拒绝后继续转交

1. A 再发起一条“给 B”的请求。
2. B 点击“我也不行”。
3. B 应直接看到“继续转交”成员选择器，选择 C 并确认。
4. C 收到新的行动卡并点击“我来做”。

预期：

- 原请求保留为 `declined`，不可被伪装成已接手；
- 新请求指向 C，原请求与新请求通过 `supersedes_request_id` / 事件链关联；
- C 接受后，Occurrence 当前负责人变为 C；
- A 收到不可操作的“已转交给 C”状态反馈，不会看到只属于 C 的接手按钮；B 不会因为重复回放而收到重复推送；
- 任意时刻只有一个有效负责人。

## 场景 3：通知直接给其他人

1. A 发起“给 B”的请求。
2. B 点击“给其他人”。
3. App 直接打开该请求的成员选择器，B 选择 C。

预期：

- B 不需要先进入收件箱再重新寻找请求；
- B 确认后原请求变为 `delegated`，C 收到新行动卡；
- 责任仍绑定在原 Occurrence，不创建平行待办。

## 场景 4：断网点击行动卡

分别测试“我来做”和“我也不行”各一次：

1. B 先确认请求已出现在通知中。
2. 关闭 B 的网络，点击通知动作。
3. 重新打开 App，确认 Today 出现照护协作同步状态。
4. 恢复网络，等待自动同步，或点击“立即同步”。

预期：

- 动作不会静默丢失，也不会显示为已经成功但服务端没有变化；
- 同一个 `commandId` 被重放，不生成重复事件；
- 同步完成后请求、Occurrence、Today 和通知状态一致；
- “我也不行”同步成功后，继续打开“继续转交”流程。

## 场景 5：并发、过期与完成竞态

- B 同时从通知和 App 收件箱点击“我来做”：只允许一个最终成功，另一个收到最新状态；
- 调度器过期请求的同时，B 点击“我来做”：只能出现 `accepted` 或 `expired` 其中一个终态；
- B 接手后 A 完成该 Occurrence：请求链成员看到真实执行人和完成事实，重复完成通知不增加；
- Occurrence 已完成后再点击任何请求动作：服务端拒绝，不能重新分配已完成事项。

## 通过门槛

以下条件全部满足才算 P0 移动端验收通过：

1. 三个系统通知动作都能从真实通知进入正确路径；
2. 断网动作可持久化并自动重放；
3. 拒绝必然有继续转交路径；
4. 并发、过期、重复点击不会制造两个负责人；
5. Today、请求收件箱、Pet Event 和推送结果对同一状态保持一致。

若失败，先记录“设备 / 账号 / 请求 ID / commandId / action / 当时网络状态”，再按推送展示、客户端队列、API 状态机、数据库事件四层定位，不用截图推断服务端状态。

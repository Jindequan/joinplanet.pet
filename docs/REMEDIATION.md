# PLANET 产品整改 — 架构落地说明

状态：2026-09-15

本文记录产品审计后的**完整架构整改**实现状态。宪法仍以 [PRODUCT.md](../docs/PRODUCT.md)、[FOUNDATION.md](../docs/FOUNDATION.md) 为准。

## 客户端横切包

| 包 | 路径 | 职责 |
|----|------|------|
| activation | `APP/src/core/activation/` | 激活阶段推导、登录后路由 |
| collaboration | `APP/src/core/collaboration/` | 照护值班/责任视图（正式 care-responsibility，旧 summary 仅兼容回退） |
| capabilities | `APP/src/core/capabilities/` | 服务端能力矩阵（推送/i18n/导出），404 回退默认值 |
| presentation | `APP/src/core/presentation/` | 术语、跳过 copy、删除影响说明 |
| resolved scope | `APP/src/core/scope/resolved-scope.ts` | Scope + 时区 + todayQuery 唯一出口 |

## 视图模型

| 模块 | 路径 |
|------|------|
| Today 排序/补记/跳过 | `APP/src/features/today/model/` |
| Pets 列表分区 | `APP/src/features/pets/model/list.ts` |

## 路由与 IA

- 登录后 → `/(tabs)`（今天）。未完成开通时由 SetupJourney 当唯一教练；`/activation/*` 仅作旧链重定向。
- Pet 记录子路由 → 锁定当前 Pet 的记录工作区，不再把用户踢回全局页面
- Tab 图标：今天=Sun，记录=ClockCounterClockwise，宠物=PawPrint，更多=DotsThree；照护请求由独立底栏入口承载并保留待处理数量，家庭管理不占日常底栏
- Pet 工作区 Tab「对外分享」；列表点击不再劫持到 Today（改用 PendingCareBanner）

## 后端 API

| 端点 | 用途 |
|------|------|
| `GET /me/activation-summary` | 一次返回激活指标；客户端仅对旧服务端保留聚合回退 |
| `GET /me/capabilities` | 诚实能力矩阵 |
| `GET /families/{id}/care-responsibility` | L3 协作读模型 |

激活摘要已经接入服务端：家庭数、活跃宠物数、拥有活跃计划的宠物数和今日待办一次返回，避免按宠物 fan-out 请求并避免大规模宠物场景下的近似判断。

## 验收

```bash
cd APP && npx tsc --noEmit
./scripts/verify-extension-layer.sh
./scripts/verify-client-layers.sh
./scripts/dev.sh reload
```

双账号剧本：邀请 → Today 完成 → Timeline → 值班 claim/release。

## 2026-09-12 前端补强与验收

- [x] 分享链接统一指向公开站点 `/s/:token`，邀请码深链自动预填并在提交前校验 10 位字母数字格式。
- [x] Today 只保留照护事项上下文，请求收件箱集中到请求中心；家庭列表不再为每个家庭 fan-out Today 查询。
- [x] Pet 工作区固定为档案 / 照护两栏；公开分享缺少 token 时有明确空态和恢复提示。
- [x] 时间线离线回放提交时合并并发新增事件，避免覆盖用户刚写入的本地记录。
- [x] 全局请求提示条统一承担收件箱轮询，请求中心复用缓存，避免重复轮询；照护响应入口统一满足 44pt 触控目标。
- [x] Today 移动端默认收起日期条，把当前照护主操作放到首屏；桌面端保留展开日期视图。
- [x] Today 的临时照护和家庭摘要默认收进“更多照护工具”，用户先处理当前清单，需要时再展开次要功能。
- [x] “更多照护工具”说明按当前可用能力动态显示，不再把不可用的家庭摘要或临时记录写进首屏文案。
- [x] 多成员照护卡默认突出“我来做”；“我也不行 / 给其他人”收进“更多”，保留完整责任链能力但降低首屏决策负担。
- [x] “更多”页移除重复的照护请求入口和轮询；请求只在底栏“请求”页处理，治理页只保留家庭、趋势、设置和账户。
- [x] 统一低频分组标签使用句式大小写，避免英文环境出现装饰性全大写；确认对话框与旧页头沿用同一文字层级。
- [x] 首次激活页移除“先进入今天”的空工作台出口，只保留当前步骤主动作；权限不足时明确进入家庭管理。
- [x] 登录、表单和查询错误提供可访问的 alert 语义；系统减少动效偏好通过共享订阅生效。
- [x] 展开明细、查看责任链、调整时间、设备退出和继续安排等次操作统一提升到 44pt 触控目标，避免小屏误触。
- [x] `PressableScale` 默认暴露 `button` 语义；特殊控件仍可覆盖为 `tab` 等角色，避免视觉可点击但读屏不可理解。
- [x] `APP/e2e` 覆盖桌面 1280 与移动 390：认证边界、邀请码预览/非法码拦截、过期分享空态、Today 完成后刷新读取持久化状态。

验证命令：

```bash
cd APP && npm run test:e2e && npm run typecheck && npm run lint && npm run verify:frontend
cd ../planet-api && TEST_DATABASE_URL=postgres:///postgres go test ./...
```

移动端通知中心/锁屏按钮和冷启动仍按 [CARE-COORDINATION-DEVICE-ACCEPTANCE.md](CARE-COORDINATION-DEVICE-ACCEPTANCE.md) 单独验收；Android 断网重放已用真实请求闭环验证。Simulator 的 DeliveredNotifications.plist 只能证明系统收到了通知，不能替代按钮点击证据。

## 2026-09-13 最终回归证据

- `cd APP && npm run test:e2e`：桌面 1280 与移动 390 共 54/54 通过，覆盖认证边界、未登录直达账户页重定向、邀请码预览与非法码拦截、过期分享恢复、Today 完成后刷新读取服务端状态、次要工具和替代责任动作默认收起并按需展开、单次排程调整与临时照护新增、More 页不重复显示请求入口、五个主入口、九个管理/设置页和十五个对象/激活路由逐页核验可读主标题、返回入口及移动端宽度、管理页返回实际落到正确父级、可恢复的家庭加载错误、照护转交成员查询失败后的手动重试、请求中心宠物权限查询失败后的手动重试、后台请求轮询失败后的轻量提示与重试、全家庭摘要失败后的明确错误与重试、长宠物名称不造成移动端横向溢出、移动登录输入聚焦时主按钮仍可见、空显示名提交前拦截、家庭/宠物/照护/分享/转移的只读权限边界，以及系统通知按钮不可见时应用内来人请求卡仍可完成“我来做”；同时锁定桌面日期条展开、移动日期条收起的首屏规则。
- `cd APP && npm run typecheck && npm run lint && npm run verify:frontend`：全部通过，前端契约守门 33/33 通过（含次操作、角色/负责人排序、通知开关读屏状态、日期/时间/快速记录输入边界、全局崩溃恢复与关闭按钮 44pt 触控目标、默认按钮语义、Simulator-only 原生启动路径、UIScene 生命周期、冷启动通知 delegate、Today 次要工具折叠、协作动作分层、More 去重复入口、旧 API 二进制重建保护、移动发布预检入口、行内加载状态语义、事实来源说明、Today 忙碌状态语义）。
- `./scripts/acceptance-phase-a.sh`：使用本地真实 API 完成登录 → Family → Pet → Care Plan → Today → 完成 → Timeline，全链路通过。
- `./scripts/acceptance-care-coordination.sh`：使用当前源码启动的本地 API 完成双账号邀请、成员权限、请求/批量交班、拒绝后重排、幂等重放、完成后收束和取消保护，全量通过。
- `cd APP && npm run doctor`：Expo Doctor 16/16 通过；通知契约、extension 层和 client 层守门脚本全部通过。通知契约脚本同时检查 Simulator 权限失败的可读恢复提示。
- `cd APP && npx expo export --platform web --output-dir /tmp/planet-web-export-20260913-final`：Web 产物成功导出。
- `./scripts/ios.sh`：CocoaPods workspace Debug 构建、安装并启动 `pet.joinplanet.app` 成功；本轮引入 Metro `image-size` 安全 alias 后再次构建通过；iPhone 17 Pro Max Simulator 截图复核 Today 移动端日期条默认收起，当前照护主按钮位于首屏且未被底部导航遮挡。
- `scripts/ios.sh` 已固定为 Simulator-only（使用 `simctl` 安装/启动，禁止物理设备 fallback）；本轮核验实体设备上 `pet.joinplanet.app` 不存在，后续原生验收仅针对 Simulator。
- `APP/android/` 原生工程已由 Expo prebuild 生成，`APP/package.json` 的 Android 启动入口已改为 `scripts/android-emulator.sh`：只接受 `emulator-*` 序列号并走 `expo run:android`，拒绝 Android 实体设备。脚本会自动准备本地 API、解析 AVD 名称，并反向转发 API/Metro 端口，避免 Android 把宿主机 loopback 当成设备自身。已在 arm64 Android 35 Emulator 上完成 Debug APK 构建、安装与启动，冷启动登录请求返回 202、验证码验证返回 200，随后读取家庭/宠物/激活状态并进入 onboarding；截图与 `uiautomator` 树核验了可访问文本、邮箱输入控件和主流程页面。
- 本轮 Android `:app:assembleDebug` 使用 OpenJDK 17、官方 CMake 3.22.1/Ninja 与 Android SDK 完成，Gradle 输出 `BUILD SUCCESSFUL`（312 actionable tasks）；构建产物约 58 MB。随后使用 `/tmp` 一次性测试 keystore 完成 `:app:assembleRelease`，Gradle 输出 `BUILD SUCCESSFUL`，产物约 36 MB，`apksigner verify --verbose` 报告 v2 签名有效且内置 `assets/index.android.bundle`。构建过程中清理的仅是可再生缓存与中间产物；生产签名密钥注入及通知中心/锁屏按钮交互仍未计入已验收范围。
- 额外以 `API_PORT=8091 EXPO_PORT=8093 npm run android` 验证非默认端口：脚本自动启动本地 API、反向转发两个端口，Emulator 启动后的真实请求落到 8091；退出后临时 `.env.local` 已恢复，不污染开发者配置。
- Android Emulator 运行后由 `dumpsys notification --noredact` 读到 `care_coordination` / “家庭照护”高优先级通知频道，震动、声音和 badge 配置均已落地；通知栏展示与一次动作回流已有模拟器证据，完整动作结果仍按设备验收继续补齐。
- 本轮进一步在 Android Emulator 的系统通知栏完成 UI 证据：卡片真实展示“我来做 / 我也不行 / 给其他人”三个按钮；点击“我来做”后，已登录 App 进入请求处理链并向本地 API 发出 `POST /care-requests/{id}/accept`，无效请求显示“这条照护请求不存在，或你已无权查看。”可恢复错误。通知由临时开发验收触发器产生，触发器已撤回，正式构建不包含测试入口；三动作结果与断网重放均已由有效请求验证，锁屏展示仍需继续验收。
- 随后用同一 Emulator 登录真实目标账号，建立三条新的照护请求并分别点击三种系统动作：`8e82af4e-a0ee-4ada-b495-224a4ce3eeea` 最终为 `delegated`（API 201），`87c8c683-a83e-40ca-a0cb-b11d0d6d96c7` 最终为 `declined`（API 200），`7f20b266-1dfb-4e6d-89ab-f8629e307439` 最终为 `accepted`（API 200）；随后重新读取三条请求确认状态一致。断网重放、锁屏和 iOS UI 仍单列验收。
- 同一 Emulator 继续完成断网重放：请求 `25148cac-ffc8-433f-9aca-16798673db64` 在 API 停止期间点击“我来做”，界面显示“暂时连不上 PLANET”且没有假成功；恢复 API 后，App 冷启动触发持久队列自动重放，服务端日志记录 `17:15:57` 的 `POST /api/v1/care-requests/25148cac-ffc8-433f-9aca-16798673db64/accept`（HTTP 200），用新 token 重新读取该请求为 `accepted`。这证明 Android 的“断网点击 → 本地保存 → 恢复后重放 → 服务端落库”闭环；iOS 通知中心/锁屏和 iOS UI 仍未验收。
- Android Release 默认不再使用 debug keystore；缺少 `PLANET_ANDROID_KEYSTORE*` 正式签名变量时，Gradle Release 任务直接拒绝。依赖安装后重新执行 `npx pod-install` 修复 ExpoAsset Pods 路径，`./scripts/ios.sh` 随后在 iOS Simulator 构建、安装、启动均通过。
- 发布守门补强：新增 `cd APP && npm run preflight:release`，只读校验 EAS 项目 UUID、iOS/Android 包标识、EAS production profile 和 Android 正式签名输入；缺项会一次列全，避免 Debug 能跑却无法发布。
- CI 守门补强：`.github/workflows/ci.yml` 现在每次 push/PR 都安装 Chromium 并执行 E2E、前端产品契约检查和 `npm audit --omit=dev --audit-level=high`，本地已验证 E2E 54/54、契约 33/33、high/critical 0。
- `npm audit fix` 与兼容性覆盖已修复可安全升级的 `@xmldom/xmldom`、`decode-uri-component`、`postcss`、`uuid`；官方 `image-size` 尚未发布包含 DoS 修复的 2.0.3，Metro 现通过锁定的 npm alias `@josuejuca/image-size@2.0.7`（同一 API、锁文件含完整 integrity）消除该间接依赖风险。`npm audit --omit=dev --audit-level=high` 当前为 high=0/critical=0；待官方上游发布修复版本后应移除 alias 并复核构建。
- `scripts/dev.sh` / `scripts/dev-app.sh` 已移除实体设备模式，默认只启动本机 Simulator Metro；`./scripts/dev.sh start frontend device` 实测以退出码 2 拒绝。
- 使用本轮服务端真实验收生成的 `request_accept_id=b068bd23-9704-4415-8aa0-3bb57717e640` 与 `care_handoff_batch_id=443d547a-a0bd-4bec-a052-1ea891fd697d`，分别运行单项/批量通知 Simulator 脚本，并由 `acceptance-care-notification-inspect.sh` 在 `DeliveredNotifications.plist` 找到 `care_request` 与 `care_handoff_batch`；这证明两类通知已送达 Simulator，按钮点击仍需可操作 UI。
- `xcrun simctl terminate` 后执行 `xcrun simctl openurl <udid> 'planet://requests/<id>'`：系统冷启动链路能触发“在 PLANET 中打开”确认页；当前环境没有可操作的 Simulator.app，确认按钮仍无法点击，因此不计入通知冷启动通过。
- 2026-09-13 真实链路复核：发现 8081 端口曾运行 8 月遗留的预编译 API，虽然 `/healthz` 正常却不能代表当前源码；已重建 API 并用 `scripts/dev.sh start backend` 启动当前源码，随后 `acceptance-care-coordination.sh` 全部通过。`scripts/ios.sh` 现在会比较 Go 源码与预编译二进制时间戳，发现旧二进制会先重建并只重启匹配的 PLANET API 进程，避免源码与验收服务错位。
- iOS Simulator 登录页键盘复核：邮箱输入获得焦点后，页面自动调整滚动 inset，主按钮“继续”保持完整可见；对应实现位于共享 `Screen` 滚动容器与认证页键盘避让层。
- 2026-09-13 再次运行 `./scripts/ios.sh` 时先清理可再生 iOS DerivedData，修复本机磁盘不足导致的 Metro `expo-asset` 缓存读取失败；随后 Simulator 原生壳重新构建、安装、启动并成功加载认证页。实体设备仍未连接。
- 同一 Simulator 重新发送真实请求 `25148cac-ffc8-433f-9aca-16798673db64` 后，`acceptance-care-notification-inspect.sh care_request booted` 找到 `DeliveredNotifications.plist`；仍只计入通知送达证据，不计入系统按钮点击通过。
- 通知验收脚本现支持第三个参数校验业务对象 ID；本轮分别用 `care_request + 25148cac-ffc8-433f-9aca-16798673db64` 与 `care_handoff_batch + 443d547a-a0bd-4bec-a052-1ea891fd697d` 重新发送并在同一 `DeliveredNotifications.plist` 找到精确 payload ID，避免只按通知类别误判。
- 通知验收脚本现在同时检查 Simulator 运行时 `Categories.plist`：本轮确认已安装 PLANET 二进制实际注册 `care_request` 与三枚动作标识；这补强了“原生注册 + payload 送达”证据，但仍不替代系统 UI 的按钮点击证据。
- 本地 Debug/Simulator 构建在缺少 EAS project id 时仍会申请系统通知权限，但不会登记远端 Expo token；这样 `simctl push` 可以真实进入通知中心，同时生产构建继续对缺失的 EAS 配置 fail-closed。iOS Simulator 的授权 UI 自动化已通过；通知中心按钮仍需可操作的系统 UI 环境继续验收。
- 单项照护请求和批量交班推送现在携带稳定的 `threadId`（iOS APNs 对应 `thread-id`），每个待处理对象保持独立通知线程，避免多个请求合并成一个无法逐项操作的摘要卡；服务端 Go 测试和 Simulator 推送脚本均已覆盖。
- 清理 iOS shared scheme 对不存在 `PLANETTests` target 的陈旧引用；当前工程只声明实际存在的 `PLANET` target，不把不存在的 XCTest 入口当成交付能力。
- iOS 原生 UIScene 兼容层回归：`NotificationSmokeTests.testLoginAndAuthorizeNotifications` 在 iOS 27.0 Simulator 通过，应用可冷启动并进入登录页；`testSystemNotificationButtonsAreActionable` 仍因当前 SpringBoard UI 未暴露“我来做”按钮而失败，故通知按钮保持未验收状态。
- 深层表单补强：家庭/宠物/照护计划/用药/时间线输入增加合理长度上限；保存失败统一以 `accessibilityRole="alert"` 暴露，药名与照护计划标题为空时在提交前拦截；`prod-preflight.sh` 现在一次列出所有缺失的生产变量，并在 `deploy/env.example` 给出备份配置模板。
- 危险操作反馈补强：删除照护计划和撤销外部分享在服务端确认成功后显示带影响说明的结果提示；确认框失败时保留在原处并提供可读错误与重试路径。
- 深层输入边界补强：协作留言、临时照护、跳过备注、替代事项、登录邮箱/验证码、显示名、家庭/时区搜索、周期数字、时间线体重/备注以及危险操作确认输入均有明确长度上限；空显示名在提交前禁用并给出可读错误；桌面/移动 E2E 54/54 回归通过。
- 2026-09-13 能力读取失败补强：设置与通知页现在区分“能力确实未提供”和 `/me/capabilities` 暂时失败；后者显示明确错误与重试入口，不再把网络故障误报成“当前版本不提供推送”。全局 Toast 同时增加读屏 alert/live-region 语义，并保证操作回调抛错时仍会关闭瞬时反馈。
- 通知设置恢复补强：用户从系统设置返回后，页面会自动重新检查通知权限并更新“设备通知”状态，不再要求再次点击一个只会重复打开系统设置的按钮；登记成功说明同时明确系统按钮不可见时可点通知进入应用内处理。
- Simulator 通知脚本补强：单项和批量推送脚本会把系统权限未授权（`UNErrorDomain code=2003`）转换为明确的修复提示，不再把 SpringBoard 原始错误误当成业务投递失败。
- 权限体验补强：只查看成员进入家庭、Today 和宠物工作区仍可阅读记录，但完成、转交、编辑家庭、邀请成员、添加宠物、编辑档案、创建分享和发起转移等写入口会隐藏；照护页明确说明可查看但不能修改，转移页给出联系源家庭管理员的恢复路径；桌面/移动回归已覆盖这些权限边界。
- 通知兜底补强：单项和批量照护行动卡的正文现在明确写出“打开 PLANET 处理”，即使系统通知界面没有显示自定义按钮，用户点击通知仍能理解下一步；服务端 carecoord 单测和集成测试通过。
- 转交流程恢复补强：家庭成员名单加载失败时不再伪装成“没有其他成员”；弹层提供重试入口，责任链加载失败时禁止继续提交，避免用户重复发起请求。桌面/移动 E2E 已覆盖“连续失败 → 手动重试 → 成员恢复”。
- 请求中心权限依赖补强：宠物权限查询失败时不再静默把请求操作降级成只读；请求中心明确提示范围不可更新，家庭与宠物依赖均可一起重试。批量交班详情对深链批次失败也提供明确重试入口。
- 后台请求可见性补强：全局请求提示条在收件箱轮询失败时显示轻量“可能没有更新”状态与 44pt 重试按钮；成功恢复后自动消失，避免用弹窗打断当前照护流程。
- 视觉复核：重新查看 Today（桌面/移动、更多工具展开）、请求、宠物详情、记录和设置截图；主 CTA、底栏和内容卡未出现横向溢出或被导航遮挡，次要工具继续保持按需展开。
- 日期/时间字段交互补强：原生日期和时间字段将“清除”按钮与打开选择器的字段主体拆成并列控件，避免嵌套 Pressable 在原生 responder 链中误触打开选择器；Web 日期/时间输入与快速记录输入增加长度边界和类型标签；范围触发器、ModalSheet 关闭按钮和范围错误态重试统一达到 44pt 触控目标。`npm run typecheck`、`npm run lint`、前端契约 33/33 与 E2E 54/54 通过。
- 行内加载状态补强：根导航/根路由恢复会话、激活页、范围选择器、分享链接列表和时间线加载更早记录时都宣布具体等待对象；所有 LoadingState 实例均带任务级标签和 `progressbar` 语义，Today 同步和完成按钮额外暴露 busy 状态，避免只有旋转图标让用户无法判断正在等待什么。前端契约当前 33/33 通过。
- Simulator 脚本修复：`scripts/ios.sh` 改按 CoreSimulator 的 `deviceTypeIdentifier` 选择 iPhone，允许验收设备改名为 `PlanetBuildCheck` 后仍可自动启动；仍只接受 `platform=iOS Simulator`，没有真机安装回退。无环境变量时已实际构建并启动成功。
- 页面事实来源补强：记录页明确说明数据来自家庭成员记录的照护事实与宠物事件；趋势卡保留时间线与照护记录来源，并提供回到宠物工作区/记录的按钮路径；匿名分享页明确这是分享人生成的只读快照。新增对象路由矩阵在桌面与移动端 2/2 通过，包含标题、返回入口和宽度溢出检查。
- 角色与负责人排序操作补强：家庭成员角色切换、照护负责人上移/下移按钮统一提升为 44pt，契约脚本固定检查，减少小屏误触。
- 路由权限补强：`account/index` 纳入根 Stack 的 authenticated protected group；账户页面自身保留未登录重定向，新增桌面/移动直达 `/account` 回归，E2E 当前 54/54 通过。
- 全局恢复补强：崩溃兜底页面增加 `alert` 读屏语义，重试按钮固定 44pt 以上并通过契约守门，确保渲染异常仍有清晰、可操作的恢复路径。
- 加载状态统一：根路由会话/工作区恢复、激活页、宠物照护计划与用药记录不再直接渲染无文案的 ActivityIndicator，统一使用带 `progressbar` 语义和中文状态说明的 LoadingState，避免读屏用户只听到空白等待。
- 通知设置无障碍补强：日常提醒、每日摘要和健康预警开关现在显式暴露名称、说明和当前 checked 状态，契约守门固定检查。
- 最终构建复核：`npm run doctor` 16/16 通过，`npx expo export --platform web` 成功；最新 iOS Simulator Debug 构建已重新安装并启动。
- 输入审计补强：Web 日期/时间字段分别限制为 10/5 位，快速记录按记录类型限制为 10/300/1000 位并动态暴露语义标签；相关 Today、账户和管理页 E2E 6/6 通过。
- 外部分享审计闭环：分享创建与撤销现在在同一数据库事务内写入 `share_created` / `share_revoked` 审计记录，并携带 `family_id` 与 `family_ids`；家庭“最近变更”查询可按任一关联家庭返回这些记录。`TestShareLifecycle` 已用真实 PostgreSQL 通过，覆盖创建、撤销、立即失效、重复撤销和家庭审计可见性。
- CI 真实数据库闸门：后端 GitHub Actions job 现在启动 PostgreSQL 16 service，并注入 `TEST_DATABASE_URL`；集成测试不再因为缺少数据库而静默跳过，提交级绿色结果具备真实迁移与 HTTP 数据库链路证据。
- 集成测试 fail-closed：当显式设置 `TEST_DATABASE_URL` 后，PostgreSQL 连接失败会让测试失败；仅在本地未配置数据库时保留跳过行为，避免 CI 环境异常被误报为通过。使用故意指向 `127.0.0.1:1` 的连接串复核，实际退出码为 1。
- CI 构建闸门补强：前端 job 现在额外执行 `npm run doctor` 与 `npx expo export --platform web`，提交级验证覆盖依赖健康和实际 Web 产物导出，不只停留在源码测试。
- 内联错误无障碍补强：摘要、照护负责人、成员加载、请求状态和风险卡的局部失败文案现在显式使用 `alert` 语义；前端产品契约守门增加对应检查，当前 33/33 通过。
- Landing CI 闸门：`.github/workflows/ci.yml` 新增独立 `landing` job，固定执行 `www.joinplanet.pet` 的 `npm ci`、生产构建/渲染测试和 lint，营销站改动不会再绕过提交级验证；依赖升级到 Next 15.5.25，并通过 PostCSS 8.5.28、Sharp 0.35.4 override，`npm audit --omit=dev --audit-level=high` 当前为 0 vulnerabilities。
- 收款服务关闭流程补强：`www.joinplanet.pet/server/lemon-webhook/main.go` 改为监听 SIGINT/SIGTERM，使用 10 秒有界 `Shutdown` 等待在途 webhook/checkout 完成；Landing 测试新增静态守门，当前 5/5 通过，服务端 `go test ./...` 与 `go vet ./...` 通过。
- 2026-09-14 最终回归：根导航加载语义、Today 同步进度和完成按钮 busy 状态补齐后，`npm run test:e2e` 为 62/62，新增能力接口与激活计划读取网络失败可见重试、通知能力加载态不误报为“不支持”、认证服务 404 可恢复提示的桌面/移动覆盖；核心路由 6/6、TypeScript、Lint、33/33 契约、Web export、Expo Doctor、依赖审计和后端全量 Go 测试均通过。
- 幂等性补强：宠物跨家庭分享、外部访问授权、照护负责人排序和停药写入现在由 API 强制接收 `Idempotency-Key`，服务层在同一事务内认领/绑定请求；前端 API 默认生成请求键，网络丢响应后的重试不会重复关系、重复换位或重复停药事件。真实 PostgreSQL 集成测试与前端契约 33/33 通过。
- 时间线删除补强：手动事实删除现在把软删除与请求键绑定放进同一事务；本地 V1 回归新增“首次 DELETE + 同键重试”证据，当前 98/98 通过，重试保持 204。
- 家庭与宠物生命周期补强：删除/恢复 Family、删除/恢复 Pet、成员退出现在都支持客户端默认请求键；软删除、恢复、责任链收束、配额更新和审计成功后才绑定幂等记录，本地 V1 回归覆盖五类同键重试，当前 104/104 通过。
- 通知闭环复核：当前本地 API 协作验收全量通过；同一运行生成的单项请求 `8607a0f7-58c3-4d80-94a1-77e694cd7ac7` 与批量交班 `4b4cf388-503d-4e4e-acb8-0d1eec413f75` 已分别推送到 `PlanetBuildCheck`，`Categories.plist` 与 `DeliveredNotifications.plist` 均读到正确类别、动作标识和业务 ID。系统通知中心按钮仍按设备出口单独计为未验收。
- Landing 交互补强：修复快速演示与排程预览动态文案中的 HTML 实体泄漏（不再显示字面量 `&apos;`），活动与归档图片统一改用 Next Image，邮箱/共创输入增加长度边界，提交失败状态改为可读屏告警；Landing 构建与 5 项渲染/源码测试通过，lint 无错误或 warning。
- 2026-09-14 Simulator 复核：`./scripts/ios.sh` 重新构建并启动 `PlanetBuildCheck`（iOS 26.5，UDID `903172A5-BC93-4635-9877-7C335901B4FB`）；随后用 `simctl push` 发送请求样本，通知类别、三枚动作标识和精确业务 ID 均在 `DeliveredNotifications.plist` 中读回。系统按钮视觉/点击仍按设备验收文档单独计为未完成。
- 来人请求卡状态补强：前台兜底卡的“我来做 / 我也不行”在网络请求期间暴露 disabled 与 busy 状态，避免重复点击和读屏误判；相关桌面/移动 E2E 2/2 通过。
- 生产入口探针：新增 `scripts/production-smoke.sh`，只读检查 `www.joinplanet.pet`、`app.joinplanet.pet/auth`、Landing `/progress` 权威容量数据、API `/readyz`、健康响应，以及登录首步 `POST /api/v1/auth/request-code` 和 `app.joinplanet.pet` CORS。探针使用空邮箱验证请求确实命中路由校验层，并要求返回当前错误契约 `400 + VALIDATION_FAILED`，避免通用 OPTIONS 处理造成假阳性。当前 Landing、App、Landing `/progress`、API `/healthz` 通过，但 `/readyz` 与登录路由/CORS 均返回 404，脚本仍以退出码 1 阻止误报；这表明 `api.joinplanet.pet` 仍未切换到当前 `planet-api` 版本，不能把 Web 登录入口宣称为业务可用。
- 后端发布闸门：`planet-api/deploy/deploy.sh` 重启后除了 `/readyz`，还必须让空邮箱 POST 命中登录路由校验并返回 `app.joinplanet.pet` 的 CORS 头；任一条件不满足会打印服务日志并回滚上一版二进制。生产预检同时强制 CORS 白名单包含 Landing 与 App 两个明确 HTTPS Origin。
- 后端部署架构修复：`planet-api/deploy/deploy.sh` 现在同时构建静态 `amd64` 与 `arm64` 二进制，上传后按服务器 `uname -m` 选择；未知架构直接失败，不再把 arm64 文件误装到 x86 VPS。两种产物均已在本机用 `file` 验证为对应 ELF 架构。
- 后端反代切换补强：部署脚本现在备份并更新 `/etc/caddy/Caddyfile`，将 `/api/v1/*`、`/healthz`、`/readyz` 分流到 `127.0.0.1:8081`，Landing 的 `/checkout`、`/progress`、`/webhook` 等路径保留到 `127.0.0.1:8080`，先执行 `caddy validate` 再 reload；服务门禁失败时同时恢复旧二进制和旧反代配置。内嵌 Caddy 更新器已用保留其他站点的 fixture 验证通过，避免只换二进制却仍命中旧 landing backend，也避免切换 App 时破坏支付回调。
- Landing 部署脚本同步标注为 bootstrap：若 Caddy 尚未存在，只创建 8080 临时入口；App API 发布后由共享分流配置接管，后续不会把整个 `api.joinplanet.pet` 误认为单一 Landing 服务。
- 生产探针补强：`scripts/production-smoke.sh` 增加 Landing `/progress` 权威容量字段校验；线上当前 Landing、App、容量数据和健康响应通过，App `/readyz` 与登录路由/CORS 仍明确失败。前端产品契约因新增 Caddy 分流守门升为 34/34，通过嵌入式 Caddy fixture 验证保留 8080 Landing 路径并切换 8081 App 路径。
- 后端切换状态：已确认 `api.joinplanet.pet/healthz` 由 Caddy 返回 200，但登录路由由同一公开域名返回 404；当前工作区没有可用的远程部署会话（`ssh tx` 被目标主机在握手后关闭），因此不能伪造“后端已上线”证据。需要恢复服务器 SSH/部署凭据后执行 `planet-api/deploy/deploy.sh`，再重跑生产探针。
- 后端发布通道补齐：新增手动 GitHub Actions 工作流 `.github/workflows/backend-deploy.yml`，从 production environment 读取 `PLANET_SSH_HOST`、`PLANET_SSH_USER`、`PLANET_SSH_PRIVATE_KEY`、`PLANET_SSH_KNOWN_HOSTS`，调用多架构 `deploy/deploy.sh`，成功后自动执行 `scripts/production-smoke.sh`；固定 host key 避免 runner 用未校验的 `ssh-keyscan`，当前仓库尚未配置这些 Secrets，因此工作流未冒险触发远程变更。
- 本地后端一致性复核：重启当前源码后，`/healthz` 返回 JSON `status=ok`、`/readyz` 返回 200，空邮箱登录请求返回 `400 + VALIDATION_FAILED` 且 CORS 正确；将生产探针指向本地 8081 时全量通过。问题仅剩远程 API 未切换，已被线上探针单独锁定。
- APP Web 再部署：能力接口网络失败修复后，重新部署 `planet-app` 生产版本 `dpl_2CqxmLJefW6jeWjKHGtSNqqvj6Uq` 并重新绑定 `app.joinplanet.pet`；Vercel 项目已恢复 `rootDirectory=APP`。线上 390px 登录页读取新 bundle，标题/主按钮语义和 `scrollWidth=clientWidth=390` 复核通过。
- 2026-09-14 发布复核：`./scripts/deploy-app-web.sh` 首次因 Vercel CLI `fetch failed` 中断，trap 已恢复 `rootDirectory=APP`；有限重试后生产部署 `dpl_FLnD2LEPm8ruCETkhx8W3HXwRwVr` Ready，别名 `https://app.joinplanet.pet` 保持可达，项目设置重新读取仍为 `rootDirectory=APP`、`npm run export:web:production`、`dist`。通知能力加载态修复后再次部署 `dpl_AdHADqAALYYJRwQuHs1LgMfkvaq6` Ready，线上 `/auth` 返回 200 并读取新 bundle `entry-08dc51d061d19ab42adcee87420cea5a.js`。同次线上冒烟仍明确失败于 API `/readyz` 404 与登录路由/CORS 404，故只计入 Web 发布完成，不计入业务上线完成。
- 2026-09-14 发布复核补充：认证服务 404 用户提示修复后再次发布 `dpl_FyoNm3YqwBrb4jJbC8hFT4ajBUQC` Ready，`https://app.joinplanet.pet/auth` 返回 200 并读取 bundle `entry-e171b46839f37fa45808b12dc5e32f3d.js`；生产冒烟仍稳定捕获 API `/readyz` 404 与登录路由/CORS 404，故不计入业务上线完成。
- 发布脚本固化：新增 `scripts/deploy-app-web.sh`，发布前临时清除 Vercel 的 `rootDirectory=APP`，从 `APP/` 上传后无论成功或失败都通过 trap 恢复设置，避免后续发布误解析为 `APP/APP`。
- 生产探针抗瞬时网络抖动：三类 HTTP 请求统一使用有限次数重试；连续重试后仍失败才报红，避免单次 TLS 抖动掩盖真正的 ready/登录路由问题。
- APP Web 发布闸门：新增 `APP/vercel.json` 与 `export:web:production`，固定静态输出和 Expo Router 深链回退；构建会禁用本地 dotenv、注入生产 API 默认值并清空 Metro 缓存，回环/明文 HTTP/preview 配置会在构建前退出。生产导出已通过，故意注入回环 API 的测试以退出码 1 拒绝；部署绑定实际 Vercel 项目 `planet-app`，rootDirectory 固定为 `APP`。
- 2026-09-14 设置页首屏状态补强：能力接口读取期间保留设置内容但显示“正在读取通知能力”，摘要不会把默认能力值误报成“当前版本不提供设备推送”；桌面/移动能力加载与失败恢复回归通过。随后 Web 生产部署 `dpl_e8YLFq2rzemRfCzwB57erjFa7nFs` Ready，`https://app.joinplanet.pet/auth` 返回 200。
- 2026-09-14 设置页描述同步补强：能力读取中 PageHeader 说明与摘要保持一致，明确当前只在读取通知能力；TypeScript、Lint、相关 E2E 4/4 通过。Web 生产部署 `dpl_6zSVGDMS3BcQhfCGWx8YWMpfvMq3` Ready，bundle `entry-543efdbc04df698841a2604f7fd6efad.js`，`https://app.joinplanet.pet/auth` 返回 200。
- Web 生产环境变量守门进一步收紧：`EXPO_PUBLIC_API_BASE_URL` 现在必须是无 query/hash 的 HTTPS 地址并以 `/api/v1` 结尾；公共站点地址同样拒绝 query/hash。合法默认值、尾斜杠和错误路径/明文 HTTP/preview 输入均已逐项实测，错误配置在导出前退出。
- 激活状态准确性补强：激活摘要回退聚合时，任一宠物照护计划读取失败不再静默计为“无计划”，而是进入可恢复错误态；桌面/移动 E2E 已覆盖连续失败与手动重试。
- APP Web 线上验收：Vercel 项目 `planet-app` 生产部署 Ready，项目 `rootDirectory=APP`、构建命令为 `npm run export:web:production`、输出目录为 `dist`；`/`、`/auth`、`/requests/demo`、`/pets`、`/timeline`、`/more` 深链均返回 200。移动 390px 页面 Playwright 复核确认标题 heading 语义、主按钮命名、生产 bundle 使用 `https://api.joinplanet.pet/api/v1`，且 `scrollWidth=clientWidth=390`。页面可达不代表登录完成：生产探针已捕获 API 登录路由 404，后端部署切换完成前仍阻止业务验收通过。

以上证据证明代码路径和可操作的 Web/原生首屏已回归；它们不替代系统通知中心按钮、锁屏、冷启动和断网点击后的移动端验收。
- 2026-09-14 运行时配置与发布复核：API/公共站点基址统一去除尾斜杠，避免拼出 `/api/v1//...`；新增桌面/移动尾斜杠配置用例 2/2，并完成全量 E2E 62/62、TypeScript、Lint、前端契约 34/34。生产 Web 部署 `dpl_9c6D3MfXaZZhYT5AnqN3xprmyCyo` Ready，`/auth` 返回 200；线上探针仍只失败于远端 API `/readyz` 与登录路由/CORS 404。
- 2026-09-15 本地回归补充：`families.restore` 客户端现在默认携带 `Idempotency-Key`，与服务端恢复事务保持一致；分享撤销、用药删除、照护计划删除、家庭成员移除、家庭成员角色切换、宠物家庭关联解除、访问授权撤销、宠物移出家庭和照护负责人移除均已绑定幂等事务，丢失 204 响应后的同键重试仍返回成功。照护计划删除会在同一事务内归档计划、取消未来开放任务、收束照护请求并只写一条审计记录。`scripts/ios.sh` 已识别 Xcode-beta 的 `DeviceHub.app`，执行启动脚本后会打开正确的 Simulator UI。新增 `cd APP && npm run verify:local` 单实例回归入口，只检查现有 `8081`/`8082`，不启动额外服务或窗口；该入口本轮同时通过 TypeScript、ESLint、API 回归和前端契约。`scripts/api-logic-test.sh` 更新为当前成员/宠物配额、串行重试和并发幂等契约并通过 `26/26`，`scripts/api-walkthrough.sh` 补齐成员角色切换、成员移除、家庭共享解除、负责人移除、授权撤销、停药、分享撤销和用药删除重试并通过 `60/60`；两个脚本都通过 `/api/v1/account` 清理测试账号，并确认旧 token 返回 `401`。完整 V1 API E2E 新增三类删除重试后为 `111/111`，Playwright 桌面/移动回归为 `94/94`，照护协同验收再次通过；前端契约守门当前为 `36/36`，Expo Doctor 为 `16/16`；当前 Simulator `PlanetBuildCheck` 与本地 `8081`/`8082` 单实例运行正常。
- 2026-09-15 照护计划编辑可靠性补强：`PATCH /care-plans/:id` 的计划编辑、暂停/恢复现在将请求键认领、取消旧开放事项、关闭相关照护请求、生成新今日事项和审计写入同一事务；前端 `carePlans.update` 默认携带 `Idempotency-Key`。真实本地 E2E 覆盖首次更新、同键重试和“只写一条审计”，全量结果 `114/114`；前端 TypeScript、ESLint 与产品契约守门通过，契约当前 `36/36`。
- 2026-09-15 计划编辑跨步骤恢复补强：计划编辑弹层将同一个命令键同时交给基础 PATCH 与“从今天/明天起”排程动作；若第二步失败后重试，第一步会重放为只读结果，不重复取消事项或写审计。前端契约守门新增该绑定检查并通过。
- 2026-09-15 用药编辑可靠性补强：`PATCH /medications/:id` 现在将药档字段更新与请求键绑定放入同一事务；用药编辑弹层在重试时复用同一命令键，避免网络超时造成不确定结果。V1 E2E 覆盖首次编辑与同键重试，结果 `119/119`；前端 TypeScript、ESLint 与契约守门通过。
- 2026-09-15 时间线编辑可靠性补强：`PATCH /timeline-events/:id` 将手动事实更新、权重冗余重算与请求键绑定在同一事务；foundation writer 和记录编辑弹层复用稳定命令键，自动事件仍保持不可编辑。V1 E2E 覆盖同键重试，结果 `120/120`；前端契约新增稳定键检查。
- 2026-09-15 编辑器命令键复用补强：家庭信息编辑弹层现在在重试时复用稳定请求键，成功后才生成下一枚键；计划、用药、时间线编辑均遵循同一生命周期，避免“部分成功后重试”造成重复副作用。
- 2026-09-15 Simulator 通知送达复核：协作验收新生成的单项请求 `99fb7dc1-c5a5-4ba8-8b8d-160120b68327` 与批量交班 `6c564294-5000-4c99-9648-471392a6ef99` 均由 `simctl push` 成功送达；`acceptance-care-notification-inspect.sh` 读回对应 `care_request` / `care_handoff_batch` 类别、动作集合和精确业务 ID。系统通知中心按钮点击仍需可操作 UI 环境。
- 2026-09-15 家庭设置编辑可靠性补强：`PATCH /families/:id` 的改名/时区迁移现在在 owner 锁事务内认领请求键，重试直接返回当前家庭状态，不重复迁移规则或写审计；前端 `families.update` 默认携带 `Idempotency-Key`。V1 E2E 覆盖同键重试与单审计，结果 `116/116`。
- 2026-09-15 照护负责人写入可靠性补强：`PUT /care-plans/:id/assignments/:user_id` 现在在同一事务内认领请求键、执行负责人 upsert、返回权威负责人并写一次审计；前端 `carePlans.setAssignment` 默认携带 `Idempotency-Key`。V1 E2E 覆盖首次设置、同键重试和单审计，结果 `117/117`。
- 2026-09-15 账户设置写入可靠性补强：`PATCH /me` 的显示名/语言和 `PATCH /me/preferences` 的默认家庭/宠物现在在事务内认领并绑定 `Idempotency-Key`；同键重试读取权威当前值，复用到不同请求返回 409。前端 API 默认生成请求键，V1 E2E 覆盖双字段原子更新、资料与默认范围同键重试及空请求校验，结果 `124/124`。
- 2026-09-15 通知偏好并发可靠性补强：家庭通知开关改为数据库单语句局部更新，连续切换不同开关不会因旧读值覆盖彼此；空更新明确返回 400，前端保存期间暂时禁用其它开关，避免并发操作造成误解。V1 E2E 覆盖默认值、局部保留和空请求校验，结果 `128/128`。
- 当前前端产品契约守门共 `45/45` 通过，新增通知开关保存期间禁用并发切换、生命周期、账户编辑器命令键复用、家庭/宠物治理写入重试和显示名长度边界检查；`git diff --check` 通过。
- 2026-09-15 生命周期重试体验补强：家庭删除/退出/移除成员、宠物归档/恢复/删除以及删除列表恢复现在由页面复用同一命令键；确认弹层在网络丢响应后重试不会把已完成操作误报为新失败。前端 TypeScript、Lint、契约守门通过。
- 2026-09-15 账户编辑器重试体验补强：显示名与语言保存成功前保持同一请求键，只有服务端结果和页面刷新都确认后才生成下一枚键；失败恢复不会重复提交另一条命令。
- 2026-09-15 确认弹层命令生命周期补强：家庭与宠物危险操作在取消确认后会立即生成新键；同一弹层内失败重试仍复用原键，取消后执行另一项操作不会因旧键污染返回 409。
- 2026-09-15 治理操作重试补强：家庭成员角色切换、宠物移出家庭、宠物家庭共享/解除共享、照护负责人增删/排序和用药停用/删除现在在页面层复用同一意图的请求键；负责人移除或用药停用失败时保留确认/操作状态，允许原地重试。前端契约 `43/43`、E2E `94/94`、本地回归 `26/26 + 60/60` 通过。
- 2026-09-15 照护协作请求重试补强：单项请求、批量交班、前台来人请求卡和批量安排弹层现在按同一业务意图复用请求键，网络丢响应后原地重试不会生成第二条责任链；成功后才清理键，离线队列继续沿用原键。前端契约 `45/45`、E2E `94/94`、本地回归 `26/26 + 60/60` 通过。
- 2026-09-15 时间线删除与跳过恢复补强：时间线删除确认框、周期事项“跳过/取消本次”失败时保留原上下文和可读错误；同一事项重试继续复用请求键，成功后才清理，避免重复删除或重复写入。前端契约 `47/47`、E2E `94/94`、本地回归 `26/26 + 60/60` 通过。
- 2026-09-15 Today 核心动作重试补强：完成、撤销和“我来做”现在按事项与动作复用稳定请求键，撤销成功会清理旧完成键，避免完成→撤销→再次完成被旧结果污染；契约 `48/48`、本地回归 `26/26 + 60/60` 通过。
- 2026-09-15 跳过路径文案修正：周期事项选择“今天做不了”后，确认步骤主按钮沿用已选动作名称，避免把“取消本次”误显示为“标记为跳过”；TypeScript、ESLint、前端契约与本地回归通过。
- 2026-09-15 本地入口收紧：`APP` 的 `npm run start` 默认使用 localhost/offline，不再广播局域网二维码；Web 仍由根目录脚本单独启动，避免 Simulator 测试误连实体手机。
- 2026-09-15 Simulator 通知链路复核：单项请求 `f599e68f-8627-400d-8014-24219d5e668a` 与批量交班 `a8c1f86c-7d5c-45db-b18b-66a1e08af4a9` 均送达 `PlanetBuildCheck`，并从通知存储读回正确类别、动作集合和业务 ID；系统通知中心的视觉按钮点击仍需手动验收。
- 2026-09-15 分享撤销幂等链路补强：延伸层 writer 不再丢弃分享/访问授权的请求键，撤销分享确认框在失败重试时复用同一键；前端契约与本地回归通过。
- 2026-09-15 分享摘要文案收敛：移除“Why now”中英混排和半角括号，改为“本次最想和兽医讨论什么（选填）”等直接中文表达；不改变分享数据范围或接口。
- 2026-09-15 账户设备退出恢复补强：单台设备退出失败时确认弹层保持打开并展示错误，只有服务端确认成功后才关闭；前端契约与本地回归通过。
- 2026-09-15 深层写入权威回读补强：宠物档案保存、用药新增/编辑/停用/删除、照护计划新增/编辑/暂停/恢复/删除在服务端写入后都会先重新读取对应权威查询，成功提示、关闭弹层或路由跳转均等待回读完成；回读失败时保留原操作上下文，幂等请求键也不会提前重置。针对性 Playwright `20/20`、本地回归 `26/26 + 60/60`、TypeScript、ESLint 与前端契约 `54/54` 通过。
- 2026-09-15 治理写入权威回读补强：宠物归档/删除、家庭删除/退出、成员移除、角色切换和宠物家庭关联解除现在先重新读取详情或权威列表，刷新失败时确认框与重试键保持原状；成功后才关闭、提示或跳转。前端产品契约新增 2 条检查，TypeScript、ESLint 与完整 Playwright 回归继续通过。
- 2026-09-15 时间线权威回读补强：新增、编辑、删除手动事实后先重新读取当前时间线，回读失败时保留弹层/确认和原请求键；只有服务端写入本身失败才进入离线队列，避免“服务端已写入但回读失败”再次排入重复记录。完整 Playwright `96/96`、本地回归 `26/26 + 60/60`、前端契约 `57/57` 通过。
- 2026-09-15 直接 UI 恢复回归补强：新增桌面/移动测试覆盖档案保存、用药编辑、宠物归档在权威回读失败后的原地重试和同键重放；新增用例 `6/6` 通过，完整 Playwright 当时为 `102/102`。
- 2026-09-15 Today 主动作权威回读补强：完成、撤销和“我来做”现在都等待当前清单重新读取后才清理请求键或提示成功；回读失败不会进入第二条离线队列，页面保留同一意图的请求键并提供“重试同步今天清单”入口。新增桌面/移动 Today 恢复用例 `2/2`，完整 Playwright 当前 `104/104`；前端产品契约 `60/60`，本地总验收继续通过。
- 2026-09-15 通知兜底动作权威回读补强：单项/批量通知卡的接手和拒绝现在会先重新读取请求收件箱，再关闭卡片、提示成功或跳转继续安排；回读失败保留原动作键和卡片，避免用户看到旧请求或产生重复责任链。前端产品契约提升至 `61/61`，相关请求场景回归 `12/12` 通过。
- 2026-09-15 请求中心写入权威回读补强：单项请求创建、请求接手/拒绝、批量交班创建与响应现在先重新读取请求收件箱、批量详情和责任链，再关闭弹层、清理幂等键或提示成功；回读失败保留原操作上下文并提供原地错误反馈。TypeScript、ESLint、前端产品契约 `62/62` 通过。
- 2026-09-15 值班与风险写入权威回读补强：值班负责人接手/释放、风险卡“我来做”现在先重新读取负责人、风险、Today 和时间线状态，再关闭弹层、清理幂等键或提示成功；回读失败保留原操作上下文，并将风险卡主按钮变为“重试同步”。TypeScript、ESLint、前端产品契约 `64/64` 通过。
- 2026-09-15 转移确认与过期数据提示补强：宠物转移只有在权威列表回读成功后才清理幂等键；照护计划、用药、分享、时间线和转移列表已有数据刷新失败时保留旧内容并明确显示“重试更新”，避免把旧数据当成最新状态。TypeScript、ESLint、前端产品契约 `65/65` 通过。
- 2026-09-15 过期数据提示扩展：通知设置也加入统一的过期数据提示，所有已读列表在刷新失败时保留内容但明确标记并提供“重试更新”，避免用户误把旧设置当成最新设置。
- 2026-09-15 前端契约同步：将直接 UI 恢复回归纳入产品契约守门，当前契约 `58/58`，避免后续改动移除这三类关键恢复证据。
- 2026-09-15 stale-data 错误态补强：已有数据的查询刷新失败不再触发整页错误分支，时间线、分享、转移、账户、通知和已删除家庭列表保留当前操作上下文；仅首次无数据加载进入整页错误态。契约新增 1 条检查。

## 2026-09-22 founder 九条裁决批（文档批）

来源：founder 2026-09-22 九条裁决（对象为 MVP 六系统审计延期项，登记于 [DEFECT-LEDGER.md §八](DEFECT-LEDGER.md) L36–L45）。本批为文档批落点：口径落进事实源与台账；代码批 commit 由本体回填（下表「代码批 commit」列均为占位）。

| 裁决对象 | 处置 | 文档落点 | 代码批 commit |
|---|---|---|---|
| L36 宠物离世语义 | deceased 特殊状态本批落地：占配额、数据保留只读、仅可删除、无恢复；纪念功能延后 | PRODUCT.md §5.0 裁决要点 + §4.3/§6.3 生命周期各补一句 | planet-api 8621d19 / APP d5fe9aa |
| L37 宠物 30 天恢复窗 | 裁决真窗口+purge，本批落地（与 planet-cli purge TODO 合并） | DEFECT-LEDGER §八 L37 状态更新 | planet-api 8621d19 / APP d5fe9aa |
| L38 once 无时段已指派零提醒 | 裁决 once 必须带时间，本批落地，「无时段且已指派」形态随之消失 | DEFECT-LEDGER §八 L38 状态更新 | planet-api 8621d19 / APP d5fe9aa |
| L39 viewer 可被移交所有权 / 邀请码独立撤销 | 裁决不改动（人的行为），销号 | DEFECT-LEDGER §八 L39 销号留痕 | 不涉代码 |
| L40 digest 通道 / 角标 / 送达窗口 | 摘要邮件默认停发（DIGEST_EMAIL_ENABLED 开关）；推送为必须（已由调度推送修复达成）；角标/时区窗口维持现状登记 | DEFECT-LEDGER §八 L40 状态更新 | planet-api 8621d19 / APP d5fe9aa |
| L41 「照片断网入队」承诺 vs 实现 | 照片离线队列 MVP 不做，登记之后版本项；文档改为如实口径 | PRODUCT.md §6.4：文字类记录（note/symptom/weight/vet_visit/vaccine/deworm/medication，补齐此前遗漏的 deworm）断网入离线队列；照片=在线能力（先直传 R2 才能建记录，断网时表单保留待重试） | planet-api 8621d19 / APP d5fe9aa |
| L42 导出「完整」语义 | 导出 MVP 搁置（之后版本项） | PRODUCT.md §5.0 之后版本项登记 + DEFECT-LEDGER §八 L42 | planet-api 8621d19 / APP d5fe9aa |
| L43 access-grants 无产品定义 | 裁决仅 family；access-grants=预留能力（API 保留，无产品入口） | DEFECT-LEDGER §八 L43 状态更新 | planet-api 8621d19 / APP d5fe9aa |
| L44 纪念态（归档）宠转移 UI 口径冲突 | 维持登记，随 deceased 落地复核休眠归档转移口径 | DEFECT-LEDGER §八 L44 维持登记 | 随 deceased 复核 |

配套台账更新：[audits/MVP-SIX-SYSTEMS-2026-09-22/00-OVERVIEW.md](audits/MVP-SIX-SYSTEMS-2026-09-22/00-OVERVIEW.md) 第四节由「待 founder 裁决」改为「裁决结果（2026-09-22）」逐条一句话结果。本批未动 [APP-BEHAVIOR-CONTRACT.md](APP-BEHAVIOR-CONTRACT.md)（由并行代码批负责）。

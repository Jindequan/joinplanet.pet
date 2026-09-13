# PLANET App

原生客户端（Expo + React Native）。当前已验证 iOS Simulator、Android Emulator 与 Web；Android Debug APK 已完成构建并在 Emulator 启动到真实登录页。入口只允许连接 Simulator/Emulator，不能把 Debug 包当作生产发布包。

## 定位

| 目录 | 角色 |
|---|---|
| `APP/` | 原生 App（本目录） |
| `mobile-v3/` | **冻结的 Web 视觉基准**（只读） |

## 本地运行

本机若只有 **Xcode-beta**（没有正式版 `Xcode.app`），请用仓库脚本启动，它会自动设置 `DEVELOPER_DIR`：

```bash
# 推荐：一键 API + iOS 模拟器
./scripts/ios.sh
```

或在 `APP/` 内：

```bash
cd APP
npm install
cp .env.example .env   # 首次
npm run ios            # 已默认指向 Xcode-beta
```

`scripts/ios.sh` 运行的是已提交的原生 PLANET Debug target：它会启动 Metro、使用 CocoaPods workspace 构建并安装 `pet.joinplanet.app`，再把 Debug JS 地址绑定到 Metro。不要用 `simctl openurl exp://...` 代替这一步；那会打开 Expo Go，不是原生 PLANET。

若 Expo 仍提示找 `Xcode.app`，在终端执行一次（需密码）：

```bash
sudo xcode-select -s /Applications/Xcode-beta.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
```

本项目采用非 CNG 工作流：`ios/` 原生目录已提交并由 Xcode/Podfile 直接维护，`app.json` 只提供 Expo/Metro 公共配置，不运行 `expo prebuild` 覆盖原生目录。因此 `package.json` 中关闭了 Expo Doctor 的“app config 未同步到原生目录”检查；修改原生能力时必须同步检查 `ios/` 与 Android 原生工程。

Xcode 27 的模拟器 UI 叫 **DeviceHub**（不再是 Simulator.app）。

Workspace：

```bash
# 浏览器测试（http://127.0.0.1:5173）
./scripts/dev.sh start all web

# Android Emulator（自动准备本地 API、构建并安装原生 Debug 包；需本机 Java/Android SDK）
cd APP
npm run android
```

需要避开本机端口时可传 `API_PORT` / `EXPO_PORT`；脚本会反向转发到同一个
Emulator，并在退出时恢复临时 dotenv 文件：

```bash
API_PORT=8091 EXPO_PORT=8093 npm run android
```

Web 与原生共用 `APP/` 的路由、会话、协作状态和 API；不要再启动冻结的
`mobile-v3/` 作为产品测试入口。Web 启动使用本地离线依赖检查，网络不可用时
也应能打开登录页。

Web 生产部署使用仓库内的 `vercel.json`：构建命令为 `npm run export:web:production`，静态
产物目录为 `dist`，所有 Expo Router 深链回退到 `index.html`。将该目录绑定到
`app.joinplanet.pet` 前，先将目录绑定到实际的 Vercel 项目（当前项目名为
`planet-app`，rootDirectory 为 `APP`），使用根目录的 `./scripts/deploy-app-web.sh` 发布，再执行 `npm run preflight:release` 和根目录的
`./scripts/production-smoke.sh`；后者还会验证 API ready/health、登录首步路由与 App Web CORS，只有 Landing、App、API
就绪、健康和登录路由/CORS 全部通过，才能把营销页上的“打开 App”视为可用入口。

生产 Web 构建会拒绝回环地址、明文 HTTP、缺少 `/api/v1` 的 API 地址，以及带 query/hash 的地址；这样页面不会在可打开但所有业务请求都打错路径的状态下发布。

时间线的“照片”事件支持从相册选择或打开相机，保存一张压缩照片和说明；
照片属于 Pet Event，家庭成员按当前家庭权限查看，服务端拒绝外部图片 URL。

原生构建必须使用 CocoaPods workspace；不要直接对 `ios/PLANET.xcodeproj` 调用 `xcodebuild`，否则会绕过 Pods，产生缺失 Expo/React Native module map 的假失败：

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcodebuild -workspace ios/PLANET.xcworkspace -scheme PLANET \
  -sdk iphonesimulator -configuration Debug \
  -destination 'platform=iOS Simulator,id=<simulator-uuid>' build
```

要验证不依赖 Metro 的可分发构建，使用同一个 workspace 构建 Release；成功条件是生成 `PLANET.app/main.jsbundle`，安装后不需要设置 `RCT_jsLocation`：

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcodebuild -workspace ios/PLANET.xcworkspace -scheme PLANET \
  -sdk iphonesimulator -configuration Release \
  -derivedDataPath /tmp/planet-ios-release \
  -destination 'platform=iOS Simulator,id=<simulator-uuid>' build
```

Android Release 构建必须注入 `PLANET_ANDROID_KEYSTORE`、
`PLANET_ANDROID_KEYSTORE_PASSWORD`、`PLANET_ANDROID_KEY_ALIAS` 和
`PLANET_ANDROID_KEY_PASSWORD`；缺少任一变量时 Gradle 会拒绝 Release 任务，禁止使用 debug keystore。

## 当前进度

本地已可登录并进入五个主入口：今天（真实 API 与多人协作）、请求（成员之间的照护转交）、宠物（列表与照护资料）、记录（时间线与健康事件）、更多（家庭治理、趋势、设置和账户会话）。家庭管理从更多进入，不再作为平行主入口。APP Web 已部署到 Vercel 项目 `planet-app` 并绑定 `app.joinplanet.pet`，页面入口与深链可达；生产登录路由探针当前因 `api.joinplanet.pet` 返回 404 而未通过，待后端切换后再计入线上业务可用；iOS Simulator 的 Debug/Release 原生包可构建并启动，Release 已验证生成内置 `main.jsbundle`；Android Debug APK 已在 arm64 Emulator 构建并安装启动，原生登录页和 onboarding 已通过截图与 UI 自动化树核验；Android Release 已用一次性测试 keystore 构建并通过 `apksigner` 校验，生产签名密钥注入与通知系统 UI 交互仍待验收。

详见 [docs/PLANET_APP_DESIGN_SYSTEM.md](./docs/PLANET_APP_DESIGN_SYSTEM.md)。

## 目录

```text
app/                 Expo Router（auth + tabs）
src/core/            配置、网络、会话、查询
src/features/        按页面迁移的功能模块
src/ui/              组件、主题、导航
assets/              图标与启动图
```

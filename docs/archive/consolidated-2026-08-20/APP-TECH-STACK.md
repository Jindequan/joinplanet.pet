# App 技术与组件选型（Phase 1 · Expo / React Native 版）

> 日期：2026-08-17（原生路线修订版）· 对应 [APP-DESIGN](APP-DESIGN.md) §2
> 前提修订：App 与落地页**完全独立**——一套代码编译 iOS + Android（Expo / React Native）；落地页（Next.js）只做营销。Go API 两端共用。
> 选型原则：**少依赖、可逆、单人四周可交付、EAS 托管优先**。每项写明拒绝的替代品。

## 一、App 客户端（`mobile/`，Expo 项目）

| 类别 | 选型 | 理由 | 拒绝的替代 |
|---|---|---|---|
| 框架 | **Expo（React Native）+ TypeScript** | 一套代码 → iOS/Android 双端原生包；与仓库 TS 技术栈同构；EAS 云构建免本地双端环境 | Flutter/Dart（技术栈割裂）；PWA（已否——原生路线）；双原生 Swift+Kotlin（单人不可维护） |
| 路由/导航 | **expo-router**（文件式路由 + Tabs 布局） | 三 Tab IA 的原生实现，深链（邀请链接 /invite/[code]）开箱即用 | react-navigation 裸用（expo-router 就是其封装+约定） |
| 服务端状态 | **TanStack Query v5**（RN 完整支持） | 乐观更新、focus/前台 revalidate（App 前后台切换正是 RN 的 focus 事件）、缓存失效——spec §66/§69/§70 的标准解 | Redux Toolkit；裸 useEffect |
| 表单 | **react-hook-form + zod** | 与 Controller 模式配合成熟，schema 一份两用 | Formik |
| 动效/手势 | **react-native-reanimated + react-native-gesture-handler** | spec §22 左滑 Skip、§20 完成动效（check 120ms spring）、Bottom Sheet 手势都是其标准场景——原生路线下 spring 是刚需，不再是"CSS 够用" | CSS 过渡（Web 思维残留） |
| 底部抽屉/弹层 | **@gorhom/bottom-sheet** | Quick Record/Add Task 的 drag-close、键盘适配、safe-area 全都内置 | 自写手势 sheet（坑深） |
| 图标 | **lucide-react-native**（react-native-svg） | 与设计稿同源、树摇、stroke 统一 | 混用 emoji/填充图标（spec §85 明令禁止） |
| 图片 | **expo-image**（缓存/缩略/渐进入场）+ **expo-image-manipulator**（上传前压缩 maxWidth 1600/质量 0.8） | 缩略图-详情图-原图三级加载（spec §73）原生直配 | rn-fetch-blob 手搓缓存 |
| 凭据存储 | **expo-secure-store**（Keychain/Keystore） | Bearer token 的唯一正确存放处 | AsyncStorage（明文） |
| 日期时间 | **dayjs** + 原生日期/时间选择器（`@react-native-community/datetimepicker`） | circle 时区解释逻辑（spec §75-76）与平台原生选择器 | moment/自绘日历 |
| 分享 | **react-native-share**（系统分享面板） | Share today card 直发 WhatsApp/iMessage/LINE/微信——spec §26 的原生等价物 | Web Share API（PWA 遗物） |
| 触觉反馈 | **expo-haptics**（完成=light，删除=warning） | spec §78 在原生下从"可选"变"顺手就有" | — |
| Toast | 轻自绘（reanimated 实现，带 Undo 动作） | sonner 等 Web 库不可用；RN 生态 toast 库质量参差，30 行自绘可控 | — |
| 推送（预留） | Expo Push（**Phase 1 不启用**） | 原生路线的免费期权，Phase 2 智能提醒直接用 | Phase 1 建任何通知闭环（纪律） |
| 构建/分发 | **EAS Build + EAS Update（OTA）+ TestFlight / Play 内部测试** | 云构建免 Mac；OTA 让试点期 bug 修复不过审；TestFlight 公开链接支撑 100 installs | 本地 xcodebuild/gradle（环境地狱） |
| E2E | **Maestro**（W3 起三条冒烟） | RN 支持最好、YAML 用例最简 | Detox（配置重）；Playwright（不适用原生） |
| 埋点 | GA4（firebase 不可用于匿名…用 **posthog**？）→ 定：**服务端事件表 + 简客户端批上报** | spec §90 的事件清单直接落库；避免双 SDK | 混多个分析 SDK |

## 二、Go 侧选型（不变，随原生路线的两处微调）

| 类别 | 选型 | 说明 |
|---|---|---|
| 路由/校验/邮件/R2/测试 | 同前一版：stdlib ServeMux、手写校验、Resend REST 直调、aws-sdk-go-v2/s3、httptest+compose | 无变化 |
| 认证交付 | session 表不变，**签发 Bearer token**（随机 256bit，Authorization 头） | App 直连无 cookie；落地页若将来调 API 可另走 cookie——同一张 session 表两种交付 |
| 分享页 | `/s/:token` 与邀请 `/invite/:code` 保持 **Web**（Go 直接渲染或薄 HTML） | 接收方/被邀请人不装 App 是产品前提；这两个入口必须无 App 可达 |

## 三、纪律

- `mobile/` 与 `www.joinplanet.pet/` **零 import 共享**——品牌一致性靠设计 token 文档，不靠代码；
- Phase 1 不启用：推送、IAP（Phase 2 RevenueCat 接入权益层）、原生模块开发（凡 Expo SDK 未覆盖的原生需求，先质疑需求）；
- 双端真机各一台进 W1 日常试用（模拟器不算——触觉/手势/键盘行为只有真机诚实）。

## 四、暂不引入（记档防手痒）

CodePush 之外的 OTA 方案、redux、mobx、native-base/tamagui 组件全家桶、lottie 动画库、i18n、Sentry（试点期用日志+事件表，上架后再定）、Storybook。

# PLANET Mobile V2

新的移动端重做目录。与现有 `mobile/` 独立，先搭建跨 iOS / Android 的产品骨架，不处理发布和商店流程。

## 本地运行

```bash
cd mobile-v2
npm install
cp .env.example .env
npm run start
```

## 已搭建的地基

- Expo Router 原生导航：auth、onboarding、tabs 分层，面向 iOS / Android App；页面之间使用 `router.push` / `router.replace`。
- Phosphor Icons：统一使用 Phosphor 的 regular / duotone / fill weight，并按单图标路径导入控制 bundle。
- React Query：统一缓存、前后台 focus、重试策略和 query key 约定。
- API client：超时、Bearer token、JSON 错误归一化、网络错误 fallback。
- SessionProvider + Expo Secure Store：登录态不散落在页面中。
- ThemeProvider：token 驱动的视觉入口，后续页面不写散落品牌色值。
- React Hook Form + Zod：表单 schema 与错误状态统一。
- 基础控件：Button、TextField、DateTimeField、Rating、SegmentedControl、Card、Screen、Toast、ErrorBoundary。
- 性能基线：Reanimated / Gesture Handler / Bottom Sheet 已纳入运行时，长列表预留 FlashList，页面默认不直接触碰网络层。
- 视觉骨架：空白 Today 首页、悬浮圆角磨砂玻璃底栏，以及 More 聚合页与 Account / Pets / Family / Settings 独立页面骨架。

## 设计规范

所有页面、组件、交互、布局和状态以 [PLANET APP Design System](./docs/PLANET_APP_DESIGN_SYSTEM.md) 为准。

实现顺序固定为：`tokens.ts` → 共享组件 → 页面组合。设计 HTML 只用于视觉评审，不作为 React Native 样式源。

## 目录约定

```text
app/                     路由和页面编排
src/core/config.ts       环境配置
src/core/network/        唯一 API 出口
src/core/query/          QueryClient 和缓存键
src/core/providers/      session / theme / toast
src/core/storage/        Secure Store
src/ui/components/       跨页面基础控件
src/ui/theme/            设计 token
```

后续页面按 feature 拆分，页面只组合 feature hooks 和 UI 组件，不重复实现请求、权限、表单状态或平台判断。这里不使用 DOM、HTML form、`href`、Server Component 或 Next.js 页面约定。

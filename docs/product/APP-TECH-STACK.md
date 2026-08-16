# App 技术与组件选型（Phase 1）

> 日期：2026-08-17 · 对应 [APP-DESIGN](APP-DESIGN.md) §2 架构
> 现状基线：Next 15.5 + React 19 + TS 5.9，**Tailwind 4 已接线未使用**（postcss 已配、globals.css 已 import），设计 token 在 `:root` CSS 变量里；Go 1.25 后端。
> 选型原则：**少依赖、可逆、与 narrative 视觉一致、单人四周可交付**。每一项写明拒绝的替代品及原因——拒绝清单和选型同样重要。

## 一、前端选型

| 类别 | 选型 | 理由 | 拒绝的替代 |
|---|---|---|---|
| 样式 | **Tailwind 4 utilities + 现有 token**（`@theme` 把 `--paper/--green/...` 映射进 Tailwind） | 已接线零成本启动；v4 CSS-first 配置不冲突手写类；布局用 utilities 提速，品牌组件（卡片/任务行）继续语义类 | 引入第二套 CSS-in-JS；推倒重写成全 utility |
| 交互组件 | **Radix UI Primitives**（dialog / popover / dropdown-menu / tabs / select / switch / tooltip），无样式直配 token | 要 a11y 正确的交互件但不要视觉主张；纸感衬线的品牌视觉必须自己长 | MUI/Chakra/AntD（视觉强主张，与温暖纸感冲突）；完整 shadcn（依赖面大、默认灰调）——只借鉴其 copy-in 组件模式 |
| 服务端状态 | **TanStack Query v5** | 任务列表轮询、完成任务的乐观更新（点完成立刻实心、失败回滚）、缓存失效，都是它的标准场景 | Redux Toolkit（无全局客户端状态需求）；裸 useEffect（四周内必写出竞态） |
| 表单 | **react-hook-form + zod** | 建档/任务/药品表单的非受控性能；zod schema 同一份供表单提示与提交前校验 | Formik（维护迟缓） |
| 图标 | **lucide-react**（stroke-width 1.75 匹配现有细线图标） | 树摇友好、风格中性；品牌 orbit logo 继续自绘 | icon 库全家桶（bundle 膨胀） |
| 日期时间 | **dayjs** + 原生 `input[type=date/time]` 自定义皮肤 | 格式化够用；原生选择器免 30KB 库且移动端体验最好 | react-datepicker/moment（重） |
| PWA | **Serwist**（next-pwa 的维护继任者，支持 Next 15 App Router） | app-shell 缓存 + manifest 一站式；API 稳定 | 手写 SW（四周排期不值） |
| 图片上传 | **browser-image-compression**（maxWidth 1600 / 质量 0.8）→ Go 签名直传 R2 | 客户端先压缩：护 20 张/月配额、护 R2 流量、移动端照片秒传 | 直传原图（配额秒爆） |
| Toast | **sonner** | 3KB、动作按钮支持（"已撤销"） | 自写 toast（a11y 边角多） |
| 动效 | **CSS transitions/animation only** | 微交互（完成打点、卡片浮层）CSS 足够；bundle 优先给三屏质量 | framer-motion（Phase 1 无编排需求） |
| 图表 | **Phase 2 再定**（届时 recharts/µPlot 按趋势图需求选） | Phase 1 无图表，不装占位依赖 | — |
| E2E | **Playwright**（W3 起三条冒烟：登录建宠 → 完成任务 → 生成分享） | 三条关键路径守住回归；现有 `node --test` 渲染测试保留 | Cypress（移动视口与 PWA 场景 PW 更顺手） |
| API client | 轻封装 `fetch`（同源走 Next rewrites） | 端点少、单人维护，类型手工对齐 Go 结构体 | OpenAPI codegen（W0.5 不值，Phase 2 端点翻倍再上） |

## 二、Go 侧选型

| 类别 | 选型 | 理由 | 拒绝的替代 |
|---|---|---|---|
| 路由 | 继续 **stdlib ServeMux**（go 1.25 方法+路径参数已够：`POST /api/v1/tasks/{id}/logs`） | 零依赖、与现有 7 端点一致 | chi/echo/gin（中间件需求不存在） |
| 校验 | 手写小函数（`normalizeEmail` 模式已有先例） | 字段少、错误信息要精确可控 | go-playground/validator（struct tag 魔法，单人调试慢） |
| 邮件 | Resend **REST 直调**（`http.Post` + JSON） | 一个 endpoint 的 API 不配引入 SDK | resend-go（无增益） |
| R2/S3 | **aws-sdk-go-v2/s3**（presign + 代理上传） | SigV4 手写是坑，官方 SDK 只引 s3 子模块 | minio-go（版本语义混乱） |
| 数据库 | pgx（已有）+ 事务内权限校验（circle 归属检查是每个写路径的第一步） | 已验证模式 | ORM（sqlc 可在查询超过 ~25 条时再评估） |
| 测试 | `net/http/httptest` + docker-compose 起 Postgres 跑集成测试 | 权限矩阵和 webhook 幂等必须真库验证 | sqlite 替身（行为差异坑） |

## 三、Bundle 纪律

- `/app` 路由组独立 code-split，landing 页不背 app 的包（当前 landing First Load 109KB，app 目标 <180KB）；
- lucide 按图标 import；Radix 按需 import（dialog 和 popover 不同包）；
- 无 framer-motion、无图表、无日期重库——三屏的"漂亮"靠排版与微动效，不靠库。

## 四、暂不引入（记档防手痒）

Storybook（单人无需组件文档）、OpenAPI codegen、状态机库（xstate）、i18n 库（Phase 1 仅英文）、CMS、错误监控（Phase 1 用日志 + GA，Sentry 等 WAP 漏斗跑起来再定）。

# PLANET

> Their whole world. One place.

PLANET 是一个面向全球宠物家庭的照护协作产品。第一阶段不做宠物社交社区，而是解决两个高价值问题：

1. 家人、伴侣、室友一起养宠时，明确今天谁做了什么，避免漏做和重复做。
2. 看兽医、寄养或交接时，把宠物的完整情况快速整理并分享出去。

## 当前产品假设

目标用户不是所有宠物主人，而是：

- 两人或多人共同照顾宠物的家庭；
- 老年宠物、慢性病宠物或长期用药宠物的主人；
- 经常出差、寄养或需要临时照护的人。

## 当前阶段

产品定位：The digital home for your pet——多人共养的 Shared Pet Care System。Landing Page 双路径（免费试点申请 + 可退款创始席位）作为获客与支持者通道持续运转；**开发不受订金门槛限制**（2026-08-17 评估采纳），Phase 1 直接做 The Best Free Pet Care App，北极星为 Weekly Active Pets（目标漏斗：100 installs → … → 5 只宠物持续使用 2+ 周）。免费 = Remember everything，Pro（Phase 2）= Understand everything（Pet Intelligence）。

## 仓库结构（2026-08-19 起为多仓 workspace）

```text
joinplanet.pet/                  本仓库：跨产品文档 + 脚本（代码仓并列父目录）
├── docs/                        产品需求、技术架构、验证/营销/收款参考文档
├── scripts/                     跨仓脚本
├── www.joinplanet.pet/          独立仓库：Vercel 前端（Next.js Landing Page + lemon-webhook Go 后端）
├── APP/                         PLANET 客户端（Expo/React Native；当前验收 iOS Simulator + Web）
├── mobile-v3/                   冻结的 Web 视觉基准（迁移只读，不改）
└── planet-api/                  独立仓库：App 本体后端（Go + PostgreSQL）
```

- Landing 前端只持公共变量，支付与数据逻辑在其内嵌 Go 后端；App 后端在 planet-api。
- 部署：Landing 前端 → Vercel 项目 `joinplanet-pet`；APP Web 产物 → Vercel 项目 `planet-app`（`rootDirectory=APP`）并绑定 `app.joinplanet.pet`；后端二进制 → 任意主机 + Postgres。
- 详见 [Lemon Squeezy 收款方案](docs/commerce/LEMON-SQUEEZY.md#部署与初始化)。

## 文档

**唯一入口：[docs/README.md](docs/README.md)**。当前只维护产品与技术两份事实源，App 迁移说明单独维护：

- [产品需求](docs/PRODUCT.md)：目标用户、核心流程、V1 边界和验收标准。
- [技术架构](docs/ARCHITECTURE.md)：仓库结构、前后端分层、数据/API、开发和测试。
- [App 迁移说明](APP/docs/PLANET_APP_DESIGN_SYSTEM.md)：原生重建与对照 `mobile-v3` 的约定。

## 本地测试

```bash
# 浏览器：打开 http://127.0.0.1:5173
./scripts/dev.sh start all web

# iOS Simulator
./scripts/dev.sh start all simulator
./scripts/ios.sh

# 已启动本地服务后的单实例回归（不启动额外服务、不打开新窗口）
cd APP && npm run verify:local

# 移动端正式发布前预检（只读，不上传、不安装）
cd APP && npm run preflight:release

# 生产入口只读冒烟（Landing / App / 支付容量 / API ready/health + 登录路由/CORS）
./scripts/production-smoke.sh

# APP Web 生产发布（自动恢复 Vercel rootDirectory=APP）
./scripts/deploy-app-web.sh
```

两种入口都运行 `APP/`；`mobile-v3/` 仅作为冻结的视觉对照，不是测试入口。
仓库脚本不提供实体手机安装入口；Android 仅接受已运行的 Emulator 序列号。

research / marketing / commerce 只作参考，历史文档统一在 `docs/archive/`。

## 暂不做

公开社区、宠物朋友圈、点赞评论、AI 诊断、医生独立工作台、商城、保险、硬件接入和复杂权限系统。

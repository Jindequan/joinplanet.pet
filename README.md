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
joinplanet.pet/                  本仓库：跨产品文档 + 脚本（三个代码仓的父目录，各自独立 git）
├── docs/                        产品/设计/验证/收款文档（唯一事实源 PRODUCT-SPEC.md 在此）
├── scripts/                     跨仓脚本
├── www.joinplanet.pet/          独立仓库：Vercel 前端（Next.js Landing Page + lemon-webhook Go 后端）
├── mobile/                      独立仓库：PLANET App（Expo/React Native，iOS+Android+Web）
└── planet-api/                  独立仓库：App 本体后端（Go + PostgreSQL，契约 v2）
```

- 三个代码仓各有完整 git 历史，在本 workspace 内并列、互不嵌套追踪（根 .gitignore 排除）。
- Landing 前端只持公共变量，支付与数据逻辑在其内嵌 Go 后端；App 后端在 planet-api。
- 部署：Landing 前端 → Vercel；后端二进制 → 任意主机 + Postgres。
- 详见 [Lemon Squeezy 收款方案](docs/commerce/LEMON-SQUEEZY.md#部署与初始化)。

## 文档

- [产品总纲 PRODUCT-SPEC（canonical）](docs/product/PRODUCT-SPEC.md)
- [后端设计 BACKEND-DESIGN](docs/product/BACKEND-DESIGN.md)
- [API 契约 v2](docs/product/API-CONTRACT.md)
- [开发进度 DEV-PROGRESS](docs/product/DEV-PROGRESS.md)
- [前端实现方案 FRONTEND-V1-PLAN](docs/product/FRONTEND-V1-PLAN.md)
- [App 技术与组件选型](docs/product/APP-TECH-STACK.md)
- [验证定价](docs/research/VALIDATION.md#5-先收款再开发)
- 其余设计/研究文档见 docs/design、docs/research、docs/commerce

## 暂不做

公开社区、宠物朋友圈、点赞评论、AI 诊断、医生独立工作台、商城、保险、硬件接入和复杂权限系统。

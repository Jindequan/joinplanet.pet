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

## 仓库结构

```text
joinplanet.pet/
├── docs/                        产品/设计/验证/收款文档
├── www.joinplanet.pet/          Vercel 前端（Next.js，纯静态 Landing Page）
│   ├── app/                     页面、组件（GA、表单、进度条）
│   └── tests/                   渲染测试
└── www.joinplanet.pet/server/   Go 后端 + PostgreSQL
    └── lemon-webhook/           7 个 API（checkout/progress/intake/email-capture/webhook/claim/healthz）
```

- 前端只持有公共变量，所有支付与数据逻辑在 Go 后端。
- 部署：前端 → Vercel；后端 → 任意主机（二进制 + Postgres）；数据库初始化 → `psql -f server/lemon-webhook/schema.sql`。
- 详见 [Lemon Squeezy 收款方案](docs/commerce/LEMON-SQUEEZY.md#部署与初始化)。

## 文档

- [产品总览](docs/product/PRD.md)
- [MVP 范围](docs/product/MVP.md)
- [App 设计规划](docs/product/APP-DESIGN.md)
- [App 技术与组件选型](docs/product/APP-TECH-STACK.md)
- [App 页面布局草稿](docs/design/APP-LAYOUTS.md)
- [设计团队审查（对标×全生命周期）](docs/research/DESIGN-REVIEW.md)
- [外部评估报告 2026-08-17（定锚：digital home / WAP / Pet Intelligence）](docs/research/DESIGN-EVALUATION-20260817.md)
- [设计方向](docs/design/DESIGN.md)
- [验证计划](docs/research/VALIDATION.md)
- [路线图](docs/ROADMAP.md)
- [Lemon Squeezy 收款方案](docs/commerce/LEMON-SQUEEZY.md)
- [验证定价](docs/research/VALIDATION.md#5-先收款再开发)

## 暂不做

公开社区、宠物朋友圈、点赞评论、AI 诊断、医生独立工作台、商城、保险、硬件接入和复杂权限系统。

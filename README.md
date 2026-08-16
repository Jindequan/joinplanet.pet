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

Landing Page 双路径验证：主路径是免费试点（邮箱加入 10 个首批家庭，试点期间不收费，试用后再谈付费）；辅路径是可退款的创始席位（S$29.99 一次性，首个版本发布前可全额退，与试点在同一卡片并存、并在试点报名成功后再次展示）。进入完整 App 开发的门槛：试点申请有真实转化，且至少 5 个创始订金或试用后付费。

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
- [设计方向](docs/design/DESIGN.md)
- [验证计划](docs/research/VALIDATION.md)
- [路线图](docs/ROADMAP.md)
- [Lemon Squeezy 收款方案](docs/commerce/LEMON-SQUEEZY.md)
- [验证定价](docs/research/VALIDATION.md#5-先收款再开发)

## 暂不做

公开社区、宠物朋友圈、点赞评论、AI 诊断、医生独立工作台、商城、保险、硬件接入和复杂权限系统。

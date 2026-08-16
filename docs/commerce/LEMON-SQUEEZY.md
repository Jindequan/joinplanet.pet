# Lemon Squeezy 收款接入方案

日期：2026-08-09  
状态：Landing Page 永久会员接入待配置 checkout URL

## 结论

前期只做一件事：**收款并绑定邮箱**。页面采用 Lemon Squeezy Hosted Checkout，用户不需要先注册 PLANET，也不需要先成为 `saas-core` active member。

真实闭环是：

```text
Landing Page
  ↓
Lemon Squeezy one-time checkout（收集付款邮箱）
  ↓
PLANET webhook ledger（验签、幂等、记录订单/邮箱/永久会员/退款）
  ↓
用户未来注册真实 PLANET App
  ↓
验证邮箱
  ↓
查到 active lifetime claim → 自动升级永久会员
```

这一步不需要接 `saas-core-sdk Pay.Checkout()`。`saas-core` 留到真实 App 上线时负责账号与正式业务鉴权；它不应该阻塞前期收款验证。

## 为什么现在不接 saas-core SDK

- SDK 是 Go 服务端 SDK，不能安全地从当前 TypeScript landing page 直接调用。
- `saas-core` 的 checkout 接口需要 M2M `X-API-Key`，这个密钥不能放进浏览器。
- checkout 请求要求 `user_id` 是该 app 的有效会员；landing page 访客还没有这个身份。
- one-off 商品虽然支持，但它适合已经注册的 SaaS 用户，不适合当前匿名预购入口。

因此，直接把 SDK 接进当前页面会额外引入注册、登录、后端代理、会员创建和状态回传，和当前“付款邮箱先记录，未来注册时兑付”的目标不匹配。

## 当前架构与接入方式

PLANET 采用 **Vercel 前端（Next.js）+ Go 后端 + PostgreSQL** 架构。前端是纯静态 Landing Page，所有支付/数据逻辑在 Go 后端。

```text
Vercel 前端 (www/)              Go 后端 (server/lemon-webhook/)
├ Landing Page / /success       ├ GET  /checkout        → 重定向 Lemon checkout
├ NEXT_PUBLIC_API_BASE ────────►├ GET  /progress        → 已付款人数
└ 组件 fetch Go 后端            ├ POST /intake          → 需求收集
                                ├ POST /email-capture   → 等候名单
                                ├ POST /webhook         → Lemon 验签记账
                                └ POST /membership/claim→ 未来兑付
PostgreSQL: membership_claims / payment_webhook_events / pet_intake / email_captures
```

前端只持有公共变量（`NEXT_PUBLIC_API_BASE`、`NEXT_PUBLIC_GA_ID`、`NEXT_PUBLIC_LIFETIME_PRICE_DISPLAY`）；所有密钥（Lemon API key、签名密钥、claim token、`DATABASE_URL`）只在 Go 后端，永不进浏览器。

Go 后端支持三个批次 variant，对应环境变量：

```text
LEMON_FOUNDING_20_CHECKOUT_URL / LEMON_FOUNDING_20_VARIANT_ID
LEMON_EARLY_60_CHECKOUT_URL   / LEMON_EARLY_60_VARIANT_ID
LEMON_FINAL_100_CHECKOUT_URL  / LEMON_FINAL_100_VARIANT_ID
```

`/checkout` 路由读取 PostgreSQL 中 paid/claimed 人数，决定当前批次，重定向到对应 Lemon Checkout URL；若未配置 Checkout URL，则用 `LEMON_API_KEY` + `LEMON_STORE_ID` 调用 Lemon API 实时创建 checkout。支付系统必须同时配置 Go 后端的 `/webhook` endpoint，不能只把按钮链接放到页面上。

`/webhook` 验证 `X-Signature`（HMAC-SHA256）、按 event_id 幂等去重，并把订单写入 PostgreSQL `membership_claims` 表。账本至少记录：

```text
order_id       unique
email          normalized lowercase
email_hash     lookup key
sku / plan
status         paid | claimed | refunded | over_limit
paid_at
refunded_at
claimed_user_id nullable
claimed_at     nullable
```

并发超卖防护：`/webhook` 写入 paid 订单时在 Postgres 事务内 `SELECT count(*)`，达到 `MAX_MEMBERSHIPS`（默认 100）则记为 `over_limit`。这比单进程 mutex 更可靠（跨实例安全）。

未来真实 App 注册时，调 `/membership/claim`（需 `PLANET_CLAIM_TOKEN`），先完成邮箱验证，再按 `email_hash` 查找 `status=paid` 且未退款的记录；成功匹配后写入 `claimed_user_id`，授予 `lifetime` 权益。订单号唯一、claim 操作幂等，避免重复兑付。

在 Lemon Squeezy 中建立一个产品、一个 `one-time` variant。所有成功付款的用户获得完全相同的 PLANET 永久会员身份：

| PLANET 产品 | 加入批次价格 | 对应配置 |
|---|---:|---|
| Lifetime Membership · #1–10 | S$29.99（约 US$23），一次性 | `LEMON_FOUNDING_20_CHECKOUT_URL`（Variant 1998458） |
| Lifetime Membership · #11–50 | S$69.99（约 US$53），一次性 | `LEMON_EARLY_60_CHECKOUT_URL`（Variant 1998459） |
| Lifetime Membership · #51–100 | S$129.99（约 US$97），一次性 | `LEMON_FINAL_100_CHECKOUT_URL`（Variant 1998460） |

checkout 的 thank-you / redirect 页面应明确写出：这是 lifetime membership 一次性付款、所有购买者获得同一会员权益、当前批次价格、100 个总名额、预计交付时间和退款规则。不要承诺所有未来功能永久免费，也不要在页面上承诺当前已经存在完整 App。

付款回跳页面已实现：把 `LEMON_CHECKOUT_REDIRECT_URL` 指向站内 `/success`。买家用 Lemon 完成付款后被送回 `/success`，页面确认席位并展示一个极简需求表单（邮箱 + 一句话最想解决的问题），提交后写入 D1 的 `pet_intake` 表。这是验证漏斗里“付费后是否愿意提供真实材料”这一关键证据的落地点，对应 VALIDATION 的 Go 门槛。Lemon 回传的订单参数（`order_id` / `checkout_id`）会被读取并连同需求一起保存，便于把需求和订单关联起来。

## 100 个名额的执行

唯一 checkout 链接受同一个总额度控制。Lemon Squeezy 不会替 PLANET 自动计算剩余额度，因此 webhook ledger 统计成功订单数：

```text
paid + claimed < 100 → 继续开放
paid total >= 100 → 关闭 checkout 链接
```

当前 checkout gate 会在已支付或已兑付记录达到 100 个时拒绝新的购买（`/checkout` 返回 410，`/webhook` 记为 `over_limit`）。Go 后端的 `/webhook` 已在 PostgreSQL 事务内做名额检查，跨实例并发安全，不需要引入完整 `saas-core` 账单系统。

## 部署与初始化

1. **数据库**：在 PostgreSQL 实例执行 `psql "$DATABASE_URL" -f server/lemon-webhook/schema.sql`（幂等，可重复执行）。
2. **Go 后端**：`cd server/lemon-webhook && go build -o planet-backend && ./planet-backend`，配置 `.env`（参考 `.env.example`）。
3. **Vercel 前端**：`cd www.joinplanet.pet && npm install && npm run build`，在 Vercel 项目设置 `NEXT_PUBLIC_API_BASE` 指向 Go 后端域名。

## 上线前验收

1. 在 PostgreSQL 执行 `schema.sql`，确认 4 张表创建成功。
2. Go 后端启动后 `curl /healthz` 返回 `{"status":"ok"}`，`curl /progress` 返回 JSON。
3. 唯一 checkout 链接指向正确的 one-time variant，金额和币种正确。
4. 测试模式完成一笔支付，确认 webhook 写入 `membership_claims`，前端 `/success` 回执页正常。
5. 生产模式完成一笔小额真实支付，确认订单、退款路径和收款主体信息。
6. 记录每笔订单的产品、邮箱、来源和同意的交付/退款说明。
7. 在预付款达到验证门槛前，不接入复杂的宠物数据和医疗功能开发。
8. 在 Lemon Squeezy 后台 checkout 设置里，把条款链接指向站点政策页：`https://www.joinplanet.pet/terms`、`/privacy`、`/refund`（Settings → Store → 相关字段，或在产品 checkout 编辑器里配置）。

## 退款 SOP（用户邮件到 support@joinplanet.pet 时）

承诺口径见 `/refund` 页：首版发布前无条件全额退；发布后 14 天内对已发布版本不满意也全额退。收到退款请求后：

1. 在 Lemon Squeezy 后台 Orders 里按邮箱或 order ID 找到订单，点 Refund（全额）。退款原路退回，通常 5–10 个工作日到账。
2. Lemon 会向 `/webhook` 发送 `order_refunded` 事件；后端 `markRefunded` 会把对应 `membership_claims` 记录翻成 refunded（幂等），`/progress` 的活跃席位计数自动回落，无需手工改数据库。
3. 回邮件确认：已退款、到账时间、席位已释放、欢迎继续参加免费试点。模板不用客套，一句话说清楚即可。
4. 若 webhook 因故丢失（`/progress` 计数没有回落），检查 `webhook_events` 表里是否有该事件；确认丢失则手动 `UPDATE membership_claims SET status='refunded', refunded_at=now() WHERE order_id='...'`，并去 Lemon 后台 Resend webhook。
5. 每月底看一眼：refunded 席位数 × 单价 = 验证口径里的「订金净额」，别用流水自欺。

## 第二阶段：真实 App 上线时接回 saas-core

真实 App 注册/登录和业务鉴权准备上线时，再增加一个会员兑换服务：

```text
verified app email → membership ledger lookup
                              ↓
                    lifetime claim / refund check
                              ↓
                    app user upgraded to lifetime
```

如果之后正式产品也需要由 `saas-core` 创建 checkout，再把 Lemon Squeezy variant ID 作为 `sku`，并使用 SDK 的 `OnOrderEvent`；API key、Lemon Squeezy secret 和 webhook 配置只放在服务端。前期会员兑换不依赖这条链路。

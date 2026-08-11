# PLANET Phase 0 市场验证执行手册

> 日期:2026-08-11
> 状态:已落地,待运行
> 配套:本手册描述 www.joinplanet.pet 已部署的验证机制、要看的数据、以及 Go/No-Go 门槛
> 关联文档:FINAL-PRODUCT-PLAN.md(产品方案)、PLANET-NEEDS-REPORT.md(需求报告)、OPPORTUNITY-MAP.md(机会清单)

---

## 1. 已落地的验证机制

以下机制已在本周代码改动中实现,部署后立即生效。

### 1.1 可交互 Vet Summary Demo(`/demo`)

**这是 Phase 0 验证的核心。** 一个纯前端、无需注册、无需后端的可交互页面:
- 用户填写宠物信息(15 个字段,含过敏/用药/症状/就诊原因)
- 实时预览生成一份结构化的 Vet-ready Summary
- 一键打印为 PDF(浏览器原生 print-to-PDF + 打印样式表)
- 一键生成免注册分享链接(URL hash 编码,接收方无需注册即可查看)
- 内嵌"邀请第二位照顾者"入口

**验证的假设(来自四份报告的共识):**
1. 主人能否在 ~3 分钟内把分散信息整理成 vet-ready summary?(价值假设)
2. 生成后是否会分享?(免注册分享 = 病毒系数)
3. 是否会触发邀请第二位照顾者?(多人协作假设)

**Demo 的设计原则:**
- **纯前端,零法律敞口**:不存储任何数据,不做付费,只是工具。即使产品最终不存在,Demo 本身也是有用的——规避了"卖空气"的合规风险。
- **GA 埋点完整**:每个关键动作都有事件,能看完整漏斗。
- **"Load a sample"按钮**:降低空白页放弃率,让访客 3 秒看到成品。

### 1.2 超卖竞态修复(db.go)

`insertPaidClaim` 已加 `pg_advisory_xact_lock`,并发 webhook 不再超卖。这是真实金钱 bug,已修复并通过 `go build`。

### 1.3 HTTP/Lemon API 超时(main.go)

- HTTP server 加了 ReadHeaderTimeout/ReadTimeout/WriteTimeout/IdleTimeout
- Lemon API client 加了 10s timeout
- 不再用裸 `http.ListenAndServe` 和 `http.DefaultClient`

### 1.4 Landing 文案诚实化

- Hero CTA 从"See his story"改为"Try the vet summary demo"——先体验价值再要求付费
- Nav 加"Try the demo"入口
- proof-strip "HEALTH AI" → "VET SUMMARY"(更克制)
- story-intelligence 标题"A health AI that actually helps" → "Vet-ready summaries that actually help"
- pricing 区加退款政策说明(14 天无理由 + 权益边界 + Demo 优先引导)

### 1.5 已有机制(未改动,继续生效)

- Lemon Squeezy 收款(webhook 验签幂等,已修竞态)
- 创始进度条(`/progress` 实时显示已售席位)
- 邮箱捕获(`/email-capture`)
- 付款后需求收集(`/intake`)
- GA4 已接入(G-Z4M278ZGW3)

---

## 2. 验证指标体系

### 2.1 GA4 事件埋点(已在代码中)

| 事件名 | 触发点 | 验证的假设 |
|---|---|---|
| `demo_start` | 用户首次在 Demo 表单输入 | 兴趣信号 |
| `demo_load_sample` | 点击"Load a sample" | 降低门槛的有效性 |
| `demo_preview` | 点击"Preview summary" | 完成表单的意愿 |
| `demo_generate` | 点击"Generate PDF" | **核心价值交付指标** |
| `demo_share_copy` | 复制分享链接 | 免注册分享假设 / 病毒系数 |
| `demo_invite_caregiver` | 点击"Invite a caregiver" | **多人协作假设** |
| `demo_to_pricing` | 从 Demo 跳转到 pricing | Demo → 付费转化 |
| `shared_to_home` | 分享链接接收方点击回首页 | 接收方打开率(病毒) |
| `nav_demo` / `hero_try_demo` | 各入口点击 Demo | 哪个入口转化最高 |
| `checkout_click` | 点击付费按钮 | 付费漏斗 |
| `cta_click` | 各种 CTA | 落地页整体转化 |

### 2.2 核心指标定义

**北极星指标:有效家庭数(Effective Households)**
> 过去 14 天内,至少有 2 个成员在同一只宠物下各完成过 1 次照护操作的家庭数。
> 注:Phase 0 的 Demo 不产生"照护操作",这个指标在 MVP 上线后才有意义。Phase 0 用替代指标(见下)。

**Phase 0 替代北极星:Demo 价值交付数**
> 30 天内点击"Generate PDF"的独立用户数(Demo 交付了真实价值)。

**Phase 0 多人验证替代指标:邀请触发数**
> 30 天内点击"Invite a caregiver"的次数 + 分享链接被接收方打开的次数。

### 2.3 要看的数据看板(GA4 + 后端)

每日/每周追踪:
- `/demo` 页面 PV、UV、平均停留时间
- 漏斗:访问 → demo_start → demo_preview → demo_generate → demo_share_copy → demo_invite_caregiver
- `/progress` 返回的 paid 数(实际付款)
- `/email-capture` 新增邮箱数
- `/intake` 提交的需求内容(质性分析)
- 分享链接打开率(shared_to_home 事件数 / demo_share_copy 数)

---

## 3. Go/No-Go 门槛

### 3.1 Go 门槛(全部满足才进入 MVP 开发)

在 Demo 上线 + 导流后 **30-45 天内**:

| # | 门槛 | 数据来源 |
|---|---|---|
| 1 | 收到 ≥ **10 笔**真实永久会员全款 | `/progress` paid 数 |
| 2 | Demo 有 ≥ **100 人**点击 demo_generate(交付了真实价值) | GA4 |
| 3 | 其中 ≥ **20 人**实际分享了 summary 或邀请了照顾者 | GA4 demo_share_copy + demo_invite_caregiver |
| 4 | ≥ **3 个**付费用户明确表示把 summary 带去了诊室(回访确认) | 质性回访 |
| 5 | 分享链接接收方打开率 ≥ **40%** | GA4 shared_to_home / demo_share_copy |

### 3.2 No-Go 信号(满足任一即预警,需讨论转向)

| 信号 | 含义 |
|---|---|
| Demo 1000+ UV 但 demo_generate 转化 <5% | 价值主张不成立——用户不想整理 |
| demo_generate 后 demo_share 转化 <15% | 免注册分享不是真需求 |
| 分享链接打开率 <25% | 接收方(兽医/保姆)不在乎 |
| 付费用户 30 天主动打开率 <30% | 黏性不足 |
| demo_generate → checkout 转化 <2% | Demo 价值不足以驱动付费 |

### 3.3 介于 Go/No-Go 之间

- **Demo 数据达标但付费不足:** 价值成立但定价/文案/渠道有问题 → 改 Landing,不改产品
- **付费达标但 Demo 数据不足:** 故事好听但价值未验证 → 深度访谈付费用户,确认他们买的是什么
- **两者都不达标:** 按 FINAL-PRODUCT-PLAN.md 的 No-Go 转向路径执行(转单人 AI Vet Summary 或退款关闭)

---

## 4. 执行时间表

| 时间 | 动作 |
|---|---|
| **本周** | 部署代码改动(超卖修复 + Demo + 文案);确认 GA4 事件正常上报 |
| **第 1 周** | 用 LAUNCH-PLAYBOOK 的内容包导流到 `/demo`(而不是只导首页);观察漏斗 |
| **第 2 周** | 根据 Demo 漏斗数据优化表单(哪个字段流失最高);回访前 5 个付费用户 |
| **第 3-4 周** | 持续导流 + 观察;如果 demo_generate 转化 >10%,加倍导流;如果 <5%,先改 Demo 再导流 |
| **第 30-45 天** | 对照 Go/No-Go 门槛做决策 |

---

## 5. 关键提醒

1. **导流优先导到 `/demo`,不是首页。** Demo 是有真实价值的工具,转化率会比"卖空气"高。LAUNCH-PLAYBOOK 里所有链接都应该考虑加 `/demo` 版本。

2. **Demo 是验证工具,不是产品。** 它故意不存数据、不做账号,是为了最低成本验证假设。MVP 开发时会被替换成真正的产品功能。

3. **退款政策已写进 Landing。** 14 天无理由是 EU 合规底线,也是信任信号。已售的 100 席继续服务,不推翻。

4. **超卖 bug 已修但未部署。** 部署 Go 后端时确认 `go build` 通过(已验证),advisory lock 在事务内生效。

5. **"有效家庭数"北极星在 Phase 0 用替代指标。** 因为 Demo 不产生照护操作。MVP 上线后切换到真正的北极星。

---

*本手册与 FINAL-PRODUCT-PLAN.md 配合使用。产品方案定义"做什么",本手册定义"怎么验证做对了"。*

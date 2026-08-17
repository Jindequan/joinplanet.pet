# PLANET 路线图

> 2026-08-17 按[外部评估报告](research/DESIGN-EVALUATION-20260817.md)重构：产品定位为 The digital home for your pet——Phase 1: PLANET remembers → Phase 2: PLANET understands → Phase 3: PLANET accompanies the pet throughout its life。

## Phase 0：落地页与支持者通道（进行中，与开发并行）

- Landing Page 双路径（免费试点申请为主 + 可退款创始席位为辅）继续运转，作为获客与支持者入口；
- **不再作为开发门槛**（评估第十三节）：要验证的是"免费给你，你到底会不会持续使用"，不是"愿不愿预付一个尚不存在的产品"；
- founding 席位（S$29.99 起，终身含未来全部 Pro）= 早期相信的对价，退款承诺照旧；
- Reddit（r/IMadeThis）等渠道持续灌流量，收集试点申请。

## Phase 1：The Best Free Pet Care App（约 5 周）

> 2026-08-17 创始人定调：**V1 把免费层完整交付给用户，先把人吸引过来；付费功能（Pro）之后开发上架**。切期标准从"按时间分 Phase"改为"按免费/付费分层交付"。

目标不是赚钱，是**让用户愿意把 PLANET 当作这只宠物的数字档案**。

**V1.0 核心环（已交付，2026-08-17）**：

- 三屏聚焦：Today / Timeline / Pet（Share 为上下文动作 + 全局 + 快速记录）；
- F1 身份（邮箱验证码）→ F3 档案（含用药清单、紧急医疗授权、真照片）→ F4 今日照护协作 → F5 时间线（≤5 秒记录+照片）→ F6 Summary 模板 → F7 免注册分享链接 → F8 导出/删除；
- 权益层（entitlements + can()）已就位，为 Pro 上架预留。

**V1.5 照护环四翼（免费，~1 周）——把"记了→存了"补成"看见→惦记→传出去"**：

1. 体重趋势图：weight 事件的确定性折线 + "9 天 −4.9%"式变化摘要（**基础图免费**；AI 洞察/关联分析仍属 Pro）；
2. 疫苗/驱虫到期：事件录入可选"下次到期日"，档案页聚合到期清单；
3. 基础本地提醒：任务到点本机通知（expo-notifications，无需服务端推送；智能/自适应提醒仍属 Pro）；
4. Today 图片分享卡：生成进家人群的图片卡（文本版已上线，图片版补齐）。

**纪律不变**：禁止为"全面"堆功能——四翼每件都直连付费画像（慢性病/老年宠物多人家庭）的 JTBD；社区/商城/问诊/保险/AI 诊断仍不做。

北极星：**Weekly Active Pets**（不是 WAU）。目标漏斗：

```text
100 installs → 40 create pet → 20 create first task → 12 use 3+ days
→ 8 invite another caregiver → 5 use 2+ weeks
```

出口条件：漏斗走通到"5 只宠物持续使用 2+ 周"。达不到回炉摩擦，不加功能。

## Phase 2：Pet Intelligence——Pro 订阅（V1 验证后开发上架）

> Free = Remember everything；Pro = Understand everything。免费层完整跑通、WAP 漏斗验证后，才动工计费。

- AI 从 UI 消失：无聊天框；一句话自由文本后台结构化（症状/次数/时间），用户不再填表；
- AI 能力：结构化记录、病历 OCR、时间线整理、智能搜索、AI 就诊准备、健康趋势洞察（基础确定性图表已在 V1 免费）、智能提醒、自动摘要；
- 免费用户每月 3 次 AI 体验额度；
- AI 只做 organize / retrieve / correlate / summarize / remind，永不 diagnose / prescribe；
- 计费走权益层多适配器：Lemon Squeezy/Web 先行，预留 App Store IAP / Google Play（业务代码不知道钱从哪付的）；
- 多宠解锁（挂 entitlement gate）。

## Phase 3：全程陪伴

- 纪念册 / 告别册（时间线 + 照片 + 导出天然支撑）；
- 寄养模板包、旅行交接；
- 费用 / 保险理赔材料；
- 原生 App 决策（若 Pro 订阅成功且 iOS 内购必要）。

## 关键决策

- Phase 1 不做 AI——刻意做到没有 AI 也非常好用，AI 上线时才像 "PLANET suddenly became intelligent"；
- 应急永不设卡、分享不收费、导出不收费、核心闭环永久免费（品牌价值观，长期不动）；
- 不扩品类：社区、商城、找医生、保险、AI 问诊、宠物百科都不做——越来越深地拥有这只宠物的一生数据，而不是横向铺开。

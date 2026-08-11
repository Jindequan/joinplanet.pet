# PLANET 需求侧完整报告(综合分析版)

> 日期:2026-08-11
> 方法:真实世界数据采集(市场/竞品/用户/社会/合规五维) → 四视角独立分析 → 圆桌辩论质询达成共识 → 综合产出
> 覆盖维度:市场、社会、真实用户、需求
> 目标:在最完善的证据基础上,给出可执行的 Phase 0 决策

---

## 摘要:一句话结论

**需求是真的,但 PLANET 当前押错了卖点重心,且把验证设计成了一个高风险、慢反馈、法律敞口大的永久会员发售。**

真实证据(学术研究 + Reddit 双向抱怨 + 主流媒体报道)证明"照护协作 + 病历准备"是真实痛点。但 31% 的宠物 App 已支持多成员管理,"多人协作"作为口号已被讲烂——PLANET 真正的差异化不在"多人",而在"主人拥有、跨机构、免注册可分享的照护记录",这击中了"被拒绝访问自己宠物病历"的数据所有权痛点。

最危险的不是需求假、竞品强、技术难,而是**在产品还没做出来时,用卖空气的方式验证**。本报告的核心建议是把"先卖再做"升级为"**边卖边交付边验证**"。

---

## 第一部分:市场维度

### 1.1 市场规模——够大,但可达市场比想象小

| 层级 | 规模 | 来源 |
|---|---|---|
| 宠物 App 市场(2026) | US$3.48B,CAGR 7-10% | Business Research Insights |
| 宠物健康 App(2025) | US$4.2B → 2034 US$11.8B(12.1% CAGR) | Dataintelo |
| 美国宠物总支出(2025) | ~$158B,其中兽医护理 $34.4B | APPA |
| 老年宠物护理(2026) | 慢性病/生活质量支持占 37% 份额 | Fact.MR |

**可达市场拆解(PLANET 的真实 SOM):**
- 美国约 6,600 万养宠家庭,30-40% 多人共养 → ~2,000-2,600 万户
- 老年宠物(7 岁+)占 39%+(AVMA 调查),慢性病长期用药 10-15%
- 两条件叠加(多人共养 AND 老年/慢性病),英语市场约 **300-500 万户**真实潜在用户
- 愿意为新 App 付费的早期采用者,按 1-2% 渗透 → **3-10 万人**

**结论:** TAM 够大,SOM 够养活一个小团队,但 100 个创始名额作为验证规模**偏激进**——VALIDATION.md 的 Go 门槛实际只需 5 个家庭付费。

### 1.2 行业趋势——两个对 PLANET 有利,一个不利

**有利 1:老年宠物和慢性病护理是增长最快的细分。** 39%+ 的狗年龄 7+,Fact.MR 报告慢性病护理占 2026 年老年宠物服务 37% 份额。这与 PLANET 押注的"老年/慢性病宠物的多人家庭"完全吻合。

**有利 2:宠物 App 市场整体 7-12% CAGR 增长**,赛道在扩容。

**不利:31% 的宠物 App 已支持多宠物/多成员管理**(Market Reports World)。这意味着"多人协作"不再是功能空白,而是行业基线——把它当差异化口号会失效。PLANET 必须在"协作"之上叠加更强的差异化。

### 1.3 竞品真实状况——存在机会窗口

| 竞品 | 现状 | 对 PLANET 的含义 |
|---|---|---|
| **11pets** | 最成熟的免费健康追踪 App,但 App Store 评分已降到 **3.3★**,长期用户抱怨数据丢失和 UI 倒退 | 窗口期——老牌竞品在失血 |
| **PetPal** | 产品碎片化(消费者版 + B2B 版),有"AI 宠物翻译器"噱头,定位混乱 | 没人把协作做透 |
| **Pawprint → GreatPetCare** | 医疗记录版已**重新定位为 GreatPetCare**,合并医疗记录+召回提醒+记录分享 | **直接威胁**:已占病历管理赛道 |
| **兽医自有 App**(Banfield/VCA) | 北美覆盖率不低,锁定就诊数据 | 锁定的是就诊数据,不是日常照护数据 |

**关键判断:** GreatPetCare 已转型覆盖"病历管理 + 分享",PLANET **不应在病历管理赛道硬碰**。但 GreatPetCare 是单玩家视角、医疗化重型体验;兽医 App 锁定就诊数据但不收日常照护数据(喂药、如便、情绪)。PLANET 的真实空间在"**日常照护协作 + 跨场景交接**",数据源和体验定位都不同。

---

## 第二部分:社会维度

### 2.1 "情侣因宠物分工吵架"是被反复验证的社会现象

主流媒体的内容生态是需求真实性的强证据——当一个话题被多家权威媒体反复讨论,说明它是普遍痛点而非小众需求:

- **ABC News**:"因宠物吵架越来越常见,甚至导致分手"
- **Tribeca Therapy**(专业心理咨询):"宠物冲突常象征更深层的关系问题"
- **The Farmer's Dog** + **Adopt-a-Pet**:专门的"如何公平分担宠物照护"指南
- **NPR / TIME**:报道"Fair Play"家务分工方法论,宠物分工是其中一环
- **Reddit r/puppy101**:情侣讨论如何协调幼犬日常照护的活跃社区

**结论:** "多人照护协作"的需求真实性有强社会证据支撑。这不是 PLANET 凭空捏造的痛点。

### 2.2 数据所有权是新兴的社会情绪

Reddit r/Pets、r/AskVet 上有大量"**被拒绝访问自己宠物病历**"的讨论,主人对兽医机构锁定数据感到愤怒。r/AskVet 一条"换到芝加哥后,惊讶于多少兽医只在就诊时才看病史,而不是提前看"揭示了病历跨机构不流通的结构性问题。

**对 PLANET 的机会:** "主人拥有、跨机构、可随身携带的照护记录"是一个击中社会情绪的定位。这比"多人协作"更锋利,且 GreatPetCare(绑定单一医疗体系)和兽医 App(锁定就诊数据)都不会做。

### 2.3 社会合规趋势在收紧

- **FTC 2024 年 10 月发布 Click-to-Cancel 规则**——监管对数字订阅/会员的消费者保护在趋严
- **Lemon Squeezy 退款政策**:卖家可设政策,但 Lemon 有最终裁量权,**60 天窗口内可主动退款防拒付**,有卖家报告被自动退款"高风险"订单
- "Lifetime membership"在 Lemon 上无特殊政策,依赖卖家条款 + 当地消费者保护法

**结论:** 卖"尚不存在的产品"的永久会员,在 SG CPFTA / US FTC / EU 14 天退款权三重监管下面临真实法律敞口。社会合规趋势在收紧,不是放松。

---

## 第三部分:真实用户维度

### 3.1 兽医端——对无准备的主人明确不满

**r/VetTech**:"客户承诺带病历但不带,真的让人恼火"——兽医技师公开表达对无准备客户的不满。这证明"就诊准备"不是伪需求,兽医端有真实痛点。

**但有一个关键反转:** 学术研究(PMC/NIH 2021,被引 191 次)证明宠物主和兽医都重视信息讲义,但**研究主要讲兽医发给主人的,反向(主人发给兽医)的研究很少**。Reddit 上兽医普遍欢迎有准备的主人,但反感 Google Doctor 和信息过载。

**推论:** 兽医大概率不会在诊室里扫码看第三方 App 链接——他们的时间成本很高($34.4B 兽医市场的单位时间)。他们更可能接受**纸质或 PDF**。r/AskVet 那条"病历跨机构不流通"的痛点,流通的载体不是 App 链接,是可打印、可传真、可邮件的标准化文件。

**对 Vet-ready Summary 的根本影响:** Summary 的主形态应该是**一键生成的 PDF**,不是可分享链接。营销从"让兽医看到你的准备"改为"5 分钟整理出一份兽医看得懂的病历"。把 Summary 定位成"主人的整理工具",而不是"兽医的入口",规避兽医端采纳不确定性。

### 3.2 主人端——焦虑、分散、渴望整理

Reddit 揭示了主人端三层痛点:

1. **记录分散**:"食物记录在聊天里,疫苗是一张照片,上次血检在抽屉里"——这与 PLANET 文案描述完全一致,是普遍现象
2. **就诊焦虑**:r/AskVet 有焦虑主人问"兽医接不接受我准备的信息表"——主人想准备但不确定是否受欢迎
3. **数据失控**:r/Pets"被拒绝访问自己宠物病历"、r/Pets 兽医技师录入错误数据导致就诊混乱——主人对数据准确性和所有权有焦虑

**对产品的启示:**
- Summary 必须极快生成(焦虑状态认知带宽窄,遵循「3 tap to summary」)
- 必须含**「本次就诊主诉 / Why now」**字段(兽医第一需求,DESIGN.md 遗漏)
- **过敏必须单独顶部标注**(会出命的问题,不能埋在长文档里)
- 缺**「最近一次驱虫/疫苗状态」**(兽医问诊高频项)

### 3.3 保姆交接——需求已高度标准化

TrustedHousesitters、Evaheld、Pet Sitters International 的交接清单已**高度标准化**,PLANET 不需要发明格式,需要做的是把纸质模板数字化:

- 宠物基础信息、饮食日常、医疗(药/过敏/慢性病/疫苗)、行为备注、紧急联系人
- **关键缺失字段:紧急医疗授权书**(谁被授权在你联系不上时做医疗决定)——PLANET 文档完全没提
- Evaheld 的"私人保险库"概念——存储信息的安全感是需求

**对 Share 模块的启示:** Sitter Instructions 应该是结构化模板(对齐行业标准),不是让用户自由填写。加入"紧急医疗授权"字段。

---

## 第四部分:需求维度(四视角辩论共识)

这一部分来自一场结构化辩论——产品、技术、商业、UX 四个视角围绕五个争议焦点**互相质询、用真实数据交锋、达成可执行共识**。

### 4.1 共识一:定位收窄为"宠物照护的协调中心"

**辩论焦点:** 单人 vs 多人,押哪边?

- PM 主张押"多人协作",有 ABC News/Tribeca Therapy 的社会证据
- BIZ 反驳:31% App 已支持多成员,"多人协作"口号已被讲烂
- UX 指出"邀请第二人"是最大设计缺口也是最大风险

**达成的共识:** 多人协作作为**定位叙事和北极星**,但不作为 P0 的功能交付门槛。对外口号用"**零摩擦分享**"(可证伪、未被讲烂),不用"多人协作"(已被讲烂)。PLANET 的真实定位是:

> **宠物照护的协调中心——主人拥有的、跨机构的、免注册可分享的照护记录。**

这击中了"被拒绝访问自己宠物病历"的数据所有权痛点,且是 GreatPetCare 和兽医 App 都不会做的轻量体验。

### 4.2 共识二:Vet Summary 改为 PDF 优先

**辩论焦点:** Summary 是真实价值还是心理安慰?

- BIZ 质疑:兽医真的会点开第三方 App 链接吗?
- PM 辩护:r/VetTech 兽医明确不满无准备主人,需求双向真实
- UX 关键质询:形态是命门,兽医更接受纸质/PDF,不接受诊室扫码

**达成的共识:**
- Summary **主形态改为可一键生成的 PDF**(A4 单页或双页),辅以可分享链接
- 营销文案从"让兽医看到你的准备"改为"**5 分钟整理出一份兽医看得懂的病历**"
- 验证指标:首批买家中,30 天内 ≥20 人实际生成并下载过 PDF;后续回访问"有没有真带去诊室"
- 定位为"主人的整理工具"而非"兽医的入口",规避采纳不确定性

### 4.3 共识三:冻结新永久会员,改为 Demo Pass + 分层经营

**辩论焦点:** 100 席永久会员 vs 其他验证模式

- BIZ 列举法律敞口(SG CPFTA / US FTC / EU 14 天退款)、长期负债、SGD 削弱转化
- PM 辩护沉没成本,Lemon 60 天退款给了缓冲
- TECH 重申沉没成本是决策谬误,且超卖竞态 bug 必修

**达成的共识(务实平衡):**
1. **不推翻已售订单**(尊重沉没成本和已付费用户信任)
2. **冻结继续售卖新的永久会员**
3. **新增 S$5 "Demo Pass"**:可交互生成一份 Vet Summary PDF,7 天有效,购买后可抵扣未来会员——验证付费意愿 + 法律敞口最低(交付真实可用 demo 而非空气)
4. **已售 100 席的"永久"权益在条款里设边界**:含 24 个月 AI 服务,之后按当时费率续费(规避无限负债)
5. **价格增加 USD 主显示**,SGD 辅助
6. **退款政策写明 14 天无理由**(EU 合规底线)
7. **TECH 立刻修超卖竞态 bug**——无论哪种模式都必修

### 4.4 共识四:Phase 0 唯一发布——Summary PDF + 内嵌邀请入口

**辩论焦点:** 如果只能做一件事验证整个产品假设,是什么?

四个视角各推自己的优先级(PM 推邀请链路、BIZ 推 Demo Pass、TECH 推修 bug、UX 推 Summary PDF)。辩论后发现它们其实是一件事的两面:

> **把 Vet Summary PDF 生成器做成第一个真正可用的功能,并在 PDF 分享时内嵌"邀请第二位照顾者查看完整照护记录"的入口。**

**一箭三雕:**
- 交付真实价值(Summary)——解决 UX 和 BIZ 担心的"卖空气"
- 触发多人验证(分享即邀请)——解决 PM 要的多人假设验证
- 规避法律敞口(交付可用产品)——解决 BIZ 的合规担忧

TECH 的超卖 bug 作为**前置依赖同步修复**(阻塞项不是选择题)。邀请链路和 Summary 不分先后,合并为同一次发布。

### 4.5 共识五:护城河不押功能,押两个竞品不会做的点

**辩论焦点:** GreatPetCare 已转型,兽医 App 锁定数据,PLANET 还剩什么?

- BIZ 敲警钟:功能会被抄,GreatPetCare 加个"家庭共享"一个迭代就追上
- TECH 指出护城河只能靠数据网络效应或切换成本,但都要产品先跑起来
- UX 找到窗口:兽医 App 锁定就诊数据,但日常照护数据没人收

**达成的共识:** 押两个 GreatPetCare 和兽医 App 都不会做的点:
1. **跨机构的、主人拥有的、可免注册分享的照护记录**(数据所有权叙事)
2. **多人协作的轻量分享体验**(免注册链接、品牌信任、可撤销)

营销明确差异化:"**不是又一个病历管理 App,是宠物照护的协调中心。**"

---

## 第五部分:行动方案

### 5.1 立即(本周,阻塞项)

| # | 行动 | 负责视角 | 依据 |
|---|---|---|---|
| 1 | **修复名额超卖竞态**(`SELECT FOR UPDATE` 或 advisory lock) | TECH | 真实金钱 bug,READ COMMITTED 下并发不安全 |
| 2 | **在 Terms 写明退款政策**(14 天无理由 EU 底线 + 交付时间表 + 权益边界) | BIZ | SG CPFTA / US FTC / EU 三重法律敞口 |
| 3 | **Landing 价格改 USD 主显示**,SGD 辅助 | BIZ | 美国用户 mental 换算是真实转化摩擦 |
| 4 | **统一 Go 门槛**(VALIDATION 第 3 节"订金 3 个" vs 第 5 节"全款 5 个"矛盾) | PM | 文档自相矛盾 |
| 5 | **调低 Landing 上 AI 措辞**,改为"整理工具"而非"AI 模型" | BIZ/UX | AI 在 P1 但营销讲 AI,承诺与交付矛盾 |

### 5.2 Phase 0 核心发布(2-4 周)

| # | 行动 | 说明 |
|---|---|---|
| 6 | **做 Vet Summary PDF 生成器**(第一个真正可用功能) | A4 单页/双页,含主诉+过敏置顶+用药+病史+驱虫疫苗 |
| 7 | **PDF 分享时内嵌"邀请第二位照顾者"入口** | 邀请链接只读、可撤销、带品牌 preview |
| 8 | **新增 S$5 Demo Pass**(7 天有效,可抵扣未来会员) | 验证付费意愿 + 法律敞口最低 |
| 9 | **冻结新的永久会员售卖** | 已售 100 席继续服务,不再新增 |
| 10 | **设软目标 20 / 硬上限 100** | 对外讲"前 20 席创始价",卖满再开放下一批 |

### 5.3 验证与指标(发布后 30-45 天)

**北极星指标:有效家庭数(Effective Households)**
= 过去 14 天内,至少有 2 个成员在同一只宠物下各完成过 1 次照护操作的家庭数。

**价值交付指标:**
- 30 天内 ≥20 人实际生成并下载过 Summary PDF
- 邀请链接发出后,被邀请人打开率 ≥50%
- 回访:买家中 ≥3 人明确表示把 PDF 带去了诊室

**Go/No-Go 门槛(硬):**
1. 收到 ≥10 笔真实付款(全款或 Demo Pass)
2. 其中 ≥5 个用户 14 天内邀请第二位成员
3. 其中 ≥3 个第二位成员完成至少 1 次操作
4. ≥3 份 Summary PDF 实际带去就诊(回访确认)

**No-Go 信号(满足任一即预警):**
- 邀请链接打开率 <40% → 多人故事存疑
- PDF 生成后带去诊室率 <30% → 核心卖点存疑
- 付费用户 30 天主动打开率 <30% → 黏性不足

### 5.4 进入 MVP 前的技术债(与上一轮报告一致)

HTTP server 超时 + graceful shutdown / Lemon API timeout / 速率限制 / 结构化日志 / DB migration 工具 / Postgres 备份 / main.go 拆包 / email 加密 / 基础 CI。

---

## 第六部分:遗留分歧(需进一步验证)

辩论中未能达成共识、需要小范围测试的问题:

| 分歧 | 正方 | 反方 | 建议验证方式 |
|---|---|---|---|
| 永久会员的法律定义 | TECH/BIZ:改"24 个月 + 续费"实质订阅 | PM:削弱稀缺叙事损害信任 | 法律顾问咨询 + 已购用户访谈 |
| 第二人权限模型 | UX:P0 只读,P1 放写 | PM:只读让第二人觉得"被监视" | 可点击原型 A/B 测试 |
| AI 措辞 | TECH:调低,避免承诺落差 | BIZ:先讲,UX 担心预期落差 | Landing A/B 测试转化率 |
| Demo Pass 定价 | BIZ:S$5 | PM:偏低拉低品牌感;UX:应免费引流 | 小范围定价测试 |

---

## 第七部分:最完善的需求清单

基于全部证据,重新定义需求优先级:

### P0(必须有,Phase 0 发布)

| 功能 | 关键设计 |
|---|---|
| 宠物档案(精简版) | 名称/头像/犬猫/生日/品种/过敏/慢性病/紧急联系人/当前用药 |
| **Vet Summary PDF 生成器** | 一键生成 A4,含主诉+过敏置顶+用药+病史+驱虫疫苗 |
| **PDF 分享 + 内嵌邀请入口** | 邀请链接只读/可撤销/带品牌 preview/接收方免注册 |
| Demo Pass 付费 | S$5,7 天有效,可抵扣 |
| 紧急医疗授权字段 | 对齐 TrustedHousesitters 标准(谁可做医疗决定) |

### P1(验证后做)

| 功能 | 说明 |
|---|---|
| 今日照护任务(完整版) | 重复任务/跳过/提醒——P0 只做"今日清单+谁做了标记" |
| 健康时间线(完整版) | 六类事件+筛选+分组折叠 |
| AI 摘要 | Claude Haiku/GPT-4o-mini,JSON schema 约束,来源可追溯 |
| 邀请第二人可写权限 | P0 只读验证后放开 |
| 多宠物 | 顶部头像横滑切换 |
| OCR | LLM vision 路径 |

### 明确不做(与原文档一致 + 新增)

- AI 诊断/风险评级/用药建议
- 医生账号/医生后台
- 公开社交/点赞/评论
- 在线问诊/电商/保险/硬件
- AI 宠物翻译器类噱头(对标 PetPal 的失败教训)
- 病历管理赛道硬碰(让给 GreatPetCare)

---

## 附录:证据来源

**市场数据:**
- [Business Research Insights – Pet Care Apps Market](https://www.businessresearchinsights.com/market-reports/pet-care-apps-market-123827)
- [APPA Industry Trends & Stats](https://americanpetproducts.org/industry-trends-and-stats)
- [Fact.MR – Pet Longevity & Geriatric Care](https://www.factmr.com/report/pet-longevity-geriatric-pet-care-services-market)
- [Pawlicy – Pet Ownership Statistics 2026](https://www.pawlicy.com/blog/us-pet-ownership-statistics/)
- [dvm360 – Why Dogs and Cats Age](https://www.dvm360.com/view/why-dogs-and-cats-age-and-how-we-can-influence-process-proceedings)

**竞品:**
- [11pets App Store](https://apps.apple.com/us/app/11pets-pet-care/id1232470530)
- [Pawprint App Store](https://apps.apple.com/us/app/pawprint-pet-services/id6760276561)

**真实用户痛点:**
- [r/AskVet – Do vets accept information sheets](https://www.reddit.com/r/AskVet/comments/1b6pb12/do_vets_take_kindly_to_being_given_information/)
- [r/AskVet – Is it too much to expect vets to read history](https://www.reddit.com/r/AskVet/comments/1mgq9a8/is_it_too_much_to_expect_the_vet_to_read_the/)
- [r/VetTech – Does it get annoying if people don't have records](https://www.reddit.com/r/VetTech/comments/14rekr0/does_it_get_annoying_if_people_dont_have_records/)
- [r/Pets – Being refused our pet's medical records](https://www.reddit.com/r/Pets/comments/okcb74/being_refused_of_our_pets_medical_records/)

**兽医对信息讲义态度:**
- [PMC/NIH – Pet owners' and veterinarians' perceptions of information handouts (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7850489/)

**共享照护社会证据:**
- [ABC News – When Pets Come Between Partners](https://abcnews.com/GMA/Relationship/story?id=433489)
- [Tribeca Therapy – Conflicts About Pets](https://tribecatherapy.com/blog/conflicts-about-pets-often-symbolize-deeper-relationship-issues-for-couples-director-of-supervision-and-training-kelly-scott-in-the-wildest)
- [The Farmer's Dog – How Couples Can Divide Dog-Care](https://www.thefarmersdog.com/digest/how-couples-can-divide-dog-care-responsibilities/)
- [NPR Life Kit – How to split up chores fairly](https://www.npr.org/transcripts/1123560719)

**保姆交接标准:**
- [TrustedHousesitters – Sitter Handover Checklist](https://www.trustedhousesitters.com/blog/sitters/sitter-handover-checklist/)
- [Evaheld – Pet Care Guide Template](https://evaheld.com/blog/pet-care-instructions-template)
- [Pet Sitters International – Emergency Planning Guide (PDF)](https://cdn.ymaws.com/petsitters.org/resource/resmgr/emergency_planning_/dp_pet_sitter_revised_11.20..pdf)

**合规:**
- [Lemon Squeezy – Refunds and Chargebacks](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks)
- [Lemon Squeezy – Buyer Terms](https://www.lemonsqueezy.com/buyer-terms)
- [FTC – Click-to-Cancel Rule (Oct 2024)](https://www.ftc.gov/news-events/news/press-releases/2024/10/federal-trade-commission-announces-final-click-cancel-rule-making-it-easier-consumers-end-recurring)

---

*本报告由真实世界数据采集 + 四视角独立分析 + 圆桌辩论质询综合产出。所有市场、用户、社会、合规结论均有可追溯的来源。可作为 Phase 0 决策和文档更新的依据。*

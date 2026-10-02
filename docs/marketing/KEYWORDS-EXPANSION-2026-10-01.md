# 关键词扩展研究 2026-10-01（第二批）

状态：2026-10-01（SERP 探针当日跑）
岗位：关键词研究（只读研究 + 本报告，未改任何代码）
对象：PLANET（多照顾者宠物照护系统），市场 = 美国 / 全球英文
基线：[keyword-research-2026-09-29.md](../../www.joinplanet.pet/docs/keyword-research-2026-09-29.md)（4377 词收割 / 563 词精选 / 10 意图簇）+ [NEEDS-MINING-2026-10.md](NEEDS-MINING-2026-10.md)（405 条竞品差评 → C1–C14 需求簇）

**本报告只收 2026-09-29 批报告没覆盖的词与现有内容的缺口。** 基线已覆盖并已布局的词（疫苗表、驱虫、用药提醒/图表、症状检查器、健康记录模板、sitter instructions 模板、shared pet care app 品类词）一律不重复收录。

---

## 0. 方法与怎么读这份报告

- **挖掘面**：①竞品内容结构（PetMD / The Spruce Pets / DogLog / PetDesk / petcoparenting / 寄养-救助 SaaS）②「多人共养」真实场景系统性过一遍（离婚/分手共同养育、室友合养、寄养家庭、多犬家庭、老年父母的宠物、术后照护交接、就诊记录交接）③SaaS/B2B 词 ④季节性/事件词。
- **工具**：13 次 WebSearch 探针（2026-10-01），难度判定用 **domain 级 SERP 证据**（谁在排、什么形态、DR 强弱），与基线报告同一方法论、同一局限（拿不到精确搜索量，见 §9）。
- **收录门槛**：只收 PLANET 能真诚提供价值的词——多照顾者协作、用药管理、照护交接三类产品能力直接对应的场景。纯蹭量、法务意图冒充、或需要 PLANET 没有的功能（预约/收款/费用分摊）才能满足的词，明确给出「不做」结论而不是藏起来。
- **没有搜索量数字。** 每个「难度」都是 SERP 形态判断。上工程前必须在 GSC（站已有 impression 后）和 Keyword Planner 复核——和基线报告同一红线。

**站点现状盘点（2026-10-01，读源码确认）**：可索引页 = `/`、`/tools`（+ schedule / pet-card / symptoms）、symptom wave-1 子页（`SYMPTOM_WAVE=1`，8 篇已发布）、`/learn` 索引 + 5 篇文章（dog-vaccine-schedule-chart、puppy-vaccine-schedule、deworming-schedule-for-dogs、pet-health-record-template、remember-dog-monthly-medication）、`/pricing`、`/support`、`/faq`、`/about`（+法务页）。基线报告 P0 的 `/tools/sitter-instructions` 工具**尚未建**（app/tools/ 下只有 schedule/pet-card/symptoms），本批多个词依赖它，日历里显式标注了依赖。

---

## 1. TOP20 新词表

难度 = domain 级 SERP 证据（当日探针，来源编号见 §8）。意图按(info / commercial / tool)标注。

| # | 关键词 | 意图 | 难度（SERP 证据） | 目标页 | 一句话角度 | 优先级 |
|---|---|---|---|---|---|---|
| 1 | dog custody schedule · pet custody schedule after divorce | info→commercial | **中**：法律模板站（agreements.ai / PandaDoc / LegalTemplates）+ 律所博客（khk.law / Weinberger）+ OurFamilyWizard（人类共同养育 App）；**没有任何权威宠物站** | **新** `/learn/dog-custody-schedule` | 协议只决定「谁哪天带」；真正难的是执行——把 2-2-3 排班跑成共享日程 + 「谁做了」记录，交接日不丢信息 | P1 |
| 2 | co-parenting a dog · dog co-parenting app | commercial | **中**：petcoparenting.com 一家专门站 + Rover/ahead-app/thesmartsnout 博客 + Reddit r/Pets 讨论；无权威站占位 | 同上页 + 并入计划中的对比支柱 `/learn/best-shared-pet-care-apps` | 直接品类词；诚实标注 PLANET 不做费用分摊/数字协议，只做照护执行层 | P1 |
| 3 | who gets the dog in a divorce · can my ex take my dog | info（法律向） | **高**：律所 + AARP + IAABC Foundation Journal 权威内容 | 同 #1 页的 FAQ 章节 | 只做普及层回答（各州差异 + 建议咨询律师），把意图引向协调执行，不装律师 | P2 |
| 4 | roommates sharing a dog · roommate pet agreement | info | **低**：printablecontracts / homeco / roommatepact 等弱模板站 + Caltech 宿舍 PDF | **新** `/learn/roommate-dog-agreement` | 书面协议只是开始；搬进来那天签的协议，三个月后靠共享清单执行（谁喂了/谁遛了/疫苗谁带去） | P2 |
| 5 | who fed the dog app | commercial | **中高**：Team Pet / Pawlo / Pet Feeder / DogNote 应用包 + Reddit；竞品密集（与基线 I 簇同盘） | `/` 文案优化 + 对比支柱条目 | 「I thought you did it」的口语化品类长尾；正是 home page 已有的场景原话，做到标题里 | P2 |
| 6 | foster dog medication log · foster dog care log | info→tool | **低**：单个救助组织的打印 PDF（All Points West GSP Rescue）+ Etsy 寄养手册 + Pinterest；几乎无人做数字方案 | **新** `/learn/foster-dog-care-log` | 寄养协议普遍要求记录每次用药；把纸面 log 变成可交接的共享记录，交还救助方/换寄养家庭时一键只读分享（care summary 正是此场景） | P1 |
| 7 | new foster dog checklist · foster dog supplies | info | **中**：azhumane / adoptapet / fosterdogsnyc 等非营利权威，但都是购物清单形态、无执行层 | 同 #6 页 | 前 30 天清单 + 与救助方对接：救助方给的医嘱进来即成为共享计划，不是又一张纸 | P2 |
| 8 | rescue dog first 30 days · adopting a rescue dog checklist | info | **中弱**：诊所博客（shortpumpvet）+ espanolahumane PDF + Sniffspot + ASPCA Pro；**无单一权威占位** | **新** `/learn/rescue-dog-first-30-days` | 3-3-3 去应激期 = 全家从头建立 routine 的时刻，正是共享日程的最强采纳时机；十月领养月正配（见 §5） | P1 |
| 9 | 3-3-3 rule rescue dog | info | 同 #8 同簇 | 同 #8 页 H2 | 同上；作为该页的入口长尾词而非独立页 | P2 |
| 10 | multi-dog household feeding schedule | info | **弱中**：小诊所博客 + 电商博客（Kima / Petmate）+ VCA 通用文 + Reddit 讨论；无产品形态答案 | **新** `/learn/multi-dog-household-schedule` | 每只狗不同处方粮/不同医嘱 × 不同人执行 = 错喂重喂高发；对应差评簇 C12（多宠）与 C3（谁做的），产品多宠聚合正是正面解 | P1 |
| 11 | multiple dogs different medications reminder | info | 同 #10 簇 | 同 #10 页（或并入计划中 med-chart 页的多宠分区） | 心丝虫每月 1 号 ×N 只狗 + 驱虫错峰的现实；「全家共用一张用药表」角度 | P2 |
| 12 | cat sitter instructions template · cat sitter checklist | info→tool | **低且陈旧**：2016 年 printable 博客（Sunny Day Family）+ petsitterplan / pupline / Etsy / TrustedHousesitters 博客 | 基线 P0 工具 `/tools/sitter-instructions` 的**猫专属分区**（依赖：工具先建） | 基线 A 簇工具页补猫字段：litter 排班、多猫 per-cat 表、躲藏点、室内猫时长规则；猫 SERP 比狗更弱 | P1 |
| 13 | pet sitter instructions for multiple pets | info→tool | **低**：同 #12，模板站均支持 per-cat 表但无工具形态 | 同 #12 页 | per-pet 表格角度，与 10 的多宠内容互链 | P2 |
| 14 | dog surgery recovery checklist · dog after surgery care at home | info | **中**：VCA / 专科诊所（shorepetsurgery / miscaspecialtyvet）权威但全是医学通用文，无执行层 | **新** `/learn/dog-surgery-recovery-checklist` | 「每日 2 次伤口检查 × 10-14 天 + 按时给药」是典型多人接力；只做协调与遵医嘱记录，不做医学判断（YMYL 红线，页面要有 vet-review 行） | P2 |
| 15 | what to bring to first vet visit (new vet) | info | **弱中**：诊所网络博客（geniusvets 联盟）+ PetSmart 学习中心 + Animal Humane Society；无强占位 | **扩充** `/learn/pet-health-record-template`（新增分区） | 就诊 = 记录「活过来」的那一刻（差评簇 C7 的正面场景）；「带什么」清单直连已有记录页 + 只读分享链接 | P1 |
| 16 | how to transfer vet records to a new vet | info | 同 #15 簇 | 同 #15 页 | 基线 harvest 已收 `how to get vet records`（B/1）但从未给目标页——本页补上；与 15 同簇同页 | P2 |
| 17 | helping elderly parents with pet care | info | **低**：home-care 机构博客（asccare / Visiting Angels / LifeWorx），全是卖养老服务的间接内容，直说「兄弟姐妹分摊任务」却无人提供工具 | **新** `/learn/aging-parents-pet-care` | 子女远程分摊父母的宠物照护 = PLANET 家庭角色 + 请求转交的正场景；**需求信号弱，必须 GSC/Keyword Planner 先验证再写** | P2 |
| 18 | senior dog medication schedule / chart | info→tool | **低中**：基线 B 簇 SERP 形态适用（Etsy printable + 大学 PDF），senior 限定词未见强占位 | 计划中 `/learn/pet-medication-chart` 的 senior 分区 | 老年犬多药叠加 × 多照顾者；11 月 Senior Pet Month 时点配（见 §5） | P2 |
| 19 | pet emergency plan · who takes the pet in an evacuation | info | **高**：Red Cross / ASPCA / CDC / State Farm / 大学推广全权威 | **扩充** sitter-instructions 工具（紧急联络 sheet 输出） | 权威 SERP 不正面打；只做「家庭紧急分工表」工具化长尾——谁负责哪只、带走什么、记录在哪 | P3 |
| 20 | dog daycare report card（+ boarding report card） | info→tool | **低**： daycare 行业报告卡是 SaaS 功能（ProPet/Collar），消费者侧模板搜索由弱模板站承接 | 扩充 `/tools/pet-card`（输出模板对齐 daycare report card 字段） | daycare 每日报告卡 = 交接场景的既有心智；pet-card 工具加「daycare 版式」即可承接 | P3 |

**落选说明（有需求、本轮不做，防止复案）**：
- `halloween pet safety` 类节日安全 head 词——SERP 被 ASPCA/AVMA/PetMD/MedVet（DR90+）整排占位，新站无胜机，见 §5 的完整裁决。
- `pet insurance`、`rover 类`：基线 §5 已裁，不变。
- `dog boarding vs sitting`：真实养宠决策词，但本轮未做 SERP 探针验证，不凭感觉入表；下轮验证。
- 「double feeding 猫/室友重复喂」：真实痛点（差评 C2/C3 与 Reddit 均有证据），但未验证独立搜索词形态，先作为 #10/#5 页内 H2，不独立建页。

---

## 2. 竞品内容缺口（证据）

**核心发现：权威内容站集体缺席「协作机制」这个层面。** PetMD/The Spruce Pets 把「宠物需要什么照护」覆盖得很厚（这也是基线已布局的疫苗/驱虫/症状簇，属同质化竞争区），但「一家人如何一起跑照护」没有任何权威站内容：
- **The Spruce Pets**：站内检索确认只有 `How to Find an Excellent Dog Sitter`（泛泛建议 "provide detailed instructions"）和 `Pre-Travel Checklist for Pet Parents`（打包清单）。**无 pet custody / co-parenting / 多照顾者协作类文章**（site: 探针空结果）。
- **PetMD**：无 co-parenting/custody 协调类内容；halloween safety 这类节日词倒是它与其他 DR90 站整排占位（这就是 §5 裁决的依据）。
- **DogLog（直竞）**：博客极薄（weigh your dog 类短文）；其 App 差评 C3「多人遛狗统计坏了」/C4「pack 成员提醒做不到」说明它关键词面虽在协作长尾，兑现能力差——我们在同一批长尾上是产品更强的一方。
- **PetDesk（诊所分发）**：无公开内容打法；其差评 C1「不支持 multi-pet parents / invisible labor 全压一个人」是文案弹药（基线 TOP1 已收），不是关键词目标。
- **petcoparenting.com**：宠物共同养育唯一专门站（共享排班/交接提醒/换班请求/费用分摊/日历同步）。域名新、体量小，可打；它验证了这个细分的商业意图。**注意它的费用分摊/数字协议功能我们没有——对比页必须诚实列出。**
- **寄养/救助侧**：组织端是成熟 SaaS（Petstablished / Pawlytics / Trackabeast，见 §4），但**寄养志愿者（消费者）侧**只有救助组织散装的打印 PDF 和 Etsy 手册——#6/#7 的低难度就是这么来的。

**结论**：第一批新页全部落在「协作机制」层（custody 执行、roommate 执行、foster 交接、multi-dog 分工、术后接力、就诊记录交接），这是竞品内容结构上真实存在的空白，且全部有产品能力直接背书。

---

## 3. SaaS / B2B 词评估（裁决：不做组织端）

| 词族 | SERP 证据（2026-10-01） | 量级判断 | 裁决与依据 |
|---|---|---|---|
| dog daycare software · pet sitting software · cattery management software · kennel software | Time To Pet、Paw Partner、ProPet、KennelBooker、Gingr、Collar 六家以上成熟 SaaS + Capterra/Connecteam/Franpos 评测矩阵整排占位 | 稳定商业品类词，量大但完全是采购意图 | **不做。** PLANET 无预约/排班付薪/开票/收款/容量管理/员工协作，任何 B2B 软件页都是不真诚的（违反收录门槛）。写进本报告防止复案。 |
| pet care business software | 同上盘 + 行业评测站 | 同上 | 同上 |
| animal rescue foster coordination software · shelter management | Pawlytics / Trackabeast / Rescue Workflow / Petstablished / Animals First / Shelter Assist（开源）+ Maddie's Pet Forum 社区讨论 | 中量，采购意图明确 | **组织端不做**（同上）。**但拆出消费者侧**：寄养志愿者搜的是「我怎么记录这只 foster 狗的用药/病历」——即 §1 #6/#7，低难度、产品直接满足。这是 B2B 面里唯一诚实的切入点，切入点是 B2C。 |
| vet clinic reminder software（间接） | 全是 Vetstorch 类医疗 SaaS 盘 | 大 | 不做。PLANET 明确不连诊所系统（FAQ 已承诺），此处连内容都不该碰，避免自相矛盾。 |

**给依据的量级参考**：品类词的采购意图由「Capterra 专门品类页 + 多家定价页 + Reddit 选型讨论」三件套确认，这已是 SaaS 市场标准形态，不存在「小众没人做」的空间——与基线报告「品类词被小 App 包占有」的 I 簇判断在这里**不成立**（那边是小应用包可打，这边是成熟企业软件不可打）。

---

## 4. 季节性 / 事件词（十月 + 常青日历）

### 十月（本月可动作的）
| 事件 | 证据 | 动作 |
|---|---|---|
| **Adopt a Shelter Dog Month**（ASPCA）/ **Adopt-A-Dog Month**（American Humane，1981 年起） | National Day Calendar / American Humane 官方页 | **`/learn/rescue-dog-first-30-days` 于 10 月第 1 周上线**（§1 #8），是本轮季节性与内容计划唯一强耦合点。10/4 World Animal Day 做社交分发。 |
| **National Pet Wellness Month**（十月全月） | 行业日历（astroloyalty 等） | 不建节日页；作为 `/learn/pet-health-record-template`「first vet visit / 记录交接」分区（§1 #15）**10 月内上线**的发布由头。 |
| Halloween pet safety | SERP 整排 ASPCA / AVMA / PetMD / MedVet / Thrive（DR90+ 权威） | **不做内容页。** 新站正面打权威节日词无胜机；只做社交/邮件钩子（xylitol 提醒 + 让家人看同一张照护清单的产品角度），不自建 URL 与权威抢。 |
| National Animal Safety and Protection Month（十月） | 行业日历 | 并入 #19 紧急分工表工具化的发布由头（P3，日历顺延）。 |

### 常青节日历（社交与邮件钩子用，默认不建内容页——同类权威 SERP 裁决同 halloween）
| 时点 | 事件 | 用法 |
|---|---|---|
| 3 月 | National Pet Poison Prevention Week | 邮件/社交钩子，链 `/tools/symptoms` |
| 4 月 | Heartworm Awareness Month | 链 `/learn/remember-dog-monthly-medication` |
| 5 月第 1 周 | National Pet Week（AVMA）/ National Pet Month（美英均有） | 社交 + 对比支柱推广 |
| 7 月 4 日 | 烟火走失高发日 | 社交钩子：走失预防 + 紧急联络 sheet |
| 7 月 15 日 | Pet Fire Safety Day | 社交钩子 |
| 8 月 15 日 | Check the Chip Day | 社交钩子，链健康记录页 |
| 11 月 | **National Senior Pet Month** + National Pet Diabetes Month | **`senior dog medication schedule` 分区（§1 #18）11 月上线**的发布由头——这是日历里第二个内容-时点强耦合 |
| 12 月 | 假期出行/寄养高峰 | sitter-instructions 工具加「holiday handoff」文案与邮件推送（12 月初，不新建 URL） |

**原则**：节日词只在「有产品能力直接满足且 SERP 有洞」时建页（本季只有 rescue-dog-30-days 一例）；其余一律做社交/邮件/页内钩子，避免在权威 SERP 上消耗抓取与信任。

---

## 5. 现有页面扩充清单（14 个可索引页逐页过）

基线报告的 T1 优化（首页加 shared pet care、schedule 工具加 template 措辞、symptoms 改题等）仍然有效、不重复；下面只列**本批新发现导致的缺口**。

| 页 | 缺什么板块（本批新发现） | 对应新词 |
|---|---|---|
| `/` | ①「who fed the dog」口语化场景句没有出现在任何标题级位置（现文案只有 "shared pet care" 品类语）；②三场景卡（couples/families/roommates 已有）缺第四类：**分开的家庭共用一只狗**（custody 场景，产品能力完全覆盖，只差文案点名） | #1/#2/#5 |
| `/tools`（hub） | 缺 sitter-instructions 工具卡位（工具建好后）；缺「foster / 多宠」场景入口 | #6/#12 |
| `/tools/schedule` | 缺 multi-pet 同屏视角的措辞与 H2（「多只狗、不同医嘱、一张表」）；基线的 template/printable 分区仍缺 | #10/#11 |
| `/tools/pet-card` | 缺 daycare report card 版式/字段对齐（#20）；缺「给 sitter 的随身卡」用例文案 | #20 |
| `/tools/symptoms`（+wave-1 子页） | 本批无新缺口；wave-2 拆分维持基线 GSC 门控不变 | — |
| `/learn`（索引） | 5 篇文章后无分类结构；到 8 篇前必须加分组（Care coordination / Schedules & prevention / Records & visits），否则新页（custody/foster/multi-dog）会把索引拖成杂烩 | 全部 |
| `/learn/dog-vaccine-schedule-chart` | 缺「这次谁带去打」协作视角一句 + 直链 schedule 工具 CTA（基线已提，未落）；**不扩新板块**，避免文章失焦 | — |
| `/learn/puppy-vaccine-schedule` | 缺「幼犬任务分工」小节（谁负责哪针/夜里谁起）——新宠采纳时刻即共享计划最强时刻（基线自己论证过，内容没兑现） | #5 |
| `/learn/deworming-schedule-for-dogs` | 缺多犬家庭同驱/错驱小节（一窝或一屋多只狗的同步驱虫表） | #10/#11 |
| `/learn/pet-health-record-template` | **最大缺口页**：缺「what to bring to first vet visit」「how to transfer vet records to a new vet」「紧急联络 sheet」三个分区 | #15/#16/#19 |
| `/learn/remember-dog-monthly-medication` | 缺多宠叠加场景（N 只狗 × 心丝虫/驱虫错峰）与 senior 犬多药小节 | #11/#18 |
| `/pricing` | 缺场景化 FAQ：两地家庭共用一只宠物怎么算（custody）、室友共用免费档边界——**先核实产品能力再写**（免费档 2 只活跃宠/家庭角色的表述要与 App 实际一致），不能拍脑袋承诺 | #1/#4 |
| `/faq` | 缺四类场景问答：custody（两家庭两账号可行吗）、roommate（搬走怎么办）、foster（临时照护者权限）、sitter（只读链接有效期）——全部用现有能力作答，答不了的（费用分摊）明说没有 | #1/#4/#6 |
| `/about` | 无关键词任务，不动 | — |

---

## 6. 30 / 60 / 90 天内容日历草案

依赖前置：基线 P0 的 `/tools/sitter-instructions` 工具未建，#12/#13/#19 三个词排在工具落地之后；`/pricing` 场景 FAQ 需产品能力核实，排 60 天。

### 30 天（2026-10）
| 周 | 动作 | 对应 |
|---|---|---|
| W1 | 上线 `/learn/rescue-dog-first-30-days`（领养月）；社交分发挂 World Animal Day（10/4） | #8/#9 |
| W1–2 | 扩充 `/learn/pet-health-record-template`：first-vet-visit + records-transfer 分区（Wellness Month 由头） | #15/#16 |
| W2 | 建 `/tools/sitter-instructions`（基线 P0 顺序本就该在此）并直接带猫分区 + 多宠表 + 紧急 sheet 输出 | #12/#13/#19 |
| W3 | 上线 `/learn/foster-dog-care-log` | #6/#7 |
| W4 | `/learn` 索引加分类分组；FAQ 加 custody/roommate/foster/sitter 四问答（不含 pricing 依赖）；GSC 首批新页 impression 检查 | §5 |
| 全月 | Halloween 只做社交/邮件钩子，不建页 | §4 |

### 60 天（2026-11）
| 周 | 动作 | 对应 |
|---|---|---|
| W1–2 | 上线 `/learn/dog-custody-schedule`（含 co-parenting 品类词与法律 FAQ，页脚挂「不提供法律意见」）；对比支柱 `best-shared-pet-care-apps` 若未建则本批建，收录 petcoparenting/DogLog 等诚实对比 | #1/#2/#3/#5 |
| W2 | 首页文案更新：who-fed-the-dog 句 + 第四场景卡；`/pricing` 场景 FAQ（能力核实后） | #5 |
| W3 | 上线 `/learn/multi-dog-household-schedule`；`remember-dog-monthly-medication` 扩多宠/多药小节（Senior Pet Month 由头） | #10/#11/#18 |
| W4 | 扩 `/learn/puppy-vaccine-schedule` 分工小节；`/tools/schedule` 加多宠 H2；60 天 GSC/Keyword Planner 复盘第一批词（custody/foster/rescue 三簇为主） | #11 |

### 90 天（2026-12 – 2027-01）
| 周 | 动作 | 对应 |
|---|---|---|
| 12 月 W1 | sitter 工具 holiday-handoff 文案 + 邮件（不新建 URL） | §4 |
| 12 月 W2–3 | 上线 `/learn/dog-surgery-recovery-checklist`（配 vet-review 行与免责结构） | #14 |
| 1 月 W1–2 | `aging-parents-pet-care`（**先验证需求信号**：GSC/Keyword Planner 无信号则降级为页内小节）；`roommate-dog-agreement` | #17/#4 |
| 1 月 W3–4 | 全量复盘：20 词逐一对照 GSC 展示/点击与 Keyword Planner 量级；决定 #17 是否砍、#6/#10 是否值得续拆长尾、wave-2 symptom 拆分是否按基线门控放行 | §9 |

---

## 7. 来源清单（全部 2026-10-01 探针）

** custody / co-parenting / roommate**
1. agreements.ai pet custody template — https://www.agreements.ai/templates/pet-custody-agreement-on-separation-divorce
2. PandaDoc pet custody template — https://www.pandadoc.com/pet-custody-agreement-template
3. OurFamilyWizard — https://www.ourfamilywizard.com/blog/pet-custody-during-divorce-putting-pets-and-kids-first
4. Rover dog parenting plans — https://www.rover.com/blog/your-guide-to-dog-parenting-plans
5. petcoparenting.com — https://petcoparenting.com/divorce-pet-custody-app
6. AARP gray divorce — https://www.aarp.org/family-relationships/pet-custody-amid-gray-divorce
7. IAABC Foundation Journal — https://journal.iaabcfoundation.org/who-keeps-the-dog-divorce-advice-from-a-pet-custody-expert
8. ahead-app shared pets — https://ahead-app.com/blog/heartbreak/navigating-shared-pets-after-breakup-a-co-parenting-guide-that-works
9. Reddit r/Pets shared pet apps — https://www.reddit.com/r/Pets/comments/1kx4lqv/are_there_any_apps_to_track_a_shared_pets_care
10. Caltech roommate pet agreement PDF — https://housing.caltech.edu/documents/21205/RoommatePet_Agreement.pdf
11. printablecontracts roommate shared pet — https://www.printablecontracts.com/Roommate_Agreement_Shared_Pet.php
12. roommatepact blog — https://roommatepact.com/blog/pet-roommate-agreement
13. BADRAP roommates — https://badrap.org/training-resources/advice-from-roommates-sharing-spaces-with-multi-pets

**应用包（who-fed-the-dog 簇）**
14. Team Pet — https://teampetapp.com ；15. Pawlo — https://getpawlo.app ；16. Pet Feeder — https://petfeeder.app ；17. DogLog — https://www.doglogapp.com （blog: /blog）

**foster / rescue / multi-dog**
18. Arizona Humane 30-day checklist — https://www.azhumane.org/blog/bringing-home-a-rescue-dog-your-first-30-days-checklist
19. Adopt-a-Pet foster shopping list — https://www.adoptapet.com/blog/foster-volunteer/foster-dog-shopping-list
20. All Points West GSP medication log — https://www.allpointswestgsp.org/medicationlog
21. Foster Dogs NYC — https://www.fosterdogsnyc.com/shopping-list
22. Short Pump Vet 3-3-3 — https://www.shortpumpvet.com/3-3-3-rule-adopted-dog-adjustment
23. Espanola Humane 3-3-3 PDF — https://www.espanolahumane.org/wp-content/uploads/2020/09/Adopting-Dogs-333-Rule.pdf
24. ASPCA Pro adjustment periods — https://www.aspcapro.org/resource/pet-adjustment-periods-3-days-3-weeks-3-months-guide
25. Sniffspot 3-3-3 — https://www.sniffspot.com/blog/dog-training/the-3-3-3-rule-for-rescue-dogs
26. 108 Ave Animal Hospital multi-pet feeding — https://108aveanimalhospital.com/tips-for-feeding-multiple-pets-with-different-needs
27. VCA feeding times — https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-your-dog
28. Reddit r/dogs med schedule automation — https://www.reddit.com/r/dogs/comments/1swxv37/advice_on_medication_schedule_automation_for_dog

**cat sitter / 术后 / 就诊 / 老年父母**
29. Pet Sitter Plan cat template — https://www.petsitterplan.com/cat-sitter-instructions-template
30. Pupline cat template — https://www.pupline.app/templates/cat-care-instructions-template
31. Sunny Day Family（2016 printable）— https://www.sunnydayfamily.com/2016/05/cat-sitting-checklist.html
32. TrustedHousesitters cat checklist — https://www.trustedhousesitters.com/blog/owners/cat-sitter-checklist
33. VCA surgical incisions — https://vcahospitals.com/know-your-pet/care-of-surgical-incisions-in-dogs
34. Shore Pet Surgery recovery — https://www.shorepetsurgery.com/blog/how-to-prepare-your-pets-recovery-after-surgery.html
35. GeniusVets wellness exam — https://www.geniusvets.com/pet-care/learn/dogs/dog-wellness-exams/what-do-i-need-bring-wellness-exam
36. PetSmart vet visit prep — https://www.petsmart.com/learning-center/pet-care/preparing-for-your-pets-vet-visit
37. Animal Humane Society first vet visit — https://www.animalhumanesociety.org/resource/how-prepare-your-pets-first-vet-visit
38. ASC home care pets — https://www.asccare.com/aging-parents-and-pets-how-to-help-with-their-care
39. Visiting Angels seniors with pets — https://www.visitingangels.com/articles/professional-home-care-can-help-seniors-with-pets/20857
40. The Spruce Pets dog sitter — https://www.thesprucepets.com/how-to-find-an-excellent-dog-sitter-4685741 ；pre-travel checklist — https://www.thesprucepets.com/pre-travel-checklist-for-pet-parents-11766860

**B2B / 救助组织端**
41. Time To Pet — https://www.timetopet.com ；42. Paw Partner — https://pawpartner.com ；43. ProPet — https://www.propetware.com/boarding-kennel-daycare-software ；44. KennelBooker — https://www.kennelbooker.com/daycare-software ；45. Collar — https://platform.collar.pet/dog-daycare-software ；46. Capterra pet sitting software — https://www.capterra.com/pet-sitting-software ；47. Petstablished — https://petstablished.com ；48. Pawlytics — https://pawlytics.com ；49. Trackabeast — https://trackabeast.com ；50. Maddie's Pet Forum — https://forum.maddiesfund.org/discussion/software-programs-for-all-foster-based-rescue

**季节 / 应急**
51. National Day Calendar Adopt a Shelter Dog Month — https://nationaldaycalendar.com/celebrations/adopt-a-shelter-dog-month-october
52. American Humane Adopt-A-Dog Month — https://www.americanhumane.org/article/adopt-a-dog-month
53. Astro Loyalty October pet holidays — https://www.astroloyalty.com/pet-holiday-guide-october-2026
54. ASPCA Halloween safety — https://www.aspca.org/pet-care/general-pet-care/halloween-safety-tips ；AVMA — https://www.avma.org/resources-tools/pet-owners/petcare/halloween-pet-safety ；PetMD — https://www.petmd.com/general-health/halloween-pet-safety-tips
55. Red Cross pet disaster preparedness — https://www.redcross.org/get-help/how-to-prepare-for-emergencies/pet-disaster-preparedness.html ；CDC kit PDF — https://www.cdc.gov/healthy-pets/media/pdfs/disaster-prep-Pet-Emergency-Checklist-1.pdf ；24Pet evacuation plans — https://www.24pet.com/blog/pet-emergency-evacuation-plans

---

## 8. 局限（引用任何数字前先读）

1. **无搜索量数据。** 全部难度是 domain 级 SERP 形态判断（谁在排、内容形态、权威度），与基线报告同一方法论。#17（aging parents）这类需求信号最弱的词，必须 Keyword Planner 先验证再投入写作。
2. WebSearch 探针是摘要式返回，未逐 URL 抓取 SERP 交集；「无权威站占位」的判断以探针可见结果集为准，写页前建议对 #1/#8/#10 三个 P1 head 各补一次人工 SERP 目检。
3. 20 词是候选不是承诺：每个词落地前按 §6 日历的复盘点用 GSC 数据再裁一次，特别是 #17/#19/#20 三个 P2/P3。
4. 本报告未改动任何代码；`/tools/sitter-instructions` 未建属基线 P0 缺口，日历已把依赖显式排期。

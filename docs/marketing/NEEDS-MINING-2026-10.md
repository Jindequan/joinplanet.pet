# 竞品差评需求挖掘 2026-10

状态：2026-09-30（数据当日拉取）
岗位：产品需求研究（营销调研）
目的：从宠物照护类头部竞品的 1–3 星用户评论中挖真实需求，为下批路线图（1.1 之后）提供候选与排序依据。
事实源对照：[PRODUCT.md](../PRODUCT.md)（能力现状）、[V11-CAPABILITY-SCOPE.md](../audits/V11-CAPABILITY-SCOPE.md)（1.1 范围）。组织层与付费已裁为范围外，本报告不再提。

---

## 0. 方法与语料

- 采样：iTunes 官方客户评论 RSS（`itunes.apple.com/{cc}/rss/customerreviews/id={appId}/sortBy=mostRecent`，每 App 拉满最近页），按 1–3 星过滤；Google Play 用 web_reader 取页面可见差评与总分；Pet Care Tracker 另取 justuseapp 聚合页补充长尾主题。
- 语料量：7 个 App、约 2,184 条原始评论，其中 1–3 星负评 **405 条**，逐条通读后归类。
- 拉取时间：2026-09-30。RSS 只给最近约 500 条，高分 App 的负评绝对数仍充足（见下表）。

| # | 竞品 | 定位 | 平台 | 总分（拉取日） | 样本量 | 1–3 星样本 |
|---|---|---|---|---|---|---|
| 1 | 11pets | 全能宠物健康日志（老牌，口碑崩塌中） | iOS US + Play | iOS 3.29★/77；Play 2.1★/5.65K | 48 + Play 可见 3 条 | 29 + 3 |
| 2 | PetDesk | 诊所分发的宠主 App（50 万评分） | iOS US | 4.86★/505,021 | 500 | 122 |
| 3 | Airvet | 宠物远程医疗（兽医视频问诊） | iOS US | 4.93★/11,096 | 415 | 41 |
| 4 | DogLog | 家庭共享狗狗日志（「pack」多人共养直竞） | iOS US | 4.78★/1,361 | 147 | 27 |
| 5 | Pet Care Tracker (Dog & Cat Log) | 单人健康记录+提醒（前次调研已引） | iOS US | 4.83★/948 | 174 | 10（另有 justuseapp 长尾 6 条建设性主题） |
| 6 | Tractive | GPS 硬件+App（Pawtrack 同类替代，见下注） | iOS US | 4.61★/27,830 | 400 | 173 |
| 7 | Medisafe | 通用用药提醒（宠物场景差评专项） | iOS US | 4.71★/101,404 | 500 | 4 条宠物相关（2 负评） |

**两点说明（诚实标注）：**
1. **Pawtrack 未入选**：原品牌（英国猫咪 GPS）在美区/英区 App Store 均无可观评论体量（检索只命中同名杂牌 0–4 评分），不具备挖矿价值，按同类替代原则换成 Tractive（27.8K 评分）。
2. **Airvet 与 Tractive 的多数差评属于商业模式/硬件吐槽**（远程医疗不能开药还收 $30；GPS 硬件续航/续订/无人工客服），按任务规则**单列**（§3），只把其中「产品能解决」的部分收进聚类。

---

## 1. 需求聚类表（只收「产品能解决的」）

频次 = 语料中可归入该主题的负评条数（同一竞品多条计多条）。原声保留英文原文。

### C1 第二照顾者进不来 / 多家长账号缺位 —— 频次 6，出现在 5/7 家

| 代表原声 | 竞品 |
|---|---|
| "Doesn't support multiple pet parents!!! … This widens the care gap because it incentivizes couples to put all the invisible labor of caring for the pet/s on one person." | PetDesk |
| "If a simple function like my wife trying to share our dog's account with me doesn't work I have no hopes for the rest of this app." | Pet Care Tracker |
| "Family sharing is a feature it's supposed to have, but the family member can never accept the invitation because it gets stuck in an endless bluetooth discovery loop." | Tractive |
| （DogLog 邀请页崩溃："can never use the app. It always crashes when I get to the 'invite' screen."） | DogLog |

### C2 通知没有落在可行动的完成面上 —— 频次 5

| 代表原声 | 竞品 |
|---|---|
| "When you get the notification you really want, you head over to the app and there's nothing there. No checkbox to confirm, no way to tell what's supposed to happen." | Pet Care Tracker |
| "We see the notice counter with 4 items. If you can actually get logged in, there are no messages." | PetDesk |
| （DogLog：记录动作静默丢失，"I miss so many events because I thought I waited long enough then look later in the day and there's nothing there."） | DogLog |

### C3 「谁做的 / 真实执行时间」缺失 —— 频次 5

| 代表原声 | 竞品 |
|---|---|
| "If you set up the medication to give it every day at noon, but you don't give it until 3:40 PM, the medication is still going to show as though it was given at noon… a fatal flaw in this app, especially for cats on chemotherapy." | PetDesk |
| "It also doesn't allow for accurate tracking of when the medication is actually given." | Pet Care Tracker |
| "We are trying to track multiple people walking the dog and when she does her business. But the stats tab does not work!" | DogLog |

### C4 提醒调度缺「事件相对 + 静默窗口」—— 频次 4

| 代表原声 | 竞品 |
|---|---|
| "I set the flea meds and it went off every 2 minutes until I reset it." | Pet Care Tracker |
| "Ability to schedule alarms… set alarm for certain number hours after first pee of the day during certain window… have these alarms go to all pack members or not, with option to turn on/off for pack members… we have a problem in our house w family mbrs forgetting to take dog out on days when mom isn't telling someone too." | DogLog |
| "Why on earth don't you give people like 24hrs to react to a low battery notice??" | Tractive |

### C5 通知不可分级：照护通知与营销杂音绑死 —— 频次 5

| 代表原声 | 竞品 |
|---|---|
| "You can only turn notifications on or off. I don't care about all of the specials and spam information… but I can't turn notifications off because I still need notifications about my pet." | PetDesk |
| "You'll try to set up simple reminders to give your pet their medication. You'll end up getting literal 'cat facts' notifications. You'll get notifications about upcoming notifications." | Pet Care Tracker |
| （反向失效同样致命："Notifications when others feed or medicate my dogs are one of the key features of the app." —— 然后通知停发了） | DogLog |

### C6 数据信任：更新/迁移/额度变动动用户历史 —— 频次 15（最大簇）

| 代表原声 | 竞品 |
|---|---|
| "Most of the data was not migrated. And what's worse, the data that was migrated was scrambled!" | 11pets |
| "No warning to prior users they were going to lock all the pets info behind a paywall." / "my pets info is being held hostage for ransom" | 11pets |
| "After the update… ALL data on my pets is gone! So now I can't even make an appointment since I have no pets!" | PetDesk |
| "I've used it to track symptoms and medications for our cat… now seeing that I don't have all the history I've been diligently tracking, I'm really frustrated."（免费档只存 30 天） | Medisafe |

### C7 历史要活到「带宠物看医生/换照护人」那一刻 —— 频次 15

| 代表原声 | 竞品 |
|---|---|
| "Most sad is the loss of ability to generate reports for various contexts (pet sitter, vet, etc). I don't want to 'invite' people to see everything at any time, I want to generate a file based on what they need." | 11pets |
| "We showed up at the vet yesterday and found that I couldn't see the history since the last time we brought him in. What's the point in allowing me to track symptoms and notes for each dose if the history isn't saved." | Medisafe |
| "No way to export info. I want to print a lab result as a pdf or email… No way to print or share results from app unless I screenshot each result one at a time." | PetDesk |

### C8 宠物离世：被当成了「删账号」—— 频次 6

| 代表原声 | 竞品 |
|---|---|
| "After he died… his entire profile was deleted without my knowledge or say-so. It feels like losing him all over again." | PetDesk |
| "My beloved dog has been dead for over a year and yet PetDesk hasn't been able to stop automatic monthly reminders from appearing in my calendar." | PetDesk |
| "Went back 3-4 yrs after my dog died to get records to provide for a new adoption and low and behold, the app had no records of my previous pet." | PetDesk |

### C9 表单填不完（键盘遮挡/控件错乱/白字白底）—— 频次 10

| 代表原声 | 竞品 |
|---|---|
| "I can't even use the contact us within the app, because the submit button to submit what I've typed is hidden by the keyboard on an iPhone." | 11pets |
| "Tried to put in my pets birthday… the month calendar doesn't show the whole thing so I can't pick the date." | 11pets |
| "The 'Food' button will take you to a screen that shows you miles walked and time instead of things such as the food type… It's affecting everything in the Diet, Outdoors, and Care sections." | DogLog |

### C10 登录/会话/账号删除的自助闭环断裂 —— 频次 17（多为账号管道类）

| 代表原声 | 竞品 |
|---|---|
| "The email sent is titled 'How to know when your pets need care' and offers no option to validate anything… you're back at square one in a never ending loop." | PetDesk |
| "When I try to reset my password, it says that I do not have an account, but I have gotten email reminders from them to that email." | PetDesk |
| "I'm not comfortable with linking my Google (Gmail) or FB accounts… so unfortunately I cannot use this app."（×3 条同类） | DogLog |

### C11 请求发出后进黑洞 / 状态与实际相反 —— 频次 7

| 代表原声 | 竞品 |
|---|---|
| "It would be nice that the app would show I submitted a request for a prescription… later I wonder if I requested a prescription and may submit a request twice." | PetDesk |
| "I frequently receive reminders about appointments that has been cancelled and appointments that has been kept are showing as past due. It creates more work following up." | PetDesk |
| "I made an appointment through the app only to have it not tell the vet clinic about the appointment… my animal didn't get seen and I left work early for no reason." | PetDesk |

### C12 多宠与异宠家庭 —— 频次 6

| 代表原声 | 竞品 |
|---|---|
| "I have five guinea pigs and there is not a guinea pig choice so I couldn't start this app." | 11pets |
| "Three of our four dogs are special needs, and it would be helpful to keep track of meds and behaviors for all of them."（加宠入口失效） | DogLog |
| "Weight can only be logged in pounds; wants grams/ounces for neonatal kittens (4 oz). Logging weight is clunky for 2-hour feeding schedules." | Pet Care Tracker |

### C13 平台与无障碍（iPad 横屏/深色模式/读屏）—— 频次 10

| 代表原声 | 竞品 |
|---|---|
| "Could be a great app if it was accessible completely to those who use a screen reader. Many buttons are not labeled." | PetDesk |
| "The app will only open in portrait mode, useless for those of us with iPad and cases with keyboards."（×4 条同类） | PetDesk |
| "For deaf people — not highly recommend to install this app due to no closed caption." | Airvet |

### C14 邀请外的共享动作细节（日历/权限打断/紧急逃生口）—— 频次 5

| 代表原声 | 竞品 |
|---|---|
| "There is no 'add to calendar' function in the app! With 2 dogs and grooming, that's dozens of appointments for me to manually add." | PetDesk |
| "It continually asks for permission updates. The request blocks the main user screen and does not relent if you don't accept all requested permissions." | Tractive |
| "During a crisis and we are trying to find our dogs, I do not want to be rating the app at that moment… When a pet owner says go live, it should go live!" | Tractive |

---

## 2. 单列：非产品可解决（商业模式/客服/硬件）

这些是负评里量最大的部分，但不是 PLANET 用功能能解决的，收录仅作定价与文案警戒：

1. **价格与付费墙背刺**（~30 条，11pets/Medisafe/DogLog/Tractive）：免费转付费锁历史、终身授权不作数、$30 一次问诊、年付强制。**教训**：Medisafe 把免费档砍到 2 个药即引发「拿健康开玩笑」式怒评——PLANET 限额原则（超额只挡新增写入、存量永远可读可导出可删）正是对这一簇的制度化防御，写进验收而非仅写进设计。
2. **远程医疗结构性失望**（~35 条，Airvet 主体）：不能开处方、收了钱让去线下诊所、排队时长不透明。PLANET 明确不做 AI 诊断/医生后台，此簇为定位护城河而非需求缺口。
3. **硬件与客服**（~120 条，Tractive 主体）：续航、定位漂移、无人工客服、订阅扣款纠纷。与 PLANET 无关。
4. **广告与隐私**（~12 条，PetDesk/Tractive）：保险推销满屏、session recorder、强收 cookie、不能删账号。PLANET 无广告无追踪是默认满足项，可在商店文案里显性承诺。

---

## 3. 每聚类对照 PLANET 现状

判定依据：PRODUCT.md §3–§6、§8（Phase B/C 已完成清单）与 V11 范围表。「本批」= 1.1（C 触达 i18n、D 完成态/表单/会话收尾、E 授权时机等已在修）。

| 聚类 | 判定 | 依据 / 验收草案 |
|---|---|---|
| C1 第二照顾者进不来 | **已解决（列为永久回归闸门）** | Family 三角色+邀请+深链加入（1.1 A）、确认制共享（B）、双账号验收（§7）即为该簇的正面解。竞品死法（DogLog 邀请页崩溃、Tractive 邀请死循环）说明该链路必须是每个版本的 e2e 固定回归项：**验收：邀请码过期/重复/失效/深链冷启动四种路径均一步可达 Today，无死循环无崩溃。**同时此簇原声直接进商店副标题与 landing 文案库。 |
| C2 通知落到完成面 | **已解决（1.1 D 收尾）** | 推送携带请求 ID 回 Today 收件箱；Today 原位完成/跳过/撤销；幂等离线队列防静默丢失（Phase B 已完成）。1.1 D 正在修的「完成态收尾（L84）、建计划反馈（L102）、web 刷新（L98）」就是该簇最后一公里。 |
| C3 谁做的/真实时间 | **部分已解决；周视图可进下批** | 已解决：Occurrence 完成记执行人+真实完成时间，撤销不留假事实（§4.4）；预警含「已确认未完成的用药」（Phase C）。缺口：缺少跨天/跨成员的聚合视图。**下批候选验收草案：Family 页新增「本周谁做了什么」只读汇总（每成员完成/认领/转交计数），仅聚合现有完成事实，不新建业务主体，viewer 可见，五语。** |
| C4 事件相对提醒+静默窗口 | **可进下批（需 founder 裁决，属 L91 之外通知面）** | 现有 daily/weekly/monthly/interval/once + Family 时区已覆盖静态调度；「按首次记录事件相对触发」与「静默窗口内只入 Today 不推送」未做。1.1 已明确「L91 之外的通知面扩展」不在本批、下批起。**验收草案：interval 规则可设静默时段（默认 22:00–07:00 本地时区），窗口内事项照常物化入 Today、推送合并为窗口结束后一次；推送与 Today 条目指向同一 Occurrence，幂等。** |
| C5 通知分级降噪 | **已解决（设计层面）+ 本批修触达质量** | 无营销推送（无广告承诺）；提醒规则/通知偏好属 MVP 六系统之五；临近到期升级按小时持久化去重（Phase B）。1.1 C 修推送文案 i18n（当前 en/ja/es/pt 用户收中文）正是「触达质量」主缺口。分事项类型的通知粒度如要做，归并进 C4 的下批裁决。 |
| C6 数据信任 | **已解决（原则制度化）** | 软删与恢复、时区铁法（已物化事项冻结不追改）、超额只挡新增不惩罚存量（§5.0）、幂等七挂点、文字类记录离线队列（§6.4）。11pets/Medisafe 的死法即 PLANET 的红线。建议把「任何版本升级/降档后，存量记录可读、可导出、可删除」固化为发版前检查项（0 行新代码）。 |
| C7 历史活到就诊/交接那一刻 | **已解决** | Timeline 事实流无 30 天截断类上限；care_card/summary 限时分享快照+撤销过期（F7）；`GET /pets/{id}/export`（F8，仅 owner）；就诊场景= digest/summary 的设计初衷（F6）。营销可直用 Medisafe/11pets 原声做对比文案。可选加强（不占路线图）：验证 caregiver 角色能否为共享宠物生成 summary 分享，若不能则记入下批候选。 |
| C8 离世处理 | **已解决（差异点）；纪念页=下批候选（founder 已预列）** | deceased 特殊状态：占配额、只读保留、仅可删除、无恢复，停止新生成（§4.3/§6.3）——正面回答 PetDesk 全部三条怨气（档案不消失、提醒不复活、历史可回看）。PetDesk #86 的「领养新宠物要旧宠物记录」场景 PLANET 直接满足。**纪念功能 founder 已列为之后版本项（§5.0）；差评支持其优先级。验收草案：deceased 宠物可生成只读纪念分享页，复用 summary 快照管道（过期+可撤销），仅含 facts scope 事件，五语。** |
| C9 表单填不完 | **已解决（基线）+ 本批修** | 页面质量基线「表单能完成」（§4.7）即为该簇的验收标准；键盘态/长文案态截图验收已入基线。1.1 D 修表单错误映射（L89）、建计划反馈（L102）就是这条基线的落地收尾。 |
| C10 登录/会话/删除 | **已解决 + 本批修** | Apple 登录单通道（无验证码死循环面）、会话多设备/吊销、注销前置处置（MVP 系统一）、账号删除流程（E）。1.1 修会话过期提示（L88）。DogLog 的「强绑社交登录」怨气在 PLANET 不存在；将来开 Android/Web 解锁邮件登录时，验证码邮件的可达性要按 PetDesk 的死法做验收（验证邮件 ≠ 营销邮件）。 |
| C11 请求黑洞/状态相反 | **已解决（主线正中）** | 请求中心同屏「有人请你帮忙」+「我发出的」、责任链状态卡（等待回应/已确认/已转交/暂无负责人）、过期自动收束、拒绝后继续转交（Phase B）。PetDesk 该簇 7 条恰是 PLANET v1.1 主线的需求证明，全部可进对比文案。 |
| C12 多宠与异宠 | **部分已解决；物种特化=范围外** | 已解决：多宠建档与切换（free 2 只活跃）、档案不设物种门槛的通用字段、同账户多宠物 Today 聚合。范围外：异宠专用模板（豚鼠/爬虫/新生儿幼猫的喂食计算器等）——通用记录已覆盖基础事实，物种特化引入模板维护成本且与协作主线无交集；待真实用户提出再评估。 |
| C13 平台与无障碍 | **范围外（下下批评估）** | iPad 横屏、深色模式、读屏标签、字幕均未承诺。理由：v1.0 视觉锚点冻结（founder 2026-09-16 重锚定）、当前唯一 iOS 载体；与协作主线无交集。但读屏标签属低成本高道义项，建议在视觉冻结解除后第一批补。**不做验收草案。** |
| C14 共享动作细节 | **部分已解决；日历集成=下批候选（归通知面裁决）** | 已解决：推送授权时机（L100，1.1 E 本批修，直接回应 Tractive #54 的「权限弹窗堵死主屏」）；升级去重避免打扰；PLANET 无「紧急时刻弹评分」类设计。缺口：日历导出（.ics）——1.1 已裁「L91 之外通知面扩展」下批起。**验收草案（若立项）：Care Plan 可按家庭时区导出 .ics 订阅链接，只读、随撤销分享一同失效，事项变更后 5 分钟内刷新。** |

---

## 4. TOP3 机会排序（频次 × 与协作主线契合度）

### TOP 1 —— 把「第二照顾者真的进得来、用得上」做成卖点兼闸门（对应 C1+C11）

- **频次**：跨 5/7 家竞品的结构性缺失（PetDesk 50 万评分体量下仍是 1 星高赞怨言；Pet Care Tracker 因此一句话劝退用户）。
- **契合度**：满分——这就是 1.1 主线（协作闭环）与北极星前置（第二位照顾者被邀请率）。
- **动作**：不新增功能。三件事：①邀请→加入→同宠物可见→协作发生，固化为每版本 e2e 回归闸门（含邀请码过期/重复/失效/深链冷启动）；②把 PetDesk「invisible labor」、Pet Care Tracker「wife share」原声写进 App Store 副标题/截图文案与 landing；③商店评价引导对准已激活家庭（第二照顾者刚完成首次协作的时机），把 4.8+ 高分盘面维持住。

### TOP 2 —— 「谁做了什么」周参与视图（对应 C3）

- **频次**：5 条直接负评 + DogLog 用户愿为「pack 成员提醒/统计」付费的证据（"I would pay for premium if this was avail"）。
- **契合度**：满分——WAP 定义中「≥2 个照顾者有交互」正是此视图度量的对象；数据全部已在（完成事实带执行人），只差一层只读投影。
- **动作**：下批候选（验收草案见 §3 C3 行）。成本估计：一个聚合查询 + 一张卡，无新表。这也是「家庭共养是一等场景」的可视化证据，分享出去即是获客面（复用 summary 快照管道可顺带验证）。

### TOP 3 —— 触达质量包：事件相对提醒 + 静默窗口（对应 C4+C5）

- **频次**：9 条（误触发轰炸、深夜轰炸、通知停发信任崩塌、营销与照护通知绑死）。
- **契合度**：4/5——属 C 协作触达的深水区；1.1 先修 i18n 与授权时机，本项是 1.2 触达纵深。
- **动作**：下批候选（验收草案见 §3 C4 行），与「按事项类型的通知粒度」合并为一次 founder 裁决。风险提示：通知面扩展曾被 1.1 明确出清，立项须重裁决；实现上必须落在 Occurrence 下游，不新建提醒主体。

**落选说明**：C6/C7（数据信任/历史留存）频次最高但 PLANET 已在架构层解决，属于「营销弹药」而非「路线图缺口」；C8（纪念页）情绪浓度最高、有 founder 预列背书，可作 TOP2 之后的第 4 顺位；C13（无障碍）记入待办不占批。

---

## 5. 来源链接清单

**App Store 评论 RSS（本报告主语料，2026-09-30 拉取）**

1. 11pets — https://itunes.apple.com/us/rss/customerreviews/id=1232470530/sortBy=mostRecent/json
2. PetDesk — https://itunes.apple.com/us/rss/customerreviews/id=631377773/sortBy=mostRecent/json
3. Airvet — https://itunes.apple.com/us/rss/customerreviews/id=1448478595/sortBy=mostRecent/json
4. DogLog — https://itunes.apple.com/us/rss/customerreviews/id=1229529595/sortBy=mostRecent/json
5. Pet Care Tracker — https://itunes.apple.com/us/rss/customerreviews/id=1551003273/sortBy=mostRecent/json
6. Tractive — https://itunes.apple.com/us/rss/customerreviews/id=921588809/sortBy=mostRecent/json
7. Medisafe — https://itunes.apple.com/us/rss/customerreviews/id=573916946/sortBy=mostRecent/json

**商店页（总分与可见差评）**

8. 11pets（Play）— https://play.google.com/store/apps/details?id=com.m11pets.elevenpets&hl=en_US
9. 11pets（App Store US）— https://apps.apple.com/us/app/11pets-pet-care/id1232470530
10. PetDesk（App Store US）— https://apps.apple.com/us/app/petdesk/id631377773
11. Airvet（App Store US）— https://apps.apple.com/us/app/airvet-for-pet-parents/id1448478595
12. DogLog（App Store US）— https://apps.apple.com/us/app/doglog-track-your-dogs-life/id1229529595
13. Pet Care Tracker（App Store US）— https://apps.apple.com/us/app/pet-care-tracker-dog-cat-log/id1551003273
14. Tractive（App Store US）— https://apps.apple.com/us/app/tractive-gps-for-dogs-and-cats/id921588809
15. Medisafe（App Store US）— https://apps.apple.com/us/app/medisafe-medication-management/id573916946

**聚合与补充**

16. Pet Care Tracker 评论聚合（justuseapp）— https://www.justuseapp.com/en/app/1551003273/pet-care-tracker-dog-cat-log/reviews

**局限**：①RSS 仅覆盖各 App 最近 ~500 条，历史负评（如 11pets 2022 转付费潮）只部分入库；②高分 App 负评占比低，主题频次在竞品间不可直接互比，只作簇内强度参考；③Medisafe 宠物场景样本仅 4 条，通用提醒结论外推需谨慎；④Google Play 未批量拉取，仅 11pets 交叉验证；⑤原声逐字保留，错别字未改。

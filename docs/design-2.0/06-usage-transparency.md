# 06 · 用量透明度体系(USAGE TRANSPARENCY)

> **设计稿 v2——已过审查门**(2026-10-15 独立审查 verdict=pass:P2×1——§7① 对 join 撞墙文案现状的陈述失实,实为映射与五语文案**均在位**(`errors.ts:15`、五语 `core.json:109`),真缺口是指代错误(对被邀请人说「你的套餐」而席位锚 owner),已改写;P3×3——查询计数漏 quota_configs(现状 7 非 5)、§6.1 交叉引用错码(O3→O2)、subscription.source 枚举与取数口径矛盾(两分支写死字面量,不透传渠道列),均已修)。
>
> 任务锚:G6「用量透明度体系(订阅体验的核心支撑面,免费档同样受益)」。founder 质问三连是设计锚:「订阅有用量区分,但用户看得到用量吗?有没有认真分析用户需求、宠物照护流程、系统资源?」——本文 §0 逐一实锤现状,§1–§3 逐一回应三问,§4–§7 按 §6.8 纪律四段成文。
> 事实源:[SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md](../commerce/SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md)(四档权益 §2/宽免 §2/锚定 A §4)、[QUOTA-SYSTEM-DESIGN.md](../commerce/QUOTA-SYSTEM-DESIGN.md)(P1–P7 原则)、[PRODUCT.md](../PRODUCT.md) §5.0(限额数字+「一个数字只有一个家」法+撞墙只给动作裁决)。
> 本文所有行号引用均为 2026-10-15 工作区实读(main @ 84c5922 + 工作区改动),独立复核可直接按 `path:line` 打开。

---

## 0. 现状盘点与六缺口核实(全部实锤到代码)

### 0.1 已有的地基(设计必须在其上生长,不推翻)

| 能力 | 现状 | 出处 |
|---|---|---|
| 用量之家 | 「账户 › 用量」页:四域计数(families/pets/storage/逐家庭 members)+humanBytes+进度条+档位胶囊(只读)+满额胶囊+满额动作+满额「查看档位」链(S3) | `APP/src/features/account/usage-screen.tsx:226-273` |
| 单端点 | `GET /me/usage` = on-read 实时聚合(7 个查询:BestKey 1 + plans 1 + quota_configs(ai_monthly)1 + user_usage 1 + 三计数 3——PlanForEntitlement 命中 plans 行后必查 quota_configs,`service.go:280-282`),无快照表 | `planet-api/internal/modules/entitlements/service.go:42-110,280-282`、`identity/http.go:54,343-353` |
| 存储计量 | 记账制:事件挂接时 original+thumb 两对象 Stat 实测和入账(`storageCharge`),软删同事务按事件账面 `photo_bytes` 对称回退,零漂移设计;领票软闸 + Create 硬闸(Reserve 原子) | `timeline/service.go:337-364,368-382,432-444`、`repo.go:58,82,328` |
| 缓存与失效 | `useMeUsage` = `queryKeys.meUsage`(默认 staleTime 30s);宠物/家庭/时间线三类写入后 `invalidateMeUsage` | `foundation/quota.ts:22-27`、`foundation/cache.ts:18-20,152,169,208`、`query/query-client.ts:14` |
| 创建预检 | 宠物/家庭创建入口按 usage 缓存禁用+说明(P5 防错优先);预检拿不到数据乐观放行,服务端是唯一执法者 | `foundation/quota.ts:1-35`、`pets/create-screen.tsx:48-49,156`、`families/form-screen.tsx:51-52,145-155` |
| 撞墙文案 | 五语「照片空间已满,请删除部分照片后再试」(给动作,不铺数字) | `core/api/errors.ts:18`、`i18n/{en,zh,es,ja,pt}/core.json:111` |
| 订阅执法 | BestKey 四档排序 + subscriptions/entitlements 双源判定;宽免立法(只挡新增写入) | `entitlements/service.go:114-203`、SUBSCRIPTION-LAUNCH §2/§4 |

### 0.2 六缺口逐一实锤

| # | 缺口 | 实锤 | 本章方案 |
|---|---|---|---|
| 1 | 拍照上传前后零用量感 | `composer.tsx` 全文 1389 行,`usage/quota/storage` 零引用(grep 仅命中 timeline-event-queue import);上传链 = 压缩(`preparePhoto`)→领票→直传 R2→建事件,全程无配额上下文 | §5.1 StorageHintBar + 跨阈值轻提醒 + 撞墙动作升级 |
| 2 | 无 80/90% 提前预警,体验是断崖 | `usage-screen.tsx:55,91` 的满额判定只有 `used >= limit` 一档(100%);全仓无 near/critical 阈值概念 | §1.2 三级状态感体系 |
| 3 | 家庭席位感缺失 | `family-groups.tsx` 的 FamilyMembersGroup 无席位计数(grep 无 seat/limit);`invite-sheet.tsx` 零配额感知;成员撞墙发生在**被邀请人 join 侧**(`families/service.go:421,900`),邀请人不知情;且 join 撞墙文案**指代错误**(已核实):五语文案对被邀请人说「这个家庭的成员数已达**你的套餐**上限」(`errors.ts:15` → 五语 `core.json:109`,en "This family has reached **your plan's** member limit")——而 D3 席位锚**家庭 owner** 的 plan(QUOTA 设计 P2),被邀请人自己的档位与此墙无关,按现文案会误以为自己该行动 | §5.3 邀请入口席位预检 + 满席状态感 + join 文案改指 owner |
| 4 | 撞墙后无整理工具 | 满额动作「查看记录」→ `/timeline` 全量列表(`usage-screen.tsx:246`),无「哪个宠物的照片最占空间」视角;timeline 有 per-pet scope(`screen.tsx:67-75`)但无存储排序 | §5.2 存储整理视图(per-pet 分解) |
| 5 | 照片=记忆资产的情感心智未设计 | 撞墙文案只有「删除部分照片」一种路径(`core.json:111`);升级出口(S3)与整理路径无顺序态度;无「删除不可恢复」的诚实告知设计 | §1.3 语气立法 + §5.2 整理-升级双路径 |
| 6 | 订阅状态不完整 | 用量页只有 plan 胶囊(`usage-screen.tsx:206-221`),无到期日/续期信息;**数据其实已到客户端**——`GET /me` 已返回 `entitlements:[{key,source,expires_at}]`(含 subscription 行,`identity/http.go:300-315`、`planet-api.ts:15,336`),但用量页未消费且 P4 单端点原则不允许它混第二查询 | §5.4 订阅状态行 + `/me/usage` 扩 subscription 块 |

补充实锤的两个口径事实(后续设计依赖):

- **事件删除无恢复端点**:timeline 模块 grep 无 Restore/undo 路径;`Repo.Delete` 是软删(`repo.go:361-364`),R2 对象 post-commit 移入 trash 7 天删(`service.go:1055-1061`)。用户视角=**删除即永久**(事件行无自助恢复;trash 只是对象层的运维兜底)。与宠物/家庭的 30 天恢复期(PRODUCT §5.0)不同物,整理动线文案必须诚实说「不可恢复」。
- **计量双计口径**:`storageCharge = original.Size + thumb.Size`(`service.go:361-364`)——用户看到的「已用」含缩略图,单张照片占账 ≈ 原图+480px 缩略。此口径已立法(QUOTA 设计 §2 D4a),不是缺陷,但透明度设计要让它可被用户理解。

---

## ① 用户需求:什么时候想知道 / 什么粒度 / 什么语气

### 1.1 三个时刻(when)

| 时刻 | 用户心理 | 现状 | 该给什么 |
|---|---|---|---|
| **消费时**(拍照/建宠/邀请) | 「这件事现在能做吗?还能做多少次?」 | 拍照:零感直至 403;建宠:预检已禁用(`create-screen.tsx:156`) | 动作入口旁的**状态感**(非数字),满则预检禁用 |
| **好奇时**(巡览账户) | 「我家用了多少?我的订阅什么时候续?」 | 四域已有,订阅深度缺(到期日) | 数字之家内补全:per-pet 分解、到期日、管理订阅 |
| **受限时**(撞墙) | 「为什么不行?我现在能做什么?」 | 403 文案给「删照片」一个动作,但去处是全量 timeline,无整理视角;无升级出口的时序态度 | **整理优先、升级第二**的双路径 + 直达整理视图 |

关键裁决:**「消费时」是体系的主战场**。好奇时用户会主动来(用量页已接住);受限时是设计失败的最后防线(宽免+预检已兜住);只有消费时——最高频的拍照——今天完全无感,这正是断崖体验(缺口 1/2)的成因。设计把触点密度按此排序:拍照触点 > 撞墙动作 > 巡览深化。

### 1.2 粒度(what):状态感给触点,精确数字只给用量页

- **触点(拍照/邀请)一律零数字**:一行定性文案(「快满了」)+ 一个动作(「查看」)。依据:PRODUCT §5.0 裁决「用量数字唯一之家=用量页;撞墙报错只给动作,不重复铺数字」——该法的立法本意是防数字洪水,触点若展示 `已用 41.2MB / 50MB` 即是第二个家。本设计把法从「撞墙报错」推广到**所有触点**:状态感(三级)与动作可以出门,数字不出门。
- **存储域三级状态感**:`comfortable`(<80%,零触点)/`near`(≥80%)/`critical`(≥90%)/`full`(100%,既有满额胶囊)。百分比是内部判定值,不渲染。
- **结构域(宠/家/席)不做百分比预警**:2/4/8/30 的小整数域,「80% 的 2 只宠」不存在;其天花板感知靠席位状态感(§5.3)与既有满额胶囊,不发明 1.6 只宠式的伪精度。
- **剩余张数估算(iCloud 式「还可存约 N 张」)不做**:需要实测均张体积,本仓无该数据(免费档 50MB 的设计推算「几百张」是 SUBSCRIPTION-LAUNCH §2 的估计值,不是测量值)。不发明数据——列入开放问题 O1,上线后由真实用量分布驱动再评估。

### 1.3 语气(tone):预警不恐吓,删除不轻描

语气立法四条(文案验收的判定标准):

1. **状态描述,不做威胁**:「照片空间快满了」(事实),不是「你的照片即将无法保存」(恐吓)——绝不出现「不升级就会…」句式。
2. **整理是第一动作,升级是第二**:撞墙与 critical 态的动作序=「整理照片」→「查看档位」。顺序即态度:免费用户的第一选择永远是免费的(升级出口仅撞墙时点出现,复用 S3 既有裁决 SUBSCRIPTION-LAUNCH §6 S3;`usage-screen.tsx:96-98` 已按「无常驻入口」实现)。
3. **删除是重的,诚实告知不可恢复**:照片是记忆资产,不是缓存。整理视图与删除路径文案明说「删除后无法恢复」(0.2 已实锤事件无恢复端点);绝不批量推荐「删掉这些」(让算法挑哪段记忆该消失=反情感,且 AI 已裁暂缓)。
4. **宽免是承诺,要可见**:降档/超额只挡新增——「你现有的照片永远可以查看、下载、导出」这句安心话放在撞墙文案里,把产品法(SUBSCRIPTION-LAUNCH §2「超额宽免原则不变」)变成用户可感知的承诺。

---

## ② 宠物照护流程:拍照-记录-分享 / 家庭协作 / 整理动线

### 2.1 拍照-记录-分享流程的触点选择

流程实读(`composer.tsx:368-488` save()):选图(PhotoPicker)→**提交时**才压缩、领票、直传、建事件。触点裁决:

- **触点选「composer 打开时」(选图前),不选「提交时」**:用户需要的是拍之前知道「还能不能拍」,不是提交失败后才知道。数据源=既有的 `useMeUsage` 缓存(与创建预检同源,`foundation/quota.ts:22-27`;staleTime 30s 内零请求,深链直达也只触发同一查询的首次装载)。
- **触点形态选「PhotoPicker 下方一行 caption」,不选弹窗/toast**:拍照是高频轻流程,弹窗打断快门时刻;嵌入式状态行随表单存在,信息可回避(不想看就忽略),符合「预警不是广告位」红线。
- **分享环节零触点**:分享(care_card/summary)不消费配额(share_links 是快照链接,非存储计量域),不加任何用量感——触点跟着真实消费走,不制造焦虑。
- **上传后(记录落成)的反馈 = 跨阈值瞬间的一次轻提醒**:平时上传成功零用量反馈(健康态无感,数字洪水红线);仅当这次上传把存储从 <80%/90% 推过阈值,出现一次 toast(去重见 §3.4)。这是「上传后多久知道」的体验答案:健康时永远不用知道,越界时立刻知道一次。

### 2.2 家庭协作里的席位沟通(谁负责邀请)

流程实读:邀请资格已单源立法——仅 owner、且家庭已有宠物(`core/presentation/can-invite.ts:20-27`,四处入口共享;`detail-screen.tsx:99-101` 深链守卫同口径)。缺口在两端:

- **邀请人(owner)侧**:owner 不知道家庭席位将满/已满,发出邀请后被邀请人撞 403(`families/service.go:421`)——**墙长在被邀请人身上,疼在协作关系上**。设计:邀请入口席位预检(§5.3,复用 P5 预检模式——满席则禁用+说明,而不是可点+报错);邀请 sheet 内剩 1 席时一行「这是最后一个席位」(个位数的席位域,这句话比 x/y 数字更贴沟通场景)。
- **被邀请人侧**:join 撞墙文案必须指路「联系 {家庭名} 的主人」——这是线下沟通动作,App 内无可给的动作按钮,诚实只给指引不铺数字。现状已核实(2026-10-15 复核):映射与五语文案**均在位**(`errors.ts:15` `QUOTA_MEMBERS_EXCEEDED→core.errQuotaMembers`、五语 `core.json:109`),但指代错误——文案对被邀请人说「**你的**套餐上限」,而 D3 席位锚家庭 owner 的 plan(QUOTA 设计 P2),被邀请人会误以为该自己行动;修法=改既有键文案指向 owner,不新建映射/键。
- **非 owner 成员**:家庭详情成员区同样可见「席位已满」状态感(理解「为什么不能再加人」),但无动作(管理成员/查看档位是 owner 的墙)——不给成员「催 owner 升级」的产品化通道,那会把家庭协作变成销售现场,违「免费协作闭环」红线的精神面。

**红线自查**:席位预检不是新闸——D3 执法(`QUOTA_MEMBERS_EXCEEDED`)早已存在(`families/service.go:421,900`),预检只是把墙从被邀请人的 403 提前到邀请人的眼前;免费档 2 席数字不动。

### 2.3 整理动线(按宠物 / 按时间 / 批量删的出口,与软删的关系)

撞墙后的完整动线设计(缺口 4 的正面回答):

```text
撞墙/预警 → 用量页存储行「整理照片」→ 整理视图(按宠物降序:每只宠物的占用+张数)
  → 点某宠物 → 既有 timeline per-pet 深链(/timeline?pet_id=,screen.tsx:67-75 既有路由)
  → 按时间浏览(既有 timeline 即时间序)→ 逐张删除(既有删除链,软删+账面同事务退费)
  → 返回用量页:数字已降(writeTimelineEvent → invalidateAfterTimelineChange → invalidateMeUsage,cache.ts:158-175)
```

裁决与理由:

- **排序维度选「按宠物」,不选按时间/按大小混排**:多宠家庭(付费档 4/8/30 只的核心画像)的第一个整理问题是「谁的照片最占地方」;时间维度 timeline 本身就是;按单张大小混排会把「删大图」变成赤裸的存储游戏,背离记忆资产心智(§1.3)。
- **批量删 v1 不做**:删除是记忆的失去,逐张确认是设计而非低效(0.2 实锤删除不可恢复);批量选取 UI 是独立工程量(M 级)且催生「一次删 200 张」的误操作面。按宠物过滤后的逐张删已是完整闭环。
- **与软删恢复期的关系,如实立法**:事件删除=立即退账(账面同事务回退,`service.go:1027-1040`)+不可恢复(无恢复端点,§0.2);R2 对象 7 天 trash 只是运维兜底,不是用户承诺。**宠物**级软删 30 天保护期内其照片账面仍占额(宠物软删不删事件、不退费)——整理视图只列 accessible 宠物,此口径差列入开放问题 O2(「其他 N MB」补差行是否需要,等真实数据)。
- **deceased 宠物如实列出**(占额是事实,PRODUCT §5.0「deceased 占配额」),带既有离世标记形态,不做特殊排序或「建议清理」暗示——离世的毛孩子的照片不比活着的更该被删。

---

## 3. 系统资源:计量准确性 / R2 对账 / 新鲜度 / 预警去重 / 性能

### 3.1 存储计量的准确性(用户看到的数字凭什么可信)

- **口径**:记账制,非镜像制。入账=事件挂接时 original+thumb 两对象 Stat 实测和(`service.go:361-364`);退账=软删同事务按事件账面 `photo_bytes` 回退(`service.go:1035-1040`),「回退金额恒等于记账金额(零计数漂移)」(`service.go:339-341` 注释)。usage 读数直接读 `user_usage` 行(`entitlements/service.go:51-54`),与执法同源(P1)。
- **已知漂移面,如实列出(不假装零漂)**:①事件照片被显式头像引用时不退费(`service.go:1031-1036` P2-1 止血,注释自认「对象级存储台账((holder 转移)是后续正确收口方案」)——账面 ≥ 真实可释放量,方向安全(用户不会被多拒);②trash 移动是 post-commit(`service.go:1055-1060`),失败则物理对象残留(R2 > 账面,平台成本问题,非用户可见);③abandon 补偿链失败残留由启动兜底+服务端引用安全闸收口(`photo-ticket-ledger.ts:199-232`)。
- **用户可见口径写进设计**:删除即时退账、对象物理清除滞后 7 天,两者都正确——配额按账面执法,不按物理对象。整理视图文案「删除照片会立即释放空间」因此是可兑现的承诺。

### 3.2 R2 对账(v1 裁决:不建用户面实时对账,补运营侧离线审计)

实时对账(每次 usage 读都 List R2)不可行:R2 List 按前缀+1000 对象/页分页,付费档万级对象,操作费与延迟都不允许;且记账制的事务保证已使账面自洽(§3.1)。**v1 补离线审计工具**(`planet-cli storage audit`:R2 List `pets/` 前缀 vs `SUM(pet_events.photo_bytes WHERE deleted_at IS NULL)` + 头像引用键 + trash 前缀的差集报告),定位长期漂移(§3.1 三面),运营侧 P2 跟进批交付——它保护的是成本与计量可信度的深度,不是本期用户价值,如实降级。

### 3.3 数据新鲜度(上传后多久反映)

已闭环,无需新设计,如实记录:照片事件写入成功 → `invalidateAfterTimelineChange` → `invalidateMeUsage`(`cache.ts:158-175`,`writers.ts:61,70,76` 全写路径覆盖)→ 下一次任何 `meUsage` 消费点(用量页挂载/创建预检/composer 触点)refetch 即见。离线队列重放同样走 writers 失效链。staleTime 30s(`query-client.ts:14`)只影响「消费点之间的静默期」,不存在陈旧决策面:配额执法在服务端写路径锁内,客户端数字旧一点只会导致预警晚一行,不会导致数据损坏。

### 3.4 预警去重(一次性 vs 每次打开)

两层裁决,区分「状态」与「打扰」:

- **嵌入式状态(composer 触点行、用量页行内态)不去重**:它是状态的忠实呈现,随实时数据出现/消失,不是打扰——80% 时每次打开 composer 都该看到那行,直到用户处理或回落。
- **主动打扰(跨阈值 toast)一次性**:阈值跨越瞬间出现一次,看过即消音。实现:`MMKV` 键 `usage.warn.storage.muted`(存已消音阈值);用量回落 <80% 时清键(下一次再跨越可再提醒一次)。全部客户端本地,零服务端状态(预警不是事实,不该进服务端事实源);判定函数=纯函数(§5.1),输入只有 usage 快照。

### 3.5 性能(实时聚合的代价,扩了之后仍然克制)

- 现状一次 `/me/usage` = 7 查询(BestKey 1 + plans 行 1 + quota_configs(ai_monthly)1 + user_usage 1 + 三计数 3;`service.go:42-98,280-282`——quota_configs 查询在 plans 行命中后必执行)。本设计扩展后 8:**subscription 详情并入 BestKey 同一查询**(bestKeyQuery 已扫 subscriptions 行,`service.go:152-168`,加返回列 expires_at/status 即可,零额外往返)+ **per-pet 分解 1 个 GROUP BY**(`SELECT pet_id, SUM(photo_bytes), COUNT(*) FROM pet_events WHERE recorded_by_user_id=$1 AND event_type='photo' AND deleted_at IS NULL GROUP BY pet_id`)。
- 量级:免费档几百行、Unlimited 档万级行的过滤聚合,单用户视角毫秒级;配一个 partial index(§6 迁移)后与行数解耦。读频率=账户页打开+预检消费+composer 打开,非热路径。
- **不建快照表、不加参数**:快照表=第二计数源(违 P1 单一事实源,正是 QB1/Q5 刚清除的双轨病灶,`service.go:18-21` 注释立此存照);端点参数化(如 `?include=pets`)破坏「单请求取数」的简单性(`usage-screen.tsx:157-159`),收益为零。
- 预警阈值判定(80/90%)在客户端纯函数完成,零服务端成本;推送通知 v1 不做(存储预警不值得最强打断形态,App 内触点已覆盖三时刻)。

---

## 4. 用户旅程(四段式之一)

五条旅程,覆盖三时刻 × 免费/付费。**共同红线**:免费档全程可用,无一触点是付费专属;所有触点零数字。

### A. 拍照者·日常记录(消费时,主战场)

| | |
|---|---|
| 谁/何时 | 任何成员,打开 composer 记录照片(最高频消费场景) |
| 经过 | **<80%**:现状不变,零触点(健康态无感是功能,不是缺失)→ **≥80%**:PhotoPicker 下一行「照片空间快满了 · 查看」(near)→ **≥90%**:「照片空间即将用完 · 查看」(critical,同形态语气加重)→ 点「查看」→ 用量页(数字之家) |
| 上传后 | 成功=既有成功反馈,零用量噪音;**若本次上传跨越 80/90 阈值**→ 一次 toast(同文案)+ 此阈值消音至回落 |
| 撞墙 | 领票 403(既有,`service.go:441-443`)→ composer 错误态升级:既有五语文案 + 两动作「整理照片」(→用量页整理视图)/「查看档位」(→paywall,S3 撞墙荐档)+ 宽免安心句「现有照片不受影响」 |
| 到哪出 | 健康:照常完成记录;预警:知情并可提前行动;撞墙:两条路(整理/升级)都可达,草稿保留(既有取消链,`photo-ticket-ledger.ts:186-196`) |

### B. 好奇者·账户巡览(好奇时)

| | |
|---|---|
| 谁/何时 | 任何用户,账户 › 用量 |
| 经过 | 既有四域一屏读尽 → 存储行 near/critical 时进度条状态色+行内 caption(数字之家内,可用剩余 humanBytes)→ 新增「整理照片」入口(存储行,≥near 时出现)→ 新增订阅状态区:档位胶囊(既有)+ 续期信息(付费档「续期于 {date}」/founding「永久」/free 仅档位名)+「管理订阅」行(仅付费档,深链 Apple) |
| 到哪出 | 巡览即全知:用了多少、还剩多少、何时续期、满了去哪整理 |

### C. 管家·家庭组织者(消费时,席位)

| | |
|---|---|
| 谁/何时 | owner,想邀请第三位成员 |
| 经过 | 家庭详情 → **未满席**:现状不变(Invite members 可点);剩 1 席:邀请 sheet 内一行「这是最后一个席位」→ **已满**:Invite 入口禁用+说明「家庭席位已满」+ 动作「管理成员」(既有成员治理)/「查看档位」(S3 合法时点,满=撞墙) |
| 非 owner | 同样看到「席位已满」状态感,无动作(§2.2) |
| 被邀请人 | join 撞 403(既有)→ 文案「这个家庭的席位已满,请联系 {owner 名}」(指引沟通,不铺数字) |
| 到哪出 | 墙提前到邀请人眼前;被邀请人不再撞哑墙 |

### D. 整理者·空间回收(受限时)

见 §2.3 动线图。到哪出:删除 → 即时退账 → 用量页数字降 → 预警态降级/消失;或中途改主意 → 「查看档位」→ paywall(撞墙荐档既有,`billing/plans.ts:31-40`)。

### E. 订阅者·续期确认(好奇时)

| | |
|---|---|
| 谁/何时 | 付费用户,想确认续期 |
| 经过 | 用量页订阅状态区 → 「续期于 {date}」(GRACE_PERIOD 语义天然覆盖:billing 侧宽限期=expires 抬至宽限截止,`billing/service.go:269` 注释,展示层无需特判)→ 「管理订阅」→ Apple 订阅管理(iOS `showManageSubscriptions`;Apple 政策边界:App 内展示到期日合法,管理动作必须交还 Apple,SUBSCRIPTION-LAUNCH §7.6) |
| 到哪出 | 续期状态一目了然;取消/改期在 Apple 侧完成,回来后 notifications v2 → subscriptions 行更新 → meUsage 失效 → 状态区刷新 |

---

## 5. 交互规格(四段式之二,五维走查)

### 5.1 StorageHintBar(composer 触点,新增)

| 维度 | 规格 |
|---|---|
| 页面/控件 | composer 表单 PhotoPicker 下方一行:左 12dp 警示形(near=sage 系/淡,critical=corral 系/coralSoft 胶囊既有语义色)+ 文案 + 右侧「查看」文字链。复用 `limitRow` 形态(`usage-screen.tsx:311-332`);testID `composer-storage-hint` |
| 出现条件 | `storageWarnLevel(usage)` ∈ {near, critical};数据=useMeUsage(同预检源,30s 内零请求);<80% 不渲染(红线:预警不是广告位——低用量零触点) |
| 加载态 | usage 加载中/出错→不渲染(预检同款乐观语义,`quota.ts:8-13`:服务端是执法者,触点只是体验层) |
| 空态 | usage 有数据且 <80% = 健康空态=无组件(不是占位) |
| 错误态 | 无独立错误态(数据缺失即不渲染);真正撞墙由上传错误态接(下条) |
| 权限/可访问性 | 所有可写角色可见(存储是记录者个人配额,D4a 锚 user);`accessibilityRole="text"` + label 即文案本身;五语 i18n 新键(en/zh/es/ja/pt,`APP/src/i18n/`);**文案不含任何数字**(grep 验收,§7) |

**composer 上传错误态升级(既有 setError 位,`composer.tsx:390-393`)**:403 `PHOTO_STORAGE_QUOTA_EXCEEDED` 时不只渲染文案——文案下方两动作链:「整理照片」(→`/account/usage` 整理视图)/「查看档位」(→`/paywall`);文案尾补宽免安心句。testID `composer-quota-actions`。

**跨阈值 toast(一次性)**:上传成功回调处,比较写前/写后 usage(写后=失效后 refetch 或乐观叠加本次 bytes——实现取 refetch,诚实优先),跨越阈值且未消音 → toast + 置消音键;回落清键(§3.4)。

### 5.2 存储整理视图(用量页存储行的动作展开,新增)

| 维度 | 规格 |
|---|---|
| 页面/控件 | 用量页存储行新增动作「整理照片」(≥near 出现;full 时**替代**既有「查看记录」——满额时去全量列表是坏出路,batch7 裁决的意图就是给处理路径)。点开 = 底部 sheet(MoreGroup 卡同形态):标题「整理照片」+ 说明行「删除照片会立即释放空间,且无法恢复」+ 按宠物行(降序):`{宠物名 · 离世标记} {humanBytes} · {N} 张` + 「查看」链 → `/timeline?pet_id=`(既有深链,`timeline/screen.tsx:69-75`);testID `storage-breakdown-sheet` / 行 `storage-breakdown-pet-{id}` |
| 加载态 | usage 首载=既有 UsageSkeleton;sheet 复用已到手的 usage 数据,无第二请求(per-pet 分解在 /me/usage 响应内,§6) |
| 空态 | 分解为空列表(纯文字记录用户)→ sheet 不开,存储行动作不出现(<near 时)或 full 时理论上不共存(0 张照片不会满);防御:空数组 → EmptyState「还没有照片记录」+ 去 timeline |
| 错误态 | usage 错误=既有 QueryErrorState(整页既有);分解字段缺失(旧服务端)→ 动作不出现(形状守卫,同 `snapshot.members?.` 既有防御 `usage-screen.tsx:250-252`) |
| 权限/可访问性 | 所有人(存储域锚 user 本人);sheet `accessibilityRole="dialog"` + 滚动语义;行 a11y label 含宠物名+占用;文案五语;排序纯大小降序,无推荐删除暗示(§1.3-3) |

### 5.3 席位预检与状态感(家庭详情,改既有)

| 维度 | 规格 |
|---|---|
| 页面/控件 | ①`canInviteFamily` 签名扩 `seatsFull?: boolean`(默认 undefined=不影响,向后兼容;`can-invite.ts:20-27` 单源函数扩条件,四处入口自动可接)——hero Invite 按钮 + 请求中心空态出口 + 深链守卫三处接入(`detail-screen.tsx:99-101` 同模式);TodayInviteGate(激活首家庭)不接(首家庭必不满席,`can-invite.ts:6-9` 四入口清单)。②满席时 Invite 禁用+caption「家庭席位已满」+「管理成员」链(既有成员区)+「查看档位」链(S3 时点合法:满=撞墙);testID `family-invite-quota-locked`(仿 `family-create-quota-locked` 命名,QUOTA 设计 §4)③邀请 sheet 内 `成员数 === limit-1` → 一行「这是最后一个席位」。④成员区组标题:已满 → 尾缀「席位已满」caption;未满 → 无噪音(零数字,x/y 仍在用量页) |
| 数据源 | owner 视角:useMeUsage 的 `members[]` 中该家庭行 `isQuotaFull`(既有判定,`quota.ts:32-35`);非 owner:家庭详情 DTO 的 member_count 与档位 limit 不可得(非 owner 的 usage.members 只含自己 own 的家庭,`service.go:88-98` 只报 owner 家庭)→ 非 owner 满席感来源=**服务端扩 family detail DTO 的 `seats_full` 布尔**(§6;只给布尔不给 x/y,守住数字之家法) |
| 加载态/错误态 | usage 不可得 → 预检乐观放行(quota.ts 既有语义:不拦,服务端 403 兜底);seats_full 缺省 false |
| 空态 | 无成员家庭(不可能:owner 恒在,`service.go:95` 含 owner 口径)——不设 |
| 权限/可访问性 | 预检只影响 owner 入口可见性;非 owner 只读状态;join 侧撞墙文案升级含「联系 {owner}」(五语) |

### 5.4 订阅状态区(用量页,扩既有档位行)

| 维度 | 规格 |
|---|---|
| 页面/控件 | 档位胶囊行(既有,`usage-screen.tsx:206-221`)下:①续期行(付费档):「续期于 {date}」(date=本地化日期格式);founding/永久 entitlement:「永久」;free/未知值:不渲染。②「管理订阅」行(MoreRow 形态,仅付费档):iOS → StoreKit `showManageSubscriptions`;web → 文案「请在 iPhone 上的 PLANET 内管理订阅」(诚实:web 无 StoreKit,开放问题 O3)。testID `plan-renewal-row` / `manage-subscription-row` |
| 数据源 | `/me/usage` 扩 `subscription: {source, expires_at}`(§6;单端点法不破——数据已在服务端 subscriptions/entitlements 行内,`billing/service.go:144-160`、`entitlements/service.go:225-247`,只是没进 usage 快照) |
| 加载态 | 随既有 usage skeleton;错误态=既有整页错误态 |
| 空态 | free 档=现状(档位胶囊 only,无常驻升级入口,S3 裁决不变);subscription 块缺失(旧服务端)→ 两行都不渲染(形状守卫) |
| 权限/可访问性 | 到期日=只读信息(Apple 政策允许);管理动作=交还 Apple(§7.6 既有承诺);五语文案;auto-renew 开关态**不展示**(服务端无数据源——notifications v2 只落 status/expires_at,`billing/service.go:289-297`;不发明) |

---

## 6. 领域与数据影响(四段式之三)

遵循 §6.8 纪律:不建平行主体,不建第二计数源;所有扩展**只增不改**(`entitlements/service.go:38-39` 既有键形状不变惯例)。

**服务端(planet-api)**:

1. `/me/usage` DTO 扩两块(只增):`subscription: {source: 'subscription'|'entitlement', expires_at: string|null}`——BestKey 查询加返回列(bestKeyQuery 已 UNION 两源,`service.go:152-168`,顺手带出命中行的 expires_at,零额外往返);**source 取值口径**:subscriptions 分支写死 `'subscription'` 字面量、entitlements 分支写死 `'entitlement'` 常量,**不透传** `entitlements.source` 原列(它是 'lemonsqueezy' 等渠道串,`ListForUser` 即如此投影,`service.go:230,245`——透传即违 §5.4 声明的两值枚举);`resources.storage_bytes.pets?: [{pet_id, pet_name, photo_bytes, photo_count}]`——pet_name 经 accessible-pets 同口径取(整理视图只列可见宠物;软删宠物口径差=O2)。
2. families GetFamily/List DTO 扩 `seats_full: boolean`(服务端算 owner plan members vs member_count;布尔,不泄 x/y 给非 owner)。
3. 一个迁移:partial index `ON pet_events (recorded_by_user_id, pet_id) WHERE event_type='photo' AND deleted_at IS NULL AND photo_bytes > 0`(现状索引 pet_id 领头但不覆盖 recorded_by 过滤,`migrations/0001:646,673`、`0016:7`;万行级 seq filter 今天可用,索引成本极低且与行数解耦,§3.5)。
4. 无新表、无新计数源、无调度器;join 侧 403 文案补 owner 名(错误构造点 `families/service.go:421`)。

**客户端(APP)**:

1. `foundation/quota.ts` 扩纯函数 `storageWarnLevel(usage): 'near'|'critical'|null`(阈值 0.8/0.9 常量;判定=纯函数,零服务端参与)。
2. MMKV 键 `usage.warn.storage.muted`(toast 消音,§3.4;回落 <80% 清键)。
3. `canInviteFamily` 签名扩(§5.3);composer/家庭详情/用量页消费方接线;i18n 五语新键(触点文案全部无数字)。
4. 失效图零改动(§3.3 已闭环);缓存键零改动(单一 meUsage 查询继续承载全部消费方)。

**明确不做**(防扩散):快照表(违 P1)、usage 端点参数化、服务端预警状态(预警非事实)、推送通知(打断强度错配)、批量删除 UI(§2.3)、auto-renew 展示(无数据源)、R2 实时对账(§3.2)。

---

## 7. 验收(四段式之四,含 e2e 断言点)

GWT 可判定式;e2e 沿用量页既有网络层断言先例(QUOTA 设计 §4「GET /me/usage 恰 1 次+grep 执法」)。

**触点与预警**

- Given usage storage=85%,When 打开 composer,Then `composer-storage-hint` 出现且**文本不含数字**(断言:渲染树无 `humanBytes` 输出、无 `used/limit` 插值);Given 60%,Then 无 hint 节点(低用量零触点=红线 e2e 钉桩)。
- Given 写前 79%/写后 81%(mock 网络层两次 usage 响应),When 照片事件写入成功,Then near toast 恰 1 次;再次打开 composer 不再 toast(消音);Given 回落 60% 再升至 91%,Then critical toast 恰 1 次(阈值独立消音+回落重置)。
- Given used≥limit,When 提交照片,Then 领票 403(既有)→ 错误态含 `composer-quota-actions`(整理/档位两链)+ 宽免句,且不含数字。

**用量页与整理**

- Given storage=85%,When 打开用量页,Then 进度条呈 near 状态色且 GET /me/usage 恰 1 次(既有断言回归);存储行出现「整理照片」。
- Given 3 只宠物各 {2MB,5MB,1MB} 照片(mock /me/usage pets 分解),When 打开整理 sheet,Then 行序=5/2/1 降序,每行「查看」→ `/timeline?pet_id={id}`(路由断言);deceased 宠物行带离世标记。
- Given 从深链删除 1 张 photo 事件(2MB),When 返回用量页,Then /me/usage 重取且 storage used 恰减 2MB(网络层响应值断言;即时退账=§3.1 口径的 e2e)。

**席位**

- Given 家庭成员 2/2(free),When owner 打开家庭详情,Then Invite 入口 disabled + `family-invite-quota-locked` a11y label 含「席位已满」;成员区标题含「席位已满」;When 第三人凭码 join,Then 仍 403 QUOTA_MEMBERS_EXCEEDED(服务端执法回归,预检不替代执法)。
- Given 成员 1/2,When owner 打开邀请 sheet,Then 出现「这是最后一个席位」一行;Given 0/1 邀请后变 1/2,Then 同行出现。
- Given 非 owner 打开家庭详情(family.seats_full=true,mock),Then 见「席位已满」caption,无 Invite 入口、无档位链(非 owner 无动作)。

**订阅状态**

- Given subscriptions 行 plan=pro/expires=未来 30 天(mock /me/usage subscription 块),Then `plan-renewal-row` 显示本地化日期 + `manage-subscription-row` 可见;iOS 点按触发 showManageSubscriptions(mock StoreKit 断言调用)。
- Given entitlement '*'(founding),Then 续期行=「永久」,管理订阅行不渲染;Given free,Then 两行均不渲染且档位区无常驻升级链(既有 grep 回归:S3「无常驻入口」不破)。

**grep 执法(数字之家法,CI 钉桩)**

- `used`/`limit` 字面渲染仅存在于用量页与错误文案插值(既有);**新增**:composer.tsx、family-groups.tsx、invite-sheet.tsx、detail-screen.tsx 不得出现 humanBytes 调用或 used/limit 渲染(触点零数字)。
- 宽免回归(既有集成测试不回退):满 storage 后既有照片 GET 签名/DELETE/导出全通——预警层全部只读,不新增任何读路径拦截。

**实现注意(审查时核对,非本设计遗漏)**:①join 撞墙文案现状**已核实**(v2 修订,原 v1 此条陈述失实):`errors.ts:15` 映射与五语 `core.json:109` 文案均在位,不需新建映射/键;要做的是改既有键文案——现文案对被邀请人说「你的套餐上限」而 D3 席位锚家庭 owner(QUOTA 设计 P2),指代错误,改为「这个家庭的席位已满,请联系 {owner 名}」(§2.2/§0.2#3);②照片删除确认文案(detail-screen)是否已含「不可恢复」**待施工时核对**(本条未核实),没有则本设计要求补;③迁移后跑 `bun run db:generate --name usage-transparency` + `db:migrate`(AGENTS 变更速查)。

---

## 8. 红线自查表

| 红线 | 本设计的守线方式 |
|---|---|
| 免费协作闭环不加任何闸 | 预警/席位感/整理视图/到期日全部免费可用;席位预检是把**既有**服务端闸(`families/service.go:421`)提前可见,非新闸;免费档数字零改动 |
| 预警不是广告位 | <80% 零触点;near/critical 触点动作=「查看」(去用量页);「查看档位」仅出现在满(100%)与席位满的撞墙时点(S3 既有合法时点);用量页档位胶囊保持只读无常驻升级(S3 裁决不变) |
| 「一个数字只有一个家」 | 所有触点(composer/家庭详情/邀请 sheet/join 文案)零数字——状态感+动作;used/limit/humanBytes/x-y 仅存在于用量页;错误文案零数字(法则原文);非 owner 只给 `seats_full` 布尔 |
| 超额宽免 | 预警层全只读;撞墙文案含宽免安心句;既有宽免集成测试回归(§7) |
| 不建平行主体/第二计数源 | 无新表;usage 仍单端点单查询族;预警判定=客户端纯函数;MMKV 键是 UX 状态非事实源 |

## 9. 开放问题(不阻塞审查)

- **O1 剩余张数估算**:需实测均张体积(压缩管线长边 2048/q0.8 WebP,`photo-upload.ts:76-96`),上线后由真实分布驱动再评估是否加「还可存约 N 张」(它是 iCloud 语义,若加须裁决其与数字之家法的关系)。
- **O2 软删宠物 30 天保护期的存储可见性**:整理视图只列 accessible 宠物,保护期内宠物的照片占额但不可见——是否需要整理 sheet 尾部「其他 {N}」补差行,等第一个真实投诉或对账数据说话。
- **O3 web 端「管理订阅」**:v1 诚实提示去 iPhone;若 web 用户占比可观,评估 Apple 通用订阅管理 URL 回退。
- **O4 `seats_full` 的 D3 语义依赖**:viewer 席是否计入成员配额是订阅侧未决项(SUBSCRIPTION-LAUNCH §9 D3),若未来 Pro+ viewer 不占席,`seats_full` 服务端算式同步改一处(设计已把算式收敛在服务端单点,客户端不自行派生)。

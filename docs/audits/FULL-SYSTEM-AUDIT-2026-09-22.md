# PLANET 全系统体检报告（2026-09-22）

- 方式：四路只读子代理调查（文档体系 / 数据表 / 后端实现 / 前端页面与体验）+ 本体 P0/P1 及头部 P2 逐条亲读复核
- 范围：docs/（事实源）+ planet-api/（后端）+ APP/（前端主线）；mobile-v3 / mobile / landing 冻结遗产不入围
- 任务简报：~/.zcode/tasks/2026-09-22-full-system-audit.md
- 复核标注说明：【复核✅】= 本体亲自读过证据文件确认；其余发现均附子代理亲读的 file:line 证据

---

## 一、总判定（先回答 founder 的两个问题）

**Q1：到底有没有明确、精心地设计过？**

**有——执行域的精心程度是体检中最强的结论；唯一的失守在业务定义层（文档）。**

| 维度 | 判定 | 一句话依据 |
|---|---|---|
| 1 业务定义（文档体系） | ⚠️ 设计存在但有缺口 | 执行域文档（行为契约/地基/协作规格）成文且互相咬合，罕见地完整；但北极星指标、8 大功能清单、付费边界、法务口径四处结构性失守（P1×4），现行文档还有 4 处互相矛盾 |
| 2 数据表设计 | ✅ 精心设计 | 37 张活表「一张表只声明一次最终形态」：partial unique 表达全部「单活」不变式、EXCLUDE 表达时序不重叠、复合 FK 表达跨域归属、触发器表达 last-owner 与 append-only；冗余有台账、每次演进留动机注释 |
| 3 后端实现 | ✅ 精心设计（全场最强维度） | 127 个端点授权收敛到 4 个守卫函数无旁路；鉴权/错误码/幂等/事务/配额/通知六项横切全部有明确设计；与契约零漂移；写路径零半写 |
| 4 页面数量与能力 | ✅ 达标 | 37 个路由与页面地图逐条对上，无「有定义无页面」缺页；1 处口径漂移（sharing 路由已重定向而地图未更新） |
| 5 页内交互 | ✅ 达标（1 处死组件） | 动作↔API 无死按钮，幂等键+离线队列+权威回读+失败回滚成体系；唯一断链=CareRiskBanner 整组件无挂载（P2） |
| 6 动作→数据变更链路 | ✅ 明确设计 | 全部写路径单事务、幂等声明与业务写同事务、派生数据（统计/记账/请求收束）与审计同事务、外部副作用（推送/邮件/R2）刻意 commit 后 fail-safe——逐动作映射见第四节 |
| 7 用户体验 | ✅ 主线精确（尾部收口未完） | 时间单源/逾期独立段/数字一家/底栏 icon-only/44 热区/卡距 tokens 全部落地且能在代码指认执法注释；残留 2 处双数字、2 处时间未收编、3 处教学文案，均 P3 |

**Q2：能不能为用户提供精确、优质的服务和体验？**

**主闭环：能。** 「数据不精确」的五个经典通路在结构层面全部有防线：重复共享确认（DB 级 pending unique）、双计数（photo_bytes 同事务账面+advisory lock+条件 upsert）、跨家庭越权（三层复合 FK+唯一授权入口+事务内复检）、幂等重放（持久幂等表+secret 可重放）、时区歧义（timestamptz 与民用日列严格分离、家庭时区为民用日权威、规则时区表达式唯一口径）。

**掉链子的地方在尾部，共三处：**
1. **照片直传是唯一实质的资源缺口**（P2）：孤儿对象无服务端回收 + 预签名无大小上限。
2. **一个已精心设计的能力用户永远看不到**（P2）：「无人负责逾期项」的 CareRiskBanner 整组件零引用。
3. **定义层的模糊会传导成体验的不精确**（跨国家庭场景才爆）：家庭改时区后历史/未来事件的解释语义、纯日期事项「何时算逾期」、被引用但无定义的 DST policy。

---

## 二、P1 发现（全部经本体复核✅，共 4 条，全部集中在文档维度）

| # | 发现 | 证据 | 复核 |
|---|---|---|---|
| P1-1 | **北极星指标不在事实源**：产品成败判据（有效家庭数/周活宠物等）只存在于 research 文档；PRODUCT.md 无指标，CARE-COORDINATION-ROADMAP §北极星 是定性四问 | docs/CARE-COORDINATION-ROADMAP.md:7；grep PRODUCT.md 零命中 | ✅ |
| P1-2 | **「8 大功能」清单唯一成文处已归档**：F1–F8 表只活在 archive/APP-DESIGN.md（L54-61），PRODUCT.md 是另一套无编号清单（grep F1/F8 零命中）；两套口径从未对齐，功能边界随人记忆 | docs/archive/APP-DESIGN.md:54,61,116,137 | ✅ |
| P1-3 | **付费边界三张皮**：PRODUCT.md:180「V1 不做付费订阅」↔ APP-BEHAVIOR-CONTRACT.md:51/70 free 50MB/pro 10GB + 402「需付费动作解决」↔ commerce/LEMON-SQUEEZY.md:82-90 永久会员一次性买断预售。free/pro 数值配额只存在于迁移 seed（0001:720-734），任何现行文档无明文 | 三处原文均已亲读 | ✅ |
| P1-4 | **法务口径出处落空**：LEMON-SQUEEZY.md:120 引用 /terms /privacy /refund，但现行落地页仓 www.joinplanet.pet/app 仅剩 tools/、server/ 仅 lemon-webhook，法务页无源码归属（是否仅存于旧 dist 不可考） | ls 实测 2026-09-22 | ✅ |

> P1-3 与记忆中「权益锚定模型待裁决」互为印证：付费这件事在产品事实源（不做）、行为契约（free/pro 配额+402）、商业文档（lifetime 预售）三个层面各说各话，是客服与商业纠纷的第一源头。

## 三、P2 发现（头部 5 条经本体复核✅，其余附子代理证据）

| # | 维度 | 发现 | 证据 | 复核 |
|---|---|---|---|---|
| P2-1 | 后端 | **照片孤儿对象无服务端回收 + 预签名无大小上限**：领票无服务端状态，客户端上传 R2 成功后若永不建事件也永不 abandon，对象永久滞留；R2 生命周期只覆盖 trash/ 前缀（media/keys.go:47-51），无 sweeper（planet-cli 仅 timeline_repair）；PresignPut 不带 content-length 条件（media/media.go:122-128），单对象体积不受 API 约束，唯一闸=领票 30 张/h 限速 | media/media.go:122-128、keys.go:47-51、timeline/http.go:217；grep sweeper/reclaim 零命中 | ✅ |
| P2-2 | 前端 | **CareRiskBanner 整组件零引用**：「无人负责逾期项」的风险卡含完整 claim 认领链，任何页面无挂载点；页面地图 §3.1 有「风险卡」表述、DEFECT-LEDGER L12 仍当它是活跃修复点 | grep CareRiskBanner 全仓（除组件自身）零命中 | ✅ |
| P2-3 | 前端 | **sharing 路由口径漂移**：/pets/[petId]/sharing 已改 Redirect+分享内嵌宠物工作区，APP-PAGE-MAP.md:126 仍定义为独立页、§1 仍写 4 个重定向（实为 5） | sharing.tsx:1-9 实读 | ✅ |
| P2-4 | 文档 | **状态机两份现行规范各执一词**：CARE-COORDINATION.md:74-80 含 draft→…→reassigning/escalation、occurrence 含 undone 态；APP-BEHAVIOR-CONTRACT §1 无这些态（且自称「实现与本文冲突=实现错」）。读者无法确定以谁为准 | 两文原文均已亲读 | ✅ |
| P2-5 | 数据表 | **照片无关系型台账**：对象 key 只在 pet_events.payload JSONB 里，无 photos 表；存在性/配额一致性纯靠代码纪律（KeyBelongsToPet+Stat 双校验+photo_bytes 同事务账面），设计自洽但无结构保证 | timeline/registry.go:201-249、media/keys.go:165-170、0026 迁移 | 子代理亲读 |
| P2-6 | 文档 | 「导出」三文档宣称存在（PRODUCT §4.3、FOUNDATION §7C、PAGE-MAP §3.2）而 API 边界清单与行为契约均无导出端点/动作行——「文档说有、契约说无」 | 两侧原文比对 | 子代理亲读 |
| P2-7 | 文档 | 视觉权威三处两种答案：PRODUCT:5 与 WEB-DESIGN-SYSTEM:3 说视觉冻结基准=mobile-v3；被指定的 PLANET_APP_DESIGN_SYSTEM.md（2026-09-16 重锚）说唯一锚点=founder Pricing 图、mobile-v3 不再约束配色，同文内另一节又保留 mobile-v3 冻结表述 | 三文比对 | 子代理亲读 |
| P2-8 | 前端 | Families/Pets 列表页无离线快照或离线横幅（Today/Timeline 有），断网即整页错误态 | screen.tsx 证据 | 子代理亲读 |
| P2-9 | 后端 | digest/send 鉴权在 handler 层（digest/http.go:49-58），Service 层无内建门禁；CLI 复用路径今日无害，新调用方接入即旁路 | digest/http.go:49-58 | 子代理亲读 |

## 四、动作 → 数据变更映射（重点交付，全表经子代理逐条亲读）

体量：**127 个 /api/v1 端点**（16 模块）+ 3 个无鉴权运维端点。全部写路径单事务（db.InTx），幂等声明与业务写同事务为强制约定，派生数据与审计同事务，推送/邮件/R2 副作用 commit 后 fail-safe。代表性映射：

| 动作 | 表级写入序列（同事务） | 事务证据 |
|---|---|---|
| Apple 登录/注册 | users 查建 → user_identities upsert → sessions insert | identity/service.go:228-277 |
| 建家 | idempotency → families → family_invitations → memberships(owner) → audit | families/service.go:82-144 |
| 建宠物 | families(lock) → pets → pet_ownerships → family_pet_links(primary) → user_usage → pet_profiles → audit | pets/service.go:185-261 |
| 记一条照护/照片 | 宠物/家庭锁 → pet_events → 照片记账 user_usage / 体重重算 pets.weight_g | timeline/service.go:114-176 |
| 建提醒计划 | care_plans → care_rules → assignments → 当日 occurrence 物化 | tasks/service.go:222-355 |
| 完成提醒 | occurrences CAS 行锁 → pet_events → care_requests 收束+events；commit 后推送 | tasks/service.go:1913-2050 |
| 撤销完成 | occurrences→pending → 撤回 completed（软删）+ undone 事件 | tasks/service.go:2149-2203 |
| 发起/响应照护请求 | occurrences 锁 → care_requests CAS → events；锁序 occurrence→request 与 complete 一致防死锁 | carecoord/service.go:293-361,1151-1239 |
| 发起/接受共享 | 自分享直写 links；跨家走 pet_share_requests pending → 接受时 CAS+ACL+audit 同事务 | pets/service.go:440-480；petshares/service.go:66-121 |
| 接受转移 | 单大事务：所有权闭开 → 双家庭字典序锁 → 链接迁移 → 请求收束/解批 → 计划迁移 → 分享撤销 → auto 事件 → audit | transfers/service.go:185-350 |
| 照片上传 | 领票无表写（限流+配额预查+presign）；挂接=建事件+双对象 Stat 实测记账；abandon=引用闸+R2 删除 | timeline/service.go:382-433,453-498 |
| 账号注销 | 单大事务 14 步：所有权终结 → 名下家软删 → 转移取消 → 解链 → 值班/指派终结 → token/会话/幂等硬删 → 事件脱标识 → 用户匿名化 | lifecycle/service.go:27-144 |
| digest 发送 | job_runs claim → 组稿（独立事务）→ 外发 → complete/fail；（family,date) 持久去重 | digest/service.go:148-175 |

结论：**「每个动作改了什么数据」这件事不但有明确设计，而且每条路径都能指认到代码与表级序列。**

## 五、页面清单（体量与四态）

- **37 个路由文件 = 2 布局 + 30 实页 + 5 重定向**，与页面地图逐条对上（唯一漂移=P2-3）。
- 四态覆盖密度高：Today / Timeline / Requests 达「骨架+错误+离线快照+同步锁+空态+只读态」满配（today/screen.tsx:655-1317 等）；低频页为「加载+错误+空态」标准配。缺口=P2-8（Families/Pets 无离线态）。
- 动作↔API 对照：21 组用户动作全部有防护（幂等键/离线队列/乐观回滚/撤销入口），无死按钮；**孤儿端点 6 个**（me.usage、families.usage、families.sendDigest、pets.update、pets.updateProfile、petShareRequests.cancel——定义了没有 UI 调用；其中 cancel 意味着共享请求发起人无撤回入口，/me/usage 意味着照片配额只在 402 报错时才被用户感知）。

## 六、P3 尾部清单（不影响主闭环，合并一次清扫即可）

1. 教学文案五语残留 3 处：pets.medsIntro（用药页常驻祈使教学）、pets.assignmentsSubtitle（负责人页机制解说）、auth 页头第二句+口号 footer。
2. Today 全完成态同屏双数字（hero「今日 N 项已全部处理」+ AllDoneCard「N 项全部完成」，screen.tsx:1049/1318）——违反「一个数字一个家」。
3. 时间格式化未收编 2 处：today/screen.tsx:103-107（formatSnapshotTime）、pets/detail-screen.tsx:883-913（recentTimeLabel）绕过 task-time 单一出口。
4. 孤儿端点 6 个：接 UI 或删定义，二选一（见第五节）。
5. 文档腐坏小项：PRODUCT.md §6 内错挂第二个「### 4.4」；BEHAVIOR-CONTRACT:62 孤立表行；PAGE-MAP:127/151 表列错位；docs/README.md 索引缺 9 份现行文档；ARCHITECTURE:195「occurrence_key 做唯一去重」与实际约束载体（uq_care_occurrences_rule_date）错位【复核✅】；users.timezone 死列；subscriptions 三个预留状态无 writer 未标注；family_invitations 无单活唯一（对比 pet_share_requests 有 DB 级保障，同类语义两种强度）。
6. 定义层模糊点（跨国家庭场景才爆）：家庭时区迁移后历史/未来事件解释语义、纯日期事项「何时算逾期」、ARCHITECTURE:194 引用的 DST policy 是悬空名词。

## 七、已知基线（本次未计入发现，复审勿重复）

锁序倒置靠重试、CareStats 惰性物化、单实例限流、paused/completed 不可达、Asia/Shanghai 默认时区、恢复演练未做、深色主题（已否）、lint no-require-imports、原生手势无手工证据、服务端删号中文硬编码、深链重定向 by design、sharing-section 文案、R5 视觉形态本身——均为已登记基线（docs/DEFECT-LEDGER.md L1-L25）。

## 八、「还差什么」建议清单（交 founder 裁决排期）

1. **定义收口批（对 P1×4，半天文档工作）**：北极星指标写入 PRODUCT；8 大功能 F1–F8 从 archive 拉回现行并与 PRODUCT §5 对齐归一；付费边界单源裁决（与「权益锚定模型」待决事项合并处理：V1 免费口径 ↔ free/pro 配额 ↔ lifetime 预售三选一说法）；法务页归属落地（www 仓补页或明确由旧部署承载并改 LEMON-SQUEEZY 引用）。
2. **P2 修复批（1-2 天）**：CareRiskBanner 挂载 Today 或正式删除；照片孤儿回收（uploads 前缀 R2 TTL 或清单核销任务）+ PresignPut 加 content-length 条件；sharing 路由/页面地图口径同步；CARE-COORDINATION §4 状态机与契约对齐（标注 draft/escalation 为未实现规划或删除）；「导出」三处文档口径统一（有则补契约，无则删文档）。
3. **P3 清扫批（半天）**：第六节 1-5 项一次清完。
4. **已知基线**：不动，待专项。

## 九、复核记录（本体亲读文件清单）

- docs/PRODUCT.md、APP-BEHAVIOR-CONTRACT.md、CARE-COORDINATION.md、APP-PAGE-MAP.md、CARE-COORDINATION-ROADMAP.md、commerce/LEMON-SQUEEZY.md、archive/APP-DESIGN.md（grep+定点亲读）
- www.joinplanet.pet/ 目录结构实测（app/、server/、dist/）
- planet-api/internal/platform/media/media.go（PresignPut）、keys.go 垃圾前缀注释、sweeper 全仓 grep
- APP/src/features/today/screen.tsx（双数字两处原文）、app/pets/[petId]/sharing.tsx（Redirect 原文）、CareRiskBanner 全仓 grep
- planet-api/migrations/0001_initial.up.sql occurrence_key 定义 + docs/ARCHITECTURE.md:195

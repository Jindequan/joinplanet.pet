# 全系统深度体检 2026-09-26

- 触发：founder 指令「纯代码出发，深度全面体检」——按钮/链接/内容实现真实性、业务流程与生命周期闭环、UI 简洁优雅、后端/数据库/三方服务/网络/数据安全全面审查。
- 方法：纯代码审计（不跑 App/e2e）。六路独立外派（交互真实性 / 业务闭环 / 后端 / 数据库 / 安全与部署 / UX），**全部 P0/P1 及关键 P2 由本体逐条亲核 SQL/代码后才准入本报告**（复核记录见各项「亲核」标注）。
- 豁免基线：docs/DEFECT-LEDGER.md L1–L50 全量登记项不重复报告（各代理任务书显式下发豁免清单）；L30/L31/L44 等待裁决项维持待裁决。
- 基线快照：planet-api 129 条路由 / 29 迁移；APP 38 路由 / 五语言 1921 键；`tsc --noEmit`、`go build`、`go vet`、目标性单测/集成测试全绿。

## 一、总体结论（TL;DR）

**无 P0。主干健康度：优。** 创始人四问的答案：

| 问题 | 结论 |
|---|---|
| 按钮/链接/内容是否真实实现？ | **100% 真实**。38 路由全扫：无假按钮、无 no-op handler、无 hardcoded 假数字假徽标、导航目标全部存在、全仓 0 个 TODO/stub。变更动作普遍带幂等键+busy+toast+失效图。 |
| 业务流程是否正确、生命周期是否完整、闭环？ | **十域状态机全部封闭**（终态可达、无悬空态、无死路、无永久卡死 pending）；每个正向流程有逆向出口；通知 deep link 落点全部真实。唯一 P1 级闭环缺口在**部署面**：30 天恢复窗的 purge 与 photo-sweep 没有任何调度入口（L51）。 |
| UI 是否简洁优雅、有无优化空间？ | 四态覆盖体系级水准（24 屏 L/E/Empty 全有分支）、错误文案零错误码直出、弹层零关闭死角、冷启动 60 秒可达。残留：5 处教学/客套文案（违 no-instructional-copy 法）、1 处业务态错挂重试、若干「删/合并」结构性机会（L64–L66、L73）。 |
| 技术面（后端/DB/三方/网络/安全）？ | auth 闸门单点收口、IDOR 抽查 30+ 写路径零越权、幂等=同事务 bind 非摆设、secrets 两仓扫描零命中、部署流水线凭据纪律良好。新增 2 个增长型数据库债（L53/L54）+ 1 个潜伏权限残留（L52）+ 2 个安全 P2（L55/L56）。 |

**建议处置序**：L51（部署缺口，一行 timer）→ L52（SQL 括号+DeletePet 补撤销，两行）→ L53/L54（索引+查询窗口）→ L55（Caddy 两行 header）→ 其余 P2 排期，P3 随手批。

## 二、绿面（验证过的健康面，复审计时以此防误报）

- **交互真实性**：Today/记录/请求/宠物/家庭/设置/账户全动作链真（完成/跳过/撤销/认领/转交/调整/日历/离线队列逐条核到后端路由）；幂等抽查合格（fingerprint 键、commandId 队列匹配、断网诚实文案）。
- **i18n**：en/zh/es/ja/pt 五语言 16 文件键集完全对齐；代码 `t()` 全部命中字典。
- **业务闭环**：请求可撤回、转移可取消、共享三向出口、四路生命周期联动取消（删宠/删家/注销/封存）；care_requests 有调度器 TTL（每分钟行锁收束）；验证码 10min/5 次；邀请单活跃（0027）。
- **后端**：public 白名单六条全部有 public 理由与滥用面防护（invite 30/h/IP 只泄 role/首宠名；share token 60/min/IP 统一 410 不泄语义；/internal/stats 回环+loopback 双保险）；body 统一 1MB+DisallowUnknownFields；分页封顶 200；幂等 claim→写→bind 全部同事务。
- **竞态**：claim vs complete（occurrence 行锁串行）、share accept vs transfer（pet 行→请求行锁序一致）、undo vs 迁移、outbox 并发（SKIP LOCKED+资格复查）全部推演无洞。
- **调度器**：outbox 补发（租约+10 次退避 park）、请求过期、自动升级、digest/alerts（job_runs 去重+5min 租约）、提醒双段限次、care-risk 小时桶——全有去重/重试上限/崩溃恢复。
- **既有修复全在位**（防回归复核）：L1/L2/L4/L5/L6/L7/L8/L10/L13/L17/L38/L41 逐条 file:line 确认仍在。
- **安全**：Apple token 8 防线在位；邮件码限流三维（per-email 1/min·10/day、per-IP 30/h、5 次尝试）、枚举防护、constant-time 比较；session 32B crypto/rand 库内 SHA-256；R2 私有桶+签名读 1h+挂接四道闸；APNs ES256+410 回写清 token；CORS 精确白名单；systemd 硬化良好。
- **secrets**：两仓内容+git 历史（pickaxe）零真实密钥；deploy.yml 全程 GitHub Secrets→0640→双向 scrub。

## 三、发现登记（新增项已入 DEFECT-LEDGER 第十节 L51–L73）

### P1（4 项，建议本批收口）

| # | 发现 | 证据 | 影响 |
|---|---|---|---|
| L51 | **30 天恢复窗 purge 与 photo-sweep 无任何部署入口**：`deploy/planet-cli-purge.service.example` ExecStart 只跑 `purge-deleted`（家庭）；`cmd/planet-cli/purge_pets.go:30` 注释自称「与 photo-sweep 并列跑在该 timer」但该 timer 根本不含这两条；deploy/README 零提及 | 本体亲核 timer 样例+注释 | L37 裁决的恢复窗真实化在部署工件层未闭环：超窗软删宠/孤儿照片无限滞留（deceased 占配额语义在 purge 后才释放的链路无人触发）。生产可能已手工配置——需 founder 确认服务器实际 systemd 状态 |
| L52 | **软删宠物经 delegation 分支泄露进 GET /pets 发现列表**：`pets/repo.go:274-285` SQL 优先级 `deleted_at IS NULL AND (owner OR family) OR delegation`——delegation EXISTS 在 AND 作用域外；且 `DeletePet`（repo.go:461-479）只终 ownership/撤 share_links，**不撤销 pet_user_delegations**（lifecycle 注销、transfer、purge 三处都撤，唯独删宠漏） | 本体亲读 SQL 全文+DeletePet | 被授权人（access-grants，L43 预留能力、无产品入口——**实际暴露需 owner 经 API 手建 grant**，故潜伏）在 30 天恢复窗内于宠物列表看到已删宠的姓名/头像/家庭角色；单宠读有 Guard 挡住。修法：delegation 分支并入同一括号组 + DeletePet 撤销 delegations |
| L53 | **care_occurrences 缺 (care_plan_id) 索引**：全库仅 uq(rule_id,date)、ix(pet,date)、partial(due_at,pending)。四条热点全部「按 plan 找 occurrence」：tasks/repo.go:457 next-occurrence LATERAL、:545 todayRows family 路径、carecoord/repo.go:421 升级候选、alerts 用药 feed（missed 连 pending partial 都用不上） | 本体亲核迁移索引清单 | occurrence 线性增长后逐计划退化为顺序扫描。建议 `(care_plan_id, due_date) WHERE deleted_at IS NULL` |
| L54 | **care_requests ListSent 无界 + 缺 (from_user_id) 索引**：`carecoord/repo.go:241-270` 无 state 过滤、无 LIMIT、无分页（内存去重后全量回传）；sent 侧零索引（inbox 有 ix_care_requests_inbox） | 本体亲核 SQL 尾段+迁移 | 「我发出的」随历史无界增长顺序扫全表。建议 partial index `(from_user_id, updated_at DESC)` + 服务层窗口 |

### P2（11 项）

| # | 发现 | 证据 |
|---|---|---|
| L55 | Caddy 无 HSTS/X-Content-Type-Options（api 同域承载 landing 收钱页，SSL-strip 场景成立） | 本体亲核 deploy/Caddyfile 零命中 |
| L56 | Apple nonce 客户端可选：仅请求带 nonce 才比对（identity/apple.go:95-99），截获的 identity_token 在 ≤5min 有效期内可重放登录 | 安全路亲读 |
| L57 | 邀请 join×refresh 轮换毫秒级 TOCTOU：Join 事务内先 lookup 后拿家庭锁（families/service.go:353-369），轮换提交后旧码仍可插入一名 caregiver/viewer（无提权） | 后端路推演 |
| L58 | digest at-least-once 重发窗：SendDigestOnce 认领→发送→CompleteRun 三步非原子（digest/service.go:177-204），5min 租约过期重认领即全员重发邮件 | 后端路推演 |
| L59 | photo-upload handler 裸 `json.NewDecoder` 绕过 httpx.DecodeJSON 的 1MB 闸（timeline/http.go:222-226）；有认证+30/h 限流+ReadTimeout 兜底 | 本体亲读 |
| L60 | 后台无界/无清理批：job_runs、notification_outbox（注销也不清）、sessions 过期行、auth_challenges 四表无任何清理任务（purge-deleted 清单不含）；另 unassignedCareRisks civilDate 为 NULL 时 due_at 只有上界扫全家庭历史（tasks/service.go:1883-1941） | 后端+DB 路合查 |
| L61 | by-id 读缺 deleted_at 四处：sharing/repo.go:70-76、transfers/repo.go:80-88、timeline/repo.go:119-125、tasks/repo.go:527——service Guard 兜底，唯 Revoke 的已撤销判定会把软删行误读为 already-revoked | DB 路亲读 |
| L62 | 注销不清理本人发起的 pending pet_share_requests（lifecycle/service.go 零命中该表）：(pet,family) pending 槽被占+对方卡显示「Deleted Member」 | 业务路亲读 |
| L63 | 注销不收束目标为本人的 pending care_handoff_batches：底层 requests 由调度器到期兜底，仅发起方 sent 列表批次行陈旧残留 | 业务路亲读 |
| L64 | pets/[petId]/care 路由把「无家庭/多家庭」业务态错挂 QueryErrorState+重试钮（重试指向 families.refetch，语义错位） | UX 路亲读 care.tsx:89-104 |
| L65 | 文案法违例批（no-instructional-copy/一数一家）：①membersEmptyOnlyYou 教学祈使句（families.json:46，渲染 detail-screen.tsx:330,384）②邀请弹层三重句同义（invite-sheet.tsx:118-124）③settings.pageDescNoPush 页头第二句+noPushDesc 未来预告跨屏说三遍④families.emptyHeaderDescription 页头第二句⑤trends.emptyDesc 祈使句且空态未用 action 槽；错误文案 3 处：errIdempotencyKeyReused「操作令牌」内部术语、errIncompleteCareRequest 实现文案直出、errPhotoStorageError 偏系统名 | UX 路亲读+本体抽查 zh 字典 |

### P3（8 批，随手修/排期）

| # | 发现 |
|---|---|
| L66 | trends 空态无 CTA（唯一无下一步的空态）；families 列表是唯一无下拉刷新的列表页 |
| L67 | 四屏超 500 行红线（AGENTS.md 规则 2）：today/screen.tsx 2044、families/detail-screen.tsx 1757、pets/detail-screen.tsx 1465、pets/care-section.tsx 1290 |
| L68 | client 孤儿方法 `families.today`（planet-api.ts:435）/`pets.today`（:457）+后端 `GET /families/{id}/today` 无 APP 消费（APP 走 `GET /today?family_id=`）——仿 L48/L49 登记待裁决（本体亲核零调用方） |
| L69 | 三个写动作无 Idempotency-Key（updateNotificationPrefs PUT/registerPushToken POST/careRequests.seen POST）——语义天然幂等，纪律偏差 |
| L70 | 死列/死枚举批：users.timezone（0027 已注）、subscriptions.status 预留值、users.status='suspended'、pet_events.source 的 'system'/'care_occurrence'、family_invitations.role='owner'（0001:157）、idempotency_keys.scope 半死 |
| L71 | transfers/pet-shares pending 无 TTL（出口齐全无卡死；目标 owner 永不响应时发起方仅能手动撤回） |
| L72 | 安全尾巴批：6 位登录码 sha256 无盐（DB 泄露可离线穷举，在线已有 5 次+限流兜住）、migrate DSN 密码进 argv（ps 可见）、JWKS 未知 kid 缓存期内不刷新（Apple 轮换最长 1h 不可用）、DevSender 打印验证码进日志（仅非 prod）、photo key 进 Warn 日志（可接受备查） |
| L73 | UX 结构批：手搓角色推导四处收口 core/presentation（today petCanParticipate:258-270/requests scopeReadOnly:64-82/pets+families detail 只读判定）；内部旧路径垫片 3 个可删（activation/welcome、activation/setup-care、(tabs)/family——删除优于兼容，e2e 引用同步收敛）；pets/new 的 `guided` 死参数链 4 处 |

## 四、覆盖度与未验证项

**覆盖**：APP 38 路由全扫（高价值屏逐控件、三大屏全量 grep+关键路径亲读）；后端 129 路由四问横扫+30 写路径 IDOR 抽查；29 迁移全过；调度器 7 任务逐个核对；两仓 secrets 全扫；部署流水线全链。

**未验证（诚实登记）**：
- 生产服务器实际状态：purge/photo-sweep timer 是否已手工挂载（L51 的关键变量）、PLANET_SCHEDULER/EMAIL_LOGIN 实际取值、R2 桶生命周期规则实配、Caddy 生产文件与本仓一致性——均需上服务器核实。
- landing 后端（8082，不在本仓）对公网 /internal/* 兜底路径的行为未验证。
- 静态索引结论未跑 EXPLAIN（禁连库）；L53/L54 建议 staging 复核后落迁移。
- e2e/真机/推送送达/断网运行时复现未跑（纯代码口径）；ja/es/pt 语义质量未逐句审。
- 集成套件全量沿用绿基线陈述（本轮只跑目标用例）；families.JoinMember 重加入多行 membership 的下游影响未全量回归。

## 五、对既往台账的复核结论

- L47 Wave 3 五个尺度文件仍在途（按豁免未重审）；L46 owner 轮询仍在（登记未修）；L48/L49/L50 状态不变。
- L37/L38/L41 裁决落地项验证**在位**，但 L37 的部署闭环发现缺口即 L51——裁决本身没白做，是最后一公里没接上。
- mobile-v3/mobile/www 冻结面未审（按约定）。

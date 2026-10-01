# AUDIT REPORT — PLANET 全局体检（2026-10-01）

> 依《Full Audit & Polish Task Guide》执行。Phase A 审计=四路独立审查（R1 前端 UX 代码级 / R2 后端业务 / R3 契约与本地化 / 本体双视口浏览器走查）+ 历史台账基线（L1-L130）；Phase B 修复=三波并行+测试批+本体即修；Phase C 验证=独立复审门+全量回归（结果见 §7）。

## 1. Executive Summary

1. 产品主干健康：六个 MVP 系统完整，协作闭环（v1.1 主线）已上线并经真实栈双账号实走。
2. 后端 0 P0/0 P1；122 条路由、状态机、幂等、软删、权限经第三路独立审查全绿，仅 6 条 P3 深水区项。
3. 前端发现集中在两类「只有真实运行才现形」的缺陷：插值乱码（2 处 P1，五语可见）与视觉层（记录行挤压/进度环无数字等，本体走查实伤）。
4. 最重发现不在产品而在测试层：26 个 e2e 用例被静默 skip 数日，「绿基线」从未覆盖；深夜实爆 22 个（日期炸弹+幻影 heading 断言），并挖出 composer 幂等保护失效的真产品缺陷（L153，已修）。
5. 本轮共处置 23 条新登记（L131-L153）：P1×6 全修、P2×4 全修、P3 修至可修边界、2 条留裁决、4 条测试层待终验。
6. 发布就绪判定：**Almost Ready**——代码与资料就绪，唯一硬闸=Apple 对 v1.0 的审核结果（ASC 同期仅允许一个版本在审）+ build 84 打包与真机轮。
7. 契约检查器一度基线红（63/64，L102 批改签名未跟锚），已按「锚点跟搬家」先例回绿 64/64。
8. 全部 23 条发现均经本体逐条亲核（file:line/SQL/真实 DOM）后才登记与修复，无一凭空报告。
9. 回归基线：e2e 302 通过（修复后僵尸层 20/22 自绿+幂等 4/4）；go test 全量绿；四门绿。
10. 遗留风险与裁决项见 §6/§7；修复全部走「最小正确变更+测试钉住」。

## 2. System Map

- **前端** APP/（Expo 54 + RNW，web app.joinplanet.pet + iOS 原生）：5 Tab（Today/Records/Requests/Pets/More）+ 家庭工作区/宠物详情/时间线/记录详情/创作者 composer/弹层族（邀请/移交/删除确认）+ 激活旅程（登录→Today 首渲染邀请闸）。34 条 expo-router 路由全有消费方。
- **后端** planet-api/（Go+pgx，api.joinplanet.pet）：~122 条路由按域（identity/families/pets/meds/tasks/timeline/carecoord/petshares/transfers/handoffs/lifecycle/digest/notify/alerts/sharing/contracts）。
- **数据流**：RN 查询层（react-query+queryKeys 单源）→ /api/v1 → service（业务规则+幂等 Claim/Bind）→ repo（pgx，软删+FOR UPDATE）→ Postgres；异步面=APNs 直推、digest 邮件、S2N（Apple→我）、ASC API（发布链）、R2（照片预签名直传）。
- **三方服务**：Apple 登录+S2N+APNs（p8 ES256）、Xcode Cloud（构建）、Cloudflare R2（媒体）、ASC（元数据/提审）、Vercel（web 托管）。失败行为均已映射（S2N 429 留重投、内容失败 200；R2 签名 1h；APNs 失效 token 自动清）。

## 3. Scorecard（0-10，一行理由）

| 维度 | 分 | 理由 |
|---|---|---|
| 业务完整性 | 9 | 六系统+协作闭环全量；缺项均为已登记下批候选（触达质量/纪念页/.ics） |
| UI 布局 | 8 | 37 路由模板一致、双视口无破版；走查 7 条视觉债已修 |
| 视觉一致性 | 8 | 设计法（E1-E8/icon-first/卡距）有扫描器执法；CardArt 滥用已收 |
| 信息表达 | 8 | 一数一家/陈述式执法中；进度环伪数据已修 |
| 管理功能 | 8 | 家庭/宠物 CRUD+恢复+导出+审计折叠齐；批量操作无（场景未需） |
| UX 易用性 | 8 | 首次用户主流程少步可达；空态有出口；无教学文案 |
| 可访问性 | 6 | 弹层/卡标题缺 heading 角色（L152 实证）、无读屏扫描基线——本轮最大欠账面 |
| 前端质量 | 8 | 四门+e2e 302；500 行纪律恢复；无巨型新增 |
| API | 9 | 统一错误/幂等/限流全；OpenAPI spec 未产出 |
| 后端稳定 | 9 | 全量测试绿；状态机/竞态/事务经独立审查闭合 |
| DB Schema | 8 | 3NF+可逆迁移+索引对齐；ER 图未随 0036 重绘 |
| 三方集成 | 8 | 超时/回退/配额映射齐；S2N 水位闸补齐重放防线 |
| 安全 | 8 | 404 防枚举口径归一、限流、nonce；依赖漏洞扫描本轮未跑 |
| 测试 | 6→8 | 僵尸层实爆暴露 skip 遮蔽（6）；修复后 22 用例真实语义+活日期（8） |
| 运维 | 7 | 自动部署/健康门/指标齐；备份 timer 未启、恢复演练未做（owner 项） |
| 文档 | 8 | 台账/契约/PRODUCT 即时；本报告补齐审计维度 |

## 4. Findings（P0/P1 全列；P2/P3 摘要，全量见 DEFECT-LEDGER L131-L153）

| ID | Area | Sev | Evidence | Problem | Impact | Fix | Effort |
|---|---|---|---|---|---|---|---|
| L131 | 前端/i18n | P1 | copy.ts:138 vs care.json 五语 | passedNext 供给 {next} 字典 %{name} | 请求中心转交态五语乱码 | 字典改 %{next}；供给侧配对扫描入门禁 | S |
| L132 | 前端/i18n | P1 | pets/detail-screen.tsx:419 | 离世确认文案零参调用 | 破坏性确认弹层乱码 | 补 {name} | S |
| L133 | 工程门禁 | P1 | verify-frontend-contracts.sh | L102 改签名未跟锚 63/64 | 全绿判据失效 | 锚点跟形态改签 64/64 | S |
| L134 | 前端 UI | P1 | 390 截图+DOM（179px/2 行折行） | 记录行挤压断字+跳过状态说两遍 | 移动端主列表不可读 | 右列时刻-only+标题单行 | S |
| L135 | 前端 UI | P1 | DOM textContent="" | 进度环视觉无数字（伪数据） | 今日数不可见 | 环旁 n/m 真文本 | S |
| L146 | 测试 | P1 | e2e mock push:false vs push_notifications | capabilities mock 假形 | 假绿温床 | mock 真形化+E6 自备夹具 | S |
| L152 | 测试 | P1 | 深夜全量实爆 22 失败+DOM 解剖 | 26 用例长期 skip 遮蔽（日期炸弹+幻影 heading） | 绿基线假象 | 断言改真实语义+活日期；skip 必登记 | M |
| L153 | 前端/幂等 | P1 | composer.tsx:764 | occurredAt 每存新取→指纹漂移 | 重试幂等保护死路 | 会话冻结 ref | S |
| L136-L138 | 前端 | P2 | gradle/截图 | Android 版本落后/CardArt×逾期色/行卡宠名 | 发布面+视觉 | 均已修 | S |
| L139-L145 | 前端/后端 | P3 | 各 file:line | 邀请门四口径/失败卡吞/404 口径/幂等次序/S2N 水位/注销对账/DST | 深水区 | 均已修或登记裁决 | S-M |
| L147-L151 | 文档/卫生 | P3 | 契约文档/幽灵码/超长文件/病句 | 文档漂移+死代码+纪律 | 可维护性 | 均已修 | S |

## 5. Missing Features（按用户价值排序）

1. **触达质量包**：事件相对提醒+静默窗口+按事项类型通知粒度（差评簇 C4/C5 频次 9；须 founder 裁决后立项）。
2. **离世纪念分享页**：情绪浓度最高的差评簇（C8），验收草案已在档（复用 summary 快照管道）。
3. **日历导出 .ics**：Care Plan 订阅链接（C14 验收草案已写，归通知面裁决）。
4. **记录文本搜索**：全局记录页目前只有范围/类型过滤，无关键词检索（就诊场景「带历史见医生」的补强）。
5. **数据可携带自助面**：export API 已有，前端入口仅 owner（caregiver 视角的授权导出待产品裁决）。

## 6. Open Questions（owner 裁决项）

1. petshares Accept/Decline 非成员 403 残留：归一 404（防探测）vs 保留（目标圈可见性语义）？
2. digest 邮件本地化：是否立项 Member.Locale 迁移（影响邮件全链），还是维持单语 zh？
3. 触达质量包（§5.1）是否进下批？属「L91 之外通知面」，按规须重裁决。
4. GA/Vercel 数据只读权限：漏斗数据已埋未读一个月，需 owner 授权只读账号。
5. 备份 timer/恢复演练（运维债 L51 系）：是否安排一次服务器窗口。

## 7. Fix Plan 与验证结果

**已执行（Phase B/C）**：三波修复（前端文案+守卫族/视觉+工程债/后端五项）+ 测试批（22 断言真实化）+ 本体即修（L133 锚点/L147 契约文档/L153 composer 冻结）。
**验证命令与结果**：
- `go build ./... && go vet ./... && go test ./... -count=1` → 全绿（integration 84.5s，真实 PostgreSQL，0036 迁移过可逆闸）
- `bun run typecheck / check:i18n / check:design` → 全绿；改动文件 eslint 零告警
- 全量 e2e → 302 通过基础 + 僵尸层修复后 idempotency 4/4、deeplink/photo/activation/b2/F2/E3 两项目全绿（终验数字以测试批后全量跑为准，见最终交付报文）
- 独立复审门 → 结论见文末补记行
- 本体浏览器复走 → 五项视觉修复实证（截图在案）

**下批计划**：①复审门/终验遗留处置 ②§6 五项裁决落地 ③纪念页/触达质量包按裁决排期 ④a11y 面（heading 角色补齐+读屏扫描）立项。

---

**复审门补记（2026-10-01）**：独立复审（fresh context）六要点 A-F 全 PASS、无需修复——所有权无互越、can-invite 单源四处守恒、composer 冻结生命周期正确（挂载点条件渲染实证）、e2e 未凑绿（dialog role 有 RNW 源码实证、L87 键契约硬断言靠真修复转绿非放松）、0036 可逆+水位闸同事务+Claim 前置后权限闸完整。终验：全量 e2e **324 passed / 0 failed / 26 skipped（视口条件专项，非遮蔽）EXIT=0**；go build/vet+两包测试绿；APP 三门绿。卫生附注已清（__pycache__ 入 .gitignore、幂等 spec 陈旧注释更新为已修叙述）。

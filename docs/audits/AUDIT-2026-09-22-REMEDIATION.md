# 体检整改处置记录（2026-09-22）

来源体检报告：[FULL-SYSTEM-AUDIT-2026-09-22.md](FULL-SYSTEM-AUDIT-2026-09-22.md)（本批不改动报告本体）。
处置口径：**本批修复**=2026-09-22 文档批当日完成；**代码批修复**=交由同期代码修复批；**登记待办**=记入 [DEFECT-LEDGER.md](../DEFECT-LEDGER.md) 或待排期；**待 founder 裁决**=需产品裁决后才能动。

## 一、P1 处置

| # | 处置 | 证据（文件:行 / 落点） |
|---|---|---|
| P1-1 北极星不在事实源 | 本批修复 | docs/PRODUCT.md 新增 §3.2「北极星与漏斗指标」（Weekly Active Pets + 安装→激活漏斗，注明 2026-08-17 评估重锚定 founder 批准）；docs/CARE-COORDINATION-ROADMAP.md「北极星」节末加一行指向 PRODUCT 量化口径 |
| P1-2 F1–F8 清单只在 archive | 本批修复 | docs/PRODUCT.md 新增 §3.3「功能总览（F1–F8）」，源自 archive/APP-DESIGN.md §1.2（2026-08 冻结定义），逐行标注现行状态（F6=健康摘要 digest/summary；F8 导出=GET /pets/{id}/export 仅 owner）；注明 Phase C digest/alerts/trends 为 F4/F5 延伸不占编号；历史评审文档以该节为准 |
| P1-3 付费边界三张皮 | 本批修复（文档口径）+ 待 founder 裁决（购买入口/权益锚定） | docs/PRODUCT.md §5「明确不做」改为精确表述（V1 无应用内购买路径；free/pro 双档预留、plans 热调；照片配额 free 50MB/pro 10GB 已接线，402 PHOTO_STORAGE_QUOTA_EXCEEDED 升级引导存在但无购买入口；数值出处 planet-api/migrations/0001_initial.up.sql plans seed）；docs/commerce/LEMON-SQUEEZY.md 头部新增「与产品事实源的关系」（lifetime 预售=市场验证期手段，权益衔接待 founder 裁决，裁决前不得宣称解锁现行配额）。LEMON-SQUEEZY.md L120 附近 /terms /privacy /refund 引用未动（另一执行者负责） |
| P1-4 法务口径出处落空 | 登记待办（www 仓法务页归属对齐，另一执行者批） | 审计 P1-4（www.joinplanet.pet/app 仅剩 tools/、server/ 仅 lemon-webhook）；本批未动 LEMON-SQUEEZY.md 引用 |

## 二、P2 处置

| # | 处置 | 证据（文件:行 / 落点） |
|---|---|---|
| P2-1 照片孤儿对象无回收 + 预签名无大小上限 | 代码批修复（后端，2026-09-22 回填）：孤儿回收已落地——planet-cli 新增 `photo-sweep` 子命令（全桶枚举→宠物照片对象目录分组→pet_events.photo 引用判定→48h 宽限→MoveToTrash，默认 dry-run、--apply 执行；引用判定 SQL 集成测试 TestReferencedPhotoObjectKeys；运维口径与 systemd timer 建议见 media/keys.go 头注）；**大小上限未落地→延期登记 DEFECT-LEDGER L29**（调查结论与候选方案见本文件 §四.1） | 审计证据 media/media.go:122-128、keys.go:47-51、timeline/http.go:217；落点 cmd/planet-cli/photo_sweep.go、timeline/sweep.go、media/keys.go、media/media.go(ListDetailed) |
| P2-2 CareRiskBanner 整组件零引用 | 代码批修复（前端，2026-09-22 落地，APP f93fe67）：判定=能力已可达（Today 逾期段每行 onClaim→planetApi.careRequests.claim，与 banner 的 claimCareRisk 同一端点；canClaim 投影 screen.tsx:807-814）→删除组件及专属包装（readCareRisks/claimCareRisk/writers.ts）；盲审 P3 清尾（queryKeys.careRisks、cache 失效字面量、client 方法+类型）与后端端点处置登记 DEFECT-LEDGER L33；DEFECT-LEDGER L12 表述已同步 | 证据链：planet-api.ts:435→readers.ts readCareRisks→CareRiskBanner 零挂载；Today claim 链路 today/screen.tsx:948-958,1381 |
| P2-3 sharing 路由口径漂移 | 本批修复 | docs/APP-PAGE-MAP.md §1 改为 5 个重定向（实况核对：/pets/[petId]/medications、/pets/[petId]/sharing、/(tabs)/family、/activation/welcome、/activation/setup-care）；§3.5 sharing 行改为重定向至宠物工作区（src/features/pets/detail-screen.tsx SharingSection，detail-screen.tsx:65/665 实读） |
| P2-4 状态机两份现行规范冲突 | 本批修复 | docs/CARE-COORDINATION.md §4 状态图改为与 APP-BEHAVIOR-CONTRACT.md §1 一致（sent→seen→accepted/declined/delegated/expired，cancelled 封闭；reassign/delegate 是动作不是状态；occurrence 无 undone 态）；原 draft→…→escalation 链与 undone 移入 §4.1「规划（未实现，2026-09-22 与契约对齐时移出）」 |
| P2-5 照片无关系型台账 | 登记待办（结构性改造待排期，现状设计自洽） | 审计证据 timeline/registry.go:201-249、media/keys.go:165-170、0026 迁移 |
| P2-6 导出「文档说有、契约说无」 | 本批修复（补契约登记） | docs/APP-BEHAVIOR-CONTRACT.md §2.4 新增数据导出行（2026-09-22 补登记：端点早已存在——pets/http.go:23 路由注册、pets/service.go:321-337 Export，仅 current owner、单读事务）；docs/ARCHITECTURE.md §7 Pet 清单补 `GET /pets/{id}/export`。前端导出 UI 入口不在本批断言范围→延期登记 DEFECT-LEDGER L28 |
| P2-7 视觉权威三处两种答案 | 本批修复 | docs/PRODUCT.md 头部、docs/WEB-DESIGN-SYSTEM.md 头部、APP/docs/PLANET_APP_DESIGN_SYSTEM.md「视觉基准（冻结）」节统一为：唯一视觉锚点=founder Pricing 参考图（2026-09-16 重锚定），mobile-v3 降级为历史参考不再约束现行配色/形态；同文件样式条款编号乱序加勘误注不重排 |
| P2-8 Families/Pets 无离线态 | 延期登记 DEFECT-LEDGER L26 | 审计证据：Families/Pets screen.tsx（子代理亲读） |
| P2-9 digest/send 鉴权在 handler 层 | 代码批修复（后端，2026-09-22 回填）：owner 判定下沉 Service——新增 `Service.SendDigestOnceForUser`（requireSendOwner：非成员 404/非 owner 403，先鉴权后认领 job_runs 去重键），handler 只转发；调度器系统路径与 CLI 运维补发路径（无鉴权 SendDigest）不变。单测 TestSendDigestOnceForUserRejectsNonOwner（caregiver/viewer 403、非成员 404）；既有集成用例（owner 200/caregiver 403/同日 skipped）回归通过 | 审计证据 digest/http.go:49-58；落点 digest/service.go、digest/http.go、digest/service_auth_test.go |

## 三、P3 处置（审计第六节 6 项）

| # | 处置 | 证据（文件:行 / 落点） |
|---|---|---|
| 6.1 教学文案五语残留 3 处 | 代码批修复（前端 P3 清扫批） | pets.medsIntro、pets.assignmentsSubtitle、auth 页头第二句+口号 footer |
| 6.2 Today 全完成态双数字 | 代码批修复（前端 P3 清扫批） | today/screen.tsx:1049/1318 |
| 6.3 时间格式化未收编 2 处 | 代码批修复（前端 P3 清扫批） | today/screen.tsx:103-107、pets/detail-screen.tsx:883-913 |
| 6.4 孤儿端点 6 个 | 已处置 4：petShareRequests.cancel 已接 UI（2026-09-22，APP f93fe67「我发出的」撤回入口+失败路径 e2e）；pets.update / pets.updateProfile 客户端方法已删（后端端点与契约保留）；导出 UI 经勘误证伪（L28 ❌）。挂起 2：me.usage→DEFECT-LEDGER L32（三项产品决策未解）；families.usage→随配额展示产品决策与 L32 一并裁决；digest 手动发送 UI→L27 | 审计第五节；f93fe67 |
| 6.5 文档腐坏小项 | 全部关闭：本批修复 6 处文档项；三项结构待办由后端代码批 0027 迁移收口（users.timezone 死列 COMMENT、subscriptions.status 预留状态 COMMENT、family_invitations 单活 partial unique 含存量去重），盲审 P3（迁移去重防护）同轮加固 | 已修：PRODUCT.md §6.4 归位、BEHAVIOR-CONTRACT L62 归位、PAGE-MAP 修表×2、README 三层事实源重建、ARCHITECTURE occurrence_key 写实；后端落点 migrations/0027_*、schema_test、migration_0027_test |
| 6.6 定义层模糊点 | DST policy 悬空名词→本批修复（ARCHITECTURE.md §6 按 tasks/service.go dueAt 实况改写）；时区迁移语义→延期登记 DEFECT-LEDGER L30；纯日期事项逾期时刻定义→延期登记 L31 | tasks/service.go:399-419（春令时缺口后移、秋令时取较早；dst_policy 列不被读取） |

## 四、遗留与移交

- ~~代码批（后端/前端）完成后须回填本表处置状态~~ 已全部回填（2026-09-22）：后端批=planet-api 956556d（含盲审 P1 photo-sweep TOCTOU/P2 PATCH 排程预检修复），前端批=APP f93fe67（含盲审 P2 撤回幂等键修复）；两轮盲审均复审闭环。
- 本批未改任何代码、未动 docs/audits/FULL-SYSTEM-AUDIT-2026-09-22.md 本体；APP/ 内仅按任务授权编辑 APP/docs/PLANET_APP_DESIGN_SYSTEM.md 一个文件。
- 后端代码批（2026-09-22）改动范围：planet-api 的 tasks/digest/timeline/media/families 相关代码与迁移 0027；未动 FULL-SYSTEM-AUDIT 本体。

### 4.1 后端代码批延期登记：照片直传体积上限未落地（2026-09-22，对应审计 P2-1 后半 / DEFECT-LEDGER L29）

**结论：不实现预签名 POST + content-length-range，维持现状（PresignPut 无大小条件）。**

原因（2026-09-22 后端批调查）：

1. Cloudflare R2 官方 S3 兼容页（developers.cloudflare.com/r2/api/s3/api/）操作表**没有 POST Object / Presigned POST 行**——该 API 面不受兼容承诺约束，随时可能变更；
2. 社区实测（answeroverflow「R2 Presigned URL: No upload limit??!!」，2025-03；Cloudflare Discord 2023-03「Presigned POST is not supported by R2」，后加部分支持）：**R2 对 presigned POST 的 content-length-range 条件不执行**——签名校验通过但体积约束被忽略；
3. 失败模式不可接受：服务端在票据里声明 `max_bytes` 而 R2 不强制，比不声明更糟（假安全感，超限对象照样落盘，直到挂接时 Stat 才发现）。

现行补偿控制（已存在，维持）：挂接时 Stat 实测字节与声明 ±20% 对账（timeline/registry.go requirePhoto + Create 记账路径）；storage_bytes 配额硬闸（Reserve 带 limit 原子拒）；领票 30 张/h 限速；本轮新增的 photo-sweep 兜底回收未挂接对象（含超限孤儿）。

候选方案（按侵入度排序，待 founder/排期裁决）：

1. **客户端压缩上限 + 挂接对账维持现状**（零改动）：依赖客户端压缩产图 ≤ 上限 + 服务端 ±20% 对账拒收；
2. **Worker 反代上传路径**：R2 前置 Cloudflare Worker 校验 Content-Length 再转发（引入新运维组件）；
3. **服务端搬运**：客户端改传 API、后端流式转 R2（违背「API 不搬运字节」的 2026-09-18 裁决，仅列不作建议）；
4. **R2 官方支持 POST policy 后接入**：media.Store 加 PresignPost，票据响应新增 `upload_url_post`/`form_fields`/`max_bytes` 字段、原 `upload_url`(PUT) 保留——接口形状已在 2026-09-22 后端批预研中确认可行（minio-go v7.3.0 PresignedPostPolicy 本地签名，可离线单测）。

# PLANET 限额体系设计 v1（2026-09-26）

状态：**v1.1——founder 已批准 §6 数字（收紧为 free=1 家庭/2 宠物，2026-09-26 裁决，落迁移 0032 + contracts.DefaultPlans）；QB1 后端已落地（单文件闸 FILE_TOO_LARGE、402→403 统一、pets on-read 收口、/me/usage 扩 families/members、grant CLI），QB2 前端已落地（账户›用量页+创建预检+队列 meUsage 失效；离线队列 403-留队列 e2e 钉桩；复审 P1/P2/P3 全收口——含 families 预检文案与 30 天软删占额矛盾的去除）。剩余=升级体系（付费墙/402 回归时点，V1 冻结外）。**
来源：founder 2026-09-26 裁决（L32 升级立项）：「现在都是默认的免费版，都必须有限额：宠物数量、family 数量、family 成员数量、资源消耗额度。需要完整系统性设计，参考企业坐席额度设计理念。」
产品边界不变：MVP 无付费（PRODUCT.md 六系统裁决）——本体系=**免费档完整限额 + 升级挂钩预留**。

## 1. 设计原则（企业坐席理念 → PLANET 适配）

- P1 单一事实源：结构域限额住 plans 表行（列级），扩展资源（当前仅 ai_monthly）住 quota_configs（PK=plan,resource，无仲裁重叠）；均运行时热调（planet-cli plans set），缺行 fail-safe 到 free 档。
- P2 席位归主体：每条限额都有明确的「谁的额度」——D1/D2/D4 锚 **user**（owner 本人），D3 锚 **family owner 的额度**（成员占的是家庭主人的席位，不是加入者的）。这是坐席模型核心：容量由付费/持有主体承担。
- P3 超额宽免（grandfathering）：降档/超额后**读不受影响、清理永远开放、只挡新增写入**——不惩罚存量（现状 pets/families/members 三点已按此实现，立为全系统法）。
- P4 一个数字一个家：用量数字的唯一之家=新「账户 › 用量」页（数据源 GET /me/usage 单端点）；撞墙报错文案只给**动作**（删除/整理指引），不重复铺数字（founder 数字洪水法）。
- P5 防错优先（§3.4）：达到上限时创建入口**禁用+说明**（预检），而不是可点+报错；报错仍是最后防线。
- P6 执法在写路径锁内：新增限额域必须复用现有模式（advisory lock + 同事务 count/Reserve + 幂等键），禁止读侧检查（TOCTOU）。
- P7 预留即声明：有列无执法的资源（ai_monthly）在文档标「预留能力」，不假装有额度。

## 2. 四域矩阵（现状 → 缺口）

| 域 | 额度主体 | free 限额 | 执法点（现状） | 错误码 | 缺口 |
|---|---|---|---|---|---|
| D1 家庭数 | user（owner） | 3 个 owned families（软删 30 天保护期内仍占） | create + restore（`families/service.go:117/911`，advisory lock `ownfam:`） | 403 QUOTA_FAMILIES_EXCEEDED | 无预检 UI；无用量页 |
| D2 宠物数 | user（owner） | 5 只 active（deceased 占额、archived 不占、软删 30 天不占——09-23 裁决口径） | create/restore/unarchive/transfer-in 四点（`pets/service.go:241/535/1033`、`transfers/service.go:288`，lock `pet-quota:`） | 403 QUOTA_PETS_EXCEEDED | 无预检 UI |
| D3 家庭成员数 | family 的 owner | 2 人/家庭 | join + restore（`families/service.go:407`，上限取 BestKey(ownerID)；LockActiveMembers 行锁计数） | 403 QUOTA_MEMBERS_EXCEEDED | 无预检 UI |
| D4a 存储 | user（跟随事件记录者） | 50MB 照片字节（attach 时 Stat 实测记账，删除/换图对称回冲，零漂移） | 领票软闸（`timeline/service.go:394-405`）+ Create 挂接硬闸（`:330-342`，Reserve 原子 `used+delta≤limit` 于 :338） | 402 PHOTO_STORAGE_QUOTA_EXCEEDED | 无预检/无用量页 |
| D4b 单文件 | user | 10MB/张 | **写路径零执法**（值已装入 Plan 并供 ListPlans 展示（`entitlements/service.go:167-170,248-259`），但无任何闸消费） | — | 本批补：attach Stat 时 original 超限 → 拒绝挂接 + 对象按既有补偿链进 trash |
| D4c AI 额度 | — | 20/月 | **零执法**（quota_configs 行在、无 AI 功能） | — | 维持预留声明，不接线（P7） |

横向缺口：①无「用量之家」UI（me.usage 端点活着但零消费方——恰是 P4 的落点）；②file_bytes/ai_monthly 有列无闸（本节 D4b/D4c）；③`user_usage.pets_created` 展示口径与 on-read count 双轨无对账；④降档收敛策略未成文（P3 立法即补）；⑤403（结构域）与 402（存储域）状态码语义分裂（见 §3 决策 Q3）。

## 3. 设计决策（提交 Codex 核对，再报 founder）

**Q1 D3 要不要 owner 级成员总席位池？**
企业坐席做法=席位池归主体（owner 全部家庭共享 N 席）。PLANET 现状=per-family 独立计数。owner 有 3 家庭×2 成员=天然总 6 的上界，派生池无新增信息量。
**提案：A 维持 per-family**（简单、语义清晰、天然有界；不引入第二计数源）。

**Q2 file_bytes 执法点放哪？**
presign 领票时无法可信获知文件大小（客户端可谎报；R2 不支持 POST content-length-range——L29 调查已证）。挂接（Create）时已有 Stat 实测字节的四道闸流水线。
**提案（Codex 改判后 v1.1）：挂接点加第五道闸，单文件口径=**original 对象**实测 > plan.file_bytes → 拒绝（合计口径属存储总账语义，Codex 指出混用会错杀双小对象）；对象按既有补偿链进 trash，用户无损失。** 领票侧不加（假防线）。thumb 不占单文件额度（由 total 存储闸兜住）。

**Q3 403 vs 402 统一？**
现状：结构域=403、存储=402。402 的 HTTP 语义是 Payment Required——但 MVP 无付费，文案已诚实只引导「删照片腾空间」。
**提案：现在统一为 403 + 机器码（`*_QUOTA_EXCEEDED` 一族），402 保留给付费上线后真正的「升级解锁」时点**——避免今天发一个语义悬空的支付码。实际只需改 `timeline/service.go:318-320` 单一构造点（:341/:404 两处复用同码，Codex 纠偏"改两处"不确）+ 前端 errors.ts 映射同步（码不变、状态码变，改动小）。

**Q4 用量之家（P4 落地形态）**
「账户 › 用量」页：家庭 3/3、宠物 5/2、存储 50MB/已用条三行 + 成员域**按家庭列表返回**（现 DTO 不含 membership 数据，Codex 改判：单行无真实 used 可展；me/usage 扩 `members: [{family_id, family_name, used, limit}]`，前端逐家庭一行呈现）。pets 行 used 取 on-read count（与执法同口径，联动 Q5）。数据源=扩展 `GET /me/usage` 单端点。错误文案不铺数字（现状基本如此）。撞墙预检：新建家庭/宠物入口在 usage 显示已满时禁用+说明（数据已在手，无额外请求）。
**提案：批准此形态；D3 的 per-family 预检在家庭详情页成员区（谁的家庭谁的席位）。**

**Q5 pets_created 双轨**
`user_usage.pets_created` 仅展示、执法走 on-read count。两数可能漂移。
**提案（Codex 加强）：不只删写入点——UsageSnapshot 的 pets 读数同步改 on-read count（`pets/repo.go:407-410` 同函数），处理存量行（迁移或忽略）与 me/usage 响应契约变更；单一事实源（P1）。**

**Q6 运营面**
planet-cli plans set 已是热调单源；补 `planet-cli entitlements grant/revoke`（表在、Service.Grant 在、零 CLI 入口）——内部号/种子用户放 pro 钩子，MVP 不开放注册即无付费墙入口。
**提案（Codex 部分采纳后收窄）：本批只做 grant CLI（Service.Grant 现成）；revoke 不做——Service 层无 Revoke，且 entitlements 查询不过滤 deleted_at（Codex 风险②：软删式 revoke 权限收不回），revoke 需连同查询过滤一起专项补。MVP 不暴露任何用户侧升级入口。**

## 4. 验收标准（GWT v1.1，Codex 可判定性纠偏后逐条可红绿）

字节口径统一：1MB=1,048,576B；边界=「≤ limit 放行、> limit 拒绝」。

- Given owner 已有 3 个 owned families（含 30 天保护期内软删，`CountOwnedFamilies` 口径），When POST /families，Then 403 QUOTA_FAMILIES_EXCEEDED；用量页家庭行 3/3；新建入口预检禁用（testID `family-create-quota-locked`，accessibilityLabel 含限额说明）。
- Given 5 只 active（含 deceased、不含 archived/软删），When POST pet，Then 403 QUOTA_PETS_EXCEEDED；When 先归档 1 只再创建，Then 201（回归保护现行为）。
- Given family F（owner O 的 plan=free）已有 2 active members，When 第三人凭 F 邀请码 join，Then 403 QUOTA_MEMBERS_EXCEEDED；Given O 有第二个家庭 G（0 成员），When join G，Then 200（per-family 口径断言）。
- Given 上传 original 实测 10,485,761B（>10MB）、thumb 任意，When attach，Then 413 FILE_TOO_LARGE；断言：`pet_events` 无新行、两对象均移入 `pets/{petId}/trash/` 前缀（对象 key 级断言）、user_usage.storage_bytes 无增量；重试同一记录走既有幂等链。
- Given storage used=52,428,800B（>50MB），When 领票，Then 软闸 403（QUOTA 族新码口径，§3 Q3）不发票；When 对既有照片调 GET 签名/DELETE/导出，Then 全部成功（P3 宽免读/清理不阻断，集成测试逐条断言）。
- Given 用量页加载，Then playwright 网络层断言 `GET /me/usage` 恰 1 次且无其他配额端点；grep 执法：`used`/`limit` 字面渲染仅存在于用量页与错误文案插值。
- Given 降档演练：`planet-cli plans set free --pets 1`（热生效于新写），Then 既有 5 只宠的读/完成/删除全可用、创建第 2 只即 403；随后 `--pets 5` 回滚并断言恢复。
- Given 同一 occurrence 并发双 complete（幂等键×2 客户端、exactly-once 断言 1 成功 1 重放），Then user_usage/计数无重复扣减（锁+CAS 回归，仿既有 TestCareOccurrence CAS 风格）。

## 5. 实施分批

- **QB1 后端**：Q2 file_bytes 第五道闸 + FILE_TOO_LARGE 错误；Q3 状态码统一 403；Q5 删双轨；/me/usage DTO 扩 families/members 域；Q6 grant CLI；集成测试逐域。
- **QB2 前端**：账户›用量页（复用现有账户区行形态+humanBytes 单源）；D1/D2 创建入口预检（me.usage 缓存进 foundation reader）；errors.ts 状态码映射调整；e2e：用量页四域+预检禁用+file-too-large toast。
- **QB3 收口**：PRODUCT.md 限额节落数（founder 批准 §6 数字后）、planet-cli 运营文档、L32 销号。

## 6. 待 founder 冻结的免费档数字（现状值，可直接批「按现状」）

| 域 | 提案 | 备注 |
|---|---|---|
| owned families | 3 | 0018 起现行值 |
| active pets / owner | 5 | 现行值 |
| members / family | 2 | 现行值；=owner 的席位成本 |
| storage / owner | 50MB | 现行值≈数百张压缩照片 |
| file / photo | 10MB | 现行 plans 值（首次真正执法） |

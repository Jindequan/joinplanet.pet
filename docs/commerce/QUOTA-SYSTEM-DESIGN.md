# PLANET 限额体系设计 v1（2026-09-26）

状态：**设计稿，待 Codex 核对 → founder 批准 → 实施**。
来源：founder 2026-09-26 裁决（L32 升级立项）：「现在都是默认的免费版，都必须有限额：宠物数量、family 数量、family 成员数量、资源消耗额度。需要完整系统性设计，参考企业坐席额度设计理念。」
产品边界不变：MVP 无付费（PRODUCT.md 六系统裁决）——本体系=**免费档完整限额 + 升级挂钩预留**。

## 1. 设计原则（企业坐席理念 → PLANET 适配）

- P1 单一事实源：限额值只住在 plans 表（运行时数据，planet-cli plans set 热调，改数不发布）。缺行 fail-safe 到 free。
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
| D4a 存储 | user（跟随事件记录者） | 50MB 照片字节（attach 时 Stat 实测记账，删除/换图对称回冲，零漂移） | 领票软闸 + Create 挂接硬闸（`timeline/service.go:391/327`，Reserve 原子 `used+delta≤limit`） | 402 PHOTO_STORAGE_QUOTA_EXCEEDED | 无预检/无用量页 |
| D4b 单文件 | user | 10MB/张 | **零执法**（plans.file_bytes 列在、没人读） | — | 本批补：attach Stat 时 >limit → 拒绝挂接 + 对象进 trash |
| D4c AI 额度 | — | 20/月 | **零执法**（quota_configs 行在、无 AI 功能） | — | 维持预留声明，不接线（P7） |

横向缺口：①无「用量之家」UI（me.usage 端点活着但零消费方——恰是 P4 的落点）；②file_bytes/ai_monthly 有列无闸（本节 D4b/D4c）；③`user_usage.pets_created` 展示口径与 on-read count 双轨无对账；④降档收敛策略未成文（P3 立法即补）；⑤403（结构域）与 402（存储域）状态码语义分裂（见 §3 决策 Q3）。

## 3. 设计决策（提交 Codex 核对，再报 founder）

**Q1 D3 要不要 owner 级成员总席位池？**
企业坐席做法=席位池归主体（owner 全部家庭共享 N 席）。PLANET 现状=per-family 独立计数。owner 有 3 家庭×2 成员=天然总 6 的上界，派生池无新增信息量。
**提案：A 维持 per-family**（简单、语义清晰、天然有界；不引入第二计数源）。

**Q2 file_bytes 执法点放哪？**
presign 领票时无法可信获知文件大小（客户端可谎报；R2 不支持 POST content-length-range——L29 调查已证）。挂接（Create）时已有 Stat 实测字节的四道闸流水线。
**提案：挂接点加第五道闸 `original+thumb 实测 > plan.file_bytes → 拒绝（对象按既有补偿链进 trash，用户无损失）`。** 领票侧不加（假防线）。

**Q3 403 vs 402 统一？**
现状：结构域=403、存储=402。402 的 HTTP 语义是 Payment Required——但 MVP 无付费，文案已诚实只引导「删照片腾空间」。
**提案：现在统一为 403 + 机器码（`*_QUOTA_EXCEEDED` 一族），402 保留给付费上线后真正的「升级解锁」时点**——避免今天发一个语义悬空的支付码。改 timeline 两处 + 前端 errors.ts 映射同步（码不变、状态码变，前端按码映射文案，改动小）。

**Q4 用量之家（P4 落地形态）**
「账户 › 用量」页：四行（家庭 3/3、宠物 5/2、成员席位（每家庭 2）、存储 50MB/已用条）+ 数据源=扩展 `GET /me/usage` 单端点（现 DTO 补 families/members 两域 used+limit；pets/storage 已有）。错误文案不铺数字（现状基本如此）。撞墙预检：新建家庭/宠物入口在 usage 显示已满时禁用+说明（数据已在手，无额外请求）。
**提案：批准此形态；D3 的 per-family 预检在家庭详情页成员区（谁的家庭谁的席位）。**

**Q5 pets_created 双轨**
`user_usage.pets_created` 仅展示、执法走 on-read count。两数可能漂移。
**提案：删 user_usage.pets_created 记账维护（5 处写入点），用量页 pets 用 on-read count；单一事实源（P1）。**

**Q6 运营面**
planet-cli plans set 已是热调单源；补 `planet-cli entitlements grant/revoke`（表在、Service.Grant 在、零 CLI 入口）——内部号/种子用户放 pro 钩子，MVP 不开放注册即无付费墙入口。
**提案：grant CLI 随本批做（成本低、是升级体系的运营前提），pro 数值冻结（10GB/6 成员等）但发放仅限手动。**

## 4. 验收标准（GWT，实施批逐条红→绿）

- Given owner 已有 3 个家庭（含 30 天保护期内软删），When 再建家庭，Then 403 QUOTA_FAMILIES_EXCEEDED；前端新建入口预检禁用+说明文案。
- Given 5 只 active 宠物（含 deceased），When 创建第 6 只，Then 403 QUOTA_PETS_EXCEEDED；When 归档 1 只后重建，Then 放行（现行为回归保护）。
- Given 家庭已有 2 成员（=owner 的 plan 上限），When 第三人凭邀请码 join，Then 403 QUOTA_MEMBERS_EXCEEDED；When 移出 1 人后再 join，Then 放行。
- Given 单张照片 >10MB，When attach，Then 拒绝（新错误码 FILE_TOO_LARGE 413）+ 对象进 trash + 记录未创建 + 前端 toast 可重试指引；Given 领票后 15 分钟不上传，Then 既有 abandon/宽限链不变。
- Given 存储 used≥50MB，When 上传领票，Then 软闸拒绝（文案给动作不给升级）；既有照片的读/删/导出永远可用（P3 宽免回归断言）。
- Given 用量页打开，Then 四域数字全部来自 GET /me/usage 单请求；无第二处显示同数（P4 grep 执法：全站 used/limit 字面仅 errors 文案插值与本页）。
- Given 降档（plans set 调小），Then 存量读/删不阻断、新写按新限拒（P3 成文行为）。

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

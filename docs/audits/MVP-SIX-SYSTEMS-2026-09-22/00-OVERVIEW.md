# MVP 六系统生命周期审计总览（2026-09-22）

- 触发：founder 裁决「MVP 不做付费；边界=①账户注册登录管理②家庭全面管理③宠物全面管理④照护信息调度与管理⑤提醒管理⑥event 创建与查看——每项是独立系统、完整业务、有各自生命周期，务必完善、不能有任何漏洞」（已落 [PRODUCT.md §5.0](../../PRODUCT.md)）
- 方法：六路只读子代理逐系统绘制「生命周期状态图 × 实现/契约/UI 覆盖矩阵 × 漏洞清单」，本体分诊后三路修复代理并行落地 + 独立盲审闭环。
- 审计全文：[01-account](01-account.md) / [02-family](02-family.md) / [03-pet](03-pet.md) / [04-care-scheduling](04-care-scheduling.md) / [05-reminders](05-reminders.md) / [06-events](06-events.md)

## 一、总体结论

六个系统的主链（状态机、终态、幂等、同事务守卫）全部具备明确设计且能在代码逐行指认——「有完整业务设计」成立。离「零漏洞」的距离集中在**系统边界的收束**（注销对他人的连带、终局迁移对 pending 请求的处置、调度触达的装配）与少量**生命周期终态语义缺失**（宠物离世）。全部 P0/P1/P2 已在本批修复，产品语义级缺口登记待裁决（DEFECT-LEDGER §八 L36–L45）。

## 二、修复回执（本批，盲审复核后）

| 级别 | 漏洞 | 修复 |
|---|---|---|
| P0 | ⑤F1 调度推送整体断链（DevPushSender 伪装成功） | APNs 经 newPushSender 接入 API 进程与调度器同一装配；prod 下 Dev 必须报错（含测试三分支） |
| P1 | ①V1 注销不清 user_identities（Apple 重注册降级邮箱匹配+墓碑残留 PII） | 注销事务硬删身份行；重注册=全新 user_id（集成测试） |
| P1 | ①V2/②F1 owner 注销连坐删除多成员家庭 | 新码 ACCOUNT_FAMILY_HAS_MEMBERS（409）：名下家庭有其他活跃成员需先处理；单成员家庭照旧自动清理 |
| P1 | ③F1 共享家庭 owner 可单方面夺权 | 转移发起限宠物现任全局 owner（ROLE_FORBIDDEN，守卫在幂等回放后）；前端入口/文案对齐 |
| P2 | ③F3 pending 共享请求三处不收束 | 删宠取消 / 转移接受撤旧 owner 请求 / 接受时归档复查 PET_ARCHIVED |
| P2 | ④F1 substitute 给多家庭宠物建不可见替任务 | 传源计划 family_id；多家庭缺归属 400 |
| P2 | ⑤F3 登出令牌残留 | DELETE /auth/session 可选 push_token 同事务回删 |
| P2 | ⑤F4 care_completed 缺 family_id 绕过补发守卫 | payload 补 family_id |
| P2 | ⑥E2 离线队列静默丢弃+402 误杀 | 402 保留重试；丢弃计数 toast 告知 |
| P2 | ⑥E1 include_photos 半成品（key 泄漏+收件人无图） | 查看时签 1h URL（fail closed，绝不返裸 key）；前端/PDF 三候选渲染 |
| P3 | ④F2 delegate 竞态 / ④F3 skip→move 假成功 / ④F4 停药不墓碑 / ④F5 legacy 指派 / ③F5+契约两码登记 / ②F4 家庭名 80/60 / 402 文案去升级化 / ⑥E4 内联照片编辑预检 | 全部落地（明细见各系统文件与提交 diff） |

盲审：REVIEW: PASS（13 项逐条 FIXED-CORRECT）；盲审提出的 1 项 P2（petshares Accept 新锁序倒置）与 2 项 P3（Release 误伤半径、CLI env 口径）已当批收口。

## 三、验证基线

- planet-api：`go test -count=1 ./...` 全绿（真实 PG 集成套件）+ `go vet` 干净；新增/改写集成测试 9+ 条全部真实断言
- APP：tsc 零错、eslint 零告警、五语 1978 键×5 一致、e2e 173 passed + 1 条件跳过（与基线持平）
- 迁移：零新增（0028 未动用）；错误码仅新增 ACCOUNT_FAMILY_HAS_MEMBERS 一个

## 四、待 founder 裁决（详见 DEFECT-LEDGER §八 L36–L45）

1. **宠物离世语义**（L36，三方案：归档正名纪念 / deceased 终态 / 完整纪念模式）
2. 宠物 30 天恢复窗：真窗口+purge 还是改口径无限期（L37）
3. once 无时段已指派事项的提醒语义（L38）
4. viewer 可被移交所有权 / 邀请码独立撤销（L39）
5. digest 推送通道 / 角标 / 送达窗口口径（L40）
6. 「照片断网入队」承诺 vs 实现（L41）
7. 导出口径落字（L42）、access-grants 预留能力处置（L43）、纪念宠转移 UI（L44）

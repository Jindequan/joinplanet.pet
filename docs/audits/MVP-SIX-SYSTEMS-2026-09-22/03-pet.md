# 系统③：宠物的全面管理 — 生命周期审计（2026-09-22）

> 审计员：只读子代理。范围：planet-api internal/modules/{pets,transfers,petshares}+access-grants+export 权限、APP 宠物域全部、契约 §1/§2.3。基线已排除（含 L28 导出 UI 已存在、L33 care-risks）。

## 1. 生命周期状态图

```
建档 POST /families/{id}/pets → active
  （必填最小集 name+species；owner-only+配额+family 行锁；owner 边+家庭边同事务）
active ⇄ archived（归档/反归档：lifecycleOwner+配额重算；联动=occurrence 墓碑化+请求收束+值班终结；
  反归档=global-owner-only+配额复查+cancelled→pending 复位；Today 由 status='active' 过滤即日消失）
active/archived --DELETE /pets/{id}（confirm=petId；同事务七项联动）--> deleted(名义 30 天窗,见 F4)
  联动：occurrence 墓碑 ✔ 请求收束 ✔ pending 转移取消 ✔ 值班终结 ✔ 分享链接撤销 ✔ 配额重算 ✔ 审计 ✔
  ✘ pet_share_requests 不收束（→F3）；family_pet_links 保留（恢复语义有意）
deleted --POST /pets/{id}/restore（原 owner 边+配额检查）--> active（原家庭已删有出口：重新加入链接区）
已删宠物可达性：详情/时间线/导出全 404（GetPet 过滤）✔；分享链接已撤 ✔；列表过滤 ✔
转移四动作（pet_transfers，pending 唯一约束）：pending → accepted/declined/cancelled（CAS 仅 pending 可决）
  接受=单事务成套迁移：字典序锁+源边复检+所有权闭开+同 owner 跳配额+纪念态免占+源边闭合+请求收束
  +批次解挂/随迁+计划迁移+指派清空+目标边升级 primary+旧 delegation 撤销+分享全撤+双方配额重算
  +auto 事件+审计【共享边 owner 发起可单方面夺权→F1】
跨家庭共享（pet_share_requests 五动作，确认制）：发起（owner 且目标家庭成员；归档禁发）/
  目标 owner 接受（CAS+ACL 边同事务）/拒绝/发起人撤回（2026-09-22 新增）/解除共享（双入口）
  pending 唯一 (pet,to_family)【删宠/转移/归档前已 pending 的收束缺口→F3】
生命终点：现行只有 active/archived/deleted 三态，无死亡/纪念语义（→F8 需 founder 裁决）
```

## 2. 覆盖矩阵（要点）

| 节点 | 后端 | 前端 | 契约 | 守卫 |
|---|---|---|---|---|
| 建档 | ✅ | ✅ 幂等+未保存守卫 | ✅ | ✅ owner-only+配额+锁 |
| 编辑（乐观锁） | ✅ 409 附权威快照；weight 直改拒绝 | ✅ 冲突出口+字段级合并（L21 在位） | ✅ | ✅ version+owner/editor+归档禁写 |
| 归档/反归档 | ✅ 成套联动 | ✅ 降透明+恢复钮 owner 级 | ✅ | ✅ 配额每点闭合 |
| 软删+联动 | ✅ 七项闭合（共享请求缺口→F3） | ✅ requireText=宠物名 | ✅ | ✅ |
| 30 天恢复 | ⚠️ 无窗口执行机制（F4） | ✅ 已删区+配额错误映射 | ⚠️ 承诺 30 天无代码 | ✅ 原 owner+配额（窗缺） |
| 转移四动作 | ✅ 成套迁移 | ✅ 双侧 UI | ⚠️ 发起权限语义（F1） | ⚠️ F1 夺权 |
| 共享五动作 | ✅（收束缺口→F3） | ✅ 撤回 2026-09-22 新增 | ⚠️ 两码未登记（F5） | ✅ pending 唯一+归档禁新增 |
| 导出 | ✅ 仅 owner 单读事务 | ✅ 管理组入口 | ✅ | ✅ |
| 生命终点 | ❌ | ❌ | ❌ | ❌ → F8 |
| access-grants | ✅ 后端完整+ACL 第三路径 | ❌ 零 UI | ❌ | ✅（→F7 处置裁决） |

## 3. 漏洞清单

| # | 级别 | 类型 | 发现与证据 | 处置 |
|---|---|---|---|---|
| F1 | **P1** | 所有权边界/守卫缺失 | **共享边家庭的 owner 可单方面接管全局所有权**：发起只要求源圈 owner（transfers/service.go:69-124，源可取共享边），接受只要求目标 owner——发起人=目标 owner 时双同意退化为一 人决策，原 owner 无确认无通知（Transfer Service 无 Notifier），配额同时翻转 | **产品裁决→本批修复：仅现任全局 owner 可发起（ROLE_FORBIDDEN）** |
| F2 | P2 | 前后端/契约漂移 | 纪念态（归档）转移：契约与后端有意放行（纪念宠可随家庭迁移），前端 canInitiateTransfer 拦死入口→能力不可达 | **待 founder 裁决**（放开 UI 或收紧后端） |
| F3 | P2 | 状态收束缺口 | pending 共享请求三处不收束：①删宠不取消（请求隐形，恢复后复活可被接受）②转移接受不撤旧 owner 发出的请求 ③归档前已 pending 仍可被接受建边 | **产品语义确认→本批工程修复三处** |
| F4 | P2 | 承诺无执行机制 | 「30 天恢复窗」无任何执行机制=事实上无限期恢复；purge TODO 已知（planet-cli purge.go:160-168）；UI 不显示剩余天数 | **待 founder 裁决**（真窗口+purge vs 改口径无限期） |
| F5 | P3 | 契约登记缺口 | PET_ALREADY_SHARED / PET_SHARE_PENDING 未登契约 §3、未映射 errors.ts（前端落通用 409 兜底文案） | 工程修复→**本批登记+映射** |
| F6 | P3 | 可达性边缘 | 共享请求发起人退出所有家庭后 outgoingAnchor=''，撤回入口不可达（API 层有出口、UI 层没有） | 工程修复（登记，边缘） |
| F7 | P3（处置项） | 无产品定义的死面 | access-grants 三端点后端完整且深度接入 ACL/收束联动，但无契约行无 UI 无寻址手段 | **待 founder 裁决**：建议 B=标注「预留能力，API 保留无产品入口」+删前端死方法 |
| F8 | **P1（缺口）** | 生命周期缺终态 | **宠物离世无语义**：归档（可逆暗示）与删除（错误数据暗示）都装不下「离世」。方案选项：一=归档正名为纪念（0 迁移）；二=新增 deceased 终态（不可逆、免配额、只读保留、禁转移共享照护）；三=完整纪念模式（纪念页/纪念分享卡） | **待 founder 裁决，本轮不实现** |
| 备注 | P3 | 导出口径 | 导出不含 care_requests 状态史与转移史；照片仅引用无字节；含管理类事件——口径未落字 | 与系统⑥共同裁决（登记） |

## 4. 结论

骨架全场最强——七条链都有状态、终态、幂等与同事务守卫，配额每个变化点闭合；离零漏洞差四件事：**转移双同意在「发起人=目标 owner」时退化为单人夺权（F1，本批修）、30 天恢复窗是文档承诺而代码无执行机制（F4，待裁决）、pending 共享请求三个终局不收束（F3，本批修）、宠物离世这个唯一「终态」没有语义（F8，待你裁决）**。

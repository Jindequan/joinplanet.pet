# 系统④：照护信息的调度与管理 — 生命周期审计（2026-09-22）

> 审计员：只读子代理。范围：planet-api internal/modules/{tasks,carecoord,handoffs,digest,alerts}+联动面、APP today/care-requests/care-section/assignments/digest/trends、契约四文档。基线已排除（paused/completed 不可达、离线队列待裁决、L27/L30/L31/L33 等）。

## 1. 生命周期状态图

```
CarePlan：[创建]（五形规则/负责人链/当日物化；严格入站+幂等 familyID 入指纹）→ active ⇄ paused（版本化收口/重开）
          → archived（终态；未来项取消+请求收束+通知；用药停药联动）
CareOccurrence：
  pending ──complete(done|skipped)（CAS 单赢家+等价 CHECK+幂等 claim 后置认领检查+7 天补记窗+未来日拒绝）
          │              ──► completed/skipped ──undo（7 天窗 done_at 口径；撤回事件+undone 成对）──┐
          └─ due_at<次日0点 → missed（终态；7 天内可补记；无下界扫描保证任意陈旧 pending 终结）
  任意 → cancelled（墓碑分两派：置 deleted_at 释放槽 vs 仅置 status——不一致见 F3/F4）
调整四动作（窗口 过去≤7 天/未来≤366 天）：skip（拒已完成）/move（拒已完成；missed 可 move 复活）/
  add（once 计划，幂等必消费）/substitute（=skip+add+replace）【substitute 多家庭归属丢失→F1】
  change_rule（manager 权限；当日就地改/未来关旧开新）
CareRequest 七态封闭：sent→seen→accepted│declined│delegated；expired 仅调度器；任意 open→cancelled；
  declined→reassign→新 sent（declined/expired 目标永久禁复用）；全部迁移 SetState WHERE 单语句守卫
  +每 occurrence 单 open 部分唯一+accept 前置锁 occurrence（与 complete 同锁序）
批量交班：1-50 项、先全检后插入绝不半批；响应逐项 outcome（changed/already_resolved/not_actionable×3）
值班：单 on-duty 唯一；claim 顶替=终结旧班+交接 note；release 仅本人；成员移除/删宠终结
digest：圈本地 ≥20:00+次日 04:00 补发；(family,业务日) 持久去重；手发 owner 门禁已下沉 Service
```

## 2. 覆盖矩阵（要点）

| 节点 | 后端 | 前端 | 契约 | 守卫 |
|---|---|---|---|---|
| 计划创建 | ✅ | ✅ | ✅ | ✅ |
| 编辑/版本化 | ✅ 取消今日起开放项+收束请求 | ⚠️ 编辑 UI 不展示版本链 | ✅ | ✅ |
| 暂停/恢复 | ✅ RuleClosedByPause 标记 | ✅ | ✅ | ✅ |
| 归档（+用药联动） | ✅ | ✅ 只读分组 | ✅ | ⚠️ 联动取消不墓碑（F4） |
| 完成/跳过/撤销 | ✅ CAS+等价 CHECK | ✅ | ✅ | ✅ 全链守卫 |
| missed/补记 | ✅ 唯一口径 | ✅ 逾期独立段 | ✅（L31 另裁决） | ✅ 无下界扫描 |
| 调整四动作 | ✅ | ✅ | ✅ | ⚠️ F1/F3 |
| 请求七态 | ✅ 封闭 | ✅ 七态文案全覆盖 | ✅ | ⚠️ F2 竞态 |
| 批量交班 | ✅ 零成功也返回逐项结果 | ✅ | ✅ | ✅ |
| 值班 | ✅ | ✅ | ✅ | ✅ |
| digest | ✅ | ✅ 展示（手发无 UI=L27） | ⚠️ 手发端点未登 §2 | ✅ |
| 负责人链管理 | ✅ | ✅ | ✅ | ✅ OWNER_REQUIRED |

## 3. 漏洞清单

| # | 级别 | 类型 | 发现与证据 | 处置 |
|---|---|---|---|---|
| F1 | **P2** | 静默错数据 | substitute 对多家庭宠物创建无 family 归属的替任务（addPayload 不带 family_id，actionAdd 仅单家庭回填）→ family_id=NULL，家庭 Today 按 ci.family_id=$1 过滤永不可见；与 FOUNDATION §10.7「缺少归属拒绝写入」相悖 | **工程修复→本批**（传源计划归属+多家庭缺归属拒绝） |
| F2 | P3 | 并发竞态→无出口中间态 | complete 与 delegate 并发可留永久 open 请求（完成事务看不见并发插入；DueForExpiry 要求 occurrence pending/missed 永不过期；Inbox 不显示但「我发出的」/责任链永久 open） | **工程修复→本批**（delegate/reassign 先锁 occurrence 同锁序） |
| F3 | P3 | 状态矛盾/假成功 | skip→move 组合：skip 不墓碑占槽，move 覆盖 override 返回成功，Today 该格永久消失、override 与行状态矛盾 | **工程修复→本批**（move 检测 override/cancelled 占位即拒） |
| F4 | P3 | 生命周期不对称 | 停药/删药取消开放 occurrence 不墓碑化（对比宠物路径专门墓碑+注释）；恢复停药计划初日静默无待办 | **工程修复→本批**（meds 联动墓碑化） |
| F5 | P3（边缘） | 悬空指派残留 | legacy 无家庭计划的 occurrence 指派在成员移除时不清理（Release 限定 family_id=$1） | **工程修复→本批**（一行 SQL 扩 OR IS NULL） |
| F6 | 观察 | 终态缺迁移 | once 临时照护过期后 plan 永远 active（与台账「care_plans 死枚举 completed」同源，不另立条） | 产品裁决（引用既有遗留） |
| F7 | 技术事实 | 供 L30 裁决 | 时区迁移日：Today 民事日边界取家庭当前时区，due_at/物化按规则快照时区→迁移日可错位一天 | L30 裁决的技术机理补充 |
| F8 | 观察 | 注释漂移 | 自动升级候选排除条件比注释严（排除任何历史参与者，保守方向无洞） | 顺手修注释（登记） |
| F9 | P3 | 陈旧 UI 边缘 | undo 按钮窗口用渲染时快照，跨午夜可短暂展示已超窗按钮（点击得已映射 409） | 低优先（登记） |

## 4. 结论

系统④是全仓状态机纪律最强的系统：六条生命周期的主链每一跳都有「状态+迁移+终态+守卫」且能在代码逐行指认；离零漏洞差的是四个边角状态一致性缺口（F1 唯一 P2 + F2/F3/F4/F5）——全部工程可修，无一需要推翻既有设计。

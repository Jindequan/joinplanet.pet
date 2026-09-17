# PLANET 行为契约（APP ↔ API 唯一行为事实源）

状态：2026-09-17（契约收口专项产出，随缺陷台账 [DEFECT-LEDGER.md](DEFECT-LEDGER.md) 与本轮修复同步冻结）
效力：实现与本文冲突 = 实现错。改动任何行为先改本文再改代码（宪法 §1.5/§1.6）。产品意图见 [PRODUCT.md](PRODUCT.md)，页面契约见 [APP-PAGE-MAP.md](APP-PAGE-MAP.md)，本文补齐「动作 → 数据变更 → 用户所见」层。

---

## 1. 状态机（七台，含守卫）

| 对象 | 合法状态 | 迁移与守卫（全部经同事务验证） |
|---|---|---|
| care_request | sent→seen→accepted/declined/delegated/expired/cancelled | 响应仅 target；终态封闭（409 NOT_ACTIONABLE）；reassign 仅 declined；expired 仅调度器写（due_at 到且 open 且 occurrence 未结）；每 occurrence 至多一条 open（部分唯一索引） |
| care_occurrence | pending/missed→completed/skipped→(undo 7天)→pending；任意→cancelled | 完成仅 pending/missed（CAS 单赢家，败者 409 TASK_LOG_EXISTS 附权威 log）；undo=完成者或家庭 owner，civil ≤7 天（done_at 口径）；cancel 带 deleted_at 释放 (rule,date) 槽位 |
| care_plan | active⇄paused；→archived(=DELETE) | paused 不物化、取消未来开放项并**收口规则**（effective_to=暂停日-1 + 同事务 paused 审计）；恢复（任一入口到 active）按暂停收口审计识别后重开规则（effective_from=恢复日）；once/带自然 end_date 规则不参与版本化（注释载明取舍） |
| pet | active⇄archived→deleted(30天)→恢复 | 归档禁一切新写（timeline/meds/handoff/share/计划；转移有意放行）统一 409 PET_ARCHIVED；archive/delete 的取消均置 deleted_at；恢复=重新物化，归档恢复另有 cancelled→pending 复位兜底 |
| pet_transfer | pending→accepted/declined/cancelled | 每宠一条 pending（部分唯一）；接受=单事务迁所有权/链接/计划/请求/分享全撤/配额；删宠/删家庭/注销联动取消 |
| pet_share_request | pending→accepted/declined/cancelled | 目标圈 owner 确认；发起人=目标 owner 时即时建边；**状态迁移/ACL 边/审计/幂等全在同事务**；accepted 幂等重放读回 |
| family | active→deleted(30天)→恢复 | 删除前置：单成员+无宠物链接（409 FAMILY_NOT_EMPTY）；恢复带配额复查 |

## 2. 动作契约（按域；幂等=Idempotency-Key 语义：同键同 payload 重放返回原响应，异 payload 409）

### 2.1 执行域（Today）
| 动作 | 端点 | 数据变更 | 幂等 | 离线 | 成功所见 | 失败/逆向 |
|---|---|---|---|---|---|---|
| 完成/跳过 | POST /care-tasks/:id/complete | occurrence→completed/skipped + pet_events(auto,dedupe) + 关联 open request 取消 | 必需 | 队列（pending-today） | 权威回读后清单更新+沉底+toast | caregiver 未认领→403 CARE_OCCURRENCE_ASSIGNMENT_REQUIRED（UI 主按钮切换为「我来做」）；重放语义在指派移除后仍成立 |
| 撤销 | POST /task-logs/:id/undo | occurrence→pending + pet_events(undone) | 必需 | 队列 | 回到待处理 | >7 天：后端 409 UNDO_WINDOW_EXPIRED（前端按 done_at 预藏按钮）；非完成者非 owner 不显示 |
| 我来做 | POST …/care-occurrences/:id/claim | occurrence.assigned_to=me | 必需 | 队列 | 责任条=已确认负责 | 已指派他人 409 ASSIGNED |
| 排程调整/临时/替代 | POST /care-schedule/actions | overrides + occurrence 增改 | 必需 | 无队列（文案明示需联网） | Today 回读 | 过去≤7天/未来≤366 天外 400 |
| 跳过弹窗两选项 | complete(skipped) / actions(skip,this) | 见上 | — | 有队列 / 无队列 | 弹窗关闭 | 离线时文案区分两种能力 |

### 2.2 协作域（care-requests / batches / handoffs）
| 动作 | 端点 | 关键守卫 | 幂等/离线 | 备注 |
|---|---|---|---|---|
| 发起/转交/再安排 | POST …/requests, /delegate, /reassign | 仅当前负责 caregiver；declined 成员不可复用 | 必需/队列 | 前序 accepted 自动转 delegated |
| 接受/拒绝 | POST /accept,/decline | 仅 target、状态机封闭；**接受批量逐项复检宠物资格（失格→not_actionable/eligibility_lost，请求保持 open）** | 必需/队列 | 接受后 invalidate 含 care-responsibility |
| 批量交班 | POST /care-handoff-batches… | 1-50 项、时间窗预校验、家庭时区 | 必需/队列 | results.outcome 前端逐项呈现 |
| 值班 claim/release | POST /pets/:id/handoff(+/release) | 非 viewer；release 仅值班者 | 必需/无队列 | 归档宠 release 有意豁免 |

### 2.3 档案域（pets/families/meds/timeline）
| 动作 | 端点 | 关键语义 | 幂等 |
|---|---|---|---|
| 档案保存 | PATCH /pets/:id/record | 乐观锁 version；**前端字段级合并：仅发用户改动字段，未改字段取最新服务端值（双快照 base/latest）** | 必需（内容指纹键） |
| 归档/删除/恢复 | POST archive/unarchive/restore, DELETE | confirm=petId；取消置 deleted_at | 必需/可选 |
| 跨家庭共享 | POST /pets/:id/families | 确认制（目标 owner≠发起人→pending）；归档宠禁发 | 必需 |
| 共享确认 | POST /pet-share-requests/:id/accept·decline·cancel | 目标 owner/发起人；**全同事务+审计传播** | 必需（读回也 bind） |
| 停药 | POST /medications/:id/stop | 家庭时区当日；联动归档挂药计划+取消开放项 | 必需 |
| 时间线写/改/删 | POST/PATCH/DELETE …/timeline… | auto 事件不可改删；weight 联动体重 | 必需（新建进离线队列；改删无队列） |
| 家庭治理 | PATCH/DELETE/leave/transfer/restore… | 删家庭前置 409 FAMILY_NOT_EMPTY；角色改 viewer 联动收束照护 | 必需/可选 |

### 2.4 分享/导出/账户
- 外部分享：创建=快照物化+token 仅返回一次（幂等重放可取回）；匿名查看 410 SHARE_GONE 不泄露；care_card 为**冻结快照**（UI 须呈现快照日期而非「今日」——遗留项 L14）；撤销同事务写审计。
- 账户：注销前置无 owned pets（409）；会话撤销/登出即失效；推送 token 注册失败有手动重试入口。

## 3. 错误码注册表（前端 errors.ts 必须全覆盖；新码先登记此处）

全量清单（含本轮新增**粗体**）：QUOTA_FAMILIES/MEMBERS/PETS_EXCEEDED、ROLE_FORBIDDEN（仅真 owner 场景）、LAST_OWNER、ALREADY_MEMBER、PET_ARCHIVED、CARE_PLAN_ARCHIVED、TASK_LOG_EXISTS、CARE_REQUEST_OPEN/ALREADY_ACCEPTED/TARGET_PREVIOUSLY_DECLINED/NOT_ACTIONABLE/NOT_REASSIGNABLE/RESPONSE_REQUIRED、CARE_OCCURRENCE_RESOLVED/ASSIGNED/**ASSIGNMENT_REQUIRED**/OUTSIDE_HANDOFF_WINDOW、IDEMPOTENCY_KEY_REUSED、VERSION_CONFLICT、TRANSFER_PENDING_EXISTS/NOT_PENDING/CONFLICT、SHARE_GONE、ACCOUNT_HAS_OWNED_PETS、**UNDO_WINDOW_EXPIRED**、**FAMILY_NOT_EMPTY**、**CARE_ASSIGNMENT_OWNER_REQUIRED**、**AUTO_EVENT_IMMUTABLE**、**IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE**、UNAUTHENTICATED、AUTH/JOIN/SHARE_RATE_LIMITED、PAYLOAD_TOO_LARGE、INTERNAL。
文案规则：中文三段式；未知码按 HTTP 语义兜底；实现层英文 message 禁止直出。

## 4. 失效图（写动作 → 必须刷新的查询面；改这里=改契约）

- 完成/撤销/claim → today、timeline、digest、care-stats、care-requests、care-responsibility
- 请求接受/拒绝 → inbox、sent、chain、today、care-responsibility
- 停药 → medications、**care-plans**、today、timeline、care-stats、care-risks
- 共享接受 → pet-share-requests、pets 根、families、family-pets 根、today
- 宠物/家庭生命周期 → familyScopedRoots（families、pets、family-pets、today、timeline、care-requests、handoff…全根）
- 全局轮询：today 15s、inbox 常驻、sent/chain/batch 8s——invalidate 只造成一次额外 refetch，不构成风暴。

## 5. 权限矩阵（行=家庭角色；宠物 owner 在非本家家庭按该家庭角色论处）

| 动作 | owner | caregiver | viewer |
|---|---|---|---|
| 完成已指派给自己事项 | ✓ | ✓ | ✗ |
| 完成/认领未指派事项 | ✓（直接完成） | 主按钮=我来做，认领后完成 | ✗（只读说明） |
| 建/改/暂停计划、负责人 | ✓（家庭 owner 或宠物 owner） | ✗ | ✗ |
| 发起/响应请求、批量交班 | ✓ | ✓ | ✗ |
| 建宠、家庭治理、转移、分享创建 | ✓（对应 owner） | ✗ | ✗ |
| 时间线写/用药写 | 编辑权者 | 编辑权者 | ✗ |

## 6. e2e ↔ 契约映射（回归防线；60+3 用例全 mock，双端口跑）

认证边界/邀请深链→§2.4；**caregiver 主按钮=我来做**→§5；**pet-share 失败 toast+同键重放**→§2.3 共享确认；**超 7 天无撤销按钮**→§2.1 撤销；权威回读系列（档案/用药/归档/治理/时间线/Today/请求/值班）→§4 失效图；viewer 边界系列→§5；离线队列系列→§2.1/2.2 离线列；尾斜杠/能力接口→运行时配置。真实后端契约防线=planet-api 集成测试（含本轮 defect_closeout_test.go 十一项）+ api-walkthrough.sh（62 步，含确认制）。

## 7. 已知接受的边界（改动前先读）

见 [DEFECT-LEDGER.md](DEFECT-LEDGER.md) 第三节豁免与「遗留」。核心：排程动作/timeline 改删/risk-claim 无离线队列（文案已明示需联网）；care_card「今日照护」呈现与冻结快照语义待产品裁决（L14）；petshares Cancel 404/403 口径与 ResolvedAt 死字段（P3 遗留）；幂等键内存性（会话内防线+服务端业务幂等兜底）。

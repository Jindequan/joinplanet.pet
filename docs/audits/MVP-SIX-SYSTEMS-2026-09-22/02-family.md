# 系统②：家庭的全面管理 — 生命周期审计（2026-09-22）

> 审计员：只读子代理。范围：planet-api internal/modules/families 全部+lifecycle/notify/identity 交界+APP features/families 全部+/families/*、/invite/[code]、/settings/deleted-families+契约 §1/§2.3/§5+PRODUCT §5.0/§6.3。基线已排除（含 0027 邀请单活唯一）。

## 1. 生命周期状态图

```
【family】(不存在) --POST /families（name 1-60+IANA tz+配额 advisory lock；同事务 families+邀请(30d)+owner 成员+审计）--> active
  active：改名/时区（owner+行锁+advisory；时区只迁本圈主管宠物的规则时区，历史 occurrence 冻结）
  active --DELETE（confirm=家庭名+单成员 FAMILY_NOT_EMPTY+无 live 宠物链接+owner；同事务软删+解链+全员 ended+pending 转移取消+审计）--> deleted(30 天恢复窗)
  deleted --POST /restore（deleted_by=调用者+≤30d+配额复查；复活 membership+pet links+审计）--> active
  deleted(>30d)=终态不可恢复；数据永久保留、无 purge、不占配额（CountOwnedFamilies 只计 30 天内）

【family_memberships】active --leave/remove/family_deleted/account_deleted--> ended(reason,ended_at)
  owner 唯一性=触发器 family_must_keep_one_owner（降级/移除/删最后 owner 一律 raise→LAST_OWNER）
  唯一 owner 变更通道=TransferOwnership（先升后降同事务）
  ended → ①同码重 join 插新行 ②restore 复活 reason=family_deleted 窗口内行 → active

【family_invitations】每家庭至多 1 条 live（0027 partial unique）
  live(未接受·未吊销·未删·exp>now)：refresh（旧码全 revoked+新码 30d）｜join 成功（码继续 live）｜30d 到期失效｜家庭软删失效
  公开预览 GET /invite/{code}：无鉴权+30/h/IP 限速+404 不泄露

【家庭审计流】append-only，九个写动作全部同事务留痕；删除/注销 actor→'Deleted Member' 哨兵
```

通知交界：家庭治理事件本身零推送；唯一通知=移除/退出/降级时被取消的 in-flight care_request（commit 后 best-effort）。

## 2. 覆盖矩阵（要点）

| 节点 | 后端 | 前端 | 契约 | 守卫 |
|---|---|---|---|---|
| 建家 | ✅ 配额+幂等+审计同事务（重放可取回邀请码明文） | ✅ 设备时区默认/未保存守卫/指纹幂等键 | ✅ | ✅ QUOTA_FAMILIES_EXCEEDED |
| 邀请生成/刷新 | ✅ 49.5bit 无偏取样+只存哈希；单活唯一 | ✅ 缓存查看无副作用；失败重取同码 | ⚠️ 未登动作行 | ✅ owner-only+role 枚举 |
| 邀请过期 | ✅ 30 天双查询过滤 | ⚠️ UI 不呈现有效期（F10） | ❌ | ✅ |
| 邀请撤销 | ⚠️ 唯一出口=refresh 轮换（F11） | ✅ 有吊销警示 | ❌ | ⚠️ 多设备互吊 |
| 公开预览/加入 | ✅ 行锁串行化 vs 软删+锁后 ALREADY_MEMBER+配额家锁+重放重建 role | ✅ 10 位归一化/自动预览/竞态保护（集成测试双条） | ✅ | ✅ |
| 角色变更 | ✅ →viewer 联动四收束（指派软删 owner 项有意保留+occurrence 释放+请求取消+值班终结）+审计 | ✅ owner 限定+幂等键按目标保留 | ✅ | ⚠️ 目标=owner 时 404 口径（F7） |
| 移除成员 | ✅ advisory 防双 owner 快照竞态+触发器兜底；在途全收束同事务 | ✅ ConfirmDialog | ✅ | ⚠️ 被移除者无通知（F2/F3） |
| 被移除者出口 | ✅ ActiveMemberRow 单一收口→404 | ⚠️ 泛化文案无解释（F3） | ⚠️ | ⚠️ |
| 退出 | ✅ 锁+幂等防丢 204 误 404+收束+审计 | ✅ 非 owner 才见 | ✅ | ✅ LAST_OWNER 映射 |
| 所有权移交 | ✅ 锁后复核+先升后降+幂等必填+重放读回 | ✅ 两段式点名确认 | ✅ | ⚠️ viewer 可候选（F8） |
| 改名/时区 | ✅（时区迁移只迁主管圈规则，有测试） | ✅ 可搜索 IANA | ⚠️ L30 | ✅ |
| 软删/恢复 | ✅ 成套同事务 | ✅ 前置禁用+requireText 强确认+恢复页全态 | ✅ | ✅ |
| 注销联动 | ⚠️ 绕过 FAMILY_NOT_EMPTY（F1，与系统①共洞） | ✅ | ⚠️ | ❌ |
| viewer 写入口禁用 | ✅ 五模块统一拦截 | ✅+e2e 两条 | ✅ | ✅ |
| 失效图 | — | ✅ invalidateAfterFamilyChange 覆盖 14 root | ✅ | ✅ |

## 3. 漏洞清单

| # | 级别 | 类型 | 发现与证据 | 处置 |
|---|---|---|---|---|
| F1 | **P1** | 无守卫的破坏性迁移 | owner 注销连坐删除仍有活跃成员的家：注销只查 active owned pets，:48-73 直接软删+ended 全体；对照正常删除有 FAMILY_NOT_EMPTY；剩余成员无预告无推送无移交，且永不可恢复（Restore 要求 deleted_by=注销者，其会话已硬删） | **产品裁决→本批按既有守卫模式修复（ACCOUNT_FAMILY_HAS_MEMBERS）** |
| F2 | P3 | 悬空引用 | 家庭软删/成员移除不清 default_family_id（客户端 scope 自愈兜底） | 工程修复（登记） |
| F3 | P3 | 没有出口的状态 | 被移除者唯一知情通路=在途请求被取消；否则页面 404 泛化文案+无限重试 | 产品裁决（是否推送「你已被移出」）+文案（登记） |
| F4 | P3 | 契约漂移 | 家庭名前端 maxLength=80 vs 后端 1-60；61-80 字符 400 无字段提示 | 工程修复→**本批前端对齐 60** |
| F5 | P3 | 覆盖缺口 | 审计流上限 50 无翻页、UI 固定显示 8 条，更早历史产品内不可达（数据在库无损） | 工程修复（登记 P3 清扫） |
| F6 | P3 | 死列/留痕缺口 | family_invitations.accepted_at/accepted_by 零 writer；RefreshInvite 不写审计 | 工程修复（登记：COMMENT+语义裁决） |
| F7 | P3 | 错误口径 | 改角色目标=owner 返回 404（与「非成员」不可区分），UI 已隐藏不可达 | 工程修复（登记低频） |
| F8 | ⚠️ 产品确认 | 权限语义 | 所有权移交接受 viewer 候选（一次确认即获全部治理权），与 viewer 语义有张力 | **待 founder 裁决** |
| F9 | ⚠️ 未确认（理论） | 配额误报边界 | Restore 成员计数不滤注销状态，卡配额界可能误报；复活幽灵行被全部读取过滤无泄露 | 工程修复（一行 SQL，登记） |
| F10 | ⚠️ 口径 | 过期语义不透明 | 邀请码 30 天过期存在且生效；但 UI 不呈现，第 31 天只见「码无效」 | 工程文案（登记） |
| F11 | ⚠️ 已知设计代价 | 撤销入口语义 | 邀请码无独立吊销，唯一出口=refresh 轮换（服务端只存哈希不可回读）；多设备互吊有 UI 警示 | **待 founder 裁决**（是否要跨设备查看现行码/仅吊销动作） |

## 4. 结论

家庭系统的主生命周期在后端是全场纪律最高的实现——行锁+advisory+触发器+同事务幂等/审计四件套齐全、无一处半写；离零漏洞真正差的只有一件事：**连坐删除没有守卫（F1，本批修）**，其余全部是尾部收口级的 P3。

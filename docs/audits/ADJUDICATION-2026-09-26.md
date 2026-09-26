# 裁决包 2026-09-26（供 founder 拍板）

来源：FULL-SYSTEM-AUDIT-2026-09-26 + 台账在案待裁决项。每项四段：**现状事实（实码证据）→ 选项 → 推荐 → 裁决（留空待填）**。
裁决方式：按编号回字母即可（如「1A 2A 3A 4B 5A 6A」）。裁决当日由我回写台账与 PRODUCT.md（宪法 §5.3）。

---

## 甲、产品边界裁决

### 1. L30 —— 家庭时区迁移后，历史/未来照护事项按什么口径解释？（跨国家庭场景才触发）

**现状事实**：owner 修改家庭时区时，后端在同一事务把该家庭全部活跃 care_rules 的时区迁到新值（`families/service.go:227`），此后未来事项按新时区物化；**已物化 occurrence 的 due_at 是绝对时间戳，不重算**（物化引擎 `tasks/repo.go:542` 只在 pending/missed 时刷新）。即：已通知过用户的约定不追改，未来按新时区。
**选项**
- A. 把现状立为法：PRODUCT.md 写明「规则时区随家庭迁移；已物化事项冻结；逾期按绝对时间判定」。零代码。
- B. 迁移时把未来 pending 事项重算到新时区。代码中等，且等于追改已推送提醒的约定。
**推荐：A**（事实不可变原则；漂移至多数小时、场景罕见）。
**裁决：＿＿**

### 2. L31 —— 纯日期事项「何时算逾期」？

**现状事实**：全系统唯一口径=过了 due_at、到**家庭时区的次日界**才定格 missed（`tasks/repo.go:571` 注释明示 MarkMissedBeforeFamilyAt 为唯一口径；旧的双轨版本已于 09-22 删除）。即当天没做不算逾期，次日才算。
**选项**
- A. 立法现状：「次日才算逾期」写进 PRODUCT.md。零代码。
- B. 改口径（如当日末即逾期）。
**推荐：A**（对用户宽厚，符合「替你盯不冤枉人」的产品语气；口径已单源，零成本立法）。
**裁决：＿＿**

### 3. L44 —— 纪念态（归档）宠物能不能转移？

**现状事实**：后端有意放行（`transfers/service.go:39`），前端拦死（`canInitiateTransfer` 排除 archived，`APP/src/features/pets/detail-screen.tsx:255`）。09-22 裁决「随 deceased 落地复核」。
**选项**
- A. 收紧后端：归档宠禁转移（与 deceased 终态纪律一致，消灭前后端分裂）。
- B. 放开前端 UI：「纪念转移」（把离世/归档宠转给他人保存）。
**推荐：A**。B 的用户价值基本已被现有通路覆盖：30 天恢复窗→恢复→正常转移；deceased 本就不可转移。保留 API 旁路反而违反「UI 不绕过权限边界」（宪法 §1.7 同理）。
**裁决：＿＿**

### 4. L71 —— 转移/共享请求要不要自动过期（TTL）？

**现状事实**：照护请求有调度器 TTL（每分钟收束）；转移与共享请求**无 TTL**，出口=发起人撤回+目标拒绝+删宠/删家/注销/封存四路联动取消，无卡死路径（业务闭环审计已验证）。
**选项**
- A. 加 7 天 TTL 自动过期（调度器已有基建，成本低）。
- B. 维持现状：想撤随时撤，不自动消失。
**推荐：B**。共享/转移是重决策人际请求，自动过期会出现「我还在考虑对方就没了」的体验；发起方撤回成本极低。若日后出现「已读不回骚扰」场景再立 TTL 不迟。
**裁决：＿＿**

---

## 乙、孤儿面清理裁决

### 5. L33/L48/L49/L50/L68 —— 六组零消费方端点/旁路：删还是留？

**现状事实**（全部经全仓 grep 零消费方核实）：
| 组 | 内容 | 证据 |
|---|---|---|
| care-risks | GET /families/{id}/care-risks（前端链路已随 CareRiskBanner 删除收口） | L33 |
| alerts | GET /families/{id}/alerts + client 方法 | L48，alerts/http.go:17 |
| usage | GET /families/{id}/usage + client 方法 | L49 |
| today 别名 | GET /families/{id}/today + client families.today/pets.today（APP 实际走 GET /today?family_id=） | L68，planet-api.ts:435/:457 |
| legacy tasks CRUD | GET/POST /pets/{id}/tasks、PATCH/DELETE /tasks/{id}、POST /tasks/{id}/logs | L50，tasks/http.go:32-40 |
| 宠物裸更新旁路 | PATCH /pets/{id}、PATCH /pets/{id}/profile（绕开 /record 字段级合并口径） | L50，pets/http.go:25,30 |

**选项**
- A. 全部删除（后端路由+client 方法+对应测试断言同步收口）。删除前我会 grep planet-cli/集成测试确认无隐性依赖，有则从名单剔除并回报。
- B. 全部保留，登记为「预留能力」。
**推荐：A**（契约面收干净，防止新调用绕开契约动作面——正是 L50 登记时的担忧；「删除优于兼容」是既定原则）。
**裁决：＿＿**

### 6. L32 —— 照片配额显示要不要做？（L49 家级 usage 与它同源）

**现状事实**：三个前置未解——①落点不存在（照片内容之家在记录流，SharingSection 是分享管理，均无配额语境）②storage_bytes 无 MB/GB 格式化单源③与 402 PHOTO_STORAGE_QUOTA_EXCEEDED 的升级引导构成同一事实两处口径，违反「信息只说一遍」。
**选项**
- A. 维持挂起（等产品出现真实配额感知需求再做，三个前置一起解）。
- B. 现在指定落点做（需要你给落点，如 402 报错卡内）。
**推荐：A 维持**（402 引导已兜住用户感知，常驻双数字是负体验）。
**裁决：＿＿**

---

## 丙、无需裁决——下一批我直接做（知会）

| 项 | 内容 |
|---|---|
| L74 | verify:frontend 检查器 13 条陈旧 FAIL 逐条自审：断言过时的修断言、真违例的修复后**才**报你 |
| L67 | 四屏拆分（today 2044 / families detail 1757 / pets detail 1465 / care-section 1290 行，500 行红线） |
| L73 余项 | 内部垫片路由 3 个删除（activation/welcome、activation/setup-care、(tabs)/family）+ 角色推导四处收口 core/presentation |
| L72 余项 | JWKS unknown-kid 强制刷新一次（Apple 轮换期最长 1h 不可用的可用性小修）；登录码加 pepper 随安全专项 |
| L70 | 死枚举/死列清理迁移（随下一窗数据库迁移顺带，不单独开迁移） |

## 丁、已豁免（知会，无需裁决）

| 项 | 豁免理由 |
|---|---|
| L58 | digest 投递 at-least-once：宁可重发不可丢，崩溃窗口极窄 |
| L69 | 三个写动作无幂等键：PUT 合并写/令牌 upsert/已读标记，语义天然幂等 |

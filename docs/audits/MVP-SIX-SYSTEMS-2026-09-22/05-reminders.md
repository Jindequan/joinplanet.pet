# 系统⑤：提醒的管理 — 生命周期审计（2026-09-22）

> 审计员：只读子代理。范围：planet-api internal/modules/notify 全部+业务事件产生点、APP settings/notifications+原生推送接线（ios/ AppDelegate、expo-notifications）、契约与设备验收文档。基线已排除（APNs 直连已实现并 6 测全绿、原生手势等）。

## 1. 生命周期状态图

### 1.1 设备令牌线
```
安装 → 登录成功(status==='authenticated' 守卫) → 权限询问[denied → pushStatus='denied'，有出口]
→ iOS 专走 getDevicePushTokenAsync 拿原生令牌（session-provider.tsx:306-323）
→ 注册 POST /me/push-tokens {token, platform:'ios', kind:'apns'}（upsert 幂等+换绑覆盖 user_id）
→ Token 换新：addPushTokenListener 重报+pushTokenRef 去重（:372-433）
→ 终态 A：登出/换号 → DELETE /me/push-tokens（signOut :766-788；会话代数守卫防串号）
→ 终态 B：账号注销 → lifecycle 事务内硬删（lifecycle/service.go:91-95）
→ 终态 C：APNs 410/Unregistered → PrunePushToken 跨账号全删（apns.go:122-127）
```

### 1.2 通知偏好线
默认全开（membership 列 DEFAULT true；缺行返回 DefaultPrefs）；挂 family_memberships 每圈一份；
仅 active 成员读写；PUT 局部更新单 SQL COALESCE 免竞态；发送时实时读 MembersWithPref 即时生效；
成员关系结束→偏好随行失效。

### 1.3 事件→outbox→触达线
```
产生点（逐一核实）：调度器(1 分钟 tick)——日常提醒/每日预警/照护风险/自动升级请求；
即时事件——请求创建/转交/批量/回执/完成通知/完成时收束/移除成员取消。
状态机：pending(available_at) → 租约认领(SKIP LOCKED, attempts+1, 5min)
  → 送达（push 或 mail 任一成功即 sent）→ 失败指数退避→attempts≥10 park(9999)
  → 补发前守卫：被移出成员不再发（按 data.family_id 复查）
```

## 2. 覆盖矩阵（要点）

| 节点 | 后端 | 前端/原生 | 契约 | 守卫 | 判定 |
|---|---|---|---|---|---|
| 权限询问→token | ✅ | ✅（AppDelegate 初始化+delegate 双保险） | ❌ 仅一行 | 未登录不注册；Web 跳过 | ✅ |
| 注册/换绑/换新 | ✅ | ✅ 监听重报 | ❌ | 会话代数守卫 | ✅ |
| 登出/注销 token | ⚠️ Logout 不回删（F3）/ 注销 ✅ 硬删 | 失败吞掉 | ❌ | ❌ | ⚠️ F3 |
| 偏好读写/生效 | ✅ | ✅ 失败 toast+陈旧提示 | ❌ | 成员守卫 | ✅ |
| 权限被拒出口 | — | ✅ openSettings+回前台复查 | — | AppState | ✅（非死寂） |
| **调度推送触达** | **❌ Scheduler.Notify 硬编码 DevPushSender（app.go:400）；APNs 只接进 API 进程；Dev 返回 nil 被记为已送达** | 端上就绪 | ❌ 承诺「到点提醒」 | ❌ | **❌ F1（P0）** |
| once 无时段已指派 | ❌ DueForReminder 跳过 nil 时段；care-risk 只兜无人负责 | UI 允许 once 不带时间 | ❌ | ❌ | **⚠️ F2（P1）** |
| 前台展示/点击落点 | ✅ alert+category+thread-id | ✅ 三类落点+按钮直达 accept/decline+离线重试 | — | — | ✅ |
| 点击目标已不存在 | 404 | ✅ notFound 文案+「收件箱为准」 | — | — | ✅ |
| digest 通道 | 仅邮件；care_digest kind 死代码 | — | ❌ 未说明邮件 | 生效 | ⚠️ F5 |
| Web 边界 | caps 恒 true | pushStatus='unsupported' 仅邮件 | ❌ 无明文 | — | ⚠️ F6 |
| 角标 | 永无 badge | 无 setBadgeCount | ❌ | — | ⚠️ F7 |
| 送达窗口 | 家庭时区；digest 补发至凌晨 4 点；提醒每小时桶全天重复 | — | ❌ 未定界 | — | ⚠️ F8 |
| outbox 保留 | sent/parked 永久累积 | — | ❌ | — | ⚠️ F9 |

「后端有、端上没接」排查结论：**不存在**「iOS 从未注册 token」式断链（注册链完整）；真正的断链是反向的——端上和 API 路径都接好了，唯独调度器装配没接 APNs。

## 3. 漏洞清单

| # | 级别 | 类型 | 发现与证据 | 处置 |
|---|---|---|---|---|
| F1 | **P0** | 调度推送通道整体断链+失败伪装成功 | newProactiveOps 硬编码 DevPushSender（app/app.go:400）；NewScheduler 不收 cfg（app.go:417-436、main.go:68）；DevPushSender 返回 nil 被记为送达（push.go:30-42+service.go:80）。日常提醒/预警/照护风险/自动升级/outbox 补发全部只走邮件；设置页「到点提醒」对推送不成立 | **工程修复→本批**（APNs 接入调度器+prod 下 Dev 必须报错） |
| F2 | **P1** | once 无时段且已指派=零主动提醒 | DueForReminder 跳过 TimeOfDay==nil（tasks/service.go:1782）；care-risk 只兜无人负责；「已指派但到点没人做」的 once 事项无任何触达 | **待 founder 裁决语义**后工程实现 |
| F3 | P2 | 登出 token 残留 | deletePushToken 失败吞（session-provider.tsx:783-787）；Logout 不清 push_tokens——设备继续收前账号家庭推送直至重登/410 | **工程修复→本批**（logout 带令牌回删） |
| F4 | P2 | care_completed 推送无 family_id | tasks/service.go:2110-2116；outbox 补发守卫对无 family_id 行放行→补发窗口内被移出成员仍收通知 | **工程修复→本批** |
| F5 | P3 | digest 仅邮件+死代码 kind | 设置文案未声明邮件；care_digest 映射无生产者 | 待裁决（要不要推送）+文案 |
| F6 | P3 | Web 推送边界未声明 | caps 恒 true，Web 无推送只邮件 | 契约补写（一句话） |
| F7 | P3 | 角标零管理 | 服务端不发 badge、客户端无 setBadgeCount，shouldSetBadge 空转 | 待裁决（是否承诺角标） |
| F8 | P3 | 送达窗口语义未定界 | 家庭时区 vs 成员时区；补发至凌晨 4 点；每小时桶全天重复是否 by design | 待裁决+契约 |
| F9 | P3 | outbox 无保留策略 | sent/parked 永久累积（全库无 DELETE） | 工程修复（定期清理，登记） |
| F10 | P3 | token 无周期校验 | 仅靠发送时 410 回收；静默家庭死 token 滞留（无害） | 可接受，标注 |

## 4. 结论

端上接线（token/点击/深链/权限出口）完整且有守卫，不必动；离零漏洞差三件事：**把调度器的推送装配接上已建成的 APNs（F1，本批修——否则「到点提醒」只是一封邮件）、once 无时段已指派的提醒语义（F2，待裁决）、登出 token 回删与 Web/digest/角标/送达窗口的边界一句话（F3 本批修，余登记）**。

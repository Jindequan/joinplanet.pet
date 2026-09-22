# 系统①：账户注册登录管理 — 生命周期审计（2026-09-22）

> 审计员：只读子代理（全程亲读代码）；基线已排除 FULL-SYSTEM-AUDIT-2026-09-22 全部发现、DEFECT-LEDGER L1–L35、删号文案中文硬编码等。范围：planet-api internal/modules/{identity,lifecycle}、app.go 鉴权链、APP auth/account/settings、会话存储恢复、契约三文档。

## 1. 生命周期状态图

### 1.1 注册（Apple 首登 = 建号）
```
[未注册] --POST /auth/apple(验签通过)--> [查 user_identities by (apple,sub)]
   ├─ 命中且 user active ──────────────→ 走登录
   ├─ 命中但 user 非 active(suspended) → 401 终态守卫（identity/service.go:231-233）
   ├─ 未命中 + verified 邮箱已有账号 ──→ 绑定到既有账号（账号合并语义，service.go:236-242）
   ├─ 未命中 + 无邮箱 ────────────────→ 400 拒绝建号（宁可不建号，service.go:243-247）【守卫】
   └─ 未命中 → CreateUser(+free subscription) → UpsertIdentity → CreateSession（service.go:243-276）
```
守卫链（identity/apple.go:70-114）：RS256 强制、iss=appleid.apple.com、aud=bundle id、exp 必带+60s 容忍、nonce 客户端生成并双端比对（auth/screen.tsx:179-196）防重放。【漏洞 V1 挂在本节】

### 1.2 登录（已有号/新设备）
```
[登出/新设备/会话过期] --GET /auth/methods(唯一方式出处, http.go:188-195)-->
   ├─ Apple enabled → 1.1 路径
   └─ email enabled(生产默认关) → request-code(410 EMAIL_LOGIN_DISABLED 收窄, http.go:200-223)
        验证码：单邮箱单活码+advisory lock+10min TTL+5 次失败作废+IP 30/h、邮箱 1/min 10/day
        +发送失败即吊销码(service.go:120-134)【防"假成功+码残留"】
```
登录即注册（VerifyCode service.go:148-206）；已注销邮箱可重注册（users 部分唯一索引+查询过滤 deleted_at），有集成测试（lifecycle_fixes_test.go:71 TestDeletedEmailCanReregister）。

### 1.3 会话存续与过期
```
[创建] token=32B 随机、仅存 sha256(repo.go:239-247) → [存续] 滑动续期(>30 天剩余时续到 90 天)
       +last_seen 5 分钟节流(repo.go:264-279) → [终态×3]
       ├─ revoked_at 置位（登出/吊销，幂等）
       ├─ expires_at 过期（60 天不活跃即死，无复活）
       └─ 注销硬删（lifecycle/service.go:126-128）
   复检：SessionByToken 联查 user active+未删（repo.go:250-262）；中间件二次防线（identity/http.go:431-434）
   客户端恢复：SecureStore token → /me 校验，401 即清（session-provider.tsx:688-729）
```

### 1.4 多设备会话列表/吊销
```
[活跃会话集] --GET /me/sessions(只列未吊销未过期)--> 列表(is_current 标注)
   吊销单台：DELETE /me/sessions/{id}（属主守卫+禁自吊销, http.go:359-370）
   吊销其余：DELETE /me/sessions?except_current=true（必带参数守卫）
   UI：确认弹窗×2+错误/重试态；被吊销端出口=下一请求 401→清 token/push/query→/auth【有出口】
```

### 1.5 档案编辑
PATCH /me（display_name 1-60/locale 白名单五语）幂等键 claim+重放读回权威值；UI 空名校验+失败回滚 locale。

### 1.6 偏好（默认家庭/宠物）
写守卫齐全（family 须 active 成员、pet 三路可达、pet 属于 family）；读无校验 → 上游删除/移除后服务端悬空不清（FK SET NULL 只对硬删生效）【漏洞 V3】；客户端三处自愈（scope 失效回 all、settings 显示清洗、通知页可达性校验）。

### 1.7 推送令牌挂靠
注册幂等 upsert+换账号重绑；iOS 原生令牌轮换监听重报+会话代数防串号；登出/换号/401 三路回删【best-effort，V4】；注销硬删；APNs 失败反馈清理；pushStatus=failed → 设置页手动重试=契约兑现。

### 1.8 注销（DELETE /account）
UI 手输完整邮箱确认；409 ACCOUNT_HAS_OWNED_PETS 守卫；单事务 14 步（所有权终结→名下家软删+转移取消+解链+成员关系结束→其余成员关系结束→值班/指派终结→push_tokens/share_links 硬删、delegation 撤销→事件脱标识→preferences/幂等/权益/用量/挑战/会话/限流硬删→墓碑匿名化）；终态不可逆（重复调用 404）；客户端收尾 signOut+清队列/快照→/account/deleted 终态页；他人视角名字「Deleted Member」有 locale_neutral 测试锁定。
注销收束对照：pending 转移 ✅ 取消；open care_request 指向注销者 ✅ 有出口（指派置空+调度器到期 expired）；pending pet_share_request ⚠️ 不收束（V9）；他端会话 ✅ 硬删→401 出口；推送令牌 ✅ 硬删。【漏洞 V1/V2/V5 挂在本节】

## 2. 覆盖矩阵（节点 × 后端/前端/契约/守卫）

| 节点 | 后端 | 前端 | 契约 | 守卫 |
|---|---|---|---|---|
| 注册（Apple 首登建号） | ✅ | ✅（无能力设备诚实说明） | ✅ | ✅ 验签五项+nonce+无邮箱拒建号 |
| 登录（邮件码收窄） | ✅ 410 | ✅ methods 驱动+410 文案 | ✅ | ✅ 限流三闸+单活码+失败吊销 |
| 会话存续/过期 | ✅ | ✅ | ✅ | ✅ 哈希存储+双端 401 复检 |
| 多设备列表/吊销 | ✅ | ✅ | ⚠️ 仅一行 | ✅ 被吊销端有 401 出口 |
| 档案编辑 | ✅ | ✅ | ✅ | ✅ |
| 偏好 | ✅ 写守卫 | ✅ 三处自愈 | ⚠️ | ⚠️ V3 服务端悬空不清 |
| 推送令牌 | ✅ | ✅ 三路回删+手动重试 | ✅ | ⚠️ V4 离线登出残留 |
| 注销 | ✅ 409 守卫+14 步 | ✅ 手输邮箱+终态页 | ✅ | ⚠️ V1/V2/V5/V9 |
| 会话被删/他处注销出口 | ✅ 401 | ✅ 全局 handler→/auth | ✅ | ✅ e2e |
| 注销后重注册 | ⚠️ 邮箱✅/Apple ⚠️ V1 | ✅ | ⚠️ 未成文 | ⚠️ 身份行不回绑 |

## 3. 漏洞清单

| # | 级别 | 类型 | 发现与证据 | MVP 内？ | 修复属性 |
|---|---|---|---|---|---|
| V1 | **P1** | 悬空引用+语义缺失 | **注销后同 Apple ID 重注册，登录主键从 sub 永久降级为邮箱匹配**：注销不清 user_identities（lifecycle 事务无此表），UpsertIdentity ON CONFLICT 不回绑 user_id（identity/repo.go:340-347）；墓碑名下永久残留真实 Apple sub+邮箱（违背 ARCHITECTURE:178 匿名化承诺）；Apple 邮箱再变更即拆号丢数据 | 是 | 工程修复（注销事务清身份行）→ **本批修复** |
| V2 | **P2** | 无守卫的破坏性迁移 | **注销对名下家庭的删除绕过 FAMILY_NOT_EMPTY 全部守卫**（lifecycle:47-73 只保留清理三件套），多成员家庭被无声解散、零通知、永不可恢复；前端后果文案未披露 | 是 | 守卫属产品裁决→ **本批按 ACCOUNT_HAS_OWNED_PETS 同款模式加 ACCOUNT_FAMILY_HAS_MEMBERS 守卫（裁决推定），通知类后续可加** |
| V3 | P3 | 悬空引用 | default_family/pet 被移出/删除后服务端永不清理（客户端三处自愈兜底） | 是 | 工程修复（登记，低危尾巴） |
| V4 | P3 | 孤儿副作用 | 登出/401 推送令牌回删 best-effort 吞错，离线登出残留 | 是 | 工程修复 → **本批 logout 带令牌回删** |
| V5 | P3 | 孤儿副作用 | 注销不清理 subscriptions 与 notification_outbox 存量行 | 是 | 工程修复（顺手项，登记） |
| V6 | P3 | 语义缺失 | Apple 登录后 users.email 永不刷新，注销确认口径停留首登邮箱 | 是 | 产品裁决+工程修复（登记） |
| V7 | P3 | 加固缺口 | POST /auth/apple 无限流；nonce 缺省时不校验（客户端恒传） | 是 | 工程加固（登记） |
| V8 | P3 | 幂等口径 | DELETE /account 不支持幂等键（并发双发可见 404） | 是 | 工程修复（可选，登记） |
| V9 | P3 | 无出口的 pending | 注销不收束自己发出的 pending pet_share_requests（唯一索引反挡新请求）；对比转移已同事务取消 | 是 | 工程修复 → **本批随宠物域收束一并处理** |

## 4. 结论

主链路（验签建号/会话/401 出口/推送挂靠/注销匿名化）是全仓纪律最高的部分之一；离零漏洞差三块：**注销的身份残响（V1，唯一可能丢数据的洞，本批修）**、**注销对他人的连带处置无守卫（V2，本批按既有守卫模式修复）**、以及一批悬空/孤儿尾巴（V3/V4/V5/V9，本批修 V4/V9，余登记）。

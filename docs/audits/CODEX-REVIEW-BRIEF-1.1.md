# Codex Review Brief — PLANET v1.1（2026-10-01）

给独立审查者（Codex）的审查包：范围、验证入口、已知豁免清单。全程可复跑，所有结论都有命令证据。

## 1. 审查范围（提交清单，均已在 main）

**planet-api**（Go+pgx）：
- `97e735f` L129 债批：skip 收束推送文案端到端断言×3、删 4 空桩、alerts 明细 i18n（copy_alerts.go 三键五语+防漂移桥接）
- `4479a6e` 参与端点：GET /families/{id}/participation（家庭时区自然周/EXISTS 防跨圈/404 口径）+ digest 单语裁决钉
- `f28a86b` 体检后端五项：petshares/transfers 404 口径、carecoord 幂等 Claim 前置、S2N 水位闸（0036 迁移+EventTime json 修复）、注销对账、weekStartAt DST
- `a3bdf04` petshares Accept/Decline 非成员 404 归一（授权与成员资格同事务同快照）

**APP**（Expo 54/RN）：
- `e1b85ad` L129：?invite=1 消费守卫/invitableFamily 回退链/canMutate deceased 对齐/推送闸协作请求时刻
- `9f53c03` 参与卡：family-participation-card.tsx + 契约层 + 4 键×5 语 + L130 邀请钮收 owner
- `d7ffbc0` 体检批：插值乱码×2 修复、can-invite.ts 单源四处接线、记录行时刻-only、进度环真数字、Android 版本对齐、photo-upload 拆分、capabilities mock 真形化、e2e 僵尸层 22 断言真实化、composer occurredAt 会话冻结（L153 幂等修复）

**文档**：`d7a80a1` 台账 L131-L153 全销号 + AUDIT-REPORT-2026-10-01.md（16 维评分卡）。

## 2. 验证入口（可复跑）

```
planet-api: go build ./... && go vet ./... && go test ./... -count=1   # 全量绿，integration ~85s 真实 PostgreSQL
APP:       bun run typecheck && bun run check:i18n && bun run check:design
APP:       EXPO_OFFLINE=1 npx playwright test                            # 324 passed / 0 failed / 26 skipped
```
- 26 skipped=视口条件专项（单视口截图集），非遮蔽；**若发现新的 skip 请直接报**（L152 教训：skip 遮蔽曾让 26 用例僵尸数日）。
- 浏览器人工路径：`scripts/dev.sh start all web` → http://127.0.0.1:5173（演示号 devin@planet.dev 邮箱码登录）。

## 3. 业务权威定义（防误报基线）

- 事实源：docs/PRODUCT.md（北极星 WAP=周活跃宠）、docs/APP-BEHAVIOR-CONTRACT.md（状态机/错误码/失效图/权限矩阵）、docs/DEFECT-LEDGER.md（L1-L153 全部历史裁决）。
- 设计法：APP/docs 设计系统（E1-E8 信息表达/icon-first/五档按钮/卡距 12px/一数一家/无教学文案）。

## 4. 已知豁免清单（这些不是缺陷，勿报）

1. **历史已裁**：L121 outbox 无 per-token 台账（有意不做）；L125 localStorage 信任模型（豁免留痕）；paused/completed 不可达、单实例限流、锁序倒置靠重试、Asia/Shanghai 默认（后端基线债）；CareRiskBanner 已删（09-22 项）。
2. **有意口径**：digest 邮件单语 zh（L105 余尾裁决关闭，迁移条件已注释+测试钉）；非成员 404 防存在性泄露（全仓圈资源口径，403 仅限「成员角色不足」）；petshares Accept/Decline 的 403 仅为目标圈 caregiver/viewer；深链重定向 by design；?invite=1 非 owner 静默吞参（L129③ 裁决）。
3. **范围外**：iPad/深色模式/读屏全面扫描（下批）、物种特化、日历导出、邮件登录、组织层 schema、付费功能。
4. **留裁决项**（勿报为缺陷，等 owner）：无。
5. **已知 P3 在档**（台账有号勿重复报）：L91 系通知面扩展、aging/纪念页等下批候选。

## 5. 重点建议审查面（高价值区）

1. **幂等链**：carecoord Create 的 Claim 前置后，非 replay 路径权限闸是否仍完整（carecoord/service.go:332 起）；composer occurredAt 会话冻结与「新记录=新挂载」语义（APP composer.tsx:605-611 + 挂载点条件渲染）。
2. **404/403 口径矩阵**：grep 全仓圈资源端点，验证无非相关者 403 残留。
3. **S2N**：水位闸与撤会话同事务、stale 200 不给重试信号、EventTime json.Number 双收。
4. **e2e 真实性**：抽查 review-fix-visual/guards spec 的锚点是否真实可达（dialog/label 而非幻影 heading）。
5. **参与端点**：周界 DST、跨圈 EXISTS、排序稳定性（participation_test.go 三测）。

## 6. 提交后链路状态（非代码）

v1.0 WAITING_FOR_REVIEW（ASC 同期单版本锁）→ build 84 打包（1.1.0 待切）→ TestFlight 真机轮（owner 手工：L99 弹窗/手势/邀请闸）→ ASC S2N 回调 URL（owner 控制台）→ 提审 1.1（whatsNew 五语已预稿 APPSTORE-METADATA §五·五）。

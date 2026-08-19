# 开发进度总览（DEV-PROGRESS）

- 本文件只回答一件事：**现在到哪了、卡在哪**。计划与边界一律见 PRODUCT-SPEC（§3 V1 边界、§6 阶段路线），本文不复述。
- 联动：BACKEND-DESIGN + API-CONTRACT（后端设计）、FRONTEND-V1-PLAN（前端实现设计）、docs/README.md（文档索引）。

## 仓库地图

| 仓库 | 角色 | 状态 |
|---|---|---|
| `planet-api/` | APP 本体后端（Go + PostgreSQL） | **V1 关版**（2026-08-18）：11 迁移、14 模块、~50 集成测试全绿；详见其 ARCHITECTURE.md |
| `mobile/` | APP 前端（Expo/RN，iOS+Android+Web） | WP1–5 已完成；WP6 真机/双账号验收待执行 |
| `www.joinplanet.pet/` | Landing（营销站，生产运行中）+ lemon-webhook 后端 | 已新增 `/s/[token]` 分享查看页与 `/invite/[code]` 邀请落地页；APP 后端与它零共享 |

> 2026-08-19 起三仓独立（mobile/landing 由 subtree split 拆出，planet-api 移入 workspace），根仓只留文档。

## 前端工作包（FRONTEND-V1-PLAN §7 的执行状态）

| WP | 内容 | 状态 |
|---|---|---|
| WP1 数据层 | 契约 v2 全量对接 + 兼容层 | ✅ 实跑验证 |
| WP2 认证 + onboarding | verify-code / 两步建圈建宠 / join | ✅ 实跑验证 |
| WP3 Today/Timeline/Pet | 409 采用/补记/归档/停药/体重 payload | ✅ 实跑验证（含 2026-08-19 记录体验重构，见日志） |
| WP4 家庭治理 + usage + 转移 | 邀请、移交、删/离开家庭、usage、转移发起与收件箱 | ✅ 已实施，待双账号验收 |
| WP5 Shares + Web 查看器 | kind/ttl UI + landing `/s/[token]` 页 + `/invite/[code]` | ✅ 已实施，待真实 API 域名验收 |
| WP6 全量联调验收 | 双账号剧本 × 全功能 + 真机 + TestFlight | ⬜（API 层 E2E 已 68/68；真机待 TestFlight） |

> **2026-08-19 重定调后的下一步顺序**（计划详见 PRODUCT-SPEC §1.5–§1.7、§6）：
> ① WP6 收尾验收（双账号+真机+TestFlight）+ 埋点接入 → ② **V2 = 主动服务三件套**（提醒即服务/每日摘要/规则预警 + 通知偏好）→ ③ P1 照护网络（回写+外部角色）。
> "真实完成"的新定义见 PRODUCT-SPEC §6（三件套上线 + 真人走查 + 外部角色跑通 + 埋点可答补做率）。

## 已知问题（2026-08-19）

1. ~~UI 语言~~ **已解决**：英文源 + zh/ja/es/pt 全量（536 键 × 5，占位符对齐）；系统 locale 默认、Settings 切换、整树即时重挂载。
2. ~~任务编辑/删除无 UI~~ **已解决**（544cd84）：任务行铅笔入口 + 编辑面板（改名/时间/删除，硬删语义如实告知：连带完成历史）。
3. ~~web Escape 不关面板~~ **已解决**（544cd84）：Escape 关闭最顶层面板（栈式，web-only）。
4. 动效未系统验证（reanimated/motion token 存在，无逐屏走查）——需真机（TestFlight 后）。
2. 动效未系统验证（reanimated/motion token 存在，无逐屏走查）——需真机。
3. 打磨项（不阻塞）：web Escape 不关面板；sheet 关闭后 DOM 残留至下次开关。

已修复存档：web sheet 冻结（useSheetModal 按需挂载）、web Tab 栏掉出折叠线（position:fixed）、时区显示（utc→tz 两步）、照片/文档入口隐藏（ATTACHMENTS_ENABLED=false，B6 翻转即恢复）。

## 变更日志（近期）

**2026-08-19（深夜·P0 三件套落地）**：founder 再次纠偏——重定调的三件套是"产品成立的最小集"，不是可延后的 V2。两路并行交付：**异常预警**（体重突变≥10%/症状 14 天反复，纯函数规则，GET /alerts + 今日屏预警卡）；**每日摘要**（时区感知、按宠物 done/pending/skipped/alerts，预览 + 一键发全体现有成员邮件）；**提醒即服务**（任务超 30 分钟未做→提醒全体、2 小时升级措辞；用药/复诊到期走 next_due；Expo 推送 token + 每用户每圈通知偏好开关；调度器 PLANET_SCHEDULER=1 门控、scheduler_runs 防重、DST 测试）。planet-api `724711f`（迁移 0012，测试全绿）、mobile `6981825`（18×5 i18n 键）。实测：真数据触发两条规则、摘要/偏好/发送 curl 全通、带登录态截图确认界面渲染。缺口：med_silence 规则（tasks 无 medication_id 列）、真机推送证书（TestFlight 后）。

**2026-08-19（晚·视觉打磨轮启动）**：founder 判定"看起来还是一开始的"——完全正确：此前的改动全是功能/修复（对眼睛不可见），计划中的视觉打磨轮一直没跑。第一轮（d1228d1）：任务行→独立软卡（阴影+20px 圆角+加大字号）、Hero 问候升 page 级+满圆角进度条、添加任务→品牌虚线幽灵卡、Pet 页渐变 Hero 卡（与今日屏同语言）+入口卡阴影、Timeline 卡片阴影、底栏 68px。**验证方式升级：headless-Chrome 带登录态截图 + 视觉分析迭代循环**（此前只有 DOM 树验证，没"看"过渲染结果——这是教训）。

**2026-08-19（晚·V1 收口冲刺）**：三路并行完成——①任务编辑/删除 UI（最后的功能缺口）；②Escape 面板打磨；③**E2E 双账号全流程脚本 68/68 PASS ×3 连跑**（scripts/e2e-v1.sh：任务生命周期含 409 权威采用/undo/跳过、五类事件+体重冗余、用药自动事件、邀请加入互作、分享匿名读/撤销 410、转移双同意+分享自动撤销、治理全链含 30 天恢复、负面路径全套、账号生命周期）。DoD 六条：1✅ 2✅(API 层+浏览器单点) 3✅ 4=工作树干净✅/TestFlight 待 founder 登录（手册在 DEMO-RUNBOOK） 5✅ 6✅(动效项留真机)。

**2026-08-19（晚·i18n）**：并行批次 review 入库（0a8183e：导出上线、邀请深链、分页/清空哨兵修复）；多语言落地（02cf84c）——五语字典 520 键、双波提取全部 UI 字符串、语言选择器；DoD 第 5 条（语言拍板落地）完成。

**2026-08-19（晚·重定调）**：PRODUCT-SPEC 升 v3——价值锚点"存储→托管"，产品重做为"会替你盯的照护服务"；新增 §1.5 主动服务三件套（P0）、§1.6 照护网络（P1）、§1.7 Pro 可卖定义（P2）；§6 路线重排（摘要 B9 提前、附件让位、新"真实完成"定义）。工程地基不动，能力模型重排。

**2026-08-19（下午）**：仓库重组为三独立仓 + 文档体系收敛（见 docs/README.md 索引）；完成 Undo 404 修复（complete toast 改用服务端 log id + 空 id 防御）。

**2026-08-19（上午）**：记录体验重构（flomo 式）——quick-record.tsx（sheet + 类型宫格）删除，quick-input.tsx 重写为常驻记录卡（多行输入 + 类型 chips + 上下文扩展 + 内联 Save，全类型乐观插入）；时间线密度修订为"全部有卡"（vaccine/transfer 升大卡，weight/note 紧凑卡）。同轮修复：next_due 字段不匹配、编辑丢到期日、中文回退标题、weight NaN 防护、.env 误指旧后端 8090、queries 死代码清除。验证：tsc clean + DOM 快照 + API 全周期 curl。

**2026-08-19（晚）**：补齐 V1 导出闭环、Web 分享/邀请查看页、家庭治理与转移界面；V1 移除建宠图片权限与图片分享，保持 data-only 边界。后端补齐请求体严格校验、转移与删圈竞态保护、局部更新清空语义、DST 间隔排程与匿名预览限流。

**2026-08-19（晚·审计补丁）**：补齐档案 PATCH 的省略/清空语义；修复性别清空触发数据库非空约束的 500；转移接受/拒绝/撤回改为事务内锁圈并复核角色；邮件发送失败时作废未投递验证码；移动端清空生日/任务时段改发显式空值。新增 V1 生命周期集成覆盖。

**2026-08-18**：后端 V1 关版；文档五合一为 PRODUCT-SPEC；前端 WP1–3 完成。

## 环境速查（本机）

```bash
# 后端（planet-api/）
make db-ensure && make migrate-up && make demo   # postgres:///planet，demo 打印 token
make run                                          # :8081
# mobile 联调（mobile/.env 已指向 http://<LAN-IP>:8081）
npx expo start --port 8082                        # 8081 被后端占用
```

⚠️ 本机注意：两个 PG 实例（Go/pgx 走 Unix socket，psql 走 TCP，同名库内容不同）；`planet_dev` 是旧栈遗留库（勿动）；CLI 必须显式 `--url`。

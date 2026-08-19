# 开发进度总览（DEV-PROGRESS）

- 本文件只回答一件事：**现在到哪了、卡在哪**。计划与边界一律见 PRODUCT-SPEC（§3 V1 边界、§6 阶段路线），本文不复述。
- 联动：BACKEND-DESIGN + API-CONTRACT（后端设计）、FRONTEND-V1-PLAN（前端实现设计）、docs/README.md（文档索引）。

## 仓库地图

| 仓库 | 角色 | 状态 |
|---|---|---|
| `planet-api/` | APP 本体后端（Go + PostgreSQL） | **V1 关版**（2026-08-18）：9 迁移、14 模块、~50 集成测试全绿；详见其 ARCHITECTURE.md |
| `mobile/` | APP 前端（Expo/RN，iOS+Android+Web） | 数据层已切契约 v2（WP1–3 ✅）；WP4–6 进行中 |
| `www.joinplanet.pet/` | Landing（营销站，生产运行中）+ lemon-webhook 后端 | 稳定；待新增 `/s/[token]` 分享查看页（WP5）；APP 后端与它零共享 |

> 2026-08-19 起三仓独立（mobile/landing 由 subtree split 拆出，planet-api 移入 workspace），根仓只留文档。

## 前端工作包（FRONTEND-V1-PLAN §7 的执行状态）

| WP | 内容 | 状态 |
|---|---|---|
| WP1 数据层 | 契约 v2 全量对接 + 兼容层 | ✅ 实跑验证 |
| WP2 认证 + onboarding | verify-code / 两步建圈建宠 / join | ✅ 实跑验证 |
| WP3 Today/Timeline/Pet | 409 采用/补记/归档/停药/体重 payload | ✅ 实跑验证（含 2026-08-19 记录体验重构，见日志） |
| WP4 家庭治理 + usage + 转移 | 移交/删家庭引导/转移收件箱/usage 卡（hooks 已备，缺界面） | ⬜ 下一步 |
| WP5 Shares + Web 查看器 | kind/ttl UI + landing `/s/[token]` 页 | ⬜ |
| WP6 全量联调验收 | 双账号剧本 × 全功能 + 真机 + TestFlight | ⬜ |

## 已知问题（2026-08-19）

1. **UI 全英文**——产品面向中文用户，文案语言策略**待 founder 拍板**（唯一阻塞决策）。
2. 动效未系统验证（reanimated/motion token 存在，无逐屏走查）——需真机。
3. 打磨项（不阻塞）：web Escape 不关面板；sheet 关闭后 DOM 残留至下次开关。

已修复存档：web sheet 冻结（useSheetModal 按需挂载）、web Tab 栏掉出折叠线（position:fixed）、时区显示（utc→tz 两步）、照片/文档入口隐藏（ATTACHMENTS_ENABLED=false，B6 翻转即恢复）。

## 变更日志（近期）

**2026-08-19（下午）**：仓库重组为三独立仓 + 文档体系收敛（见 docs/README.md 索引）；完成 Undo 404 修复（complete toast 改用服务端 log id + 空 id 防御）。

**2026-08-19（上午）**：记录体验重构（flomo 式）——quick-record.tsx（sheet + 类型宫格）删除，quick-input.tsx 重写为常驻记录卡（多行输入 + 类型 chips + 上下文扩展 + 内联 Save，全类型乐观插入）；时间线密度修订为"全部有卡"（vaccine/transfer 升大卡，weight/note 紧凑卡）。同轮修复：next_due 字段不匹配、编辑丢到期日、中文回退标题、weight NaN 防护、.env 误指旧后端 8090、queries 死代码清除。验证：tsc clean + DOM 快照 + API 全周期 curl。

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

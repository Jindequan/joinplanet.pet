# 开发进度总览（DEV-PROGRESS）

- 状态：2026-08-18 更新；与 PRODUCT-SPEC（边界）/ BACKEND-DESIGN + API-CONTRACT（后端）/ FRONTEND-V1-PLAN（前端）联动
- 本文件回答"现在到哪了、接下来做什么"，是进度唯一事实来源

## 仓库地图

| 仓库/目录 | 角色 | 状态 |
|---|---|---|
| `/Users/devin/code/planet-api`（独立仓库） | APP 本体后端（Go + PostgreSQL） | **V1 100% 完成并关版**（2026-08-18）：9 迁移、14 模块、~50 集成测试全绿、实机验收；详见其 ARCHITECTURE.md |
| `joinplanet.pet/mobile/` | APP 前端（Expo/RN，iOS+Android） | UI 底子完整（V1.5），但**数据层对接旧契约**——需按 FRONTEND-V1-PLAN 重写 api 层 + 补 6 组新流程界面 |
| `joinplanet.pet/www.joinplanet.pet/` | Landing（营销站，生产运行中） | 稳定；V1 将新增 `/s/[token]` 匿名分享查看页（前端计划 §3） |
| `www.joinplanet.pet/server/lemon-webhook/` | Landing 后端（支付/线索，Go） | 与 APP 后端零共享；**APP 不再使用它**（DEMO-RUNBOOK 旧栈部分作废） |

## V1 完成度

| 能力 | 后端 | 前端 |
|---|---|---|
| 账号（验证码登录/改名/登出/注销） | ✅ | ⬜ 数据层切换 |
| Family（建/邀请/加入/成员管理） | ✅ | ⬜ 数据层切换 |
| 家庭治理（移交/删除+恢复/拥有数配额） | ✅ | ⬜ **新界面** |
| Pet（CRUD/纪念态/转移） | ✅ | CRUD/归档已有 UI；转移 ⬜ 新界面 |
| 健康数据（时间线/用药/档案） | ✅ | ⬜ 数据层切换 |
| 今日协作（任务/幂等完成/补记） | ✅ | ⬜ 数据层切换（409 采用逻辑新增） |
| 分享（care_card/summary/撤销） | ✅ | 创建/列表 UI 已有；对接新契约 ⬜；Web 查看页 ⬜ |
| 配额（数据化限额/usage） | ✅ | ⬜ usage 卡片 + 配额文案驱动 |

**V1 剩余工作 = 前端**，工作分解见 FRONTEND-V1-PLAN §7。

## 队列

- **V1.1**：数据导出（宠物全历史 JSON + 附件清单占位）；mobile 与 planet-api 全量联调验收；TestFlight 内测
- **V2**：图片附件（R2 直传+配额+清理）、锚定付费模型落地（含 plans 多档启用）、guardians/孤儿认领、每日摘要、备份恢复演练
- **V3+**：AI 层（Import/Search/Vet Summary，见 AI 蓝图）、IAP、推送闭环

## 环境速查（本机）

```bash
# 后端（planet-api 仓库）
make db-ensure && make migrate-up && make demo   # postgres:///planet，demo 打印 token
make run                                          # :8081（Makefile 已内置 goproxy.cn）
# mobile 联调
EXPO_PUBLIC_API_BASE=http://<局域网IP>:8081 npx expo start   # 注意 expo 端口用 8082（8081 被占用过）
```

⚠️ 本机注意：两个 PG 实例（Go/pgx 走 Unix socket，psql 走 TCP localhost，同名库内容不同）；`planet_dev` 是旧栈遗留库（勿动、勿用作新栈）；CLI 必须显式 `--url`（空串会被拒绝）。

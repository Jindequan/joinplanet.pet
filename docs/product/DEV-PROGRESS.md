# 开发进度总览（DEV-PROGRESS）

- 状态：2026-08-18 更新；与 PRODUCT-SPEC（边界）/ BACKEND-DESIGN + API-CONTRACT（后端）/ FRONTEND-V1-PLAN（前端）联动
- 本文件回答"现在到哪了、接下来做什么"，是进度唯一事实来源

## 仓库地图

| 仓库/目录 | 角色 | 状态 |
|---|---|---|
| `joinplanet.pet/planet-api/`（独立仓库，2026-08-19 移入 workspace） | APP 本体后端（Go + PostgreSQL） | **V1 100% 完成并关版**（2026-08-18）：9 迁移、14 模块、~50 集成测试全绿、实机验收；详见其 ARCHITECTURE.md |
| `joinplanet.pet/mobile/`（独立仓库，2026-08-19 subtree split 拆出，历史完整） | APP 前端（Expo/RN，iOS+Android+Web） | UI 底子完整（V1.5），但**数据层对接旧契约**——需按 FRONTEND-V1-PLAN 重写 api 层 + 补 6 组新流程界面 |
| `joinplanet.pet/www.joinplanet.pet/`（独立仓库，2026-08-19 subtree split 拆出，历史完整） | Landing（营销站，生产运行中） | 稳定；V1 将新增 `/s/[token]` 匿名分享查看页（前端计划 §3） |
| `www.joinplanet.pet/server/lemon-webhook/`（属 landing 仓） | Landing 后端（支付/线索，Go） | 与 APP 后端零共享；**APP 不再使用它**（DEMO-RUNBOOK 旧栈部分作废） |

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

**V1 剩余工作 = 前端**（FRONTEND-V1-PLAN §7 六个工作包）：

| WP | 内容 | 状态 |
|---|---|---|
| WP1 数据层（types/api/errors/queries 重写） | 契约 v2 全量对接 + 兼容层 | ✅ 浏览器实跑验证 |
| WP2 认证 + onboarding 两步 | verify-code / 建 family→建 pet / join | ✅ 实跑验证 |
| WP3 Today/Timeline/Pet 切换 | 409 采用/补记/归档/停药/体重 payload | ✅ 实跑验证（抓出并修复服务端 done_by_name 丢失） |
| WP4 家庭治理 + usage + 转移界面 | 移交/删家庭引导/转移收件箱（hooks 已备） | ⬜ |
| WP5 Shares 对接 + Web 查看器 | kind/ttl UI + landing /s/[token] 页 | ⬜ |
| WP6 全量联调验收 | 双账号剧本 × 全功能 + 真机 | ⬜ 已知问题清单（2026-08-19 更新）：① ~~web sheet 冻结~~ **已修复**（useSheetModal 按需挂载，5 处面板统一；实测多轮开关后页面可交互）；② UI 全英文（中文产品需拍板文案语言策略）——**待 founder 拍板**；③ ~~照片/文档入口~~ **已隐藏**（flags.ATTACHMENTS_ENABLED=false，B6 翻转即恢复）；④ 动效未系统验证（reanimated/motion token 存在但无逐屏走查）——需真机；⑤ 打磨：web 上 Escape 不关面板、backdrop 点击后 sheet DOM 滑下但残留至下次开关（不阻塞交互，已验证）。时区显示已修复（utc→tz 两步）。

**2026-08-19 记录体验重构（flomo 式）**：quick-record.tsx（BottomSheetModal + 类型宫格 + 表单）整体删除；quick-input.tsx 重写为常驻记录卡——多行输入 + 内联类型 chips（Note/Health/Weight/Visit/Vaccine）+ 上下文扩展（Health→severity、Visit/Vaccine→next_due 自动补杠、Weight→实时 kg 预览）+ 内联 Save；全部类型乐观头插（insertEventIntoMatchingFeeds 按过滤器分发），失败恢复草稿，成功保留类型便于连续录入。同轮修复：web 底部 Tab 栏掉出折叠线（absoluteFill 相对内容盒 → position:fixed 锚定视口 + maxWidth 720 居中，实测 420×900 视口内 y=838 可见可点）；vaccine/vet_visit 的 next_due 在 normalizeEvent 读 due 不匹配（写 next_due 读 due → 到期日从不显示）→ 统一 next_due 并兼容旧 due；normalizeEvent 中文回退标题改英文（症状记录→Health record 等）；编辑疫苗/就诊事件丢 next_due（编辑屏只回传 due 旧字段）→ next_due 保留；weight NaN 防护 + 客户端上限对齐服务端 200kg；queries.ts 死代码清除（useCreateEvent/insertTimelineEvent/useDeleteEvent，feed.ts 版本是唯一实现）；**mobile/.env 曾指向旧 lemon 后端 8090**（下次重启会整体打错 API）→ 改为 planet-api 8081。验证：tsc clean；DOM 快照确认渲染；API 全周期（5 类型 POST/GET/PATCH/DELETE + weight 冗余同步）curl 实测通过。

**2026-08-19 时间线密度修订（founder 反馈：体重/疫苗等无卡片像纯文本）**：§29 密度规则修订为"全部有卡"——vaccine/transfer 升为大卡（badge + 到期日正文 + meta）；weight/note 为紧凑卡（原为无边框纯文本行 → 加 surface + border + radius，与大卡同视觉语言，标题两行）；大/紧凑之分只影响信息量，不再有裸文本行。实测：UI 录入疫苗（大卡 + "Next due 2027-08-19"正文）与体重（紧凑卡）均正确渲染。 |

实跑环境备忘：`CORS_ORIGINS=http://localhost:8082` 起后端；`EXPO_PUBLIC_API_BASE=http://<IP>:8081 EXPO_PUBLIC_WEB_SHARE_BASE=http://localhost:3000 npx expo start --port 8082`。

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

> **2026-08-19 仓库重组**：workspace 改为多仓并列——`mobile/`、`www.joinplanet.pet/` 用 `git subtree split` 拆成独立仓库（各自完整历史），`planet-api/` 从 `~/code/planet-api` 移入；本仓只剩 docs + scripts，根 .gitignore 排除三个子仓。根仓远端 `github.com/Jindequan/joinplanet.pet` 现对应 docs 仓，是否推送/建新远端由 founder 决定。

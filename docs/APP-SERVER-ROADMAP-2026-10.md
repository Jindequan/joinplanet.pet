# APP 端与 Server 能力路线图(2026-10-13,过审后)

> 管理分工(2026-10-13 founder 确认):www/营销线=ZCode 自主直推;APP 端+server=本路线图管辖,按批派工(GLM-5.3-Flash 执行+独立复审门),单向门(提审/发版/服务器物理操作)停等 founder。
> 上游事实源(不推翻):[PRODUCT.md](PRODUCT.md) §3.2(北极星与漏斗口径)/§5.0(MVP 边界)/§8(迭代顺序)、[CARE-COORDINATION-ROADMAP.md](CARE-COORDINATION-ROADMAP.md)(P0/P1 已完成)、[SAAS-PREP-2026-10-01](marketing/SAAS-PREP-2026-10-01.md)(付费/组织层触发条件)。

## 0. 现状基线(2026-10-13 实测)

- 商店 v1.0(2026-10-12 上架)= APP 仓 10-10 HEAD,**已含全部 L1-L158 修复与首审整改**;server 修复已随 push 自动部署在生产运行(healthz 200)。`app.json` 1.1.0 是干净的下一版空位——**无未发布修复积压,无还债批**。
- 六系统 MVP 完整、F1-F8 全现行、协作 P0/P1 闭环、e2e 全绿(2026-10-01,324/0)。
- 生产真实用户验证:**零**。上架前全部验证=本地真实栈+mock e2e+Simulator;DELIVERY-STATUS「真实账号端到端冒烟从未执行」仍成立——**第一批真实用户=第一次生产验证**。

## 1. 过审后的核心判断

产品从「建出来」进入「有人用」。迭代驱动力从**功能完备**换成三件事,能力规划全部服务于此:

1. **看得见用户**——现在第一批真实用户是黑盒:无崩溃/错误上报、无漏斗度量面、GA 只在 landing。§3.2 定义了北极星 WAP 与漏斗口径(100 installs→40 pet→20 task→12 3+days→**8 invite**→5 2weeks)和三个关键服务端事件(第二照顾者邀请率/周完成≥4 天占比/Summary 分享打开率),**只定义了口径,没建度量面**。
2. **接得住用户**——App 内无反馈入口;出问题只有 support@ 邮箱一条暗路。
3. **迭代有退路**——无最低版本机制,v1.0 若出致命 bug 只能求 Apple 加急。

**不做**(红线,防过度规划):付费/Pro 入口(冻结至付费立项)、组织层 schema(SAAS-PREP P9 触发)、AI 能力(V3)、Android 商店发布(有意延后)、社区/媒体库等 PRODUCT §5.0 明确不做清单。

## 2. 能力清单(按域,标注状态)

| 域 | 能力 | 状态 | 批次 |
|---|---|---|---|
| 可观测 | 客户端错误上报(自建,不引第三方) | ❌ 缺 | 批 1 |
| 可观测 | 漏斗与北极星度量面(§3.2 口径落地) | ❌ 缺(口径已定义) | 批 1 |
| 可观测 | 生产 5xx/panic 日聚合进周报 | ❌ 缺 | 批 1 |
| 反馈 | App 内反馈入口(带诊断上下文) | ❌ 缺 | 批 1 |
| 协作 | 通知中心自定义按钮 iOS 真机证据 | ❌ P0 遗留(Simulator 证据已有) | 批 1(founder 手工 10min) |
| 触达 | 邀请/分享深链(Universal Links→App 内落点) | ❌ 缺(现在邀请只落 web) | 批 2 |
| 反馈 | 商店评分引导(系统 API,时机化) | ❌ 缺 | 批 2 |
| 版本工程 | 最低版本闸(soft 提示/必要硬阻断) | ❌ 缺 | 批 2 |
| 触达 | digest 到达/打开度量 | ❌ 缺 | 批 2 |
| 运维 | 备份 timer 安装+恢复演练(L112) | ⚠️ 欠(备份代码全,疑未装 timer) | 持续线(founder 服务器一趟+我验证) |
| 协作 | 通知/摘要/预警全套 | ✅ 已有 | — |
| 商业 | 付费、组织层、AI | 🔒 冻结待触发 | — |

## 3. 迭代批次(载具=App Store 版本,节奏≈周批)

### 批 1 → 版本 1.1:「接住真实用户」(本周)

| # | 任务 | 仓 | 验收 |
|---|---|---|---|
| A1 | 客户端错误上报:server `POST /api/v1/client/errors`(结构化栈+面包屑+设备/版本,per-user 限流,保留 30 天);APP 全局 ErrorBoundary/handler 接入,More 页显示可复制的诊断 ID | 两仓 | 真机触发错误→server 可查;限流与配额测试;不泄敏感信息(栈过滤) |
| A2 | 漏斗度量面:server 聚合(注册→建宠→首任务→首完成→邀请第二照顾者;周完成≥4 天宠物占比;Summary 分享打开率;E5 撞墙账户数),owner-only 端点或 planet-cli 报表 | planet-api | 数字与手写 SQL 对账;进周报模板(DISTRIBUTION-OBSERVABILITY §5 已备行) |
| A3 | App 内反馈入口:More→「Send feedback」mailto support@,预填版本/平台/诊断 ID | APP | 真机点开邮件上下文齐全;五语文案走字典 |
| A4 | 生产 5xx/panic 日聚合:server 日志结构化统计入周报一行(轻量,不引 APM) | planet-api | 周报可见昨日 5xx 计数与 top 路由 |
| A5 | P0 设备证据:通知中心自定义按钮真机验证(TestFlight 构建,锁屏/通知中心三动作) | founder 手工 | 录屏或截图入档;CARE-COORDINATION P0 出口闸门关闭 |

发版链:A1-A4 完→复审门→攒批推送→Xcode Cloud 1.1 build→TestFlight 真机轮(含 A5)→提审。

### 批 2 → 版本 1.2:「喂北极星」(下周,批 1 数据出来后微调)

- B1 邀请/分享深链(Universal Links):邀请链接已装用户直达家庭 join 流程、未装落 landing——直击漏斗「8 invite another caregiver」环节。前置=ASC Associated Domain 配置(founder 一处手工)。
- B2 商店评分引导:`SKStoreReviewController` 系统时机(如第 N 次协作完成后),遵守系统频控,不做自定义弹窗。
- B3 最低版本闸:`/config` 下发 `min_supported_version`,启动检查→过旧软提示/致命 bug 时硬阻断页。
- B4 digest 到达/打开度量(server 侧事件),喂「价值占比」口径。

### 批 3(数据驱动,不预设版本):「价值深化」

按批 1-2 的真实数据裁决优先级,候选:
- C1 外部照护角色受控回写(PRODUCT §8 V2.5:保姆/临时照顾者有限写入——与 B 端分发切口呼应,触发=E4 访谈信号);
- C2 Android 商店发布决策(看 iOS 留存);
- C3 付费立项评估(E5 撞墙趋势+组织试点信号,冻结解除的条件检验)。

### 持续线(不占版本)

- 运维债:备份 timer 安装验证+恢复演练 runbook(L112,与 founder 服务器操作同一趟);R2 版本化/trash 生命周期控制台核对(与 L79 同趟)。
- 每周:周报按 [DISTRIBUTION-OBSERVABILITY](marketing/DISTRIBUTION-OBSERVABILITY.md) 模板跑;DEFECT-LEDGER 新增随批登记。

## 4. 验收与调节

- 每批走既定链:小弟执行(GLM-5.3-Flash)→本体亲核→code-reviewer 复审→攒批推送→构建门(bun run precheck/后端 go test 全量/e2e)→TestFlight 真机轮→单向门(提审)停等 founder。
- 调节:批 1 数据揭示更紧急的修复类问题→修复优先插入,批 2 顺延;真实用户崩溃报告(A1 上线后)直接驱动热修版本。
- 出口判据(Phase 1 原文):漏斗走通到「5 只宠物持续使用 2+ 周」——A2 的度量面就是这句话的判卷人。

## 5. founder 单点配合项(汇总,不阻塞开发)

1. A5 通知按钮真机 10 分钟(TestFlight);2. B1 前置的 ASC Associated Domains 一处配置;3. 备份 timer 服务器一趟(可合并);4. 1.1/1.2 提审点击(走 ASC 网页或授权 API)。

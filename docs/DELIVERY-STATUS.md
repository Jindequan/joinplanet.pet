# PLANET 交付状态

更新时间：2026-09-22

这是一页式交付账本。它只记录已经落到代码、能被命令或运行环境验证的结果；详细决策和历史变更见 [REMEDIATION.md](REMEDIATION.md)。

## 已解决的产品问题

| 用户问题 | 当前实现 | 证据 |
| --- | --- | --- |
| 登录后不知道下一步 | 登录后进入 Today；未完成开通时由 Setup Journey 逐步引导创建 Family、Pet 和第一项照护 | `APP/src/features/today/setup-journey.tsx`；`APP/e2e` 核心流程 |
| Today 信息过载 | 请求收件箱独立为 Requests；Today 的次要照护工具和替代动作默认收起 | `APP/src/features/today/screen.tsx`；前端产品契约 |
| 多人照护责任不清 | 请求中心、接手、拒绝、转交、批量交班和责任链状态统一回到原照护事项 | `APP/src/features/care-requests/`、`APP/src/features/handoffs/`；协同验收 |
| 网络抖动导致重复操作 | 关键写入使用事务和 `Idempotency-Key`；前端在失败或丢响应时保留同一意图的请求键 | `APP/src/core/extension/`、`planet-api` handlers/services；API walkthrough |
| 删除或退出误操作 | 删除账户、Family、Pet、计划、用药、分享和退出设备均有明确后果确认；失败时保留恢复路径 | 各 feature `ConfirmDialog`；前端契约 |
| 恢复误删家庭时可能重复提交 | 已删除家庭列表按家庭复用同一恢复请求键，丢响应后重试不会生成第二次恢复意图 | `APP/src/features/settings/deleted-families-screen.tsx`；前端契约 |
| 修改默认家庭/宠物时可能重复写入 | 设置页按完整偏好意图复用同一请求键，服务端确认后才允许下一次意图生成新键 | `APP/src/features/settings/screen.tsx`；前端契约 |
| Today 成功提示可能早于清单刷新 | 调整一次安排、替代事项和临时照护都先重新读取 Today，刷新失败时保留弹层并允许重试 | `APP/src/features/today/schedule-adjustment.tsx`、`temporary-care.tsx`；Today E2E |
| 宠物档案保存后页面可能先跳走 | 档案写入后先重新读取宠物权威记录；读取失败时保留编辑上下文，不提前导航 | `APP/src/features/pets/edit-screen.tsx`；前端产品契约 |
| 用药保存/停用/删除后列表可能仍是旧数据 | 所有用药写入先刷新权威用药历史，再关闭弹层、确认完成或提示成功；刷新失败可在原上下文重试 | `APP/src/features/pets/medications-section.tsx`；前端产品契约 |
| 照护计划保存/状态变更后 Today 可能仍显示旧计划 | 计划新增、编辑、暂停/恢复、删除先重新读取权威计划，再关闭弹层或路由；失败时保留操作上下文 | `APP/src/features/pets/care-section.tsx`；前端产品契约 |
| 宠物归档/删除后页面可能先跳转 | 生命周期写入后先重新读取宠物详情或可见宠物列表；回读失败时确认框保持打开 | `APP/src/features/pets/detail-screen.tsx`；前端产品契约 |
| 家庭治理写入刷新失败时可能丢失重试上下文 | 家庭删除/退出、成员移除、角色切换和宠物关联解除均等待权威列表回读，成功后才清理确认和请求键 | `APP/src/features/families/detail-screen.tsx`；前端产品契约 |
| 时间线写入后可能显示旧记录或在刷新失败时重复入队 | 新增/编辑/删除先回读权威时间线；仅服务端写入本身失败才进入离线队列，回读失败不会再创建第二条记录 | `APP/src/features/timeline/composer.tsx`、`screen.tsx`；前端产品契约 |
| Today 完成、撤销或“我来做”后可能先提示成功但清单仍是旧状态 | 三个主动作均等待当前 Today 权威回读；回读失败时保留同一幂等键，原地显示同步错误并提供重试，不会重复入队 | `APP/src/features/today/screen.tsx`；前端产品契约 |
| 通知兜底卡完成接手/拒绝后可能先关闭或跳转 | 单项和批量通知动作均等待请求收件箱权威回读；回读失败保留通知卡和同一幂等键，不提前跳转或伪造成功 | `APP/src/features/care-requests/incoming-request-toast.tsx`；前端产品契约 |
| 请求中心写入后可能仍显示旧状态 | 单项请求创建、请求接手/拒绝、批量交班创建与响应均等待请求、批量和责任链权威回读；回读失败保留原操作与幂等键 | `APP/src/features/care-requests/panel.tsx`、`batch-panel.tsx`；前端产品契约 |
| 值班负责人或风险卡写入后可能先显示旧责任状态 | 接手/释放和风险卡“我来做”均回读负责人、风险、Today 与时间线相关查询；失败时保留同一请求键并提供原地重试 | `APP/src/features/handoffs/handoff-strip.tsx`、`APP/src/features/collaboration/`；前端产品契约 |
| 转移确认完成后可能因列表刷新失败丢失重试键 | 转移动作只有在权威列表回读成功后才清理幂等键；已有列表刷新失败显示过期提示和“重试更新” | `APP/src/features/families/transfers-screen.tsx`、`stale-data-notice.tsx`；前端产品契约 |
| 刷新失败可能把已有页面替换成整页错误态或静默显示旧数据 | 时间线、分享、转移、照护计划、用药和通知设置在已有数据时保留当前页面，同时显示过期提示和“重试更新”；仅首次无数据加载才使用整页错误态 | `APP/src/ui/components/stale-data-notice.tsx`、多个 feature screen；前端产品契约 |
| 状态反馈不完整 | 核心页面有加载、成功、失败、空数据状态；局部失败提供重试，不能把网络错误伪装成空数据 | `LoadingState`、`QueryErrorState`、各页面错误态；契约检查 |
| 移动端容易误触或看不懂 | 关键操作达到 44pt 触控目标；按钮、忙碌、告警和通知开关带可访问语义；动效尊重 reduced motion | `APP/src/ui/`；契约检查；Simulator 截图 |
| 测试时误连真机或开一堆服务 | 本地入口固定 Simulator-only；`verify:local` 只复用 8081 API 和 8082 Metro，不启动额外服务 | `scripts/dev.sh`、`scripts/ios.sh`、`scripts/test-local.sh` |

## 当前可验证结果

- API 回归：`26/26`。
- 业务 walkthrough：`60/60`，覆盖认证、Family/Pet、照护计划、Today、Timeline、用药、分享撤销、授权撤销和删除保护。
- Phase A 真实本地闭环：登录 → Family → Pet → Care Plan → Today → 完成 → Timeline 自动事件 → All 范围，脚本通过。
- 前端产品契约：`64/64`（2026-09-22 复跑，0 FAIL）。
- Playwright 回归（core-flows）：mobile390 + desktop1280 共 158 次执行，其中 157 通过、1 个按项目条件跳过（历史记录见 `APP/docs/UX-SPEC.md` 2026-09-22 条目；mock API 口径）。
- Playwright zhSmoke：`12` 个 i18n 冒烟用例（`--list` 口径）。
- TypeScript：通过。
- ESLint：通过。
- Web 导出：`npm run export:web:production` 成功生成 `APP/dist`。
- 生产部署：2026-09-22 `deploy-app-web.sh` 上传 READY（`dpl_CSiMmYgN2V89npPqKaAeDL3o66FH`），线上 Web 与本地构建 entry hash 一致（`entry-d794123353225764e67d94dec822405a.js`）。
- 生产 smoke：`production-smoke.sh` 全部公共入口通过；`api.joinplanet.pet/readyz`、`/healthz`、`/progress` 均 200，auth methods 返回 apple=true/email=false，登录路由 410 EMAIL_LOGIN_DISABLED 且 CORS 允许 `app.joinplanet.pet`。
- 本地总入口：`cd APP && npm run verify:local` 通过，且没有启动额外服务。
- 运行时：API `127.0.0.1:8081` 健康/就绪；Metro `127.0.0.1:8082` 正常；Simulator `PlanetBuildCheck` 已启动 `pet.joinplanet.app`。

## 明确未完成

- iOS 系统通知中心的自定义按钮仍未完成可操作 UI 证据；当前只有原生 action 注册、推送送达和业务 ID 回读证据。通知点击应用内兜底路径已实现。
- 本轮未把“世界第一”作为完成标准；视觉和交互已有统一基线，但真实用户研究、可用性实验和多轮外部测试尚未发生。
- 真实账号端到端冒烟尚未执行：`production-smoke.sh` 只验证公共入口，前端 e2e 仍是 Playwright mock API；线上可用性不等于真实业务全链路已验证。

## 本地测试入口

1. 打开已启动的 `PlanetBuildCheck` Simulator，运行 `pet.joinplanet.app`。
2. 登录邮箱：`simulator.test@planet.dev`。
3. 获取当前开发验证码（响应中的 `dev_code`）：

   ```bash
   curl -fsS -X POST http://127.0.0.1:8081/api/v1/auth/request-code \
     -H 'Content-Type: application/json' \
     -d '{"email":"simulator.test@planet.dev"}'
   ```

4. 需要重启或核对运行时只执行：

   ```bash
   ./scripts/dev.sh status
   ```

不会安装实体手机，也不会额外打开 Web、Metro 或 API 实例。

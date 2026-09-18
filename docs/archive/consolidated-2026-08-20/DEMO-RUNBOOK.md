# PLANET App 本地运行手册（V1 新栈）

> 2026-08-18 版。栈 = planet-api（独立仓库）+ Expo App。旧栈手册见 docs/archive/DEMO-RUNBOOK-legacy-stack.md。

## 0. 前置（一次性）

```bash
cd /Users/devin/code/joinplanet.pet/planet-api
make db-ensure && make migrate-up    # postgres:///planet（peer 认证，无需密码）
```

## 1. 推荐：用开发控制器管理前后端

从仓库根目录执行：

```bash
./scripts/dev.sh start all web       # 后端 + Web Expo
./scripts/dev.sh start backend       # 只起 API
./scripts/dev.sh start frontend web  # 只起 Web
./scripts/dev.sh start frontend device # 真机 Expo Go（同一局域网）
./scripts/dev.sh status
./scripts/dev.sh logs backend        # Ctrl-C 退出日志查看，不停止服务
./scripts/dev.sh stop frontend
./scripts/dev.sh stop backend
./scripts/dev.sh stop all
```

控制器会自动等待 `healthz`，记录 PID 和日志到被忽略的 `.dev/`；前后端可以独立重启。旧命令仍可用：`./scripts/dev-app.sh web|device`。

## 2. 手动起后端（终端 1）

```bash
cd /Users/devin/code/joinplanet.pet/planet-api
PLANET_ENV=dev DEV_AUTH_CODES=1 make run     # :8081
curl localhost:8081/readyz                    # → ready
```

- `DEV_AUTH_CODES=1`：验证码直接回显在 `request-code` 响应的 `dev_code`（生产禁用，启动即拒）。
- 播种演示数据（Milo 全套 + 可用 token）：

```bash
make demo    # 打印 email/token 与 curl 示例；幂等可重复跑
```

- 运维：`planet-cli migrate status|up|down`、`plans list|set`（配额热调）、`purge-deleted --dry-run`。

## 3. 手动起 App（终端 2）

```bash
cd mobile
npx expo start --port 8082
# 本机 Web / Simulator 默认使用 mobile/.env 的 http://localhost:8081
# 手机 Expo Go 扫码时，改用本机局域网 IP：
EXPO_PUBLIC_API_BASE=http://<局域网IP>:8081 npx expo start --port 8082
# 同时确保 planet-api 监听 0.0.0.0:8081（默认 :8081 即可）
```

> mobile 数据层已切换至 planet-api 契约 v2（2026-08-19，WP1–3 完成）；剩余界面（治理/转移/分享查看器）见 FRONTEND-V1-PLAN 与 DEV-PROGRESS。

## 4. 快速冒烟（对后端）

```bash
TOK=<make demo 打印的 token>
curl -H "Authorization: Bearer $TOK" localhost:8081/api/v1/me
CIRCLE=<上一步 circles[0].id>
curl -H "Authorization: Bearer $TOK" "localhost:8081/api/v1/circles/$CIRCLE/today"
```

## 5. ⚠️ 本机陷阱

- 两个 PG 实例：Go 工具链走 Unix socket；psql 默认走 TCP localhost——同名库内容不同。操作后端库用 planet-cli，别用 psql 猜。
- `planet_dev` 是旧栈库，新栈勿用。
- planet-cli 必须显式 `--url`（空连接串会被拒绝，不会回退默认库）。

## TestFlight 交付（founder 操作，配置已就绪）

```bash
cd mobile
npx eas login                      # founder 的 Expo 账号
npx eas build --platform ios --profile production
# 首次会引导：登录 Apple Developer（需付费账号）、注册 bundle id pet.joinplanet.app
npx eas submit --platform ios      # 构建完成后提交 TestFlight
```

- eas.json 三档 profile 已配好（development/preview/production）；图标、bundle ID（iOS `pet.joinplanet.app` / Android 同名）齐备。
- Android 内测可走 `--profile preview`（APK，直接发安装包）。
- 本地 Web 验证：`npx expo start --port 8082`（.env 指向 planet-api 8081）。
- 移动端 API 配置模板：`mobile/.env.example`；若看到 `ERR_CONNECTION_REFUSED`，先访问 `http://localhost:8081/healthz`，再检查 API 是否已启动。

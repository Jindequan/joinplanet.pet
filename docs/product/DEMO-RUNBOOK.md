# PLANET App 本地运行手册（V1 新栈）

> 2026-08-18 版。栈 = planet-api（独立仓库）+ Expo App。旧栈手册见 docs/archive/DEMO-RUNBOOK-legacy-stack.md。

## 0. 前置（一次性）

```bash
cd /Users/devin/code/joinplanet.pet/planet-api
make db-ensure && make migrate-up    # postgres:///planet（peer 认证，无需密码）
```

## 1. 起后端（终端 1）

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

## 2. 起 App（终端 2）

```bash
cd mobile
EXPO_PUBLIC_API_BASE=http://<局域网IP>:8081 npx expo start --port 8082
# 手机 Expo Go 扫码（exp://<IP>:8082）；Web 调试 http://localhost:8082
```

> mobile 数据层已切换至 planet-api 契约 v2（2026-08-19，WP1–3 完成）；剩余界面（治理/转移/分享查看器）见 FRONTEND-V1-PLAN 与 DEV-PROGRESS。

## 3. 快速冒烟（对后端）

```bash
TOK=<make demo 打印的 token>
curl -H "Authorization: Bearer $TOK" localhost:8081/api/v1/me
CIRCLE=<上一步 circles[0].id>
curl -H "Authorization: Bearer $TOK" "localhost:8081/api/v1/circles/$CIRCLE/today"
```

## 4. ⚠️ 本机陷阱

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

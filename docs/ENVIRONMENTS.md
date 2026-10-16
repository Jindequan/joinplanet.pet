# 环境矩阵(ENVIRONMENTS)

> **为什么要有它**(2026-10-16 实锤):dev 构建把分享链接指到生产域名
> (APP/.env 遗留 `EXPO_PUBLIC_PUBLIC_WEB_BASE_URL=生产` + config 无 dev 分支),
> founder 实测「刚创建就过期」。环境事实此前散落在 .env.example 注释与代码默认值里,
> 无单一对照表。凡携带外部 URL 的新功能,dev/prod 两行必须同批补齐。

## API / Web 基址

| 环境 | API 基址 | Web(分享/深链)基址 | 备注 |
|------|----------|---------------------|------|
| 本地 dev(App) | `http://127.0.0.1:8081/api/v1`(模拟器按 hostUri 自动换 LAN IP) | `http://127.0.0.1:5173`(config.ts `runtimePublicWebBaseUrl` 的 `__DEV__` 分支) | Metro web=8082(scripts/dev-app.sh);5173 为另一启动形态端口,勿混 |
| 本地 dev(Web) | 同上 | — | Expo Web 走 `http://localhost:8082` |
| 生产 iOS | `https://api.joinplanet.pet/api/v1` | `https://www.joinplanet.pet` | Caddy 同域分流:/api/v1→planet-api:8081,/checkout→landing:8082 |
| 生产 Web | 同上 | — | app.joinplanet.pet(Apple-only 形态,prebuilt 部署) |

## EXPO_PUBLIC_* 取值矩阵(APP)

| 变量 | dev | 生产 | 说明 |
|------|-----|------|------|
| `EXPO_PUBLIC_API_BASE_URL` | 不设(走 runtime 推导) | CI/export 时设生产值 | 不设时 config.ts 按 hostUri/dev 分支推导 |
| `EXPO_PUBLIC_PUBLIC_WEB_BASE_URL` | **不设**(dev 走 127.0.0.1 分支) | `https://www.joinplanet.pet` | **禁止写进 .env 当全局默认**(2026-10-16 事故根因);.env.example 不再预填生产值 |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | 本地可不设 | TestFlight/EAS 构建必须 | 推送注册用 |
| `EXPO_PUBLIC_ENABLE_PREVIEW` | `true`(需要时) | 不设 | 预览通道 |

## 服务端开关(planet-api)

| 开关 | dev | 生产 | 说明 |
|------|-----|------|------|
| `PLANET_ENV` | `dev` | `prod` | DevPushSender(静默) vs APNsSender |
| `EMAIL_LOGIN` | 开 | 关(生产 Apple-only) | 客户端按 `/auth/methods` 声明渲染,不硬猜 |
| `BILLING_APPLE_KEY_ISSUER/KEY_ID/KEY_PATH` | 不设=订阅面关(verify 503/notify 503) | 设=JWS 验签开 | 未配置时 billing 端点诚实报不可用 |
| APNs 凭据 | — | `~/.planet-secrets/AuthKey_AU635UB384.p8`(kid AU635UB384) | **与 ASC API key(kid 7D2L694J82,~/secret/)是两把,混用即 401** |

## 对称性铁律

客户端运行时分支(config.ts 的 `__DEV__` 推导)必须与服务端环境开关一一对应:
服务端开 EMAIL_LOGIN 的环境,客户端必须能到达邮箱登录;服务端关的环境,客户端
不得渲染邮箱入口(以 `/auth/methods` 为准)。新增任何带 URL/开关的功能,先在本表
登记两环境取值,再写代码。

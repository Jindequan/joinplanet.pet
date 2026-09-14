# planet-api

PLANET APP 本体后端（Shared Pet Care System）。独立仓库，与 landing page 后端
（joinplanet.pet 仓库内的 lemon-webhook）**零共享**：分库、分角色、分进程。

跨仓技术事实来源：[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)。
本文件只保留后端仓库的运行命令和本地操作，不重复定义领域模型、表结构或 API。

## 快速开始（本地 macOS，本机 PostgreSQL 17）

```bash
make tidy
make db-ensure          # 创建 planet 数据库
make migrate-up         # 版本化迁移（planet-cli, 见下）
make demo               # 播种演示数据，打印登录 token 与 curl 示例
make run                # 启动 API (默认 :8081)
```

`migrations/0001_initial.up.sql` 是当前唯一的完整 schema baseline：每张表只在一个
`CREATE TABLE` 中声明最终字段，计划与 quota seed 也在同一 baseline 中。开发环境需要
重建本机 `planet` 数据库时执行：

```bash
dropdb planet
createdb planet
make migrate-up
```

生产环境不执行 `dropdb` 或 migration down；schema 回滚统一使用经过验证的
备份恢复。

配置（环境变量，缺省适配本地开发；生产见 deploy/）：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | 应用连接串（生产使用无 DDL 权限的 `planet_app` 角色） |
| `BIND` | 监听地址，默认 `:8081` |
| `DEV_AUTH_CODES` | `1` 时验证码回显在响应/日志（仅开发） |
| `RESEND_API_KEY` | 邮件发送；缺省用开发 Sender（只打日志） |
| `CORS_ORIGINS` | 逗号分隔允许来源 |
| `LOG_LEVEL` | debug/info/warn |

发布后先验证 `GET /healthz` 返回 `{"status":"ok"}`，再验证 `GET /readyz` 返回 200
（数据库迁移已对齐）；最后用空邮箱请求 `POST /api/v1/auth/request-code`，应得到
`400 + VALIDATION_FAILED` 和正确的 App CORS 头。根目录的
`scripts/production-smoke.sh` 会自动执行这组入口检查。

仓库提供手动 GitHub Actions 工作流 `deploy backend`（`.github/workflows/backend-deploy.yml`）。
执行前需在 production environment 配置以下 Secrets：SSH 凭据
`PLANET_SSH_HOST`、`PLANET_SSH_USER`、`PLANET_SSH_PRIVATE_KEY`、
`PLANET_SSH_KNOWN_HOSTS`，以及运行时配置
`PLANET_APP_DATABASE_URL`、`PLANET_OWNER_PASSWORD`、`PLANET_RESEND_API_KEY`、
`PLANET_BACKUP_DIR`、`PLANET_BACKUP_S3_URI`。工作流会在远程主机上以 0600 权限生成
`/etc/planet-api.env` 和 `/etc/planet-api-owner.env`，不会把值写入仓库；缺少任一密钥时
会在远程写入前停止。服务器仍需预先安装 PostgreSQL、systemd 和 Caddy，部署脚本会按
服务器架构选择 amd64/arm64 二进制，并在健康或登录门禁失败时回滚。

`deploy/deploy.sh` 会同时构建 Linux `amd64` 与 `arm64` 静态二进制，上传后按目标机
`uname -m` 选择正确架构；未知架构直接失败，避免把错误平台的文件装入生产环境。
部署时还会备份并校验 `/etc/caddy/Caddyfile`：`/api/v1/*`、`/healthz`、`/readyz` 反代到
`127.0.0.1:8081`，Landing 的 `/checkout`、`/progress`、`/webhook` 等路径继续反代到
`127.0.0.1:8080`；Caddy 校验或服务健康门失败会恢复旧反代配置，避免旧 landing backend
继续返回健康但不存在 App 路由，也避免切换 App 时破坏支付回调。

## 常用命令（planet-cli）

```bash
planet-cli migrate up|down N|status --url ...
planet-cli db-ensure --admin-url <admin> --db planet
planet-cli demo-seed --url ...
planet-cli plans list --url ...                          # 查看当前限额
planet-cli plans set free --pets 3 --members 2 --url ... # 改限额（数据级，立即生效，无需发版）
```

> 套餐限额存于数据库 `plans` 表（migration 播种）——调整策略改数据即可；
> 新增档位 = 插一行 + 发对应权益 key，零代码变更。代码内 `DefaultPlans` 仅缺行兜底。

## 测试

```bash
make vet
make test-integration   # 需要本机 PG；空库自动建库→迁移→跑用例→回滚迁移→再迁移
```

集成测试全部跑在真实 PostgreSQL 上（SQL 不允许只测 mock），并覆盖并发
（同任务并发完成、配额并发创建）与权限负例（非成员 404、越权 403、归档宠写 409）。

创建型 POST 必须携带 `Idempotency-Key`（8–200 字符，幂等窗口 24 小时）。宠物、照护计划、用药、时间线、分享和 Family 创建会在同一事务内绑定请求与资源，网络重试不会重复创建。邀请码和分享 token 只在首次成功响应中返回，重复使用同一 key 不会轮换秘密。

## 目录

```
cmd/planet-api          HTTP 服务入口
cmd/planet-cli          迁移/建库/演示数据 CLI
internal/platform/      横切设施：config/db/httpx/email/clockx
internal/contracts/     跨模块共享领域类型与接口（依赖规则的关键）
internal/modules/       业务模块：identity/families/pets/meds/timeline/tasks/...
internal/app/           组装路由与中间件（唯一允许 import 全部模块的位置）
migrations/             单一完整 schema baseline（embed；0001_initial）
test/integration/       集成测试（真 PG + httptest 全栈）
deploy/                 systemd/Caddy/PG 调优/双角色 SQL/部署脚本
```

架构、表职责、权限、照护闭环和客户端契约不要写在本 README；统一回到
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)。

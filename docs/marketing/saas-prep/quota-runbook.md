# 配额热调 Runbook — 给组织 owner 开试点档(org_pilot)

用途:SAAS-PREP §P4。给某救援组织 owner 调到试点档:起步 20 活跃宠物 / 10 成员(SAAS-PREP §3.2 建议值)。**命令名以 planet-api 源码为准**(cmd/planet-cli/plans.go、entitlements.go,2026-10-13 核对)。
数字策略(SAAS-PREP §5.4):**不改 free 档全局数字**(那是 C 端后门),新建 org_pilot 档 + 只对该 owner `entitlements grant`。

## 前置(读一遍再动手)

- 生产写权在 `planet_owner` 角色;`planet_app` 对 plans/entitlements 只读 → owner DSN 走 `DATABASE_URL` 环境变量,**不落 argv**(防 shell history / 进程列表捕获)。
- BestKey 排序:`'*' > founder > premium > pro > 其他key(60)`——若该 owner 已有 pro/founding 权益,org_pilot 不会生效,grant 前先确认其当前是 free。
- 成员上限按**家庭 owner 的档位**判定;宠物/存储按**创建者本人**判定 → grant 只需发给组织 owner 一人。

## 操作序列(英文命令,依序执行)

```bash
# 0) 连上 prod(owner 角色,env 方式)
export DATABASE_URL="host=... user=planet_owner dbname=planet ..."

# 1) 现状盘点:确认 free 档数字未被改动 + org_pilot 是否已存在
planet-cli plans list

# 2) 建试点档(新 key 首次会以 free 默认值插行,再应用本次覆盖;storage 建议值 500MB,可调)
planet-cli plans set org_pilot --families 1 --members 10 --pets 20 --storage-mb 500 --file-mb 10

# 3) 发放给组织 owner(months=0 永久;写 3 = 三个月试点期,到期权益自动失效)
planet-cli entitlements grant --user owner@rescue.org --plan org_pilot --months 3

# 4) 验证
planet-cli plans list                 # org_pilot 行数字正确;free 行原样
planet-cli entitlements grant --user owner@rescue.org --plan org_pilot   # 误操作双发也无害:insert/extend 顺延
#   端侧验证:让 owner 打开 App「账户 › 用量」(GET /me/usage),看 active pets 上限=20;再试建第 3 只宠物应成功
```

## 回滚(试点结束 / 冒用回收)

```bash
# 1) 收权益(软删 deleted_at,立即反映到 /me/usage;幂等,重复执行不报错)
planet-cli entitlements revoke --user owner@rescue.org --plan org_pilot
#   冒用嫌疑时收该用户全部手动权益:省略 --plan 即可(只动 entitlements,不动 subscriptions)

# 2) org_pilot 行可留在库里(没人持有即无效果);若确要收数字,改回 free 同值
planet-cli plans set org_pilot --families 1 --members 2 --pets 2 --storage-mb 50 --file-mb 10

# 3) 端侧复核:owner 的用量页回到 free(2 宠/2 成员);存量数据只读不受影响
```

## 注意

- 降档/超额**只挡新增写入**,存量读/编辑/删除/导出永远不受影响(PRODUCT.md §5.0)。
- `plans set` 新写立即生效;`ai_monthly` 走 quota_configs(MVP 无 AI 用量,一般不动)。
- revoke 链路现状用本 runbook 替代(QUOTA-SYSTEM-DESIGN Q6 遗留,P9 时一并补)。

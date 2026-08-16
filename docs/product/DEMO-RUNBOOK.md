# PLANET App 本地运行手册（演示栈）

> 2026-08-17 夜间冲刺产物。三个终端起完整栈：Postgres + Go API + Expo App。

## 0. 前置（一次性）

```bash
brew services start postgresql@17        # 本机已在跑可跳过
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
createdb planet_dev
cd www.joinplanet.pet/server/lemon-webhook
psql planet_dev -f schema.sql            # 支付域 4 表（幂等）
psql planet_dev -f schema-app.sql        # App 域 14 表（幂等）
```

## 1. 起 Go API（终端 1）

```bash
cd www.joinplanet.pet/server/lemon-webhook
DATABASE_URL="postgres://devin@localhost:5432/planet_dev?sslmode=disable" \
PORT=8080 AUTH_DEV_MODE=1 go run .
# 看到 "PLANET backend listening on :8080"
```

- `AUTH_DEV_MODE=1`：登录验证码直接出现在 API 响应的 `dev_code` 和服务端 stderr——无邮件基建也能登录（App 的验证码屏会灰字显示）。
- 验收：`bash scripts/api-walkthrough.sh`（22 项全链路断言）。

## 2. 起 App（终端 2，手机 Expo Go 扫码）

```bash
cd mobile
npm install                               # 首次
npx expo start
# 手机装 Expo Go → 扫终端二维码（手机与电脑同一 Wi-Fi）
```

- API 地址取自 `mobile/.env` 的 `EXPO_PUBLIC_API_BASE=http://localhost:8080`。
  真机上 localhost 不可达：改成电脑局域网 IP（如 `http://192.168.1.x:8080`），
  并让 Go 监听 `PORT=8080`（默认全接口）。
- 演示数据已备：邮箱 `devin@planet.dev` 登录即见 Milo（金毛/过敏/用药/4 任务/时间线 5 事件）。
- 公开页演示链接（浏览器直接开）：
  - 就诊摘要：`http://localhost:8080/s/200b49916a49b5b168eefc56`
  - Care Card：`http://localhost:8080/s/2a147c154f956d0f9be1d7e7`
  （过期就重跑 `bash /tmp/seed-demo.sh` 生成新链接——脚本会打印新 URL）

## 3. 演示动线（5 分钟讲完产品）

1. 验证码登录（dev code 自动显示）→ Milo 的 Today；
2. 点一个任务 → 乐观完成 + Undo toast → 右滑 Skip；
3. Timeline 聚焦输入一句话回车 → 5 秒记录；＋号 → Symptom/Weight/Photo；
4. Pet → 用药 → 停药（时间线自动出现 Stopped）；
5. Pet → Prepare for vet → 勾选 → 预览 → 创建私有链接 → **用浏览器打开**（兽医视角）；
6. Share care → Care Card 链接 → 浏览器打开（保姆视角，病史不可见）；
7. Pet → Data → Export（全量 JSON）→ Delete（级联删除，数据生命周期闭环）。

## 4. 已知边界（演示口径）

- 邮件/推送/真实存储（Resend/R2）未接——验证码走 dev 模式、附件存服务端 `./uploads/`，均为契约内可插拔点；
- Today 的"分享卡片"是文本清单版（图形卡片需 react-native-view-shot，代码留 TODO）；
- App Store 分发需 Apple Developer 账号（US$99/年），现阶段 Expo Go 即可全功能演示；
- 删除宠物后 `./uploads/` 物理文件保留（随机 key 不可猜，无泄露面）。

## 5. 质量门（本冲刺的验收证据）

- Go：`go build/vet/test` 全绿（auth 7 单测）；
- API：`api-walkthrough.sh` 22/22（认证→建宠→用药→任务→时间线→分享→公开页→导出→级联删除）；
- 前端：`tsc --noEmit` 0 错误；`expo export` iOS + Android 双端打包成功（3339 模块）。

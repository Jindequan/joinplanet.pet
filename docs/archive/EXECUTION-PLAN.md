# Phase 1 执行计划（2026-08-17 夜间冲刺）

> 目标：明晨交付可运行的完整 App（Expo iOS/Android 一套代码）+ Go API + 本地演示环境。
> 方法：契约先行（[API-CONTRACT](API-CONTRACT.md)），多 agent 按模块并行，最后人工集成验证。
> 环境降级决策（演示期）：无 Resend → 验证码开发模式直返（AUTH_DEV_MODE）；无 R2 → 附件存服务端本地 ./uploads 随机 key；分发走 Expo Go。均为契约内可插拔点，生产替换不动业务代码。

## 迭代与任务拆分

| 迭代 | 内容 | 执行者 | 状态 |
|---|---|---|---|
| I0 契约与骨架 | API 契约、schema-app.sql（14 表）、api.go 中间件+模块注册、Expo 脚手架+依赖、本地 planet_dev 库 | 主线 | ✅ |
| I1 后端四路 | A1 auth+entitlements（auth.go/entitlement.go+webhook 补授）· A2 circle/pet/medication（circle.go/pet.go）· A3 tasks/timeline/attachments（tasks.go/timeline.go/files.go）· A4 shares+公开页+数据生命周期（share.go/share_pages.go/data.go） | 4 agents 并行 | 🔄 |
| I2 前端地基 | B1 theme/api client/queries/设计系统组件/Tab 外壳/QuickRecord 抽屉 · B2 welcome 认证屏+邀请深链 | agent / agent | 🔄/待发 |
| I3 核心屏 | C1 Today（Hero+daypart+乐观完成+Share image）· C2 Timeline（快速输入/筛选/大小卡/游标分页/详情）· C3 Pet 总览+五二级页 | 3 agents 并行 | 待 B1 |
| I4 高价值流 | D1 Prepare-for-vet 三步流+Care Card 创建+链接管理 · D2 数据生命周期（导出/删除）+空状态/骨架打磨 | 2 agents 并行 | 待 |
| I5 集成验证 | go build/vet/test 全绿 · tsc 零错 · planet_dev 全链路 curl 走查（认证→建宠→任务→记录→分享→公开页→导出→删除）· 修复 · 运行手册 | 主线 | 待 |

## 明晨验收清单（对照用户要求）

1. **完整**：F1–F8 全部可用（认证/圈子/档案+用药/今日/时间线+照片/就诊摘要/CareCard/导出删除）；
2. **漂亮**：UI spec 蓝白 token 落地，三屏+公开页视觉完整；
3. **流畅**：乐观更新+Undo、骨架屏、空状态教学、Haptics、60fps 动效；
4. **完整数据生命周期**：创建→编辑→撤回→导出→删除 全链路可演示；
5. 可运行：`docker-less` 本地栈一行命令起（PG 已备 planet_dev + go run + Expo Go 扫码）。

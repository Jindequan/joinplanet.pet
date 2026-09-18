# 前端 V1 实现设计（FRONTEND-V1-PLAN）

- 状态：v2，2026-08-19（WP1–5 已实施完毕，本文继续指导 WP6 真机/双账号验收；执行状态见 DEV-PROGRESS）
- 输入：API-CONTRACT v2（已与 planet-api 实现对齐）、PRODUCT-SPEC §3（V1 边界冻结）、APP-UI-SPEC-V1/LAYOUTS（UI 层不变）
- 目标：保留 UI 骨架，数据层已切换至契约 v2；**剩余：全量双账号/真机验收**；一切设计为后续迭代（V1.1 导出增强、V2 附件/付费、V3 AI）留缝

---

## 1. 分层架构（兼容与扩展的根基）

```text
screens（app/** 现有路由）        只调 hooks，禁止直接 fetch
   ↓
hooks/（react-query，query-client.ts 已在用）   缓存 · 失效 · 乐观更新
   ↓
api client（src/lib/api.ts 重写）  唯一网络出口；DTO = API-CONTRACT v2
   ↓
planet-api  /api/v1
```

**四条铁律**（写进 code review 清单）：

1. **解释权在服务端**：Today 的排程展开、配额档位、事件类型合法性都是服务端算好的——客户端只渲染，不复制业务规则。未来 schedule v2 / AI 事件 / plans 改表，**前端零改动跟随**。
2. **宽容解析**：DTO 解析忽略未知字段（JSON 直解，不 strict）；未知错误码降级为通用提示。服务端契约"只增不改"，客户端必须配得上这个策略。
3. **错误单点**：`err.code → 中文文案` 映射表 + fallback；401 全局拦截 → 清 session → 回 welcome。
4. **数据驱动 UI**：配额/档位展示只读 `/usage` 与错误里的 `usage` 载荷，**界面不写死任何数字**（后端 plans 表热改，前端自动跟随）。

## 2. API client 重写要点

现有 `api.ts` 指向旧契约（localhost:8080）。重写为：

```ts
// src/lib/api.ts
request<T>(method, path, body?) → Promise<T>          // 2xx 返回 data
// 非 2xx 抛 ApiError{code, message, extra?, log?, usage?}
//   TASK_LOG_EXISTS.extra.log → 上层静默采用（见 §3 Today）
//   QUOTA_*.extra.usage      → 直接驱动配额文案
```

**旧→新契约差异表**（数据层切换的全部范围）：

| 旧（lemon-webhook） | 新（planet-api） | 前端动作 |
|---|---|---|
| `POST /auth/verify` | `POST /auth/verify-code` | 改名 |
| `GET /me` 内嵌 circles+pets | `/me` 精简 + `GET /circles`、`GET /circles/{id}/pets` 组合 | onboarding/首页改为组合查询 |
| `POST /circles {pet_name}` 建圈+宠一体 | 建圈、建宠两个端点 | onboarding 拆两步表单（第二步可跳过进入 join） |
| `POST /circles/{id}/invite` | `POST /circles/{id}/invite/refresh` | 改名 |
| `GET /pets/{id}/summary` | 服务端无此端点，Summary 数据经 `shares(summary)` | prepare-vet 改为创建 summary 分享 → 预览 |
| 错误 `{"error":"text"}` | 结构化 envelope | 全局错误映射重写 |
| — | 新增：usage / transfer(家庭) / transfers(宠物) / restore / archive 语义微调 | 新界面见 §3 |

## 3. 屏幕清单与流程（V1 完整功能映射）

| 屏幕（现有/新） | API | 关键交互 |
|---|---|---|
| welcome → 验证码 | request-code / verify-code | dev 灰字显示 dev_code（仅 dev）；SecureStore 存 token |
| **onboarding（改）** | POST /circles → POST /circles/{id}/pets | 两步表单：① 家庭名 ② 第一只宠物（或"用邀请码加入"直达 join） |
| Today（tabs/index） | GET /circles/{id}/today?date= | daypart 分组沿用 UI spec；完成/跳过/undo；**409 权威 log 静默采用**（缓存直接以 409 载荷更新，无感）；补记=日期选择器（服务端限 7 天，错误提示直译） |
| Timeline（tabs/timeline） | GET /pets/{id}/timeline?before=&before_id= | 无限滚动使用 `(occurred_at,id)` 双字段游标，避免同一时间戳漏项；quick-record 覆盖 v1 类型集；**未知类型渲染通用卡片**（前向兼容 transfer/附件）；auto 事件带"系统生成"徽标不可编辑；weight 输入 g/kg 换算 |
| Pet（tabs/pet + pet/**） | pets CRUD / profile / medications | 停药=确认弹窗（自动事件的语义提示）；纪念态=只读呈现+恢复入口；删除=输入宠物名二次确认（confirm 用 pet_id 由 client 填） |
| **转移发起（新，Pet 内入口）** | POST /pets/{id}/transfer | 选目标家庭（我所在的其他圈）→ PENDING 态展示；撤回 |
| **转移收件箱（新，Today/家庭角标）** | GET /circles/{id}/transfers?direction=incoming | 目标圈 owner：接受（成功即全量失效刷新）/拒绝；outgoing 页签看状态 |
| Family（settings 扩展） | members / invite/refresh / remove / leave | 邀请码面板：展示+刷新（旧码即失效提示）+复制/系统分享；移除成员二次确认；**所有权移交**=选成员+双重确认；**删家庭**：FAMILY_NOT_EMPTY → 渲染"待处置清单"（逐只转移/删除引导），空了才可删；删除后 30 天可恢复的说明文案 |
| **usage 卡片（新，Family 内）** | GET /circles/{id}/usage | 家庭/成员/宠物 三项进度条 + 超限态；文案全部来自数据 |
| Shares（shares/share-care 现有） | shares CRUD + GET /shares/{token} | kind（care_card/summary）+ TTL（24/72/168h）选择；token **一次性弹层展示**+复制链接；列表含查看次数/到期倒计时/撤销 |
| Account（settings 内） | PATCH /me / DELETE /auth/session / DELETE /account | 改名；登出；注销=输入邮箱确认（红色警示+影响说明：名下家庭将被删除） |
| **Web 分享查看器（新，landing 仓库）** | GET /api/v1/shares/{token} | `www.joinplanet.pet/s/[token]` 纯渲染页（Next.js）：无注册、无 App、打印友好；410 → "链接已失效"。**这是分享闭环的必要件**（接收方是家人/寄养人，不能要求装 App） |

## 4. 状态与缓存策略

- **react-query keys 约定**：`['circle']`、`['circle',id,'today',date]`、`['pet',id]`、`['pet',id,'timeline',before]`、`['pet',id,'shares']`、`['circle',id,'transfers',dir]`、`['circle',id,'usage']`
- 写后失效精确到 key：完成任务 → today；接受转移 → **双方圈的全部 pet/today/timeline/shares 键失效**（归属翻转是一次大换血）
- **乐观更新仅两处**（体验关键、回滚代价小）：Today 完成/undo。其余走 mutation 成功后 refetch
- 会话：token 存 SecureStore；启动 `GET /me` 恢复；`entitlements` 已随 /me 返回——Family 页预留"套餐"区块（V1 恒显示 Free，数据驱动，V2 开付费自动点亮）
- 本地提醒（notifications.ts 已有）继续由任务列表驱动，与后端契约无关，保留不动

## 5. 兼容性 / 扩展性设计（逐条对后续迭代）

| 为将来留的缝 | 现在的做法 |
|---|---|
| V2 图片附件 | 时间线事件渲染走类型注册表（本地 map：已知类型→专用卡，**未知→通用卡**）；B6 上线后附件卡只是注册表加一项 + 预签名 URL 展示 |
| V2 付费/锚定 | 一切档位 UI 读 /usage 与 entitlements，无硬编码；锚定端点上线时 Family 页"套餐"区块接一个换锚入口即可 |
| V1.1 导出 | 已提前落地完整 JSON 导出；后续可增加导出格式与附件支持 |
| schedule v2 / AI 事件 | Today 由服务端展开、事件合法性由服务端校验——客户端无任何排程/校验逻辑可过期 |
| 离线写入（远期） | screens 只依赖 hooks；api client 后是可替换的 repository 接口，未来换离线队列不动界面 |
| 错误码演进 | 客户端镜像注册表 + 未知码 fallback 文案（"操作失败，请稍后再试"+code 展示便于报障） |
| 双端（Web viewer） | 与 APP 只共享 JSON 形状，不共享代码——landing 一页静态渲染，天然隔离 |

## 6. 联调与验收计划

- 环境：`make run`（:8081）+ `EXPO_PUBLIC_API_BASE=http://<LAN-IP>:8081`；`make demo` 播种 Milo；第二账号走邀请码流程
- **验收 = PRODUCT-SPEC §3 每行在真机走通**（iOS 模拟器 + Expo Go Android），另抽负面路径：配额满员、越权 404、断网重试、409 重复完成
- 交付顺序内检：每完成一组屏幕跑一次"双账号剧本"（A 建家庭→邀请 B→共同完成→B 记事件→A 分享→撤销→转移→治理）

## 7. 工作分解（建议顺序，每组含联调）

1. **数据层**：types.ts（DTO 镜像）+ api.ts 重写 + 错误映射 + 401 拦截
2. **认证与 onboarding** 切新契约（两步建圈/建宠 + join）
3. **Today / Timeline / Pet** 数据层切换（409 采用、补记、纪念态、停药确认）
4. **Family 治理 + usage**：邀请面板、移交、删家庭引导、转移收件箱与发起
5. **Shares 对接 + Web 查看器**（landing `/s/[token]`）
6. **全量联调验收**（§6 剧本）→ 打包 TestFlight 内测（V1.1）

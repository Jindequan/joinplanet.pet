# 全系统深度体检报告（2026-09-30）

基线：v1.1 必做批之后（planet-api `c01740c` / APP `e889139`）。方法=五路全新上下文盲审并行（C 端闭环 / 业务生命周期 / 契约一致性 / 基建安全 / UI·UX），全部纯代码只读；**P1/P2 共 10 条已逐条由本体亲核坐实**（标注「亲核」），P3 标注代理置信度。已知清单（台账 L1-L105、保留债、已证伪四类）全程豁免，无重复登记。

## 收口记录（2026-09-30 同日 v1.1.1 批，founder 长期令「主动推进」后执行）

- **已修**：L106-L111、L113-L120、L123、L124（planet-api `14e42b0` / APP `b3420de..2053f5f`）；UI 执法 3 条+体重单位+机会 O1-O7 同批落地（O8 登记下批）。
- **改判**：L122 证伪——deploy.yml 实有 `on: push: main`，「merge 即上线」为真且当天部署实证；审计误引不存在的 backend-deploy.yml（教训：workflow 口径类发现必须 ls 实际文件）。
- **豁免**：L121（outbox 无 per-token 台账，重发=重复推送，D8 不做）；L125（信任模型登记）。
- **复审门**：PASS-WITH-NOTES（1 P2=S2N 限流回 200 静默丢事件→已修正为 429+600/h；2 P3=空名降级文案+0035 索引覆盖注释→均已收口）。
- **仍开放**：L112（founder 手工：服务器 `systemctl enable --now planet-cli-backup.timer` + R2 控制台桶版本化，与 trash 生命周期规则同一趟）。

## 对 founder 四问的总回答

1. **按钮/链接是否真实实现、闭环吗**：全仓静态路由比对零死链；transfer/share/请求/记录/设置各面四连追问无死路。**唯一断裂=L106（P1）**：今天新修的 L79 邀请步挂在自然旅程永不经过的路由上，对目标人群不发生。
2. **业务流程正确、生命周期完整吗**：八大实体状态机闭合（宠物/家庭/请求族/配额全闸，49 项定向集成测试亲跑绿）。但**今天新开的门（恢复入口/注销移交）有三条没装闸**（L107/L108/L109），其中 L107 是亚秒竞态可造永久无主活宠。
3. **简洁优雅、简单上手吗**：执法面高水位（五条一票否决全绿、E1-E8 大面合规），剩余粗糙集中在弹层双钮排档位混排（3 处）与激活链路概念密度；**最大的上手杠杆在用词不在画工**——「计划/临时」「跳过/移除」两对产品分界词钉死，新用户第一天少猜两次（机会线 8 条，前 3 条都是改词级成本）。
4. **技术盘**：后端安全工程质量显著高于同期水位（Apple 8 防线、越权矩阵 12+ 端点全过、日志/密钥卫生全绿、SQL 全参数化、部署有真回滚）。真实缺口三处：`/auth/apple` 唯一无限流裸奔（L110）、Apple S2N 缺失（L111）、照片不在备份域且备份 timer 疑似从未安装（L112）。

## 发现清单

### P1（1 条）——随批收口

| # | 项 | 证据 | 修复方向 |
|---|---|---|---|
| **L106** | **L79 邀请步挂点孤儿：自然激活旅程全部绕开 ready 态的 /activation**。index.tsx:38 只在 phase≠ready 时导向 /activation；setup-care 完成直 `replace(todayHref())`；登录成功直 /(tabs)；唯一触发面=手工深链。原始 L79（邀请仅剩家庭详情 4 击文字链）对目标人群依旧成立 | APP `app/index.tsx:37-38`、`setup-care-screen.tsx:42-46`、InviteStep 唯一消费点 `activation/screen.tsx:102-124`（本体亲核） | ready 拦截搬到必经面：`/(tabs)/index` Today 首渲染一次性 gate 或 index ready 分支先过邀请步；`InviteStep`/`invite-step-flag`/e2e 可整体复用。**同修 L115**：inviteTarget 加 owner+member_count===1 前置 |

### P2（9 条）

| # | 路 | 项 | 证据 | 修复方向 |
|---|---|---|---|---|
| L107 | 生命周期 | **注销终结语句不带宠物状态条件**：守卫读取后、终结执行前的亚秒窗内并发反归档/离世封存 → 永久无主 active/deceased 宠（purge 不清、恢复需全局 owner）。两路盲审交叉命中 | lifecycle/service.go:112-114（终语句仅 owner+valid_to 条件，本体亲核） | 一行：终语句加 `AND EXISTS(pets.status='archived')` 或锁后重跑守卫 |
| L108 | 生命周期 | **恢复不关规则：归档窗回看补生成幻影 missed**。归档只改 status（对照暂停有 CloseRuleAt+审计标记），今日恢复入口使该路径日常化；恢复后回看 30 天补物化 pending→次日翻 missed，污染完成率 | tasks/service.go:983-990（归档无关规则，本体亲核） vs :1151/:1173（暂停分支对照） | 归档时同 pause 口径关规则+独立标记；恢复分支按标记 re-arm 自今日 |
| L109 | 生命周期 | **停药挂药计划无闸恢复：计划与用药事实发散**。恢复路径零 medication 检查（medication_id 全文件仅创建口 :183）；恢复后 Today 指挥家人继续喂已停的药 | tasks/service.go 恢复分支 grep 零命中（本体亲核） | 恢复对 medication_id≠NULL 且 ended_on 非空（或已软删）的计划 409，或恢复时解挂降级普通计划 |
| L110 | 安全 | **POST /auth/apple 无限流**：全站唯一裸奔敏感端点（每请求=RSA-2048 验签+2MB 解码），与收钱 landing 同机 | identity/http.go:164-186 无 h.allow（本体亲核；对照 :126 verify-code 有闸） | 复用 Handler.allow 同型 per-IP 闸（verify-code 30/h 档） |
| L111 | 安全 | **Apple S2N 端点缺失**：用户在 Apple 侧撤销授权后服务端无感知，会话按 90 天滑动续期继续全权可用（5.1.1(v) 精神） | 全仓 grep 零命中（本体亲核） | 新增公开 S2N 回调（验 Apple 签名）消费 consent-revoked→撤该 sub 全部会话。**需 founder 裁优先级** |
| L112 | 运维 | **照片不在备份域+备份 timer 疑似从未安装**：备份实现完整（pg_restore 校验+SHA256+原子改名+可选 S3）但 install-and-restart.sh 零 backup 字样=手工模板未自动装；DB RPO=24h；R2 对象无版本化/复制证据 | planet-cli/backup.go vs deploy/install-and-restart.sh（本体亲核） | **founder 手工项**：①服务器 `systemctl enable --now planet-cli-backup.timer` ②R2 控制台确认桶版本化（与 trash 规则同一趟） |
| L113 | 生命周期 | archived→paused 旁路：同迁移两扇门两套守卫，可经 paused→active legacy 路径绕开恢复标记闸 | tasks/http.go:264 + service.go:1137 | archived 只允许迁 active |
| L114 | 生命周期 | L86 移交静默：继任者无声接管纪念宠（仅审计可查），无通知 | lifecycle/service.go（移交通路无 NotifyUser） | 移交成功后给继任者发一条通知（复用 L91 通路） |
| L115 | C 端 | 邀请步无角色/成员数前置：非 owner 用户被拦一次且 mint 403 | activation/screen.tsx:114 | 随 L106 同修：inviteTarget=本人为 owner 且 member_count===1 的第一个家庭，否则直接放行 |

### P3（13 条，摘要）

L116 注销/登出不清理照片票据台账（跨账号 abandon 形态，无越权、纯卫生债）· L117 share_links 缺 (pet_id) partial 索引 · L118 pet_share_requests 缺 (requested_by) partial 索引 · L119 petshares struct json tag 与 wire DTO 分叉（未来静默改契约陷阱）· L120 petshare 接受不失效 activation-summary（激活期 ≤30s 陈旧窗）· L121 APNs 429/503 部分失败即 nil 不重试（偶发丢推送）· L122 部署自动触发文档漂移（实际仅 workflow_dispatch）· L123 bootstrap-root.sh 密码 SQL 内插形态+注释 0640 漂移 · L124 prod-preflight 未接部署自动化 · L125 web localStorage 持久化照护数据（XSS 可读面登记，凭据面干净）。

### UI/UX（执法 3 P2 + 5 P3；机会 8 条，在本报告内跟踪，不入台账）

**执法**：①已删宠物行 heading(18) 违 rowTitle 唯一档（pets/screen.tsx:431，本体亲核）②弹层双钮 44+52 混排三处（temporary-care.tsx:250-255 等，本体亲核）③Records 页头两枚 featured 盒式钮、日历钮非法（timeline/screen.tsx:598-623，本体亲核）。P3：SkipDialog hint 复读按钮 label、行卡同步态文案超长必截断（应走 Short 版）、邀请步标题是概念不是句子、EventForm 弹层双层头复读、快速 composer 体重无单位（**lb/kg 歧义直接产错数据，建议提级**）。

**机会线（上手价值×成本排序，前 3 全是改词级）**：O1 激活首屏 intro 卡与阶段卡双层抽象收敛为一句 · O2 「去添加照护」改「建一条照护计划」一词钉死计划/临时分界 · O3 「今天做不了」改「从今天移除」与确认弹窗同词（跳过/移除可逆性分界可见）· O4 已完成行补 14px chevron 让「完成的事去哪看」可见 · O5 邀请步直接以 visible=true 渲染 InviteSheet 少一屏（与 L106 重挂同做）· O6 Records 日历钮降 icon 档并入 ScopeInfoLine（与执法③同做）· O7 计划表单 category 留主层（自定义计划恒 Clock 图标问题）· O8 临时照护默认时间 09:00 改就近取整（行为变更需裁决）。

## 绿面（五路汇总，下轮勿重复）

C 端：L80/L81/L82/L87/L91/L99 复验全部如声明成立；邀请-加入闭环、请求/批次详情出口、记录详情三级取数、全局来人卡全通。后端：宠物/家庭/请求族状态机闭合、配额全闸（恢复路径也数）、L86/L91 本体复验成立（L86 残余=L107）。契约：本批新增四面零错配、恢复/接受/推送失效图闭合、幂等范式全仓无漏网、无「new Date() 进重放体」第二处。基建：Apple 8 防线、越权矩阵 12+ 端点、日志/密钥卫生、SQL 全参数化、部署真回滚、迁移半迁移态安全。UI：五条一票否决全绿、E1-E8 大面合规、尺度纪律全绿。

## 处置建议（founder 裁）

- **A 随批收口（小闸，合计 ~50 行）**：L106+L115（邀请步重挂 Today 首渲染）、L107（一行条件）、L108（归档关规则+恢复 re-arm）、L109（恢复用药闸）。理由：全是今天新开门的缝或本批未达成的声明，挂在头上过夜不值。
- **B 本周快修**：L110（apple 限流，~10 行）、L113、L120、O2/O3（改词）。
- **C 需 founder 裁决**：L111（S2N 立项与否）、L112（服务器 systemctl+R2 控制台两趟手工）、L114（移交要不要通知）、O8（默认时间行为变更）、UI 执法 3 条（都是几行改）。
- **D 下批候选**：其余 P3 与机会 O1/O4/O5/O7。

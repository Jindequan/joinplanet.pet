# PLANET 缺陷台账（契约收口专项）

创建：2026-09-17。来源：两份全量摸底 + 本体亲核 + 三路全新上下文盲审（后端行为 / 前端行为 / 端到端旅程）。
分级：P0=静默失败/错数据/权限洞；P1=主流程常见场景断裂或误导；P2=体验降级/陈旧显示/不一致；P3=死代码/外观。
状态标记：✅已证实（本体亲核）｜✔盲审证实（未逐行亲核）｜❌已证伪｜🔧已修复待复验。

## 一、进入修复清单

### P0（必修）

| # | 状态 | 缺陷 | 证据 |
|---|---|---|---|
| L1 | ✅ | petshares.Accept 状态迁移逃逸事务：`SetState` 用 `r.Pool.Exec` 独立提交（repo.go:122），InTx 里 LinkFamily 回滚后 state='accepted' 已持久化→「已接受但宠物不可见」，且重放走 resolve 读回不pending提前返回，**无自愈路径**。注释（service.go:61-62）与实现相悖 | planet-api internal/modules/petshares/service.go:75 + repo.go:121-129（本体亲读） |
| L2 | ✅ | 跨家庭共享确认 UI：接受/拒绝失败**零反馈**（`respond()` try/finally 无 catch、`void respond()`），无稳定幂等键（api 每次新生成），无成功反馈；与 L1 叠加即「点了没反应」 | APP src/features/care-requests/pet-share-requests.tsx:38-53,72-73（本体亲读；盲审确认全库 216 处 fire-and-forget 中唯一无反馈点） |

### P1（必修）

| # | 状态 | 缺陷 | 证据 |
|---|---|---|---|
| L3 | ✅ | 多人家庭 caregiver 对未认领事项点主按钮「完成」：前端 canExecute 放行（`!assigned_to_user_id ||`），后端要求 caregiver=被指派或在计划责任链（否则 ErrRoleForbidden），映射文案「只有家庭管理员可以执行这个操作。」完全误导——**产品核心场景（多人共养）首次操作即撞墙**。APP-PAGE-MAP 本有约定「多成员卡默认突出我来做」但实现未执行 | 前端 today/screen.tsx:591-598 + cards.tsx:411-439；后端 tasks/service.go:1828-1842；errors.ts:16（三处本体亲读） |
| L4 | ✅ | petshares 模块幂等键形同虚设：HTTP 层强制 8-200 字符键，service 收下后全程不用（无 Claim/Bind）；decline/cancel 审计在事务外且吞错（`_ = platformaudit.Record`） | petshares/service.go:63/93/113/106/132（盲审证实+本体亲读 service 结构） |

### P2（本轮修）

| # | 状态 | 缺陷 | 证据 |
|---|---|---|---|
| L5 | ✅ | RespondBatch 缺成员/宠物资格复核：被移出成员仍可接受批量交班→occurrence 指派给无权限者且 accepted 请求永不过期，**该照护项永久卡死** | carecoord/service.go:593-640 无 guard（本体亲读段落+盲审证实） |
| L6 | ✔ | 暂停计划恢复后回看暂停期日期会补生成 occurrence 并烂成 missed，污染完成率，违反 PRODUCT.md:161 承诺 | tasks/service.go:1198 物化只看 plan status，无暂停区间记录 |
| L7 | ✅ | 宠物移出家庭时 cancelFamilyPetOpenOccurrences 只置 status='cancelled' 不置 deleted_at→占死 (rule,date) 唯一槽，重新共享后 ~30 天待办静默消失（索引是 `WHERE deleted_at IS NULL` 部分索引，补列即可解） | pets/service.go:1026-1047（本体亲读）+ 0001:645 索引定义 |
| L8 | ✔ | 停药后前端不失效 care-plans：后端停药会归档挂药计划+取消未完成项，前端 invalidateAfterMedicationChange 不含 ['care-plans'] 也不含 today→停药后照护页 30s 内仍显示计划进行中 | APP src/core/foundation/cache.ts:117-126 |
| L9 | ✔ | ['family-pets',familyId] 裸键逃逸所有失效器：家庭详情宠物列表与全局 ['pets'] 双缓存不同步（新建宠物/接受共享/转移后 >30s 陈旧） | families/detail-screen.tsx:73-77 + cache.ts:166-181 |
| L10 | ✅ | 撤销 7 天窗：30 天历史视图仍显示撤销按钮，超窗报 UNDO_WINDOW_EXPIRED **无映射**→「内容刚发生变化，请刷新后重试」误导死循环 | today/screen.tsx:564-573 + errors.ts 无此码（本体亲读 errors.ts 全文） |
| L11 | ✔ | §4.3 状态词漂移：canonical 词表（等待回应/已确认负责/正在同步…）与实际文案（等你回应/由你负责/已接手/未能接手…）全站不一致 | care-requests/copy.ts:35-41,91,105-126 + today/cards.tsx:65-79 + timeline/screen.tsx:494-498 |
| L12 | ✔ | 离线行为断层：complete/skip/undo/Today claim 有队列，而排程四动作/timeline 编辑删除无队列——同屏两套离线行为（有可见报错，不违 §3.2，但违背预期）。本轮先做「需联网」诚实文案，队列化待裁决。〔2026-09-22 更新：care-risk claim 载体 CareRiskBanner 整组件零引用已删除（认领能力由 Today 未指派项的 claim 链路承担，care-risk-banner.tsx 证据随之移除）〕 | schedule-adjustment.tsx:76-83、foundation/writers.ts:65-77 |
| L13 | ✔ | 错误码缺映射一批：UNDO_WINDOW_EXPIRED、FAMILY_NOT_EMPTY、CARE_ASSIGNMENT_OWNER_REQUIRED、AUTO_EVENT_IMMUTABLE、IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE（后三个低频） | errors.ts:12-44 逐码比对（本体亲读） |
| L14 | 🔧 | care_card 冻结快照以「今日照护」呈现 | WO5（2026-09-17 创始人裁决改呈现）：标题→「照护快照」+ 生成日期诚实说明行 + 快照空态文案；typecheck/lint/契约 0 FAIL/e2e 114/114；APP 提交见仓内 log |

### P3（本轮顺手修，成本极低）

| # | 状态 | 缺陷 |
|---|---|---|
| L15 | ✔ | transfers cancel 读幂等键未 TrimSpace（带空格键绑定失配→409 而非重放）transfers/http.go:94 |
| L16 | ✔ | MaterializeTask 退化 CASE（两分支相同）掩盖 L7 语义 tasks/repo.go:467 |
| L17 | ✔ | pet-share 不拦归档宠（与 share-link「归档禁新增」政策不一致）pets/service.go:442 mutable=false |
| L18 | ✔ | families.Join 末尾 ErrAlreadyMember 死防御 service.go:414-418 |
| L19 | ✔ | 「我发出的」首次加载无 loading 指示 panel.tsx:1001 |
| L20 | ✔ | 离线「标记跳过」后弹窗不关 today/screen.tsx:1253-1272 |
| L21 | ✔ | VERSION_CONFLICT 只有文案无就地刷新；编辑失败后幂等键不轮换→改内容重存命中键复用 409 edit-screen.tsx:118-151 |
| L22 | ✔ | 计划编辑双写（标题+循环）第二步失败文案未说明部分已保存 care-section.tsx:1008-1047 |
| L23 | ✔ | care-request 接受/拒绝后 ['care-responsibility'] 不失效（≤30s 陈旧）cache.ts:21-40 |
| L24 | ✔ | 后端测试盲区：GET /me/activation-summary、GET /care-requests/sent 无集成测试 |
| L25 | ✔ | ROLE_FORBIDDEN message 恒 "owner role required"，在 viewer 写拦截等场景为零信息（L3 修复后剩余场景影响小） |

## 二、证伪销号

| 原编号 | 内容 | 证据 |
|---|---|---|
| ❌ | 「medications 删除 onConfirm 未处理 rejection」 | ConfirmDialog.confirm() try/catch 完整（confirm-dialog.tsx:45-53） |
| ❌ | 「notification-prefs PUT 无键+单字段 body 有重放风险」 | 后端 PUT 为合并语义（nil 不改）+savingKind 串行，重放安全（notify/http.go:69-89） |
| ❌ | 「DELETE /care-plans 双写 archived+deleted_at 有复活风险」 | 双写版本 Repo.DeleteItem 全库无调用者（死代码）；live 路径只写 status；读路径全过滤 deleted_at |
| ❌ | 「pet_share_requests pending 唯一索引挡二次发起」 | 部分索引仅 pending，declined/cancelled 离开索引，可再次发起 |
| ❌ | 「配额检查与写入可能不同锁」 | families/pets/unarchive/transfer 全部 advisory 锁内同事务（逐路径核对） |
| ❌ | 「careRequests.seen 静默失败属缺陷」 | 已读回执天然幂等，失败下次 effect 自愈，有注释理由，留痕豁免 |
| ❌ | 「J1 主闭环字段/时区/幂等有错配」 | 逐跳核对完全对齐（含 weekly ISO、time_of_day 三态、occurrence_ids 空语义） |

## 三、豁免留痕（有理由接受，不改）

1. GET /shares/:token 读路径 UPDATE view_count：单行自增+IP 限流，注释明示冗余计数容忍丢失——接受。
2. 通知 outbox at-most-once 崩溃窗口：领域事务不受影响，仅推送延迟，设计选择有注释——接受。
3. 幂等键 ref Map 内存性：会话内防线+服务端业务幂等兜底——已知取舍。
4. push token 注册失败无自动重试：设置页已有登记状态+手动重试——接受。
5. B10「服务未配置」三态码混乱、care_plans 死枚举 completed：低价值清理，下轮。

## 四、盲审整体结论（存档）

- 后端：状态机纪律普遍很高（行锁+CAS+partial 唯一+同事务幂等四件套），权限抽查无越权；**petshares 是唯一没跟上纪律的模块**（L1/L4），外加四处取消/恢复语义各自为政（L6/L7）。
- 前端：错误处理纪律高于常见水准（215/216 fire-and-forget 有反馈），**系统性风险在失效图与后端联动语义漂移**（L8/L9/L23），mock 型 e2e 测不出这类。
- 端到端：单人主闭环全链路对齐无错；**多人场景第一堵墙=L3**；误导性文案集中在错误码映射缺口（L10/L13）。

## 五、修复记录（2026-09-17 契约收口专项）

四张派工单存档：~/.zcode/tasks/2026-09-17-app-contract-closeout-WO1-backend.md（后端主修）、…-WO2-frontend.md（前端主修）、WO3（收尾）、WO4a/WO4b（评审回炉）。

| # | 修复 | 验证证据 | 复审 |
|---|---|---|---|
| L1+L4 | petshares 全模块重写：状态迁移/ACL/审计/幂等全同事务，审计错误传播，读回路径也 bind | TestPetShareResolutionIsAtomicAndIdempotent + 全量 go test 绿 | 后端 code-reviewer PASS（两轮） |
| L2 | pet-share UI：catch+toast、稳定幂等键、成功反馈、失效面补齐 | 新 e2e（失败 toast+同键重放）双端绿 | 前端 code-reviewer PASS |
| L3 | 后端新码 CARE_OCCURRENCE_ASSIGNMENT_REQUIRED（拦截移到 replay 后）；前端 needsClaim 主按钮=我来做 + 码映射 | TestCaregiverUnassignedCompletionRequiresClaim + 新 e2e（主按钮=我来做） | 双侧 PASS |
| L5 | RespondBatch 逐项资格复核（accept+decline 同口径，失格→not_actionable/eligibility_lost） | TestRespondBatchViewerLosesEligibility / DeclineRechecksEligibility | 后端 PASS |
| L6 | 暂停收口/恢复重开规则（版本化，复用 change_rule 机制）+ 修复评审发现的「暂停→归档→恢复死计划」 | TestPauseRestoreLeavesNoPhantomOccurrences / PauseArchiveRestoreRegeneratesToday / RestoreDoesNotReviveNaturallyEndedPlan | 后端 PASS（RuleClosedByPause 审计标记判定评估为可接受，保守失配方向） |
| L7+同类 | 家庭移出/宠物删除两条取消路径均补 deleted_at 释放唯一槽 | TestPetRemovalReleasesOccurrenceSlot / PetDeleteRestoreReleasesOccurrenceSlot | 后端 PASS（消费方过滤全核） |
| L8/L9/L23 | 前端失效图补齐（care-plans/today/family-pets/care-responsibility） | cache.ts 契约检查 + e2e | 前端 PASS |
| L10 | canUndo 7 天窗（done_at 口径）+权限收紧+UNDO_WINDOW_EXPIRED 映射 | 新 e2e（超 7 天无撤销按钮） | 前端 PASS |
| L11 | 状态词对齐 §4.3（copy/panel/toast/batch/today 共 20+ 处） | grep 清零 + e2e 断言同步 | 前端 PASS |
| L12 | 无队列动作的「需联网」诚实文案（ABORTED 不误报） | typecheck/lint | 前端 PASS |
| L13 | errors.ts +6 码映射 | 契约 61→64 PASS | 前端 PASS |
| L19-L22 | sent loading/离线跳过关窗/指纹幂等键+字段级合并/部分保存文案 | e2e 114/114；字段级合并经定向复审逐字段推演通过 | 前端 PASS（P1 双快照方案） |
| L15-L18 | transfers trim/CASE 清理/pet-share 拦归档/死分支删除 | go test 绿 | 后端 PASS |
| L24 | activation-summary/sent 集成测试补齐 | TestMeActivationSummary / TestCareRequestsSent | 后端 PASS |
| 定时炸弹 | TestShareLifecycle 等硬编码 2026 日期改相对时间 | 复跑 PASS | — |
| 契约 FAIL×4 | 44pt/maxLength/来源句/脚本对齐 chips 常驻裁决 | verify:frontend 64/64 PASS | — |

**评审引入问题的回炉记录**：前端 P1（拉取最新后全量覆盖并发编辑）→ 双快照字段级合并修复并复审通过；后端 P2（暂停→归档→恢复死计划）→ RuleClosedByPause 修复并复审通过。

## 六、遗留（下轮，均 P3 或需裁决）

1. ~~L14 care_card 呈现~~ 已关闭（WO5，2026-09-17 创始人裁决改呈现，APP 98627f3）。
2. 排程四动作/timeline 改删的离线队列化 —— 设计决策待裁决（当前为诚实文案）。（care-risk claim 载体 CareRiskBanner 已于 2026-09-22 删除，不再列。）
3. petshares Cancel 404/403 口径统一、ResolvedAt 死字段、ErrAlreadyMember 孤儿、B10 错误码三态混乱、care_plans 死枚举 completed（需迁移）。
4. ~~edit-screen base 侧 name/med_decision_maker 未 trim（带空格存量数据下假脏）；errors.ts CARE_REQUEST_RESPONSE_REQUIRED 文案含「等你回应」未入统一词表。~~ 已关闭（2026-09-22，APP 9f64726：serverBody 同口径 trim；zh 文案改「等待回应」入 §4.3 词表；Playwright 170 次执行 169 通过 + 1 条件跳过）。
5. e2e 全 mock 层面缺一条真实后端冒烟（建议下轮加 smoke profile）。
6. walk-through 脚本 diff 含本轮前的未提交改动，归属待 founder 提交时厘清。

## 七、2026-09-22 全系统体检延期项（追加，来源=audit）

来源：[audits/FULL-SYSTEM-AUDIT-2026-09-22.md](audits/FULL-SYSTEM-AUDIT-2026-09-22.md)；处置明细见 [audits/AUDIT-2026-09-22-REMEDIATION.md](audits/AUDIT-2026-09-22-REMEDIATION.md)。状态标记沿用上文（✔=审计/盲审亲读证据，本体未逐行复核）。

| # | 状态 | 延期项 | 证据/来源 |
|---|---|---|---|
| L26 | ✔ | Families/Pets 列表页无离线快照或离线横幅（Today/Timeline 有），断网即整页错误态 | audit P2-8（2026-09-22，Families/Pets screen.tsx） |
| L27 | ✔ | digest 手动发送无 UI 入口：`families.sendDigest` 为孤儿端点，目前仅调度器触发 | audit §五/§六.4（2026-09-22） |
| L28 | ❌ | ~~数据导出无前端 UI 入口：`GET /pets/{id}/export` 端点已存在并已补登 APP-BEHAVIOR-CONTRACT §2.4（仅 owner），前端入口待排期~~ 已核实存在，无需做。2026-09-22 勘误：导出 UI 已存在于宠物工作区管理组（MoreRow「Export data」行，caps.export_json 门控），体检 P2-6 仅为文档口径问题已另行修复 | 勘误证据（2026-09-22 本批亲核）：APP src/features/pets/detail-screen.tsx Export 行 + e2e/core-flows.spec.ts「pet JSON export produces a downloadable file on web」真实用例；原登记 audit P2-6（pets/service.go:321-337） |
| L29 | ✔ | 照片上传无服务端单对象大小上限：PresignPut 不带 content-length 条件（若 2026-09-22 后端修复批已落地则销号本条）。**2026-09-22 后端批调查结论：维持不落地**——R2 官方兼容表无 POST Object 行、且对 presigned POST content-length-range 不执行（假安全感比缺失更糟）；补偿=挂接 Stat ±20% 对账+配额硬闸+领票限速+photo-sweep 兜底；候选方案见 audits/AUDIT-2026-09-22-REMEDIATION.md §4.1 | audit P2-1 延期部分（2026-09-22，media/media.go:122-128）；调查结论与候选方案 audits/AUDIT-2026-09-22-REMEDIATION.md §4.1（2026-09-22） |
| L30 | ✔ | 家庭时区迁移后历史/未来事件的解释语义未定义（跨国家庭场景才爆），待 founder 裁决 | audit §六.6（2026-09-22） |
| L31 | ✔ | 纯日期事项「何时算逾期」缺统一定义，待 founder 裁决 | audit §六.6（2026-09-22） |
| L32 | ✔ | 「me.usage 配额显示」挂起，需产品决策后再排期：①落点不存在——照片内容之家在记录流，SharingSection 是分享链接管理，均无配额语境可挂；②`storage_bytes` 无格式化口径单源（MB/GB 换算无单一出口，各页自拼必然漂移）；③used/limit 常驻双数字与 402 `PHOTO_STORAGE_QUOTA_EXCEEDED` 升级引导构成同一事实两处口径，违反「信息只说一遍」。三项未解前不接 UI | audit §五 孤儿端点（me.usage，「照片配额只在 402 报错时才被用户感知」）；2026-09-22 本批补强调查后挂起 |
| L33 | ✔ | 后端 care-risks 读端点现零消费方（前端链路已随 CareRiskBanner 删除收口），处置=保留端点待后续裁决或删除 | 2026-09-22 前端修复批：APP 侧 queryKeys.careRisks、cache.ts 5 处 'care-risks' 失效字面量、families.careRisks 方法 + CareRisk 类型全部删除，grep 全仓零引用；后端 GET /families/{id}/care-risks 端点保留不动 |
| L34 | ✔ | photo-sweep 全桶枚举与引用快照随桶线性增长（media.ListDetailed 无上限载入内存），桶到百万级对象前需改按 petID 前缀分批枚举/流式处理；当前创业期量级无碍 | 2026-09-22 后端盲审 P3（media/media.go:215、photo_sweep.go），修复批裁决登记不实现 |
| L35 | ✔ | photo-sweep 汇总行 movedDirs 无条件自增：目录内全部键移动失败时仍计入目录数（纯运维统计口径失真，无正确性影响；失败键下轮 sweep 重命中）。顺手修：`if moved > 0 { movedDirs++ }` | 2026-09-22 复审 P3 残留（planet-api 956556d photo_sweep.go:126） |

## 八、MVP 六系统生命周期审计延期与待裁决项（2026-09-22 追加，来源=MVP-SIX-SYSTEMS 审计）

审计全文：[audits/MVP-SIX-SYSTEMS-2026-09-22/](audits/MVP-SIX-SYSTEMS-2026-09-22/)（01 账户 / 02 家庭 / 03 宠物 / 04 照护调度 / 05 提醒 / 06 event）。P0/P1/P2 主体已当批修复（调度推送接线、注销身份清理、ACCOUNT_FAMILY_HAS_MEMBERS、转移全局 owner 守卫、共享请求三处收束、substitute 归属、离线队列告知、分享照片签名 URL 等）；以下为待 founder 裁决与登记项。

| # | 状态 | 项 | 出处 |
|---|---|---|---|
| L36 | 待 founder 裁决 | **宠物离世语义**（生命周期唯一缺失终态）：方案一=归档正名「纪念」（0 迁移）；方案二=新增 deceased 终态（不可逆、免配额、只读保留）；方案三=完整纪念模式 | 03-pet.md F8 |
| L37 | 待 founder 裁决 | 宠物「30 天恢复窗」无执行机制=事实无限期；裁决真窗口+purge 还是改口径（与 planet-cli purge TODO 合并） | 03-pet.md F4 |
| L38 | 待 founder 裁决 | once 临时照护「无时段且已指派」零主动提醒：要不要提醒、何时提醒 | 05-reminders.md F2 |
| L39 | 待产品口径 | 所有权移交候选含 viewer（一次确认获全部治理权）；邀请码无独立撤销（唯一出口=refresh 轮换，多设备互吊） | 02-family.md F8/F11 |
| L40 | 待产品口径 | digest 仅邮件无推送（care_digest kind 死代码）；iOS 角标零管理；送达窗口语义（家庭时区/补发至凌晨 4 点/每小时桶全天重复）是否 by design | 05-reminders.md F5/F7/F8 |
| L41 | 待 founder 裁决 | 「照片断网入队」承诺 vs 实现（照片必须在线先传 R2）：改文档还是做离线暂存 | 06-events.md E3 |
| L42 | 文档口径 | 导出「完整」语义落字：照片仅引用无字节、含管理类事件（与 facts 投影口径不同）、不含请求/转移管理史 | 06-events.md E5 + 03-pet.md 备注 |
| L43 | 处置裁决 | access-grants 后端完整但无产品定义无 UI：建议标注「预留能力（API 保留，无产品入口）」+删前端死方法 | 03-pet.md F7 |
| L44 | 口径冲突 | 纪念态（归档）宠物转移：契约与后端放行、前端 UI 拦死——放开 UI（纪念转移）或收紧后端 | 03-pet.md F2 |
| L45 | 登记（P3 尾巴，详见各审计文件） | ①V3 偏好悬空/V5 subscriptions+outbox 残留/V6 users.email 不刷新/V7 Apple 无限流/V8 注销幂等；②F2 被移除者无通知/F5 审计翻页/F6 邀请死列/F7 角色错误口径/F9 恢复计数滤注销/F10 邀请过期不透明；④F6 once 计划无终态/F8 注释漂移/F9 undo 按钮陈旧窗；⑤F9 outbox 保留策略/F10 token 周期校验；⑥E4 内联照片编辑指引/E6 trash 拖挂/E7 abandon 截断/E8 快照事务外 | 各审计文件漏洞清单 |

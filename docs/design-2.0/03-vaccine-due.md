# G3 设计稿:疫苗/驱虫到期清单与提醒(免费)

> **设计稿 v2——已过审查门。**
> 修订记录:r1(2026-10-14)首稿;r2(2026-10-14)按独立审查意见修订——**P1** §3.3 派生规则内在矛盾修正(锚点从「最新带 due 事件」改为「最新事件不论 due 与否」,新增 needs_date 挂起态);**P3 两项采纳**(/due 归属 timeline 模块显式化、All 分支顶层 date 语义澄清)。
> 不改任何产品代码;本文只写设计。施工前置:founder 复核 §5 开放问题后,按 §4 验收门交付。

- 日期:2026-10-14
- 设计包:2.0「补足」G3(P0,工程量 M)——[SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md §6.6](../commerce/SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md)
- **免费归属(裁决,不再议)**:同上文档 §6.6「G3 疫苗到期、G4 导出图、G2 sitter 分享=免费不限」;最初设计 [APP-DESIGN](../archive/APP-DESIGN.md) §1.4 能力地图把「疫苗 due 提醒」标在幼年阶段 Phase 2、§1.5 边界表「疫苗/驱虫到期清单(V1.5 免费)✓ 免费」。本设计全链路(记录/清单/Today 条/推送/digest)零 entitlement 检查、零配额闸,不触碰分享/应急/导出红线。
- 层级与 Tab:L2(一生,Pet Event 时间线)为数据归属;展示面挂 L1 Today 条 + L2 宠物工作区清单;触达走 L4 alerts/notify 既有通道。
- 红线自检:不提 AI(档位表已撤);不建与 Occurrence/Event 平行的业务主体(PRODUCT §0);免费协作闭环不被破坏(纯增量,不改任何既有写路径语义)。

---

## 0. 现状事实(先读再写的证据基线)

| # | 事实 | 出处 |
|---|---|---|
| F1 | 疫苗/驱虫已是 timeline 事实事件,类型 `vaccine`/`deworm`,payload 校验只要求非空 `name`,额外字段静默放行 | `planet-api/internal/modules/timeline/registry.go:40-41,180-188`;FactTypes 白名单 `registry.go:58-68` |
| F2 | **服务端今天就能接受 payload 带 `due`**(校验不拒),但客户端 composer 从不发送:`{name, text?}` | `APP/src/features/timeline/composer.tsx:755-759`;写路径 `timeline/service.go:96-181` |
| F3 | **APP 展示层已半接线**:zod schema 已含 `due: z.string().optional()`,事件卡已渲染「下次到期 {date}」,五语 i18n 键 `timeline.nextDue` 已备 | `APP/src/features/timeline/registry.ts:15-17,195,202`;`APP/src/i18n/{zh,en,ja,es,pt}/timeline.json:18` |
| F4 | 服务端零 next-due 结构:无表、无列、无投影、无提醒 | 全仓 `grep next_due` 零命中(本会话实测);差距定级见订阅设计 §6.5 G3 行 |
| F5 | alerts 预警基建 = 纯函数规则 + 请求时计算,不落新状态;按家庭聚合,digest 与每日 08:00 推送复用同一 `FamilyAlerts` | `planet-api/internal/modules/alerts/rules.go:1-9,24-43`;`alerts/service.go:24-50`;`notify/scheduler.go:113-137` |
| F6 | 推送去重纪律:`job_runs (job, family, dedupe_key)` 持久一次性运行权;alerts=圈本地 ≥08:00 每天一次,空预警不打扰;收件人=开启 alerts 偏好的成员 | `notify/scheduler.go:110-137,214-234`;`notify/plan.go:14`;`contracts/proactive.go:129-137` |
| F7 | 逾期口径(全系统唯一):过了计划点到家庭时区**次日零点**才判 missed,当天未完成不算逾期;执行主体是 `MarkMissedBeforeFamilyAt`(missed 判定唯一口径) | PRODUCT §4.2;`tasks/repo.go:610-623`;调用点 `tasks/service.go:1410,1859` |
| F8 | occurrence 物化引擎:care_rules frequency daily/weekly/monthly/interval/once,interval 锚点是**规则创建日**civil date;once 必须带时刻;物化在 Today 读事务内 upsert | `tasks/schedule.go:18-25,125-159,110-120`;`tasks/service.go:452-465,1391-1416` |
| F9 | digest 自动携带全部 alerts(含无照护计划宠物) | `digest/service.go:38-45,75-88` |
| F10 | 手动核验通道已存在:`planet-cli alerts --family <id>` 打印 FamilyAlerts 结果 | `cmd/planet-cli/proactive.go:62-93` |
| F11 | timeline 写后失效单点:`invalidateAfterTimelineChange`(foundation writers 统一 invalidate) | `APP/src/core/foundation/writers.ts:61,70,76`;`APP/src/core/foundation/cache.ts:158-166` |
| F12 | 文字类记录(含 vaccine/deworm)断网走本机离线队列,payload 原样透传重放 | PRODUCT §6.4;`APP/src/core/storage/timeline-event-queue.ts:14-21` |
| F13 | 依赖现状:APP 已有 `@react-native-community/datetimepicker@8.4.4`、`dayjs`、`zod`;planet-api 仅 pgx/uuid/jwt/minio | `APP/package.json` dependencies;`planet-api/go.mod` require 块 |

---

## 1. 用户旅程(①四段式之一)

### 1.1 主旅程:记录疫苗并留下「下次」

**谁/何时**:任何可参与照护的成员(caregiver/owner),带猫狗打完疫苗/做完驱虫的当天(或补记往日)。

```text
Timeline 记录(composer 选「疫苗」或「驱虫」)
  → 填名称(现状) + 新增可选「下次日期」(快捷:30/90/180/365 天,或自定义日期)
  → 保存(既有幂等键/离线队列路径,零新写路径)
  → 事件落 timeline(payload={name, due, text?}),卡片多一行「下次到期 2027-01-14」(F3 已渲染)
```

**异常路径**:
- 断网:表单与 due 字段随既有文字类离线队列保存重放(F12),同步前不伪装已写入;
- 权限:viewer/read_only 提交被服务端 RoleForbidden 拒(既有),离线队列按码族移除并提示(既有);
- deceased/archived 宠物:创建口 mutable 闸既有拦截,due 无新增口子。

### 1.2 消费旅程:另一位照顾者看到「快到期了」

**从哪进**:打开 App → Today 首屏。到期条出现在请求横幅之下、宠物概览之上(挂载形态同 `today-notices.tsx` 的 requestContext 卡)。

```text
Today 到期条(仅 status ∈ due_soon/due_today/overdue 时出现)
  单条:「Milo 的狂犬疫苗还有 3 天到期」/「今天到期」/「已逾期 12 天」 → 点击 → 记录 composer(预填类型+名称)
  多条(≥2):「Milo 有 2 项疫苗/驱虫到期」→ 点击 → 宠物工作区到期清单
```

**到哪出**:两个出口,都是既有页面——
1. **记录**:打开 timeline composer(疫苗/驱虫预填),打完针记一条新事件(带新 due)→ 到期条消失(滚动,§3.3);
2. **改期**:宠物工作区「疫苗/驱虫」清单 → 该条目 → 编辑原事件改 due(兽医改了日期)→ 条的状态/日期随之更新。

**被动触达**(不开 App 的那位):每日 08:00 圈时区 alerts 推送(进入 7 天窗或已逾期时出现,五语按收件人 locale 渲染);开启摘要偏好者随 digest 邮件「预警」段收到(F9 自动携带)。点推送回 App(既有 deep link 通道,`data` 携 pet_id/family_id 同 care-risk 先例)。

### 1.3 清单旅程:宠物工作区(管理面)

**谁/何时**:想看「这只宠物接下来还有什么针要打」的成员,宠物 Tab → 宠物详情。

```text
宠物工作区(overview tab,MedicationsSection 同层新增「疫苗/驱虫」区)
  → 每个名目一行:名称 · 上次(日期) · 下次(日期或「待补下次日期」) · 状态(upcoming/due_soon/due_today/overdue/needs_date)
  → 行动作:记录(开 composer)/ 改期(编辑该事件 due)
```

**异常路径**:
- 清单查询失败:区内联错误+重试,不阻塞工作区其余区块;
- 名目最新事件未带 due(r2 needs_date 挂起态):清单行显示「待补下次日期」+ 行级「去补」(编辑事件);区内全部名目均处于该态时,区文案「记录还没填下次日期,补一个就不会忘」;
- 宠物被多家庭共享:清单是宠物级投影(事件跟着 Pet 走,PRODUCT §3),状态日界取主家庭(primary)时区(与 `TodayForPet` 的 primary-family 时区先例一致,`tasks/service.go:1441-1459`);
- 跨家庭时区差一天:状态可能不同——接受,以主家庭日界为准,清单里「下次日期」始终是绝对日历日。

---

## 2. 交互规格(②四段式之二)

### 2.1 页面与控件

| 面 | 控件 | 规格 |
|---|---|---|
| timeline composer(vaccine/deworm) | 「下次日期」可选字段 | 默认收起一行「+ 下次日期」;展开后:日期选择器(既有 `@react-native-community/datetimepicker`)+ 四个快捷 chip(30/90/180/365 天,基于 occurred 日期算)+ 清除。不填=不追踪该名目下次 |
| Today 到期条 | 信息条(PressableScale) | 形态复用 `requestContext` 卡(图标+主文+CaretRight);单条直述具体事项,多条聚合计数(数量复述是清单页职责,同「batch1 终局裁决⑦f」纪律的镜像);只在 date=今天 时显示(历史回看日不显示,与 handoffSections 同判据 `today-rows.ts:206`) |
| 宠物工作区清单 | 列表区 | 位于 `pet-overview-tab.tsx` MedicationsSection 之下;每行:名称/类别(疫苗\|驱虫)、上次日期、下次日期、状态(upcoming=中性,due_soon=关注,due_today/overdue=警示,needs_date=中性+「待补下次日期」标签);主动作「记录」、次动作「改期」/needs_date 行为「去补」(层级遵守页面质量基线:一主一次,不并排) |
| 推送文案 | alerts 明细行 | 五语;进窗:「{pet}的{item}还有{days}天到期(due)」;当天:「今天到期」;逾期:「已逾期{days}天」 |

### 2.2 五维齐全(空态/错误态/权限/加载态/状态集)

- **空态**:
  - Today:无到期项=不渲染条(不占位、不空卡片);
  - 工作区清单:无任何 vaccine/deworm 事件=「还没有疫苗或驱虫记录」+ 主 CTA「记录第一条」;有名目但全部处于 needs_date=「记录还没填下次日期,补一个就不会忘」+ 行级「去补」。
- **错误态**:due 查询失败——Today 条静默不渲染(到期提醒是增强信息,不得因它把 Today 打挂;失败在清单页暴露);清单页显示内联错误行+重试。composer 保存失败走既有错误路径(表单保留)。
- **权限**:读(清单/Today 条/推送)=全体可见成员(含 viewer);写(记录/改期)=可参与成员,caregiver+owner(viewer 403,既有 `requireCarePlanMemberInTx`/`RoleForbidden` 同口径——事件口实际走 `Guard.RequirePetInTx`+viewer 拦截,`timeline/service.go:847-849`)。
- **加载态**:清单区骨架(工作区既有区块形态);Today 条查询与 today 查询并行,先到先渲染,不阻塞 Today 主体。
- **状态集(服务端计算,客户端只渲染)**:`upcoming`(due > 今天+7)/`due_soon`(今天 ≤ due ≤ 今天+7)/`due_today`(due=今天)/`overdue`(due < 今天)/`needs_date`(名目最新事件未携带合法 due——追踪挂起:零推送、不进 Today 条,仅工作区清单可见,§3.3)。逾期口径对齐 F7 精神:due 当天是「今天到期」不算逾期,次日零点起才 overdue。

### 2.3 可配置性裁决:N 天窗口

v1 **固定 N=7(服务端常量)**,不做用户/家庭配置。理由:
1. 通知偏好体系只有布尔开关先例(`reminders|digest|alerts`,`NotificationPrefsUpdate` 甚至刚删掉过一个死开关),数值偏好是全新交互面,为一个窗口值不值;
2. 7 天同时适配年度疫苗与季度驱虫(都足够预约兽医);
3. 「不同家长要不同提前量」是推测性需求——等第二个真实用例出现再引入(宪法:抽象延迟)。
需要调整时改常量发布,零迁移。

---

## 3. 领域与数据影响(③四段式之三)

### 3.1 核心裁决:next-due 数据归属 = ① timeline 事件 payload 内嵌,请求时纯函数投影

**推荐①,否决②③。**

**①(采纳):`pet_events.payload.due`(civil date 字符串)+ 读侧派生。**

理由(每条有锚):
1. **最初设计就埋的这个点**:APP-DESIGN §4.3 扩展点表「新事件类型(疫苗 due…)→ type CHECK + data JSONB,将来加枚举值+定义 data 结构,不改表」;§3.3 DDL 里 `timeline_events.data` 注释原文「结构化负载:体重数值、疫苗 next-due 等」。本设计是兑现埋点,不是发明。
2. **管线已半通**:服务端校验放行 due(F1/F2)、客户端 schema 与卡片渲染就绪(F3)、五语文案就绪——「补完最后一段」的工程量显著小于任何新结构。
3. **与 alerts 纪律同型**:规则纯函数、请求时计算、不落新状态(F5)。到期状态是事实的影子,不是需要状态机的新实体。
4. **离线队列零改动**:payload 透传(F12),due 随文字类记录离线可写。
5. **改期=编辑事件,滚动=记新事件**:一个编辑面、一个创建面,都是既有路径;无第二份状态可失同步。

**②(否决):独立 `vaccine_schedule` 表。**
- 违反 PRODUCT §0 红线「延伸功能不得新建与 Occurrence/Event 平行的业务主体」:next-due 无独立生命周期(不流转、不被 care plan/分享/导出引用),按 APP-DESIGN §3.4 R4 的归一化分界线「有流转、被引用的实体必须归一化,纯档案事实可以冗余」,它属于事实附属;
- 双写漂移:事件编辑(改 due)/软删/撤销都要同步改表,任何漏同步都是脏到期项;事件路径已有幂等键、payload_version、软删语义,新表全部要重造;
- 「重而清晰」的清晰是假清晰:真正的单一事实源本来就是那条疫苗事件。

**③(否决):复用 care plan interval 规则引擎。**
任务书要求区分的两个语义,代码证据上全部错位:
- **「到期提醒」≠「照护执行」**:occurrence 是执行行,有完成/跳过/撤销/负责人链/照护统计(CareStatsDay)/missed 判定(F7/F8)。疫苗到期塞进 occurrence 会:missed 标记制造「疫苗逾期未完成」的错误压力语言与照护统计污染;完成写的是 `care_task_completed` 而非 `vaccine` 事实——时间线类型直接错(记录页白名单语义被破坏);
- **interval 锚点错**:interval 自规则创建日起算(F8 `schedule.go:146-153`),而疫苗下次日期锚点是实际注射日+兽医医嘱(任意天数),不是规则创建日;
- **once 语义错配**:once 必须带时刻(F8 founder 裁决),而到期是日历日不是时刻;且每针一规则=规则垃圾,「补打滚动」=删旧规则建新规则,不是用户心智;
- Today 集成并非只有 occurrence 一条路:Today 条作为读投影挂载(§3.4)同样进 Today,且不占用执行位、不进责任链、不进完成清单。

**结论**:①+alerts 式投影。「到期检查可否与 MarkMissed 同型」的答案:**不需要同型**——MarkMissed 存在是因为 occurrence 是物化的执行行,missed 是持久状态迁移;due 是请求时可派生的影子, alerts 纯函数形态(F5)才是正确的同型对象。**不新增任何 sweep/调度分支**;唯一调度触点是既有每日 alerts 档(08:00,已覆盖「到期当天早上」的时点诉求)。

### 3.2 数据模型:零新表、零迁移、零新事件类型

- **payload 规约(vaccine/deworm)**:`{ "name": string(必填,现状), "due": "YYYY-MM-DD"(可选,新增), "text": string(可选,现状) }`。
- **服务端校验扩展**:`requireName` → `requireNameWithOptionalDue`:due 出现时必须形如 `YYYY-MM-DD` 且为合法日历日;**不限制 due 相对 occurred_at 的先后**——补记旧针时「下一针已过期」是合法真实状态。写入仍走既有 Create/Update(幂等键、事务、软删全复用)。
- **读取侧宽松纪律**:读路径遇到格式坏的 due(历史 API 直调可能写过)忽略该 due,该事件不进追踪集,不炸清单(镜像 `ParseSchedule` 读宽松先例,`tasks/schedule.go:41-47`)。
- **时区口径**:due 是 civil date 字符串,与 `care_rules.effective_from`、`Schedule.OnceDate`、`occurrence.due_date` 同族——系统内 civil date 一直以日期形态存在;PRODUCT 时区铁法约束的是**时刻**(不存本地时刻),due 不存时刻,状态日界在服务层按家庭时区取(§3.4/§3.5)。家庭时区变更时:due 日期不变,状态随新日界重算——无迁移、无追改,符合铁法。
- **归档/离世**:`pets.status='active'` 过滤(F5 ActivePets 同款)——deceased 封存宠物不再提醒(与「数据保留只读」一致),archived 不提醒。

### 3.3 派生规则(唯一的业务核心,纯函数)

对每个 (pet_id, event_type ∈ {vaccine,deworm}, trim(name)) 分组,取**最新一条未删事件为准——不论它是否携带 due**(occurred_at 相同按 id 降序稳定 tie-break,镜像 `alerts/rules.go:124-129` 先例)。仅当该最新事件携带合法 due 时才产生追踪状态;否则名目进入 `needs_date` 挂起态:

```text
latest(pet, type, name) = 最新一条未删事件(不论 due 与否)
status = needs_date      若 latest 无合法 due(含读侧宽松忽略的坏格式,§3.2)
       | overdue         若 due < familyToday
       | due_today       若 due = familyToday
       | due_soon        若 familyToday ≤ due ≤ familyToday + 7    // dueSoonDays 常量,§2.3
       | upcoming        其它
```

> **r2 修正(审查 P1)**:r1 规则是「取最新一条**带 due** 的事件」,在疫苗滚动常态(历史各针各自带 due)下自相矛盾——(a) 新针不填 due 时,旧针的过期 due 残留生效,系统对已补打的疫苗持续假「已逾期」推送;(b) 「编辑去掉 due 停止追踪」被次新 due 接管语义抵消,并不成立;(c) 与 §2.1 composer 契约「不填=不追踪该名目下次」冲突。锚点改为「最新事件不论 due」后三处同时消解:新针无 due=needs_date 挂起(旧 due 不再生效)、编辑去 due=立即挂起、软删=次新事件(不论 due)接管。

- **补打/滚动**:记新事件(带新 due)→ 新事件成为名目最新 → due 滚到新日期;**新事件不填 due → 名目转 needs_date**(兽医未告知下次日期的常见场景:绝不用旧 due 制造假逾期);旧事件仍在时间线(事实不动)。
- **改期**:编辑该最新事件的 due(payload 整体替换,既有 PATCH)。
- **停止追踪/挂起**:①编辑去掉最新事件的 due → 立即转 needs_date;②软删最新事件 → 次新未删事件接管(有合法 due 按其追踪,否则 needs_date;名下再无未删事件则名目消失)。
- **名字即分组键**:自由文本,trim 后精确匹配。「Drontal」与「海乐妙」=两个名目各自追踪(诚实:不同药各有下一针);改名的编辑=换组。不做受控目录(是更大的产品决定,见 §5)。

### 3.4 读路径 API(新只读端点,projection 而非主体)

**`GET /api/v1/due?family_id=<id>` / `?pet_id=<id>` / 无参(All)** —— scope 语义与 `GET /api/v1/today` 完全同构(`tasks/http.go:322-341`):family 分支做成员判定(非活跃成员 404);pet 分支 `RequirePet`(read);All 分支走 `AccessiblePets` 聚合(镜像 `timeline.ListAggregate`, `timeline/service.go:697-732`)。

```jsonc
// 200(纯读,无物化、无写事务)
{
  "date": "2026-10-14",              // 参照日(family/primary-family 时区的今天)
  "pets": [{
    "pet_id": "…", "pet_name": "Milo",
    "items": [{
      "event_id": "…",               // 派生源事件(编辑/跳转锚点)
      "type": "vaccine",             // vaccine | deworm
      "name": "狂犬疫苗",
      "due": "2026-10-20",           // needs_date 时为 null
      "status": "due_soon",          // upcoming|due_soon|due_today|overdue|needs_date
      "days": 6,                     // 距到期天数(overdue 为已过天数,恒正;needs_date 为 null)
      "last_occurred_on": "2025-10-20"
    }]
  }]
}
```

- 端点返回全部名目(含 upcoming 与 needs_date)——工作区清单要看 8 个月后的下一针、要提示待补;**Today 条由客户端只取 `due_soon|due_today|overdue`**(§2.1)。
- **模块归属(r2,审查 P3 采纳)**:handler 落 **timeline 模块**——它拥有 pet_events 的 payload 形状知识(`timeline/sweep.go:1-9` 头注先例),且已有 Guard/AccessiblePets 的聚合读先例(`ListAggregate`);alerts 只加规则与 repo 查询。§4.5 的 `go test ./internal/modules/timeline/...` 因此天然覆盖端点测试,不逃出验收命令。
- **All 分支顶层 `date` 语义(r2,审查 P3 采纳)**:多家庭跨时区下「参照日」单值有歧义——`date` 仅供客户端展示参照(All 分支取请求方可达家庭中第一家庭的今天),**状态一律以每宠主家庭日界为准**(§1.3 裁决不变);Today 条显隐沿用客户端 civilToday 判据(`today-rows.ts:206` 先例),不消费该字段。
- **为何不塞进 `GET /today` 响应体**:Today 是物化写路径(事务内 materialize+MarkMissed, `tasks/service.go:1391-1416`),due 是纯读投影,不应耦合进写事务;且 due 是宠物级(非家庭级)事实,聚合维度与 today 的 family×occurrence 不同;独立端点让 Today 的写语义零改动。旧客户端零影响(纯新增)。
- 有界性:疫苗/驱虫是低频事件(每宠每年个位数),单家庭全量扫描远小于既有 `EventFeed LIMIT 5000` 防御上限;查询同款 LIMIT 防御。索引:`ix_pet_events_pet_time (pet_id, occurred_at DESC)` 已覆盖按宠扫描(`0001_initial.up.sql:673`),无需新索引。
- 客户端接线:`planetApi.due()` + 新 query key;失效挂进 `invalidateAfterTimelineChange`(F11,一行)。

### 3.5 提醒路径:alerts 规则(推送/digest 全自动)

- **新规则** `alerts/rules.go`:`VaccineDueAlerts(pets, dueEvents, familyToday) []contracts.Alert`:
  - `Kind = "vaccine_due"`;`Code = "vaccine_due_soon" | "vaccine_due_overdue"`(双 code 承载两态措辞,镜像 `med_possible_miss` 的 code≠kind 先例,`alerts/rules.go:28-37`);
  - 触发条件:status ∈ {due_soon, due_today, overdue}(needs_date/upcoming 零告警);**逾期 >30 天停止推送**(镜像 medication_silence 的 30 天窗,`alerts/repo.go:81`),应用内清单仍显示 overdue(推送降噪,不减事实);
  - `Severity`:due_soon/due_today=`watch`,overdue=`warn`;
  - `ID = "vaccine_due:" + event_id`(状态随事件,同 weight_change 先例);`OccurredAt` = due 日 family-tz 午夜转 UTC(排序用);`Data` 携 pet_id/event_id/type/name/due/days;
  - `Record`(推送明细行,字段序协议):`JoinItem(code, petName, itemName, dueStr, daysStr)`。
- **服务组装**:`FamilyAlerts` 增加 `Repo.DueEventFeed(familyID)`(家庭活跃宠物的全部 vaccine/deworm 未删事件,无时间窗——due 可远在未来/过去)与 `Repo.FamilyTimezone(familyID)`(读 `families.timezone`,规则内取 familyToday 日界)。契约签名不变(`contracts.FamilyAlertsProvider`,digest/notify/cli 零改动)。
- **文案**:`notify/copy_alerts.go` 增 `KeyAlertVaccineDueSoon`/`KeyAlertVaccineDueOverdue` 两键五语 + `alertDetailArgs` 两 case(字段序双侧测试钉死,该文件头注协议)。
- **去重/时区纪律**(任务书要求的一致性):完全复用 F6——每日一次、`job_runs (alerts, family, date)` 持久去重、空预警不打扰、圈时区 ≥08:00 判定、按收件人 locale 渲染、偏好开关走既有 `alerts` pref。**不新增调度分支**。
- **digest**:零改动自动携带(F9)。

### 3.6 客户端改动面(全部增量)

| 文件 | 改动 |
|---|---|
| `timeline/composer.tsx` | vaccine/deworm 增加「下次日期」可选字段+快捷 chips;保存 payload 拼 `due`(F2 的 `{name,text?}` → `{name,due?,text?}`) |
| `features/today/today-notices.tsx` | 新增 DueNotice 条(§2.1 形态;仅 civilToday 显示) |
| `features/pets/pet-overview-tab.tsx` | 新增「疫苗/驱虫」清单区(MedicationsSection 同层) |
| `core/api/planet-api.ts` | `Due` 类型 + `due()` 方法 |
| `core/foundation/cache.ts` | `invalidateAfterTimelineChange` 内加 due key(F11) |
| `i18n/{zh,en,ja,es,pt}` | 新键(清单/状态/条文案);`timeline.nextDue` 已存在复用 |
| `features/timeline/registry.ts` | 零改动(zod 已含 due,F3);编辑表单回填 due 一行 |

**新依赖:零。** 日期选择=datetimepicker(已有)、日期算术=dayjs(已有)、校验=zod(已有);后端零新增包(F13)。触发本核查的原因:任务书红线「新依赖必须先核查两仓 package.json」。

### 3.7 与 Occurrence-Event 主体的关系(红线复核)

- 不新增业务主体:tracked 名目是 `pet_events` 的请求时投影,生命周期严格子集于事件(事件软删→名目消失;事件编辑→名目变化);不落表、不落缓存行、无独立 API 写路径(写仍是 timeline 事件 CRUD)。
- `/due` 是 projection 端点,与 `/care-stats`、`/today` 同族(读投影),不是平行业务对象。
- 免费协作闭环:不改 care plan/occurrence/request 任何语义;Today 条是信息面,不进执行清单、不进完成/跳过/统计。

---

## 4. 验收(④四段式之四)

> 施工后执行;本文档本身不跑代码。以下为施工波的验收合同。

### 4.1 服务端单测(planet-api go test)

1. **规则五态**:due=today+10→upcoming(不告警);today+7/today+1→due_soon(watch);today→due_today;today-1→overdue(warn);边界日 today+8 不进窗;latest 无合法 due→needs_date(零告警)。
2. **滚动**:同 (pet,vaccine,name) 旧事件 due=today-30、新事件 due=today+180 → 名目 due=+180,无告警。
3. **挂起(r2,审查 P1 混合用例)**:同 (pet,vaccine,name) 旧事件 due=today-30、**新事件无 due** → 名目 status=needs_date、due=null、**零告警**(旧 due 不得残留生效);给新事件补 due=today+10 → 转 upcoming;去掉新事件 due 再度回 needs_date。
4. **归组**:同名 trim 归组;异名不归组;tie-break(同 occurred_at 取 id 大者)。
5. **降噪**:overdue>30 天不出 alert;due 坏格式不进追踪集且不 panic(按 needs_date 处理)。
6. **时区**:同一 UTC 时刻,family tz=UTC+8 与 UTC-5 的 familyToday 不同→状态差一天(用 `clockx` 注入 now 断言)。
7. **校验**:`requireNameWithOptionalDue`——due 合法/非法格式/边界日期(闰日、月末)。
8. **契约钉死**:Alert.Record 字段序与 `notify/copy_alerts.go` 消费端桥接测试(既有双侧测试模式扩展)。

### 4.2 服务端集成(真实 DB,迁移器测试形态)

1. `POST /api/v1/pets/{id}/timeline`(vaccine,带 due)→ `GET /api/v1/due?pet_id=` 出现该名目;
2. `PATCH /timeline-events/{id}` 改 due → 状态更新;去掉 due → 名目转 needs_date(due=null),且旧事件残留 due 不接管(§3.3 r2 规则);
3. `DELETE`(软删)带 due 事件 → 次新未删事件接管/名目移除;
4. viewer 调 `/due` 200(读);viewer POST 疫苗事件 403(既有);
5. 非成员 `?family_id=` → 404;deceased 宠物 → 不在 `/due` 与 alerts;
6. `planet-cli alerts --family <id>`(F10 真实栈走查):造 due=today 的疫苗事件 → 输出含 `vaccine_due` 条目(JSON 断言 kind/code/severity/days);再造同名无 due 新事件 → `vaccine_due` 条目消失(挂起零告警)。

### 4.3 APP e2e(Playwright,`APP/e2e/core-flows.spec.ts` 增补)

1. composer 记疫苗「Rabies」+ 快捷 chip 90 天 → 事件卡出现「下次到期」;
2. 改 occurred 至 89 天前(编辑事件)→ Today 出现到期条(due_soon)→ 点击 → composer 预填;
3. 再记一条 Rabies(新 due=+365)→ Today 条消失(滚动);
4. 工作区清单:空态(无记录)→ 记录后单行 → 改期入口改 due → 状态色变;再记同名无 due 新针 → 行转「待补下次日期」且 Today 条消失(§3.3 r2 挂起)→ 行级「去补」补上 due → 状态恢复;
5. 断网记录(文字队列):飞行模式记疫苗带 due → 提示离线保存 → 联网重放 → 服务端有 due;
6. zh/en 双语关键文案断言(i18n 键渲染);
7. Today 条查询失败模拟(拦截 /due 500)→ Today 主体照常渲染、无条、无报错弹层。

### 4.4 免费/付费归属复核(施工后 grep 证据)

- `grep -rn "entitlements\|requireEntitlement\|Quota" <新改动文件>` 零命中;
- `/due`、alerts 规则、composer due 字段、Today 条:free/pro 用户行为完全一致;
- 不新增任何 402/403 配额码。

### 4.5 走查命令(真实栈)

```bash
# 后端:单测+集成
cd planet-api && go test ./internal/modules/alerts/... ./internal/modules/timeline/...
# 手动核验推送生成链路(§4.2.6)
go run ./cmd/planet-cli alerts --family <id>
# 客户端
cd APP && bun run typecheck && bun run lint && bun run test:e2e
# 提交前(用户默认指令)
bun run precheck
```

---

## 5. 开放问题(需 founder/施工波复核)

1. **窗口 N=7 固定**(§2.3):不做用户配置是否接受?若要配置,挂家庭级设置(新偏好面)还是成员级(与通知偏好同表)——推荐维持固定,出现真实分歧需求再做。
2. **逾期期每日重复推送**(§3.5):进窗后每天 08:00 都推(与 medication_silence 同型),30 天后停。若嫌吵,替代=「进窗一次+到期日一次+逾期每周一」——需要状态或复合去重键,成本上一档;推荐先按每日上线观察。
3. **名字自由文本归组**(§3.3):不改受控目录(疫苗目录=物种×地区知识库,是独立产品决定)。后果:用户改名/拼错会分裂名目——靠清单页可见性自愈(两行都看得见)。

## 6. 施工清单(审查门后)

后端:registry 校验扩展 / alerts 规则+repo 两查询 / notify 文案两键五语 / `/due` handler+组装(**timeline 模块**,§3.4) / go 单测+集成。
客户端:composer due 字段 / DueNotice / 工作区清单区 / API+invalidate / i18n 五语 / e2e 增补。
文档同步:APP-BEHAVIOR-CONTRACT 新端点与 due 字段规约入表(该契约 §77 的同步义务);PRODUCT §3.3 F5 行补「含 next-due 投影」一句(现行事实源随实现更新)。

# 05 · 启动体验系统性重设计(BOOT)

> **设计稿 v2——已过审查门**(2026-10-14 独立审查 verdict=pass:P2×1(web 隐私残留,已修:web blob 改走 sessionStorage)+ P3×4(引用失准/状态机分支缺漏/清理矩阵漏键/时序矛盾,均已修);修订记录见 §7)。
>
> 任务锚:订阅启动设计 §6.7「新增 P0:启动体验系统性重设计」([SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md:171-180](../commerce/SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md),founder 2026-10-13 现场实怒:「每次打开都是 restoring your session / preparing your workspace」)。
> 事实源:[PRODUCT.md](../PRODUCT.md) §6.4(离线事实裁决)、§0(层级红线)、§7(四态验收);初始设计锚:[archive/APP-DESIGN.md](../archive/APP-DESIGN.md)。
> 本文所有行号引用均为 2026-10-14 工作区实读(main @ cbc1764 + 工作区改动),独立复核可直接按 `path:line` 打开。

---

## 0. 根因(全部实锤到代码,不是文案问题)

回访用户每次冷启动被两道全屏 loading 门串行拦住,门后还有第三段「半截」:

1. **门① session loading 门** — `APP/app/_layout.tsx:65-79`:`status === 'loading'` 挡整棵导航树(公开 share/invite 路由除外)。loading 状态由 `APP/src/core/providers/session-provider.tsx:829-870` 的 restore effect 产生:`readSessionToken()`(SecureStore 异步读,快)+ **一次 `planetApi.me.get()` 网络往返**之后才 `setStatus('authenticated')`。即今天的行为把「有没有 token」这个本地事实,交给了网络往返来回答;离线弱网时用户要等 fetch 失败甚至 15s 超时(`APP/src/core/config.ts:26` `requestTimeoutMs: 15_000`)才放行。
2. **门② activation 查询门** — `APP/app/index.tsx:23-29`:`activation.isLoading` 挡进 tabs。`useActivation`(`APP/src/core/activation/hooks.ts:6-23`)是纯网络查询(`GET /me/activation-summary`,`APP/src/core/activation/readers.ts:47-58`),而 QueryClient 无任何持久化(`APP/src/core/query/query-client.ts:11-25`,内存缓存,gcTime 5 分钟)→ **每次冷启动缓存必 miss,门②必然出现**,与网络好坏无关。
3. **第三段(已有半成品,被前两门封死)** — Today 屏自身其实已有离线快照兜底:`use-today-queue.ts:82-100` 读 `readTodaySnapshot`,`screen.tsx:226-242` 用 `query.data ?? todaySnapshot?.today` 渲染、有快照即不出整页 loading。但前两门不放行,Today 屏根本没机会挂载。

顺带实锤的既有缺陷:冷启动 `/me` 请求**发了两次**——restore effect 直接调 `planetApi.me.get()`(`session-provider.tsx:842`),同时 `LocaleGate` 又挂了 `queryKeys.me` 的 useQuery(`APP/app/_layout.tsx:40-44`),两路互不共享。本设计一并收口。

---

## ① 用户旅程

四条主旅程 + 异常路径。**谁**:已登录过的回访用户(founder 实怒的场景)、首次安装用户、刚完成登录的用户、被服务端判定会话失效的用户。

### A. 回访冷启动 · 在线(核心旅程,本次重设计的主对象)

| | |
|---|---|
| 何时/从哪进 | 杀进程或冷启动 App(native:keychain 有 token;web:同标签页 reload,sessionStorage 有 token) |
| 经过 | 原生启动图 → 字体/语言 gate(既有,`_layout.tsx:196-197`,返回 null 期由启动图覆盖)→ **存储读取(token + userId + 查询缓存,零网络)→ 有 token 即刻 authenticated,缓存 hydrate 进 QueryClient** → `index` 用缓存中的 activation 相位直接 redirect → `(tabs)` 落在**上次访问的 tab** → 屏内渲染缓存数据 + 后台刷新(顶缘轻量指示)→ 刷新落地静默替换 |
| 到哪出 | **≤1s 看到真实内容**(验收硬指标),无任何全屏 loading 文案 |
| 关键约束 | 门①退化为「存储读取期」(几十 ms 量级);门②只在缓存全空时出现 |

### B. 回访冷启动 · 断网

同 A 的前半程(hydrate 全部本地,不需要网络)→ 屏内渲染缓存数据 → 后台刷新失败 → 屏内既有离线/错误态接管:Today 屏显示「离线列表(保存于 …)」条(`today-notices.tsx:138-145`)与重试入口;Requests/Timeline 等未持久化 tab 显示各自既有空态/错误态。**只读浏览 + 离线完成入队(既有能力,`PRODUCT.md §6.4`)不受影响**。

### C. 首次安装 / 无 token(路径不变)

restore 读不到 token → `unauthenticated` → `/auth`。门①只在存储读取的瞬间存在(可能一帧都不可见),门②不出现。**本设计不改变首装路径的任何语义。**

### D. 登录后的首次进入(§6.7 允许的整页 loading 例外)

登录成功(signIn 时缓存已被刻意清空,见 §3.4)→ activation 无缓存 → 「Preparing your care workspace」整页 loading 出现**这一次** → 相位判定 → families/new / activation / tabs。这是「缓存全空」的合法例外,文案保留不删。

### 异常路径

| 异常 | 行为 |
|---|---|
| token 已过期(乐观认证后被踢) | 用户先看到缓存内容,首个后台刷新 401 → 既有 `unauthorizedHandler` 幂等链(`session-provider.tsx:139-166`:toast + 清 session + `queryClient.clear()` + 回 auth)。与现状的差异仅在于:现状用户盯着 loading 门被踢,新设计用户**看过内容后被解释性地踢**(toast「请重新登录」),语义更诚实。`authenticatedRef` 已保证只有真正进过 authenticated 态才发 toast(`session-provider.tsx:116,144`) |
| 断网且有离线队列 | 乐观认证立即使队列同步 effect 挂上(`session-provider.tsx:189-242`);三条队列对 401/网络错全部 retryable 不丢弃(`care-action-queue.ts:128-133`、`pending-today.ts:122-127`、`timeline-event-queue.ts:120-122`),token 过期引发的 401 不会丢用户事实,回登录后下次登录重放 |
| 跨日冷启动 | `today` 默认 scope 的查询键不含日期(`foundation/readers.ts:46-48`:scope=all 且无选择日期时不传 date)→ 在线时先短暂渲染昨日缓存、后台刷新 ≤1 RTT 替换;断网时渲染昨日缓存但离线条带 savedAt 时间(既有 snapshot 同语义,不是本设计引入) |
| 删号 | 既有清理矩阵(`account/screen.tsx:175-185`)+ 新增持久化缓存清理,见 §3.4 |
| web 浏览器重启 | token 在 sessionStorage(`secure-storage.ts:7-13` 既有裁决:intentionally session-scoped)→ 回访=同标签页 reload;浏览器重开进 auth 是既有安全姿态,本设计不改变(见 §6 开放问题 O1) |

---

## ② 交互规格(五维)

### 2.1 页面与控件

**不改任何屏内页面。** 本次改动全部在壳层(启动时序)与数据层(持久化),屏内 UI 继承既有状态机。新增/调整的控件只有一个:

**BootRefreshIndicator(新增,壳层)**

| 维度 | 规格 |
|---|---|
| 位置与形态 | 导航树最顶缘 2dp 横条,不占布局空间(absolute,覆盖于内容之上);`theme.colors.coral` 低饱和渐隐 |
| 出现条件 | 仅「冷启动 hydrate 后的首个后台刷新批次」:挂载时 `useIsFetching() > 0` 即显示;隔离为独立小组件放在 `RootNavigator` 内,只有它自身随计数重渲染 |
| 退场 | 首批 fetch 计数归零即淡出(150ms);之后屏内的下拉刷新/pending 条不再触发它(组件在首批落定后卸载) |
| 加载态 | 自身就是加载指示;reduced-motion 时改为静态半透明条(不做动画) |
| 空态/错误态 | 无——它只表达「正在刷新」,成功失败都静默退场,结果由屏内既有错误态表达 |
| 可访问性 | `accessibilityRole="progressbar"` + `accessibilityLabel = t('app.backgroundRefreshing')`(新 i18n key,五语言:en/zh/es/ja/pt,目录 `APP/src/i18n/`) |
| 被否备选 | 复用 Today 屏内「同步中」条(`today-notices.tsx:147-158`)——它是屏级状态,盖不住多 tab;全局 toast——刷新是常态背景行为,toast 是打断 |

**门①/门② 的去向**

- 门①(`_layout.tsx:65-79`):**保留代码分支**但语义降级为「存储读取期」;它还将继续保护 public share/invite 直达路由的例外逻辑(`:59-64`),该逻辑不动。
- 门②(`index.tsx:23-29`):保留,仅在 `activation` 无缓存数据时生效(首装登录后那次)。B13 规则(`index.tsx:30-37`:摘要失败不猜)不变——缓存数据是「上次成功的真实读取」,不是「问不到」。

### 2.2 「上次屏」恢复(规格)

- 范围:**仅恢复最后访问的 5-tab 之一**(today/timeline/requests/pets/more)。持久化 `planet.last-tab.<encodeURIComponent(userId)>`(kv,照抄 `APP/src/core/scope/scope-provider.tsx:84,104-114` 的既有 per-user 键拼接与写入模式),(tabs) 初始路由指向它,默认 today。
- **明确不恢复深层路由**(pet 详情/settings/records 等):路由参数指向的资源可能已被删或移交(PRODUCT §6.3 生命周期),恢复一个指向已删宠物的详情页是「用陈旧缓存猜状态」,违背 B13 的「不猜」纪律;收益(罕见深屏回访)与风险不成比例。记录为有意不做。

### 2.3 各屏状态继承(空态/错误态/加载态逐维)

| Tab | 冷启动在线 | 冷启动断网 | 依据 |
|---|---|---|---|
| 今天(默认) | 缓存即渲染 + 后台刷新;刷新批次中顶部 2dp 指示 | 缓存即渲染 + 「离线列表(保存于 …)」条 + 重试;离线完成照常入队 | `screen.tsx:226-242` 既有 fallback 链天然接管 |
| 时间线 | 既有屏内 loading(未持久化,可接受——非首屏承诺) | 既有错误态/空态 | 本设计不扩大时间线断网承诺,与 PRODUCT §6.4 只承诺「文字记录不丢」一致 |
| 请求 | 既有屏内 loading | 既有错误态;**不持久化**(见 §3.3 黑名单) | 陈旧「待回应」卡会诱导错误动作 |
| 宠物/更多 | accessible-pets/families 已持久化 → 缓存渲染 + 后台刷新 | 同左,只读浏览 | — |

### 2.4 权限

零新增权限。存储沿用:native 走 SecureStore(keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY`,与 token/today 快照同一姿态);web 走 sessionStorage(与 token 同生命周期,见 §3.4 裁决)。多租户数据隔离见 §3.4(红线级)。

---

## ③ 架构与领域影响

**总判断:零新表、零新事件、零新枚举、零新调度器、零 API 变更。** 本设计是纯客户端读模型缓存层 + 启动状态机调整,不触碰 Occurrence-Event 主体(PRODUCT §0 红线:不建平行业务主体——连延伸层都算不上,是地基读路径的表现层优化)。失效图(`foundation/cache.ts`)完全不变:hydrate 进的是同一个 QueryClient,一切 invalidate 语义照旧。

### 3.1 session 乐观启动状态机(改 `session-provider.tsx` restore effect)

```text
现行为(:829-870)                       新行为
─────────────────────────────         ─────────────────────────────
read token+userId                      read token+userId + 读 blob(时序见 §3.2:
  └─ 无 token → unauthenticated          token/userId 并行 → 拿到 userId 后读 blob)
  └─ 有 token:                            └─ 有 token:
       await me.get()  ← 网络门                hydrate(queryClient)        ← 同步内存操作
       ├─ 成功 → authenticated                 setStatus('authenticated') ← 即刻,不等网络
       ├─ 401   → 清 session → auth            后台:queryClient.fetchQuery(queryKeys.me, { retry: false })
       └─ 其他错 → authenticated                    ├─ 成功 → 规范化 userId 并 writeSessionUserId
                                                     ├─ 401 → api-client 既有 unauthorizedHandler
                                                     │         (:74 → :139-166)接管,幂等
                                                     └─ 其他失败(网络/超时/5xx)→ catch 后 no-op
                                                               (乐观认证已授予;retry:false 消除
                                                               默认重试×15s 超时的 ~45s 静默放大,
                                                               query-client.ts:16-19 + config.ts:26)
```

要点:

1. **后台校验复用 `queryKeys.me` 查询**(`fetchQuery` 与 `LocaleGate` 的 useQuery 共享缓存)——顺带修掉现状冷启动双 `/me` 请求(`session-provider.tsx:842` + `_layout.tsx:40-44`)。被否备选:保留直接 `planetApi.me.get()`——维持重复请求;仅靠首个业务查询 401 兜底——Today 必挂载所以功能上可行,但「零陈旧查询也要校验」的确定性没了,且 userId 规范化没有落点。
2. **注释修订义务**:`session-provider.tsx:110-115` 关于「冷启动 restore 的 401 不发 toast(登录页已在眼前)」的裁决记录,在乐观启动后前提改变——用户已看到过内容,toast 是正确语义(旅程 A 异常行)。施工时必须改写该注释,不得留下与行为矛盾的裁决记录。
3. **离线队列**:零改动。队列 sync 挂 `status === 'authenticated' && userId`(`:189-190`),乐观启动后更早开跑;401 全 retryable(§①异常路径表,已核实三处),不会因乐观认证丢事实。
4. `SessionStatus` 三值(`session-provider.tsx:49`)不变——`loading` 仍是合法初值,只是存活窗口从「秒级」缩到「存储读取级」。auth 屏对 loading 的等待(`auth/screen.tsx:139`)照旧,避免登录页闪现。

### 3.2 查询持久化模块(新文件 `APP/src/core/query/persist.ts`,≤200 行)

**选型结论:零新依赖。** 用 `@tanstack/react-query` 自带的 `dehydrate` / `hydrate` / `defaultShouldDehydrateQuery`(已在包内,实证:`node_modules/@tanstack/react-query/build/modern/index.d.ts:43-46,80-81`),存储复用现有 `kv.ts` 既有通道:**native 走 SecureStore 分块写**(iOS 2KB 限制的既有解法,`kv.ts:11-74`,与 `today-snapshot.ts` 同通道同安全姿态,该通道已在生产承载同等量级的 Today 数据);**web 走 sessionStorage**(`kvGetSessionJSON`/`kvSetSessionJSON`,`kv.ts:196-230`,既有 API,零新抽象)——见 §3.4 裁决。

**依赖核查记录**(纪律:新依赖必须先核查两仓):

| 候选 | 核查结果 | 裁决 |
|---|---|---|
| `@tanstack/react-query-persist-client` | 两仓均无(`APP/package.json:32-74` 无;`www.joinplanet.pet/package.json` 无;`node_modules/@tanstack/` 下只有 query-core、react-query,实测 ls) | **否**。其核心抽象 `PersistQueryClientProvider` 的设计是「restore 完成前渲染 fallback」——这恰恰是我们要退役的 loading 门形态;若只用其 save/restore 函数,所需代码 ≤60 行,不值得为此引依赖 |
| `react-native-mmkv` | 无 | **否**。新原生模块 = 预构建/发布管线(Xcode Cloud)动荡;加密密钥的存放本身是新的安全决策;同步读的优势对我们不关键(瓶颈是网络往返,不是 SecureStore 读) |
| `expo-sqlite` | 无(`expo-file-system` 已有但明文不加密) | **否**。KV 快照用 SQL 是杀鸡用牛刀;明文文件把健康数据降出加密姿态,劣于现状 |
| `@react-native-async-storage/async-storage` | 无 | **否**。明文、比已有的 kv 抽象无增益 |

> 自研范围与移除条件(AGENTS.md 原则 8):本模块只做「白名单 dehydrate → 单 blob 写 / 读 → hydrate」与防复活守卫,不实现官方 persist-client 的重试/版本迁移/bumpy 恢复。**若未来需要 persister 版本迁移或多客户端串行恢复,应改引官方包并删除本模块,禁止在此文件上叠功能。**

**运行时行为**:

- **键(单 blob)**:`planet.query-cache.v1.<userId>`。单键使登出/删号清理 = 一次 `kvRemove`,多租户红线最简实现。
- **写**:QueryCache subscribe + 2s debounce,仅 dehydrate 白名单键;**守卫:仅当「活跃会话 userId 非空」时落盘**——防止 `queryClient.clear()`(登出/401/换号三处:`session-provider.tsx:160,894,952`)之后的缓存事件把已清空的 blob「复活」写回旧账号名下。
- **读/时序**:restore effect 内,`readSessionToken` 与 `readSessionUserId` **并行** → 拿到 userId 后**串行**读 blob(键含 userId,SecureStore 无枚举 API,三者无法并行;两次 SecureStore 读仍为 ms 级,门①「存储读取期」结论不变)→ `hydrate()`(同步)→ `setStatus('authenticated')`。hydrate 先于任何依赖缓存的组件挂载(同一 effect 内完成,React 渲染在 effect 之后),`index` 的 activation 判定拿到的必是已 hydrate 的缓存。
- **新鲜度治理**:统一 `maxAge = 7d`(按 dehydrated `dataUpdatedAt` 过滤,过期条目不 hydrate);`activation-summary` 单键加严为 24h——防止「很久以前装过、未走完激活」的陈旧相位把用户错送进 families/new。跨日 today 陈旧见 §① 异常表(既有语义)。
- **尺寸治理**:today 在落盘前裁剪为「boot scope + 当前 scope」两条(其余 scope 丢弃);blob JSON > 256KB 时优先丢弃 today 大 scope 条目。理由:SecureStore 分块 480 字符/片(`kv.ts:11`),无治理的 today 多 scope 会造成数百次 keychain 写。`today-snapshot` 的 24 条 LRU(`today-snapshot.ts:63-65`)是同量级已在生产验证的参照。
- **web**:blob 走 **sessionStorage**(`kvSetSessionJSON`/`kvGetSessionJSON`,`kv.ts:196-230` 既有 API:web 分流 sessionStorage、native 分流 SecureStore,恰好一对一命中本设计两端诉求)——同标签页 reload 即命中(§4.1 e2e 的「回访」语义);浏览器/标签页关闭自动随 token 一同清除,不留明文残留(裁决记录见 §3.4)。sessionStorage 单条 ~5MB 上限,blob 256KB 治理后余量充足。

### 3.3 持久化白名单 / 黑名单(逐键裁决,键表 = `APP/src/core/query/keys.ts`)

**持久化(冷启动渲染链所需读模型)**:

| 键 | 理由 |
|---|---|
| `me` | LocaleGate 语言解析(`_layout.tsx:40-49`)、桌面 web 工作台侧栏用户信息(`web-workspace-rail.tsx:50-54`,同键 useQuery) |
| `activation-summary` | 门②退役的直接依赖;小对象(3 个数字 + 1 个布尔,`activation/state.ts:6-11`) |
| `families` | 壳层/更多页/范围选择的骨架 |
| `pets`(familyId)、`pets/accessible` | 宠物 tab 与 Today 分组渲染 |
| `me/preferences` | 默认 scope 解析兜底(`APP/src/core/scope/scope-provider.tsx:44-58`,本地 scope 缓存未命中时) |
| `today`(限 §3.2 裁剪后的条目) | 首屏内容本体 |

**绝不持久化(含敏感/易错,逐类理由)**:

| 键 | 理由 |
|---|---|
| `care-requests/*`、`care-handoff-batches/*` | 时效性责任卡:陈旧「待回应」会诱导对已过期/已处理请求的错误动作;动作本身已有幂等离线队列,读侧不放大承诺 |
| `timeline/*`(含 aggregate) | 分页大对象、高 churn;断网承诺是「写不丢」(§6.4)不是「读可缓存」 |
| `shares`、`transfers` | 协作者 PII + 权限敏感面,无首屏价值 |
| `me/usage`、`usage`、`capabilities` | 配额与权益快照:陈旧值会误导撞墙/paywall 判断(与订阅 S1/S3 直接相关,宁可慢不可错) |
| `sessions`(me/sessions) | 活跃设备清单,安全敏感 |
| `alerts`、`trends*`、`care-stats`、`family-audit`、`notification-prefs`、`medications`、`care-plans`、`care-assignments`、`care-responsibility`、`family-participation` | 非首屏渲染链;聚合/治理/医疗明细不进冷启动关键路径 |

mutations 一律不持久化(离线写走既有的三条 durable 队列,那是 PRODUCT §6.4 的合同,不由 persister 承担)。

### 3.4 多租户红线:缓存清理矩阵(会话/账号边界必须清持久化缓存)

**web 存储通道裁决(审查 P2 修订)**:web 端 blob 走 **sessionStorage** 而非 localStorage。理由:web token 本就是刻意 session-scoped(`secure-storage.ts:9-12`「must not survive a browser restart」),若 blob 落 localStorage,浏览器重启后用户回到 auth,含 email 的 `me` 与照护内容却以明文永久残留且无清理路径——与既有安全裁决方向相悖。sessionStorage 与「web 回访 = 同标签页 reload」语义恰好重合(§4.1 e2e 断言不受影响),浏览器/标签页关闭自动与 token 同生共死。被否备选:localStorage + 「restore 读不到 token 时清除全部 blob」——引入一个全新的清理时机(浏览器重启后首次访问),明文残留窗口 = 到下次访问为止,不如 sessionStorage 结构性消除。native 不受影响(SecureStore 无会话概念,blob 生存期由下述矩阵管理)。

| 边界 | 既有清理 | 新增 |
|---|---|---|
| 登出 `signOut` | `queryClient.clear()`(`session-provider.tsx:952`) | `kvRemove(blob.<userId>)` + `kvRemove(last-tab.<userId>)`(在 clear 之后、`signingOutRef` 复位之前) |
| 换号 `signIn`(未登出直接登录) | `queryClient.clear()`(`:894`) | 同上,清**旧 userId** 的 blob 与 last-tab |
| 401 `unauthorizedHandler` | `queryClient.clear()`(`:160`) | 同上清 blob;写守卫(§3.2)保证清理后的 debounce 不复活 |
| 删号 | 六项 per-user 清理(`account/screen.tsx:175-185`) | 清单加两项,与 `clearTodaySnapshots` 并列:`clearPersistedQueries(deletedUserId)`(blob)与 `clearStoredLastTab(deletedUserId)`——last-tab 既然照抄 scope 的 per-user 键模式(`core/scope/scope-provider.tsx:84`),就必须同样进删号清理(其范本 `clearStoredScope` 本就在六项清单里,`account/screen.tsx:179`) |

数据过期提示策略:不在壳层做全局「数据已过期」横幅—— Today 断网时已有带保存时间的离线条(`today-notices.tsx:138-145`),在线时后台刷新本身就是纠偏机制;再加全局横幅是与「无感刷新」目标自相矛盾的通知噪音。陈旧但在线可刷新的数据 ≤1 RTT 自愈,提示留给真正失败的场景。

### 3.5 与既有 Offline 体系的关系(不重不漏)

- `today-snapshot`(`today-snapshot.ts`)**保留不动**:persister 管「重启后可渲染」,snapshot 管「断网时的只读兜底 + savedAt 标签」,职责不同;且 `today-notices.tsx:142` 直接消费其 `savedAt`。两者重叠的数据(today)以 snapshot 为断网展示权威、persister 为启动渲染权威,不做合并(合并=给离线语义引入持久化层的清理耦合,风险大于收益)。
- 三条离线队列(care-action / pending-today / timeline-event)**零改动**,§3.1 已述与乐观启动的时序衔接。
- 基础设施归位:新模块放 `src/core/query/`(与 query-client.ts 同域),不进 `foundation/`(它不是地基读写口,是 QueryClient 的表现层基建)。

### 3.6 改动文件清单(施工面)

| 文件 | 改动 |
|---|---|
| `APP/src/core/query/persist.ts` | 新增(§3.2,≤200 行) |
| `APP/src/core/providers/session-provider.tsx` | restore effect 重写(§3.1);signIn/signOut/unauthorizedHandler 各加一行 blob 清理;`L110-115` 注释改写 |
| `APP/app/index.tsx` | 无必改(activation.isLoading 语义随缓存自然变化);如 last-tab 需要,redirect 目标带初始 tab 参数 |
| `APP/app/(tabs)/_layout.tsx` 或 `index.tsx` | last-tab 初始路由(§2.2,~10 行) |
| `APP/app/_layout.tsx` | RootNavigator 内挂 `<BootRefreshIndicator/>`(§2.1);门①分支保留 |
| `APP/src/features/account/screen.tsx` | 删号清理清单 +2 行:`clearPersistedQueries` + `clearStoredLastTab`(§3.4) |
| `APP/src/i18n/{en,zh,es,ja,pt}/app.json` | +`app.backgroundRefreshing` |
| `APP/e2e/boot-no-fullscreen-loading.spec.ts` | 新增(§4) |

---

## ④ 验收

### 4.1 e2e 新护栏(`APP/e2e/boot-no-fullscreen-loading.spec.ts`,进 desktop1280 + mobile390 两个 project,zhSmoke 不需要)

依据既有 e2e 形态:Playwright 对 web 构建(`playwright.config.ts` webServer = `expo start --web`),API mock 走 route 拦截,Apple 登录复用 `e2e/core-flows.spec.ts` 的 nonce 助手。

1. **回访无全屏 loading(主断言)**:mock API → 登录 → 等 Today 内容可见 → `page.reload()`(token 与持久化缓存均在 sessionStorage,即 web 语义下的「回访冷启动」)→ 断言:
   - `Restoring your session` 与 `Preparing your care workspace` 两文案**全程不出现**(reload 后立即起监听 body 文本);
   - Today 内容(宠物/任务名)**≤1000ms** 内可见(§6.7 验收原文「首屏 ≤1s 出真实内容」)。
2. **断网冷启动可读**:`context.setOffline(true)` → reload → Today 缓存内容可见 + 「离线列表」条出现 + 离线完成一次照常入队(断网下完成 → 恢复网络 → 重放成功,复用既有断言模式)。
3. **登出清缓存(多租户红线)**:登出 → 断言 sessionStorage 中 `planet.query-cache.v1.*` 不存在,且新账号登录后看不到旧账号的宠物名。**浏览器重启无残留(P2 修订的验收锚)**:登出/关标签页后重开 → auth 页,blob 键在 sessionStorage 中不存在(而非在 localStorage 永久残留)。
4. **回归锚**:既有 `core-flows.spec.ts` 全绿(冷启动时序改造不得改变登录后任何行为)。

### 4.2 真实栈走查(手册,Simulator)

1. iOS Simulator 登录至 Today → `xcrun simctl terminate <udid> <bundle>` 杀进程 → `simctl launch` 重开 → 主观秒表/录屏核:无全屏 loading、直落 Today、≤1s 内容可见;
2. 飞行模式开 → 杀进程重开 → Today 可读 + 离线条;关飞行 → 后台刷新自愈;
3. 设置 → 退出登录 → 杀进程重开 → 落 auth(不闪保护屏内容);
4. Android Emulator 同 1-3;
5. 存储 p95 实测:blob 读写(SecureStore 分块)耗时尚无基准——**施工波必须实测并回报**,若写 p95 > 500ms 或 blob 超 256KB 治理后仍超,触发 §5 升级路径决策,不得静默放行。

### 4.3 免费/付费归属复核

启动体验是全量免费的基础设施:不涉及任何 paywall 触点、不读配额、不给档位差异化(门退役对所有用户一视同仁)。黑名单刻意把 `usage`/`capabilities` 挡在持久化外(§3.3),避免陈旧配额与订阅 S1/S3 撞墙逻辑互相污染——这是对订阅功能正确性的保护,不是付费墙。✅ 复核通过。

---

## 5. 风险与升级路径

| 风险 | 缓解 | 升级/移除条件 |
|---|---|---|
| SecureStore 分块写放大(blob 数百 KB → 数百 keychain 片) | §3.2 尺寸治理(256KB 上限 + today 裁剪);today-snapshot 同量级生产在跑 | 实测写 p95 > 500ms → 换 expo-file-system + 加密或 MMKV(届时按 §3.2 依赖纪律单列决策) |
| 陈旧 activation 相位错误 redirect(跨设备建了家庭) | 24h TTL;错误方向自愈(下次冷启动/刷新纠正);B13「不猜」约束的是失败读取,缓存是真实历史读取 | 若现场出现真实误路由反馈,把 activation-summary 移出白名单(门②对回访回归,其余收益保留) |
| 乐观认证让用户「看到内容后被踢」比现状更刺眼? | 旅程上是「解释性登出」(toast)优于「loading 中消失」;`authenticatedRef` 防冷启动误 toast | 观察期反馈刺眼则可加「内容遮罩淡出」——**不恢复 loading 门** |
| hydrate 与首次渲染竞态 | restore effect 内同步 hydrate 后才 setStatus(§3.2 时序) | — |
| 防复活守卫遗漏新会话边界 | 守卫在 persister 模块单点实现(activeUserId),清理矩阵四边界逐一列出(§3.4) | 新增会话边界时必须同步该矩阵(评审检查项) |

## 6. 开放问题(需 founder/施工波复核)

- **O1(web 持久登录)**:web 回访冷启动目前=同标签页 reload;浏览器重开必进 auth(`secure-storage.ts:9-12` 既有裁决:session-scoped until cookie-backed auth),blob 也随之走 sessionStorage(§3.4 裁决)。本设计不改此姿态。若 founder 期望 web 也有跨会话回访直进,需要独立的「记住我/cookie 会话」安全决策,届时 blob 通道随之一并迁 localStorage,不在本包范围。
- **O2(存储实测阈值)**:§4.2-5 的 blob 读写 p95 数据须施工波实测回报后,方可关闭「是否升级存储通道」这一分支。
- **O3(last-tab 恢复)**:本设计按「做,仅 5-tab 粒度」落规格(§2.2);若 founder 认为连 tab 都不必恢复(恒落 Today),删去 §2.2 及 §3.4 矩阵中的 last-tab 列即可,其余设计不受影响。

## 7. 修订记录

- **v2(2026-10-14,审查门 pass 后修订)**:
  - **P2 已修**:web 端 blob 由 localStorage 改为 sessionStorage(复用 `kv.ts:196-230` 既有 session 通道),消除浏览器重启后含 email 的 `me` 与照护内容明文残留;裁决与被否备选记录于 §3.4,新增验收锚于 §4.1-3。
  - **P3 已修(状态机)**:§3.1 后台校验补「非 401 失败 → catch no-op」分支,并给校验 fetch 传 `{retry: false}`,消除默认重试×15s 超时的 ~45s 静默放大。
  - **P3 已修(清理矩阵)**:§2.2 新增的 last-tab 键纳入登出/换号/删号清理(§3.4),与范本 `clearStoredScope` 同列;§3.6 施工面同步。
  - **P3 已修(时序)**:§3.2 读时序改为「token+userId 并行 → 拿到 userId 后串行读 blob」(SecureStore 无枚举,blob 键含 userId,三者无法并行)。
  - **P3 已修(引用失准)**:scope 实现路径更正为 `APP/src/core/scope/scope-provider.tsx`(providers/ 下为 re-export shim);me 的桌面 web 消费点更正为 `web-workspace-rail.tsx:50-54`;last-tab 键补注 `encodeURIComponent(userId)` 拼接;activation-summary 更正为「3 个数字 + 1 个布尔」。
- **v1(2026-10-14)**:初稿,四段式全量成文。

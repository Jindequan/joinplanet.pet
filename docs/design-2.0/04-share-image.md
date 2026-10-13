# G4 · Today「Share as image」——今日卡导出成图,发家人群

> **设计稿 v2——已过审查门**(2026-10-14 独立审查 verdict=pass;P2×2/P3×2 全部处置,见文末修订记录)
>
> 任务包:2.0 功能包 G4(SUBSCRIPTION-LAUNCH-DESIGN-2026-10.md §6.5 差距表 #4、§6.2 排期 P1/S-M,founder 已点名技术路径 react-native-view-shot)。
> 初始设计锚:[archive/APP-DESIGN.md](../archive/APP-DESIGN.md) §5-§7(2026-08-16);现行事实源:[PRODUCT.md](../PRODUCT.md)。
> 层级与 Tab:L4 对外(延伸层——只接入地基 API,不改地基表,PRODUCT §0 红线),落在「今天」Tab。
> 视觉母体:`APP/src/features/today/`(焦点卡/行卡);品牌资产:`APP/src/ui/brand/`。
> 证据基线日:2026-10-14。本文所有 `path:line` 均为本日实读。

---

## 0. 裁决总览

| # | 议题 | 裁决 | 被否备选(理由) |
|---|---|---|---|
| D1 | 导出内容 | **跟随当前 scope**:Pet scope→单宠今日卡;Family scope→该家庭今日概览卡;**All scope 入口隐藏** | 固定单宠卡(多宠家庭漏宠,图≠屏面);固定全家庭概览(单宠家庭出现无意义分组);All scope 导出(跨家庭内容误发进某个家庭群=隐私泄露,见 §1.3) |
| D2 | 技术路径 | **react-native-view-shot 截「离屏挂载的专用分享卡组件」**(新依赖,单列见 §3.4);分享出口 native 走 `expo-sharing` 系统面板(已有依赖),web 走 Blob 下载 | 截可见列表(滚动 Screen 截不全、含按钮/滑动层等交互杂质);纯 Canvas/SVG 拼装(中英日混排+Baloo 2/Fraunces 双字体需自绘排版,跨端量测不一致,重复实现排版引擎) |
| D3 | 入口位置 | **TodayHero trailing 槽新增分享 icon Chip**(日历 Chip 旁,screen.tsx:344 既有槽位);仅当日视图且 items>0 时出现 | ArrangeSheet 卡片菜单(那是单事项封闭动作清单,「导出今日」语义错位);列表段头动作(导出是全页动作,非段动作) |
| D4 | 品牌露出 | 分享卡页脚一行:PlanetLogo + PLANET wordmark + tagline(复用 `ui.brandTagline` 五语键)+ 小字 `joinplanet.pet` | 二维码/深链接(v2 再议,本期图上无可点元素);水印铺底(伤害图片主体) |
| D5 | 隐私规则 | 图=屏面内容的镜像:成员名照 `displayName()` 正典显示;**不上图**:任务 description、note、护理备注、care request 链路状态、逾期时长注脚;无链接/无 ID/无病史聚合 | 成员名遮罩开关(目的地是自家人群,群成员互知姓名,开关=无受众的复杂度) |
| D6 | 免费 | **免费、不限量、无档位引用**;生成纯客户端零网络 | 任何配额/次数墙(违 SUBSCRIPTION §1 铁律「分享/应急不设卡」) |

---

## 1. 用户旅程

### 1.1 背景与动机(为什么是这个时刻)

初始设计 §6(APP-DESIGN.md:399-402)的论断至今成立:**「第二位照顾者(通常是另一半)不会主动开 App,PLANET 真正的竞争对手是家庭群聊」**。对策一即「Today 视图加 Share as image:把今日任务卡导出成一张发群里很好看的图——骑在家人已经在截图转发的行为上」(APP-DESIGN.md:401)。W2 交付表同列(APP-DESIGN.md:416),验证动作为「卡片进群聊的转发」。

现状实锤:APP 内零 captureRef/exportImage(SUBSCRIPTION-LAUNCH-DESIGN §6.5 G4 行,2026-10-13 逐项到代码核实)——用户今天只能截屏,截屏带状态栏、截不全、不体面。

### 1.2 主路径(happy path)

```text
谁:任一能看见 Today 的成员(owner / caregiver / viewer)
何时:白天的任意时刻——最典型是「家人在群里问今天宝贝怎么样/谁去喂」的时刻
从哪进:今天 Tab(非历史回看日期,Pet 或 Family scope,当日事项 ≥1)
  → 点页头日历钮旁的分享 icon Chip
  → 离屏渲染专用分享卡(复用当日内存数据,<1s)
  → 系统分享面板弹出(iOS Share Sheet / Android Sharesheet),预览图已在
  → 选微信/WhatsApp/iMessage 发进家人群
  → 群里收到一张 1080px 宽的精装今日卡:宝贝名+日期+完成度 n/m、
     还剩什么(时间+负责人)、谁做了什么;页脚 PLANET 品牌
到哪出:App 侧无落地页(动作终点=系统分享面板);接收方看到品牌页脚即获客面
```

自传播闭环:营销站 Pet Card 工具已有同构病毒信号(`shared_make_own`——分享接收方自建,DISTRIBUTION-OBSERVABILITY.md §1.1 #31);App 内导出图把同一机制从获客工具移进产品日常。

### 1.3 异常路径

| 场景 | 行为 |
|---|---|
| 历史回看日期(viewingHistory) | 入口隐藏(同页头完成环先例 screen.tsx:296-303:历史视图不出环)——图的内容承诺是「今天」 |
| 当日无事项(items.length===0) | 入口隐藏——空态页的叙事是「引导加第一个任务」,导出无意义 |
| All scope(跨家庭聚合) | 入口隐藏——裁决理由:All 视图混合多个家庭的内容(TodayRow.familyName 会出现在条目里);导出目的地必然是「某一个家庭群」,把 B 家的事发进 A 家群是真实误发风险。隐私默认开启(工程原则 4)优先于全景导出的便利;用户先切 scope 再导出,成本可接受 |
| 生成中重复点击 | 入口禁用+降透明度,生成结束恢复(生成 <1s,无需进度 UI) |
| 生成失败(captureRef 抛错) | toast `today.shareImageFailed`(可重试=再点一次);不静默吞错 |
| native 分享面板不可用(`Sharing.isAvailableAsync()` false,罕见) | toast 同上失败文案;不fallback 到剪贴板(图片无剪贴板正典) |
| web 端 | 不走 expo-sharing,直接 Blob 下载 PNG + toast `today.shareImageSaved`(先例:pet-overview-tab.tsx:161-171 JSON 导出的 web 分支) |
| 离线(今天列表来自缓存/乐观态) | 照常可导——生成纯客户端、读内存数据;图内容与当前屏面一致(所见即所得),不标注在线状态 |

### 1.4 权限边界

**凡能看见 Today 的成员即可导出**——导出图是对屏面信息的只读投影,等价于用户自己截屏,不新增数据暴露面。这与 F7 受控分享链接的生成权(管理动作)不同:后者创建的是服务端有生命周期的数据通道,前者只是本机像素。viewer/readOnly 场景照常可导(其 Today 本就只读展示,PRODUCT §3 viewer「可以查看宠物与全部事件」)。

---

## 2. 交互规格

### 2.1 入口控件

- 位置:`TodayHero` trailing 槽(screen.tsx:344-353 现为日历 Chip)新增**分享 icon Chip**,排在日历 Chip 左侧(动作靠近内容、视图控件居角)。槽结构已支持多子元素(today-hero.tsx:144-148 flexDirection row/gap 8)。
- 形态:复用 `Chip` 组件(chip.tsx:49,dense、icon-only),phosphor `Share` 图标 15px ink 色,`accessibilityLabel=today.shareImageA11y`——与日历 Chip(icon-only+a11y 名,screen.tsx:347)同构。
- 出现条件(三条同时):当日视图(`selectedDate===civilToday`) ∧ scope ∈ {pet, family} ∧ `items.length>0`。不满足即不渲染(非禁用态——页头不摆死按钮)。

### 2.2 生成与分享流(时序)

```text
onPress(禁用自身)
→ 组装 ShareCard 数据(纯内存:buildTodayRows 已产出的 items 分解,同屏面同源)
→ 离屏挂载 ShareCard(Today screen 根部,absolute + 出屏定位 left:-10000;
   禁 display:none——RNW 不渲染 display:none 的布局,card-art.tsx:105-108
   的 RNW 实测约束同源)
→ captureRef(ref, { format:'png', result:'tmpfile', width:卡宽×3 })
   （库生成 tmpfile——文件名由库控制、跨端不可指定：captureRef 的 fileName 选项
    仅 Android,且无 overwrite 选项;证据=react-native-view-shot README,
    2026-10-14 实读,见 §3.4）
→ [native] expo-file-system 拷贝到 cache 固定名 planet-today-{slug}-{YYYYMMDD}.png
   （overwrite:true;先例=pet-overview-tab.tsx:172-174 的 Paths.cache +
    create({overwrite:true}) 写法）
→ [native] releaseCapture(库 tmpfile uri)——即时释放库临时文件(README 提供
    的配套 API),会话内也不堆积
→ [native] Sharing.shareAsync(固定名文件, { mimeType:'image/png', UTI:'public.png',
                                    dialogTitle: t('today.shareDialogTitle') })
→ [web] 不落盘:dataURL→Blob→anchor 下载,anchor.download=固定名
   （先例 pet-overview-tab.tsx:162-170 + :166 anchor.download）
→ 恢复入口;卸载离屏卡
```

- 文件名:`planet-today-{slug}-{YYYYMMDD}.png`,slug=宠物名或家庭名按 `pet-overview-tab.tsx:160` 同一净化规则;**固定名+overwrite:true**——同日重复导出覆盖,自有导出文件有界;库 tmpfile 经 `releaseCapture` 即时释放(§2.2 时序),两级都不留无主资源(工程原则 5)。
- 幂等/并发:纯本地只读,无并发面;重复点击由入口禁用挡住。

### 2.3 分享卡视觉规格(导出图的母体)

固定逻辑宽 **360**,高自适应;`width:360×3` 快照≈1080px 宽(群聊预览清晰标准)。全部复用现行 tokens/组件(theme/tokens.ts、AppText、PlanetLogo、BrandWordmark、CardArt),不自创第二套视觉语言(PRODUCT §4.7「不再为单页临时添加另一套视觉语言」)。

```text
┌──────────────────────────────────────┐
│ [CardArt right · todayArt(当日civil date)] │ ← 头部带:同 brand-art.ts:58-59
│ PlanetLogo 34 · 今日 · {宠物名|家庭名}          │   「同一天固定同一张」规则
│ {civil 日期}                 ◔ n/m 环+读数  │   (H2 字号 display 档)
├──────────────────────────────────────┤
│ Up next(复用 today.upcoming)           │
│  08:00  早餐        Owner · Devin      │ ← 时间 tabular 列+标题+负责人
│  18:00  晚餐        未认领              │   (assigneeDisplay 同款:「你/成员名/空」)
│  …(全部未完成项,含临时照护)              │
├──────────────────────────────────────┤
│ Done(复用 today.done)                  │
│  ✓ 07:12 散步      Devin completed    │ ← 复用 today.spokenDone/spokenSkipped
│  ✓ 12:40 喂药      你 skipped          │   文案;上限 10 条,超出「+N more done」
├──────────────────────────────────────┤
│ (无待办=全部完成段:All handled today    │ ← 复用 today.overviewAllDone
│  )
├──────────────────────────────────────┤
│ [PlanetLogo 20] PLANET · 家庭宠物照护   joinplanet.pet │ ← 页脚品牌行(D4)
└──────────────────────────────────────┘
```

细则:

- **不上图的内容**(D5,负面清单):任务 description(可能含用药细节;行卡本就不渲染 description——cards.tsx:169 A3 裁决)、完成 note、care request 责任链状态与一切 sync 瞬态(`syncUndo/syncRequest/...` 是过程态,静态图上几小时后必错)、**逾期时长注脚**(`Overdue by 2h` 同理——发到群里的图会在群里躺一天,逾期时长是导出时刻的快照语义,时间列本身已足够;这也呼应 PRODUCT §0 产品语言规则「只说具体的人和事,不说无法操作的抽象状态」)。
- **行级溢出规则(导出图独有立法)**:任务标题 `numberOfLines={2}` 封顶+尾部省略、行高自适应换行——与屏面行卡的单行截断(`cards.tsx:345-346` numberOfLines={1})**有意不同**:屏面截断可点行看详情,图上无任何展开入口,单行截断=接收方永久信息丢失;2 行封顶防极端长标题把卡撑爆。时间列与负责人列保持单行截断(短字段,宽度受 timeColumn min/max 约束同款)。Done 段标题同规则。
- 完成条目上限 10 条:防 30+ 条极端长图;超出聚合为 `today.shareCardMoreDone` 尾行。待办段不设上限(待办天然少,且待办正是图的沟通价值)。
- 多宠(Family scope 概览卡):条目副行带宠物名(行卡 L138 同构:cards.tsx:757-760 聚合 scope 副行补宠物名);头部 scope 名=家庭名。
- 跳过条目入 Done 段,文案 `today.spokenSkipped`(「%{who} skipped it」)——完成必须带人、跳过也带人(APP-DESIGN §5 交互三原则 2)。
- 字体:wordmark Baloo 2 / 正文 AppText 系统栈,与屏面同源,view-shot 截的是真实排版结果——**中文字体问题不存在**(这是 D2 否掉 Canvas 的核心理由;tokens.ts:92 web 端 CJK 回退栈已立法)。
- 深色模式:导出图**固定亮纸面**(paper 族底色)——图会进别人的群聊,脱离本机主题上下文;品牌浅色纸面是唯一稳定形态(与 App Store 截图同思路)。

### 2.4 五维走查(页面质量基线,PRODUCT §4.7)

| 维度 | 规格 |
|---|---|
| 正常态 | 入口 icon Chip 在页头;点按→系统面板带预览图;生成 <1s 无中间态 UI |
| 空态 | items=0 / 历史日期 / All scope:入口不渲染(§2.1 三条件);页面空态文案不因此改动 |
| 错误态 | 生成失败/面板不可用:toast `today.shareImageFailed`,入口恢复可重试;错误信息不吞(errorMessage 正典),不泄露内部路径 |
| 权限态 | viewer/readOnly Today 同样可导(§1.4);图内容同其可见面,无额外数据 |
| 加载态 | Today 未加载完时整页是 loading state(screen.tsx:242),入口尚不存在,天然覆盖;分享卡数据取自已加载的内存列表,无二次请求即无二次 loading |

### 2.5 五语文案键(today ns;新键 6 个,五语全量补齐——`check:i18n` 实测现库 1817 键 × 5 语言一致,施工后应为 1823)

| 键 | en | zh | ja | es | pt |
|---|---|---|---|---|---|
| `today.shareImageA11y` | Share today's care as an image | 把今天的照护导出成图片 | 今日のお世話を画像に書き出す | Compartir el cuidado de hoy como imagen | Compartilhar os cuidados de hoje como imagem |
| `today.shareImageFailed` | Couldn't create the image — try again | 图片生成失败,请重试 | 画像を作成できませんでした。もう一度お試しください | No se pudo crear la imagen, inténtalo de nuevo | Não foi possível criar a imagem, tente de novo |
| `today.shareImageSaved` | Image downloaded | 图片已下载 | 画像をダウンロードしました | Imagen descargada | Imagem baixada |
| `today.shareDialogTitle` | Share today's care | 分享今日照护 | 今日のお世話を共有 | Compartir el cuidado de hoy | Compartilhar os cuidados de hoje |
| `today.shareCardHeading` | Today · %{name} | 今日 · %{name} | 今日 · %{name} | Hoy · %{name} | Hoje · %{name} |
| `today.shareCardMoreDone` | +%{count} more done | 还有 %{count} 项已完成 | 他に%{count}件完了 | +%{count} completadas más | +%{count} concluídas |

复用既有键(不新增):`today.upcoming`(Up next 段头)、`today.done`(Done 段头)、`today.you`、`today.someone`、`today.overviewAllDone`(全完成态)、`today.spokenDone/spokenSkipped`(完成/跳过行)、`ui.brandTagline`(页脚 tagline,ui.json:70,五语已在)。

---

## 3. 领域与数据影响

### 3.1 与 Occurrence-Event 主体的关系:零新主体、零新表、零新 API、零调度器

- 导出图是 **Today(Occurrence)的只读展示投影**——与 Timeline `scope=facts` 投影(PRODUCT §4.4)同一哲学:客户端从已加载的 `GET /api/v1/today`(planet-api tasks/http.go:32)结果中取子集渲染像素,不落库、不回传、不建 `ShareImage` 实体。PRODUCT §0 红线(延伸层不得新建与 Occurrence/Event 平行的业务主体)满足。
- 服务端零改动:无迁移、无新端点、无新枚举。`share_links.kind` 的 CHECK 仍只允许 `care_card|summary`(sharing/service.go:26-27,113)——**有意不加 `image` kind**:图片一旦离开设备即不可撤销、不可过期、无 view_count,与 F7「必须有过期时间、可撤销」(PRODUCT §4.6)的生命周期语义根本不同;不把图片塞进链接体系假装它有治理能力。这条边界写死:图片分享与受控分享是两个物种,前者是像素,后者是数据通道。

### 3.2 观测

APP 客户端目前零埋点基建(2026-10-14 grep `gtag|analytics` 于 `APP/src` 零命中;`GA` 不单独作 grep 词——其子串会误命中 `APP/src/core/api/errors.ts:75,77` 的 `*_AGGREGATE_UNAVAILABLE` 常量,「无埋点」结论以 gtag/analytics 两词零命中交叉验证;GA 事件仅存在于营销站 www,DISTRIBUTION-OBSERVABILITY.md §1.0)。本期**不自建埋点**;观测三件套(错误上报/漏斗/反馈入口)已在途(SUBSCRIPTION §6.4),其漏斗件落地时登记事件 `today_share_image_export`(出口口径:captureRef 成功计一次),沿用三件套通道,不在本设计内实现。

### 3.3 容量与资源

- tmpfile 落 app cache 目录(OS 清理策略管理);固定文件名+overwrite 使同日反复导出不堆积(§2.2)。
- 离屏组件仅在导出瞬间挂载、分享面板关闭后卸载,无常驻渲染成本。

### 3.4 新依赖单列(纪律:先核查,后新增)

**已核查**(2026-10-14 实读):`APP/package.json` 全文(90 行)——`expo-sharing ~14.0.8` 已在(line 57)、`expo-image-manipulator ~14.0.8` 已在(line 48)、`expo-file-system ~19.0.24` 已在(line 45);`react-native-view-shot` 不在。仓库根无 package.json(`ls` 实测 No such file or directory);`www.joinplanet.pet/package.json` grep 无 view-shot;`mobile/` 目录**无 package.json**(`ls` 实测同报不存在,legacy 目录不构成核查面)。结论:**截图能力在 APP 是真缺口,需新增一项**。

**新增:`react-native-view-shot`**(`npx expo install react-native-view-shot`)。理由:

1. Expo 官方 SDK 参考收录(docs.expo.dev/versions/latest/sdk/captureRef),**Android/iOS/Web 三端支持、Expo Go 内置**,无需 dev client/原生配置——满足 PRODUCT §5「iOS、Android、Web 均能完成核心业务链路」的三端要求;
2. web 端由库内置的 html2canvas-pro 路径承接,与 §2.2 web 出口相容;
3. 被否备选的再陈述:纯 Canvas 拼装=放弃 RN 排版引擎自绘中英日混排+双品牌字体(www 站 Pet Card 工具是单页营销件才用裸 canvas——`www/.../pet-card/page.tsx:152` canvas.toBlob——不可比);截可见列表=截不全且带交互杂质。

**已知风险与预案**:web 端 html2canvas 对跨域图片(R2 签名 URL 的宠物头像)要求 CORS;若 R2 域未配 CORS,web 导出图头像缺失——预案:`PetAvatar` 已有 species 插画兜底(cards.tsx:343 传 photoUrl,组件内无照片即画 species),web 端导出时头像直接走 species 兜底形态(不阻塞,不完美但完整);native 端截图取本机已渲染位图,无此问题。

**API 事实(2026-10-14 实读 GitHub README,约束 §2.2 时序)**:captureRef 选项含 width/height/format(默认 png)/quality/result('tmpfile'|'base64'|'data-uri')/snapshotContentContainer/fileName(**仅 Android**)/useRenderInContext(iOS)——**无 overwrite、无任意输出路径**;自定义落盘的官方建议即捕获后另用文件库搬运,故 §2.2 走 expo-file-system 拷贝;tmpfile 随 app 退出自动清理,配套 `releaseCapture(uri)` 可即时释放。

---

## 4. 验收

### 4.1 e2e 断言点(playwright,web;新增 `APP/e2e/today-share-image.spec.ts`)

1. **入口可见性正例**:Pet scope 当日有事项 → 页头出现分享 Chip(`getByRole('button', { name: today.shareImageA11y })`);
2. **入口可见性负例 ×3**:历史日期回看 / 当日空事项 / All scope → 入口不存在(`queryByRole` 为 null);
3. **导出内容**:点击后 DOM 出现离屏 `today-share-card`(testID),断言:头部 `today.shareCardHeading` 含 scope 名与当日日期;Up next 条数=内存待办数;完成段 ≤10 条;页脚含 tagline 与 `joinplanet.pet`;**负面清单断言**:卡内不含任何任务的 description 文本、不含 care request 状态文案、不含「Overdue」;
4. **失败态**:mock captureRef reject → toast `today.shareImageFailed` 出现且入口恢复;
5. **五语**:zh 环境冒烟(先例 `zh-smoke.spec.ts`)断言 zh 文案键渲染;
6. **免费复核断言**:从点击到导出完成的网络面板零新增服务端请求(纯客户端的机器可验证证明)。

### 4.2 真实栈走查(Simulator/Emulator/浏览器,PRODUCT §4.7 移动端验收)

```bash
cd APP && bun run typecheck && bun run lint && bun run check:i18n
bun run test:e2e -- today-share-image.spec.ts
bun run build:web        # 前端变更(变更速查)
```

- **iOS Simulator**:Pet scope 当日 3 事项(1 完成/1 跳过/1 待办)→ 点分享 → 系统 Share Sheet 弹出且预览图为 1080px 宽 PNG;存入相册目检:插画/字体/中文名正常;viewer 账号重复一遍(权限路径);
- **Android Emulator**:同上,Sharesheet 出图;
- **错误态**:captureRef 失败/Sharing 不可用的 toast 以 e2e mock 为机器断言(§4.1#4)——真机上生成纯本地、断网不触发失败,**不可稳定复现,如实声明不走真机用例**;真机可触发的异常路径为**分享面板取消**:Cancel 后入口恢复可点、无错误 toast、离屏卡卸载(再次导出正常);
- **长文案态**:构造 ≥2 行长标题任务(如长中文喂药说明型标题)+ 切 pt/es(五语最长文案)导出目检:标题 2 行封顶+尾部省略生效(§2.3 溢出规则)、时间/负责人列不撑爆、卡高自适应不截断、页脚品牌行完整;
- **键盘态豁免**:导出流程无任何文本输入(只读卡→系统分享面板),键盘态不适用本功能,豁免声明在此;
- **web(build:web 产物)**:点分享 → 浏览器下载 `planet-today-*.png`(下载名=anchor.download 固定名),打开目检同上;头像走 species 兜底(若 R2 CORS 未配)为已知可接受态;
- **离线**:飞行模式下(今天列表已缓存)入口可用且导出成功;
- **重复导出**:同日连点两次,`expo-file-system` 查看 cache:自有固定名文件数不增(overwrite 生效)、库 tmpfile 无驻留(releaseCapture 即时释放,§2.2)。

### 4.3 免费/付费归属复核

- 裁决依据:SUBSCRIPTION-LAUNCH-DESIGN §6.6「G3 疫苗到期、**G4 导出图**、G2 sitter 分享=免费不限(分享即传播/应急不设卡)」+ §1 铁律「分享/应急不设卡」「免费档保住协作闭环完整」。
- 设计内落点:生成路径零服务端调用(§4.1#6 机器断言)、零 entitlement/quota 检查、UI 无任何档位/升级文案;`plans` 表不动。**复核结论:合规。**

---

## 5. 开放问题(需 founder/审查门裁决)

1. **All scope 入口隐藏**(D1)是否接受——本文按隐私保守裁决隐藏;若 founder 更看重「全景导出」便利,需另行裁决跨家庭内容的展示规则。
2. **页脚是否带 `joinplanet.pet` 网址**(D4)——营销站 Pet Card 工具的图带转化路径(`shared_make_own` 病毒信号);App 导出图带纯文本网址是低成本获客面,但也可主张画面更干净只留 logo+tagline。
3. **web 端是否随 v1 同车**——技术上是同一组件仅出口不同(§2.2),成本≈0,本文按同车设计;若 web 用户面极小可裁后置,不影响 native。

---

## 修订记录

- **v2(2026-10-14,已过审查门)**:处置独立审查四条——
  1. [P2] §2.2 时序补 expo-file-system 拷贝到固定名步骤(captureRef 的 fileName 仅 Android 且无 overwrite,原「固定名+overwrite 直接由 captureRef 落盘」不可跨端实现;复审补充证据:README 提供 releaseCapture,一并采纳,库 tmpfile 即时释放);
  2. [P2] §2.3 补行级溢出规则(标题 2 行封顶,与屏面行卡单行截断有意不同:图上无展开入口,截断=信息丢失);§4.2 补错误态(机器断言归 e2e mock,真机不可稳定复现已如实声明;真机走分享面板取消路径)、长文案态用例与键盘态豁免声明;
  3. [P3] §2.5 键数更正:新键 6 个(表格为准),施工后 1817+6=1823;
  4. [P3] §3.2/§3.4 证据口径修正:mobile/ 目录无 package.json(不存在文件不作 grep 证据);埋点核查词改为 `gtag|analytics`(GA 子串误命中 errors.ts:75,77 的 `*_AGGREGATE_UNAVAILABLE`)。
- **v1(2026-10-14)**:初稿。

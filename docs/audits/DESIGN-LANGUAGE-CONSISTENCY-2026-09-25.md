# 设计语言一致性审计 — 2026-09-25

> 触发：founder 2026-09-25「检查各个页面有没各种扭曲的，提炼出页面结构与功能，比较一下是否使用同一套规范和设计语言！别他妈各自胡搞了」。
> 方法：①规范法条提炼（PLANET_APP_DESIGN_SYSTEM.md §0-§8 + E1-E8 + 尺度×层级）②静态执法扫描（features+app 层全量，逐条亲读上下文）③本体浏览器逐页实测（24 页 DOM 不变量：按钮高度档/填充钮计数/卡内边距/字号分布/占位文字）④逐路由结构功能提炼（38 路由文件全量）。
> 证据：截图 24 张存 `APP/design-review/2026-09-25-consistency/`（编号=路由序）；静态违例全部带 file:line。

## 一、总结论

**设计语言存在且大体健康，但不是一套在所有页执行——是「主干合规 + 六个窝点各自胡搞」。**

- 健康面：字号阶梯纪律全 features 层 **0 违例**（裸 fontSize 仅 1 处合法定义）；颜色纪律 46 个屏幕文件仅照片查看器一处裸 hex；Trends 页可作为「语言正典」样版（五档高度全对、E3 指标卡三行结构标准、0 野档）；行卡结构（80/padding16/头像48/时间列）在 Today/Records/pets/families 四大列表全部达标。
- 扭曲面：**跨页不一致 7 类**（同级信息在不同页长得不一样——founder 直观感受到的「胡搞」主要来自这里）+ **单页违犯成文法条约 40 处**（集中在 4 个文件：today/cards、timeline/event-card、care-requests/panel、today/screen）。
- 覆盖：38 路由文件中 6 个为重定向占位，实际页面 32；本次实测 24 页（requests 详情/handoffs 详情/assignments/share/invite 需特定数据未实测，由静态扫描覆盖）。

## 二、逐页对表（实测+提炼归并）

| 页面 | 功能一句话 | 实测/扫描结论 |
|---|---|---|
| /（Today） | 今日照护执行台 | 结构正典（焦点卡+三段+段头右槽文字链）；**违例最多窝点**：行卡按钮距卡边 11px（§1b<12，Records 同类=17）、脱网格魔数 12 处（14/10/6/-2/1）、段头 15px 与他页不同 |
| /timeline（Records） | 全量记录时间线 | 行卡 80 结构达标 edge17 ✓；**页头 icon 钮手搓 40px 野档**（应 icon 档）；整行卡钮 46 野盒；**行卡主标题 heading(18) 下沉**（应 rowTitle16，全站漏网）；**+记录=自绘 52 FAB**（与全局页头钮双形态） |
| /requests | 请求中心 | 空态合规（结论句+chips+动作）；「Back to today」=52 hero 填充**用于导航动作**（升降级法则：导航→整行/文字链，存疑待裁） |
| /pets | 宠物总览 | 正典页：页头 Add=featured44 ✓、rowTitle ✓、E2 身份句 ✓、edge17 ✓ |
| /more | 个人枢纽 | 结构正典；段头 eyebrow(11.5) 与他页 heading(18) 两态；Settings 行副标题罗列三事项折两行（79 高） |
| /trends | 完成率+体重曲线 | **全站最干净页**：0 野档、E3 指标卡三行标准；唯一违例=空体重占位句「No weight logged…」无动作（E5） |
| /families/:id | 家庭工作区 | 内容厚重但骨架正典（hero+今日卡+双列组）；**11.5/13.5 野字号混用**（eyebrow 段头×5+13.5×3）；危险区=裸文字链（他页=coralSoft 卡，三态之一）；成员角色 chip 自造（未复用 ui/components/chip） |
| /families/:id/transfers | 家庭间转移请求 | **页头标题下两句教学副题**（§5 违例）；行内钮 row 档 ✓ |
| /families | 家庭列表 | **页头「New」=52 hero 超档**（页头创建动作法定 featured44，Pets 页即 44）——同类入口两档 |
| /pets/:petId | 宠物工作区 | hero/身份句/管理组正典；**11.5 段头×2**；危险区=secondary+文字链+hairline（第三种构图）；a11y h1=「Pets」导航词而非内容锚 |
| /pets/:id/care | 照护排程 | **段头右槽「Custom」=52 hero 填充**（段头槽法定 inline/icon）+ **同屏双填充**（Custom+Start recording）；计划卡「Manage owners」featured ✓；**Arrange 钮自绘 sageSoft 盒**（与 medications 各造一份） |
| /pets/:id/timeline | 单宠记录 | 与全局 Records 同构（46 野盒同源）；**FAB「+ Add a record」与全局页头钮同动作双形态** |
| /pets/new | 建宠表单 | 表单正典（hero 主钮+guided 变体）；**页头两句解释 + CTA 上方再一句**（§5 违例×2） |
| /pets/:id/edit | 编辑档案 | **B16 吸底 Save 独一份**（表单族其余=流内 full）——主钮位置三态之一；11.5 段头×2 |
| /families/new、/join | 建家/入家表单 | 页头解释句×3（§5 违例）；时区行 65 高野档（内容撑高，低危） |
| /settings | 偏好设置 | BackHeader+PageHeader **双页头**（与 account 同轨，其余二级页单层）；**页头说明句 + 卡片头教学句「Changing this updates…」**（§5 违例）；菜单行副标题折两行 |
| /settings/notifications | 推送偏好 | 结构正典（B2 不可用态单处呈现 ✓）；**页头操作指引句**（待核） |
| /settings/deleted-families | 已删家庭恢复 | **页头两句教学副题（被截断显示「familie...」——副题太长 numberOfLines 兜不住）**；行内 Restore=row ✓ 但**行标题 heading 下沉** |
| /account | 账户安全 | 双页头；危险区 coralSoft 卡 ✓（正典构图）；设备行 147 个 44 热区盒（合规但 DOM 噪音大）；§1c Sign out↔Delete 已修 |
| /ui-lab | 几何护栏（dev） | 五档正典 ✓（dev-only） |
| /auth、/activation、/share/:token、/invite/:code | 登录/激活/公开页 | 静态扫描覆盖：auth 按钮自绘 radius15、activation 页头第二句；share 打印钮 hero 合法 |
| /requests/:id、/handoffs/:id | 请求/批次详情 | 静态：死胡同出口=hero+无插画 ✓（B1 正典）；「Time not set」占位×2 处 |
| 6 个重定向占位 | 旧深链收敛 | by design ✓ |

## 三、跨页扭曲清单（「同一套语言？」的直接回答）

**P1 — 同级信息不同形态（founder 可直观感知的「各自胡搞」）**

| # | 扭曲 | 实证 | 统一方向 |
|---|---|---|---|
| 1 | 行卡主标题三套字号并存 | 全站立法 rowTitle16（09-21 hierarchy-pass），today/pets/families/requests 已接线；**timeline/event-card.tsx:287、settings/deleted-families-screen.tsx:73、pets/medications-section.tsx:129 三处 heading(18) 漏网** | 三处迁 rowTitle |
| 2 | 页头创建动作两档+野档 | pets Add=featured44（合规）；**families「New」=hero52 超档**；timeline 页头「+记录/日历」=手搓 40px 圆盒（非任何档） | 页头唯一主创建=featured44（既有例外条款）；timeline 页头钮迁 Button icon 档 |
| 3 | 段头语言三态 | eyebrow(11.5)（more/settings/account/pet/family 详情 19 处）、heading(18)（timeline/pets 分区）、caption(15)（Today） | 立一部「段头宪章」：一级段头=？二级段头=？组件化 SectionHeader 单一出处 |
| 4 | 同一动作双形态 | 「+ Add a record」：全局 Records=页头 40 手搓盒；宠物 Records=自绘 52 FAB（自绘违 D 条） | 二选一（建议页头 icon 钮；FAB 形态需 founder 裁） |
| 5 | 表单主 CTA 三种位置 | 表单族=流内 full hero；**edit=Screen footer 吸底（B16 独一份）**；transfer=卡内不 full | 裁一个：长表单吸底是否升为正典（B16 体验好，建议升） |
| 6 | 页头第二句解释句成建制残留 | **6 屏确认**（activation、families/new、transfers、pets/transfer、pets/new×2、deleted-families）+3 待核——与 09-21「教学副题五语删」裁决及 09-22「教学文案清零」整改记录直接冲突，属漏网/回潮 | 删（五语文案，需 founder 点头；deleted-families 副题已被截断显示「familie...」） |
| 7 | 三种「局部构图」各有多态 | 空态三构图 / 危险区三构图 / 二级页头双轨（settings+account 双层，其余单层）/ 主CTA导航钮（requests 空态 hero52） | 归入批 C「组件化收口」逐类定典 |

**P2 — 单页违犯成文法条（静态执法实锤 file:line，约 40 处）**

- **§1b 卡内贴边**：Today 行卡按钮距卡边实测 **11px**（<12；热区盒同位；Records 同类=17px——同为行卡两套内边距）。根因 `today/cards.tsx:1141-1143 rowActions paddingHorizontal/Bottom:10`（连同 6/10/10 三连脱网格）。
- **脱网格魔数 17 处**：窝点=tops today/cards(9)、timeline/event-card(6)、care-requests/panel(6)、pets/detail(4)、today/screen(4)、auth(3)（详见静态报告 C 节 file:line 全表）。09-17 批曾吸附 1002 处，这批是其后新 drifted 的。
- **自绘盒式钮 3 份**：timeline FAB（自绘 52 填充）、care-section Arrange、medications Arrange（同语义两页各造一份，应迁 Button secondary/outline）。
- **§1c 微间距**：panel marginTop:2×3+1、claimLinkRow 2、gap:1 家族 6 处（tokens 注释明令禁止新增）。
- **E5 占位陈述句 4 处**：trends noWeight、pet noRecordsYet、sharing「No active shares」教学块、panel/batch「Time not set」扫读层兜底。
- **裸 hex 3 色**：照片查看器 #ffffff/#000000/rgba 黑（应入 theme 语义角色）。
- **care 页双填充**：段头槽「Custom」52 填充（段头槽禁盒式钮）+ Start recording 52——每焦点区 ≤1 枚的边界需按焦点区裁。

**P3 — 体系与文档脱节**

- 设计系统文档字号阶梯清单（§0）缺 `eyebrow 11.5`、`timeColumn 13.5` 两个已 tokenized 的 variant——文档与 tokens 脱节，导致「11.5 是否合法」无法机判。
- 行内档位不齐待核 5 处：pets 已删恢复 ghost 无 size、trends「View records」ghost full、batch-panel 行 label、detail 最近记录 label、public-share label。
- a11y：pet/family 详情 h1=导航词（Pets/Family）而非内容锚（宠物名/家庭名）。
- 底栏 tab 钮 40 高（导航 chrome 豁免可议；<44 热区）。

## 四、修复批次提案（待 founder 裁后开工）

- **批 A·语言归一**（跨页，建议先做）：行卡标题三处迁 rowTitle；页头创建钮统一 featured44；timeline 页头钮迁 Button icon；段头立宪+组件化；Add a record 单形态；表单主 CTA 定典（吸底 vs 流内，需裁）。
- **批 B·执法清零**（单页内，机械）：魔数吸附 17 处；§1b Today 行卡 11→16；自绘钮 3 份迁 Button；§1c 微间距；E5 占位 4 处改动作；照片查看器色入 token。
- **批 C·文案清理**（动五语，需点头）：页头第二句 6 屏确认+3 待核逐条裁。
- **批 D·文档补强**：设计系统 §0 补录 eyebrow/timeColumn；段头使用规则入册；把 A-G 静态执法做成 CI 扫描器防回潮（本次扫描逻辑可脚本化）。

## 五、边界（不重复既往台账）

已知已登记项不在本报告重复：DEFECT-LEDGER 第七节 L26-L35、UX-SWEEP-2026-09-22 五项待裁决、深色主题/字体等已否决遗留。本次新增发现均为 09-22 整改后的存量或新增漂移。

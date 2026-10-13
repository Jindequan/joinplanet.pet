# 迭代计划 2026-10-13 —— 过审后第一轮:把上架变成活的分发漏斗

> 管理者:ZCode(本体)。执行:GLM-5.3-Flash 子代理五路并行(workflow 编排)。
> 上游计划(不推翻,只执行):[SAAS-PREP-2026-10-01](marketing/SAAS-PREP-2026-10-01.md) §2/§4(过审是 E1 前置)、[KEYWORDS-EXPANSION-2026-10-01](marketing/KEYWORDS-EXPANSION-2026-10-01.md) §1、[keyword-research-2026-09-29](../../www.joinplanet.pet/docs/keyword-research-2026-09-29.md) P0、OUTBOUND-REDDIT-TARGETS 队列(冻结保留)。

## 0. 事实基线(2026-10-13 本体实测)

- **App 已上架**:`PlanET: Shared Pet Care` v1.0,免费,iTunes lookup resultCount=1(US/SG 双区验证),`currentVersionReleaseDate=2026-10-12T20:27:05Z`。商店页:`https://apps.apple.com/us/app/id6813496739`。
- **ASC API Key 401**(issuer 564deed7-…,kid AU635UB384):token 声明正确(aud=appstoreconnect-v1)、无 MITM、时钟正常——疑 key 被撤销/权限变更,**待 founder 后台核查**。不影响本轮(公开渠道足够)。
- **分发资产滞后于上架事实**:landing(www.joinplanet.pet)三处仍写 "iOS release is being prepared for the App Store now"(faq:128/327、pricing:171、about:111),全站 0 处 apps.apple.com 链接;对外叙事仍以 web 版为主入口。
- **SEO 基建现状**:learn 已 7 篇(含 10 月初新增领养月两篇 P1 词 #6/#8);tools 有 schedule/pet-card/symptoms;**基线 P0 的 `/tools/sitter-instructions` 仍未建,是 4+ 词的依赖缺口**。
- **Reddit 通道**:自动化限流冻结 16 天(09-25 判定),恢复唯一信号=founder 手工发一条;队列 #0-#6 备好保留。
- **产品线**:DEFECT-LEDGER L154-L158 已修+审查门 PASS,e2e 全绿(2026-10-01);本轮不动产品仓(APP/、planet-api)。

## 1. 迭代目标(单句)

**一周内把「已上架」变成「处处可分发、弹药就绪、流量可观测」**:任何触点的用户都能一步到达 App Store 下载页;E1 组织试点 cold email 达到「founder 只需批准+发送」状态;SEO 主力增量再落一工具+一文章;分发数据有一页周报口径。

不做的(边界):不动产品仓代码;不重启 Reddit 自动发帖(等 founder 手工解冻);不做 E2 waitlist 实施(只出文案草稿等裁决);不做任何组织层 schema/配额产品化(SAAS-PREP P7-P11 红线)。

## 2. 任务分派(T1-T5,全部 GLM-5.3-Flash)

| # | 任务 | 仓 | 产出 | 验收标准 |
|---|---|---|---|---|
| T1 | App Store 链接全资产接线 | www.joinplanet.pet | faq/pricing/about 过期话术改写;hero/pilot-success 等关键 CTA 增加 App Store 下载入口(与 web CTA 并存);GA 事件埋点(`app_store_cta`) | `grep -ri "being prepared" app/` 零命中;`apps.apple.com/us/app/id6813496739` 出现于 hero+faq+pricing+about;`npm run build` 通过;不动法务页实质条款 |
| T2 | SAAS-PREP 筹备包 P1/P3/P4/P6+E2 草稿 | 主仓 docs/marketing/saas-prep/ | cold-email 三封(首触/跟进/邀约)+组织 onboarding 一页+配额热调 runbook+support 话术+E2 waitlist 文案草稿 | 五件齐;话术引用三问(MARKET-RESEARCH §8.4);runbook 步骤可照抄(含回滚);E2 仅草稿不实施;英文(收件人=英语组织) |
| T3 | `/tools/sitter-instructions` 工具页 | www.joinplanet.pet | 交互式 sitter instructions 生成工具(照抄现有工具页结构与设计语言);含猫专属分区(per-cat 表);挂入 tools 索引+sitemap+learn 互链 | 与 schedule/pet-card 同构;build 过;sitemap 可见;无注册墙(与现有工具一致的诚实形态) |
| T4 | learn 文章「疫苗/医疗记录丢了怎么办」 | www.joinplanet.pet | 新文一篇(vet records lost 角度,承接 #15/#16 意图簇)+articles.ts 注册+内链 | 与现有 learn 文章同构(结构/字数/EEAT 形态);不装医疗建议(YMYL 红线,给行动清单不给医学判断);build 过 |
| T5 | 分发观测 runbook | 主仓 docs/marketing/ | DISTRIBUTION-OBSERVABILITY.md:GA 现有事件盘点+新增事件清单(含 T1 的 app_store_cta)+GSC 核查项+App Store 链接规范(UTM 口径)+E5 撞墙计数+周报模板 | 每一项「现状/怎么看/周报行格式」三段;只盘点不实施(GA 改动随 T1 代码走) |

## 3. 验收与审查门(本体职责)

1. 每包产出本体亲核(读 diff/文档,跑 build);
2. landing 改动(T1/T3/T4)合并后过 code-reviewer 复审;
3. 全批攒一次推送(founder 攒批纪律;Vercel 自动部署,push 即上线,上线后线上 smoke);
4. 任何小弟产出不合格 → 修简报重派(amend),不将就。

## 4. 灵活调节策略

- T1 若发现话术涉及产品承诺(如 Android 时间表)→ 只删过期承诺、不新造承诺,存疑处登记待裁决;
- T3 若现有工具形态与新需求冲突 → 以「最小可用工具+诚实边界」为准,扩展点留 TODO 注释登记,不擅自加注册墙;
- T2 的 E1 目标组织名单(3 家)不指名入选——由 founder 圈定,小弟只产模板与筛选标准(公开邮箱、活跃寄养网络、志愿者制);
- 时间盒:任一包卡住超过一次重派,降级登记进 DEFECT-LEDGER 附录,不阻塞其余包。

## 5. Founder 待办(不可代理,汇总通知)

1. **Reddit 解冻**:用本人账号手工发队列 #0(r/EpilepsyDogs 1wgcfgw,纯帮助版已备好)——自动化恢复的唯一信号;
2. **E1 发送**:批 T2 三封模板后,圈 3 家组织亲手发(邮件必须 founder 名义);
3. **E2 裁决**:waitlist 文案草稿批/不批;
4. ~~ASC key 401~~ **已解决(2026-10-13 复核)**:401 系误用 APNs key(AU635UB384)签 ASC API——正确 key 为 kid `7D2L694J82`(`~/secret/AuthKey_7D2L694J82.p8`),换钥后 API 正常且确认 VER 1.0 = READY_FOR_SALE;
5. (随缘)App Store 首批评价:自己设备下载留评,冷启动信任锚。

## 6. 出口判据(本轮完成的定义)

- [ ] landing 全站零 "being prepared" 类话术,App Store 链接 ≥4 处且可点;
- [ ] sitter-instructions 工具线上可达;
- [ ] 新 learn 文章线上可达且入 sitemap;
- [ ] saas-prep 五件齐,E1 达到「只差 founder 点发送」;
- [ ] 观测 runbook 落盘,周报模板可直接套用;
- [ ] code-reviewer 复审 PASS;推送后线上 smoke 通过。

# PLANET 文档入口

事实源分三层：**产品事实源 = [PRODUCT.md](PRODUCT.md)；技术事实源 = [ARCHITECTURE.md](ARCHITECTURE.md)；行为唯一事实源 = [APP-BEHAVIOR-CONTRACT.md](APP-BEHAVIOR-CONTRACT.md)**（实现与契约冲突 = 实现错）。其余文档均为支撑文档，不覆盖事实源。（2026-09-22 更正，体检 P3：原「只保留两份事实源」表述过时。）

**优先级链（2026-10-16 立，重构审计前七层"唯一事实源"无排序）：**
[CONSTITUTION.md](CONSTITUTION.md)（agent 执行宪法,仓内正本）> **[RULINGS.md](RULINGS.md)（裁决总账：一切 founder 裁决先入账再同步,引用必须带 R-ID）** > APP-BEHAVIOR-CONTRACT > PRODUCT > FOUNDATION > ARCHITECTURE > 视觉/设计系统 > feature 设计文档（design-2.0/ 等）。同层冲突以 RULINGS 最新 R 行为准；引用规范一律带文档前缀（`契约 §3`,禁裸 `§3`）。

| 需要了解什么 | 文档 |
|---|---|
| **宪法（agent 执行最高法,原 §引用的仓外私有文件已入仓）** | **[CONSTITUTION.md](CONSTITUTION.md)** |
| **裁决总账（append-only,推翻=supersedes 新行）** | **[RULINGS.md](RULINGS.md)** |
| **环境矩阵（dev/prod API 与 Web 基址、EXPO_PUBLIC_* 取值、对称性铁律）** | **[ENVIRONMENTS.md](ENVIRONMENTS.md)** |
| 产品目标、北极星与漏斗、功能总览（F1–F8）、核心流程、V1 范围、验收标准 | [PRODUCT.md](PRODUCT.md) |
| **动作 → 数据变更 → 用户所见、状态机、错误码、失效图（行为唯一事实源）** | **[APP-BEHAVIOR-CONTRACT.md](APP-BEHAVIOR-CONTRACT.md)** |
| APP 页面、路由入口和交互层级（页面契约） | [APP-PAGE-MAP.md](APP-PAGE-MAP.md) |
| **地基形态、延伸层接入、API 稳定面、施工顺序** | **[FOUNDATION.md](FOUNDATION.md)** |
| 照护接力、成员转接、行动通知卡与协作状态 | [CARE-COORDINATION.md](CARE-COORDINATION.md) |
| 照护协作推进板（P0/P1 顺序、出口闸门与验收） | [CARE-COORDINATION-ROADMAP.md](CARE-COORDINATION-ROADMAP.md) |
| 整段交班规格 | [CARE-SHIFT-HANDOFF.md](CARE-SHIFT-HANDOFF.md) |
| 照护协作设备验收记录 | [CARE-COORDINATION-DEVICE-ACCEPTANCE.md](CARE-COORDINATION-DEVICE-ACCEPTANCE.md) |
| 缺陷台账（含已知接受的边界与延期项） | [DEFECT-LEDGER.md](DEFECT-LEDGER.md) |
| 交付状态 | [DELIVERY-STATUS.md](DELIVERY-STATUS.md) |
| 历史整改（架构落地说明） | [REMEDIATION.md](REMEDIATION.md) |
| Web 设计系统（视觉权威口径见文内） | [WEB-DESIGN-SYSTEM.md](WEB-DESIGN-SYSTEM.md) |
| 代码怎么组织、数据和 API 怎么走、如何启动和测试 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| APP 迁移约定与组件重建说明 | [APP/docs/PLANET_APP_DESIGN_SYSTEM.md](../APP/docs/PLANET_APP_DESIGN_SYSTEM.md) |
| 全系统体检报告与处置记录 | [audits/](audits/) |

其他目录只作参考，不覆盖以上事实源：

- [research/](research/)：用户研究、市场和设计评估（历史参考；其中引用的旧文档路径已失效，功能口径以 PRODUCT.md §3.3 为准）。
- [marketing/](marketing/)：Landing、发布和宣发材料。
- [commerce/](commerce/)：收款方案（与产品事实源的关系见文内说明）。
- [design-2.0/](design-2.0/)：2.0 功能设计文档（裁决以各文档 D 表+RULINGS 为准）。
- [archive/](archive/)：历史文档，不参与当前决策——**生产代码禁止引用 archive 内文档当法条**（现存 13 处 Go 引用待迁移,重构批2 清）。

维护规则：**founder 裁决先入 `RULINGS.md`（R-ID + supersedes）再同步领域文档**（宪法 §1.5 当日入档的落地形态）；需求与 Slogan 改 `PRODUCT.md`，行为改动先改 `APP-BEHAVIOR-CONTRACT.md` 再改代码，**地基与延伸边界改 `FOUNDATION.md`**，技术和前端数据流改 `ARCHITECTURE.md`，环境/URL/开关先改 `ENVIRONMENTS.md` 再动代码，移动端视觉只改 Design System；旧文档不要继续在 active 目录追加版本，确需保留就移入 archive。`planet-api/README.md` 和根 `README.md` 只提供入口与运行命令，不重复定义架构。

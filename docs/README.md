# PLANET 文档入口

只保留两份产品/技术事实源，移动端视觉另有一份实现约束：

| 需要了解什么 | 文档 |
|---|---|
| 产品为什么做、给谁用、Slogan、核心流程、V1 范围、验收标准 | [PRODUCT.md](PRODUCT.md) |
| **地基形态、延伸层接入、API 稳定面、施工顺序** | **[FOUNDATION.md](FOUNDATION.md)** |
| **照护接力、成员转接、行动通知卡与协作状态** | [CARE-COORDINATION.md](CARE-COORDINATION.md) |
| 代码怎么组织、数据和 API 怎么走、如何启动和测试 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| APP 迁移约定与组件重建说明 | [APP/docs/PLANET_APP_DESIGN_SYSTEM.md](../APP/docs/PLANET_APP_DESIGN_SYSTEM.md) |
| 冻结的 Web 视觉基准（只读） | [`mobile-v3/`](../mobile-v3/) |

其他目录只作参考，不覆盖以上两份文档：

- [research/](research/)：用户研究、市场和设计评估。
- [marketing/](marketing/)：Landing、发布和宣发材料。
- [commerce/](commerce/)：收款方案。
- [archive/](archive/)：历史文档，不参与当前决策。

维护规则：需求与 Slogan 改 `PRODUCT.md`，**地基与延伸边界改 `FOUNDATION.md`**，技术和前端数据流改 `ARCHITECTURE.md`，移动端视觉只改 Design System；旧文档不要继续在 active 目录追加版本，确需保留就移入 archive。`planet-api/README.md` 和根 `README.md` 只提供入口与运行命令，不重复定义架构。

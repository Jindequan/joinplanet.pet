# PLANET 文档索引（唯一入口）

> 原则：**每个角色只有一份事实来源**——需求/设计看 SPEC 系，计划只在 PRODUCT-SPEC §6，状态只在 DEV-PROGRESS。
> 任何文档与本索引指向的"事实来源"冲突时，以事实来源为准。归档文档仅供追溯。

## 四个问题，四个入口

| 你要找什么 | 去哪 | 说明 |
|---|---|---|
| **完整需求**（产品是什么、完全形态、V1 边界） | [product/PRODUCT-SPEC.md](product/PRODUCT-SPEC.md) | 产品唯一事实来源（v3：主动服务重定调 §1.5–1.7、实体/生命周期/锚定订阅/权限矩阵/V1 冻结/阶段路线） |
| **整体设计**（怎么建） | [product/BACKEND-DESIGN.md](product/BACKEND-DESIGN.md) · [product/API-CONTRACT.md](product/API-CONTRACT.md) · [product/FRONTEND-V1-PLAN.md](product/FRONTEND-V1-PLAN.md) · [design/APP-UI-SPEC-V1.md](design/APP-UI-SPEC-V1.md) | 后端设计 · 接口契约 v2 · 前端实现设计 · UI 规格（布局见 [design/APP-LAYOUTS.md](design/APP-LAYOUTS.md)） |
| **迭代计划**（接下来做什么） | [product/PRODUCT-SPEC.md §6](product/PRODUCT-SPEC.md) | 阶段路线唯一事实来源（V1 → V1.1 → V2 → V3+） |
| **当前状态**（做到哪了、卡在哪） | [product/DEV-PROGRESS.md](product/DEV-PROGRESS.md) | 工作包状态、已知问题、变更日志、环境速查 |

## 辅助文档（在役）

| 文档 | 角色 |
|---|---|
| [product/PRODUCT-AI-BLUEPRINT-20260817.md](product/PRODUCT-AI-BLUEPRINT-20260817.md) | AI 层蓝图（V3 的设计输入，仍有效） |
| [product/APP-TECH-STACK.md](product/APP-TECH-STACK.md) | 技术选型（后端章节以 BACKEND-DESIGN 为准） |
| [product/DEMO-RUNBOOK.md](product/DEMO-RUNBOOK.md) | 演示/联调环境手册（以 planet-api 栈为准） |

## 参考资料夹（不参与决策，只作依据存档）

| 目录 | 内容 |
|---|---|
| [research/](research/) | 需求研究（NEEDS/REQUIREMENTS/OPPORTUNITY）、市场验证手册、设计评估与审查 |
| [marketing/](marketing/) | 宣发内容包、流量打法、Landing 叙事方向 |
| [commerce/](commerce/) | Lemon Squeezy 收款方案 |

## 归档（[archive/](archive/)，已被取代，冲突时一律以在役文档为准）

PRD、MVP、APP-DESIGN、FINAL-PRODUCT-PLAN、EXECUTION-PLAN（2026-08-18 五合一入 PRODUCT-SPEC）；
ROADMAP、DESIGN.md、LANDING-PAGE-REWRITE-STRATEGY、DEMO-RUNBOOK-legacy-stack（2026-08-19 二次收敛归档）。

## 维护约定

1. 新决策落 PRODUCT-SPEC / BACKEND-DESIGN 对应章节，旧内容删除而非注释保留。
2. 状态变化只改 DEV-PROGRESS；计划变化只改 PRODUCT-SPEC §6。
3. 文档退役 → `git mv` 进 archive/ 并在下表登记，不在根目录留游离文件。

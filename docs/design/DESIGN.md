# PLANET 设计方向

## 1. 品牌

品牌名：PLANET  
主张：Their whole world. One place.  
品牌隐喻：PET lives inside PLANET.

“PET 藏在 PLANET 里”可以作为视觉彩蛋，但不能让用户第一眼误以为这是一个星球、环保或天文产品。

## 2. 视觉关键词

- 温暖，但不幼稚；
- 安静、可信、清晰；
- 有生活感，但不做宠物卡通化；
- 健康信息优先于装饰；
- 更像一个值得长期保存的家庭空间，而不是社交媒体。

## 3. 视觉系统（2026-08-17 UI spec 采纳后的绑定决策）

[APP-UI-SPEC-V1](APP-UI-SPEC-V1.md) 的设计系统**结构与纪律全量采纳**：4pt 间距、radius 阶梯（28/24/18/16/999）、shadow 克制（背景对比+边框优先）、44px 触达、语义色（症状/用药/AI 紫预留）、motion 时长表、token 强制（禁止裸 hex/17px/19px）。

**唯一绑定决策——色相体系**：spec 参考稿是蓝白系（Brand Blue #47B9E2），但线上 landing 已建立暖纸/sage/Georgia 品牌且 vet-paper 视觉被明确设计为"营销演示变成真货"。为保持品牌连续性，**Phase 1 的 token 值映射到现有暖色系**：

| spec token | Phase 1 落地值（暖色映射） | 用途 |
|---|---|---|
| `bg` | `#F7F8F3`（现有 --paper） | App 背景 |
| `surface` | `#FFFEFA`（--white） | 卡片 |
| `surface-soft` | `#F3EFE6`（--cream） | 次级面 |
| `border` | `#DCE2DA`（--line） | 分隔线 |
| `text` | `#1B2B27`（--ink） | 主文字 |
| brand 500 | `#245348`（--green 深松绿） | Tab active/进度/链接/＋ |
| 主 CTA | `#1B2B27` 底 + 白字 | 同 spec"大 CTA 不用品牌色"原则 |

- 语义色照抄 spec 数值（Success #57A879 / Warning #D89A3A / Symptom #D75E67 / Medication #318EB3 / AI 紫 #796BEA Phase 2 才启用）；
- 字体：正文系统 sans（spec），Hero/Section 标题保留 Georgia 衬线（品牌资产，spec 禁的是卡通字体不是衬线）；
- **蓝白方案为已记录备选**：token 结构下换肤只改值，若创始人偏好蓝白参考稿，一次 `@theme` 替换即可，不动任何组件代码。

## 4. Logo / Icon 原则

暂不投入完整品牌设计，先用简单的 PLANET wordmark 验证产品。

后续可以探索：

- 强调 P、E、T 的隐藏字形；
- 不闭合的轨道和负空间 P；
- 抽象的中心与轨道关系。

避免：爪印、爱心、狗猫头、听诊器、地球、土星。

## 5. 信息架构

（2026-08-17 评估采纳：Share 是动作不是空间，从一级导航移除，改为上下文按钮 + 全局快速记录。）

```text
PLANET
├── Today       今日照护（高频空间）
├── Timeline    健康时间线（高频/中频空间，页头 [Share]）
└── Pet         宠物与成员（长期空间，含 [Prepare for vet] / [Share with sitter]）

全局 +：+ Note / + Symptom / + Weight / + Medication / + Photo
```

首页必须首先回答：

1. 今天还有什么需要做？
2. 最近宠物发生了什么？

（"如何快速分享"由上下文动作回答，不占导航位。）

## 6. 关键界面

### Today

```text
Milo

Today
08:00  早餐       妈妈已完成
09:00  用药       待处理
12:00  遛弯       Alex 已完成
19:00  晚餐       待处理
```

### Timeline

```text
Aug 8  呕吐一次 · 食欲正常 · 图片
Aug 5  体重 4.3 kg
Jul 28 血检报告 · 上传文件
Jul 1  开始服用药物 X
```

### Share

```text
Share Milo's care

[ Vet-ready Summary ]
[ Full Timeline ]
[ Sitter Instructions ]

Expires in: 72 hours
```

## 7. 文案原则

产品界面用功能清晰的语言，品牌语言只做轻量点缀：

- Create a Planet：创建宠物空间；
- Milo's Planet：Milo 的宠物空间；
- Join the Planet：加入共同照护；
- Ready for the vet：准备好就诊资料。

避免把所有功能都包装成抽象的 Planet 术语，用户必须一眼看懂操作结果。

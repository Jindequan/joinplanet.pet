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

## 3. Logo / Icon 原则

暂不投入完整品牌设计，先用简单的 PLANET wordmark 验证产品。

后续可以探索：

- 强调 P、E、T 的隐藏字形；
- 不闭合的轨道和负空间 P；
- 抽象的中心与轨道关系。

避免：爪印、爱心、狗猫头、听诊器、地球、土星。

## 4. 信息架构

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

## 5. 关键界面

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

## 6. 文案原则

产品界面用功能清晰的语言，品牌语言只做轻量点缀：

- Create a Planet：创建宠物空间；
- Milo's Planet：Milo 的宠物空间；
- Join the Planet：加入共同照护；
- Ready for the vet：准备好就诊资料。

避免把所有功能都包装成抽象的 Planet 术语，用户必须一眼看懂操作结果。

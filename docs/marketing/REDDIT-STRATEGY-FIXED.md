# Reddit 发帖策略(修正版)

> **2026-08-16 实战更新（重要，覆盖以下部分旧结论）：**
>
> - **r/IMadeThis 已成功发帖并通过过滤器**（匿名可见全文）：https://www.reddit.com/r/IMadeThis/comments/1vp6lfa/ —— 证明账号本身没被拉黑，可以发帖。
> - **r/SideProject 两次被站方过滤器移除**（正文无链接也被移除）。原因分析：该版唯一写明的发帖要求是标题格式 **`[Project name] - [Short description]`**（旧版侧栏可见），旧帖标题 "I built 3 free pet tools..." 不符合格式，疑似 AutoMod 按格式过滤。**重发时标题必须是：`PLANET - Free pet tools: symptom checker, pet card maker, care calendar`** 这类格式。
> - **r/Pets 被删原因已确认**：AutoMod 原话 "your account does not meet the minimum requirements" —— karma 门槛（本策略下文预判正确）。
> - **链接评论会静默失败**：低 karma 账号带链接的评论可能被过滤或提交无响应，发完评论必须匿名验证（old.reddit.com 打开帖子页看评论区）。
> - **账号状态**：未 shadowban（匿名可见 profile 和帖子），1 post karma。被删帖子的 modmail 已发（2026-08-15），暂无回复。
> - **通用验证纪律**：发帖后立即用无痕/匿名视角打开帖子 URL 验证正文可见——作者视角看到的"发布成功"不算数，"removed by Reddit's filters"只对作者可见。
>
> **2026-08-16 二次实战更新：**
>
> - **标题格式不是 r/SideProject 被滤原因**：按 `[Project name] - [Short description]` 规范重发（1vp7leo）仍被移除。结论：r/SideProject 对本账号存在 karma 门槛（帖子**和评论**都拦），与 r/Pets 同类。
> - **r/IMadeThis 帖子+链接评论双双存活**（1vp6lfa + 链接评论匿名可见）——该版无任何门槛，是当前唯一可用的 Reddit 主阵地。
> - **r/dogs 评论可用**（发帖仍会被门槛拦）：实用回答存活且匿名可见。暖号路径 = 每天在 r/dogs 等无门槛版认真回答 2-3 条，攒 comment karma 后再解锁 r/SideProject / r/Pets。
> - **old.reddit.com 是本账号的黄金通道**：经典界面原生 textarea 发评论 100% 可用（www 新版评论编辑器对自动化免疫）。发评论用 `old.reddit.com` 域名。
> - **小红书补充**：创作平台"写长文"标签对柳赞账号无响应（功能有账号门槛）；图文笔记必须走文件上传对话框。网页端代发不可行，只能 App/手动发布。
>   - **修正（2026-08-16 深夜）**：用户手动点开"写长文"后编辑器可用。正文可自动化输入（正文编辑区可点击入口在标题框下方约 y≈250 处，编辑器对 Cmd+A 全选+重打响应良好，坐标点击定位光标不可靠）；**发布按钮为禁用态——长文必须添加封面图才能激活发布**，封面走文件上传对话框，自动化死穴。已验证流程：自动写好全文 → 自动保存草稿 → 人工加封面 + 点发布（约 1 分钟）。首篇草稿《狗子5岁生日，程序员老爸给它写了3个工具》已在草稿箱。

## 正确的发帖顺序

### 第一步:r/SideProject(现在就能发)
- **门槛:** 无 karma 要求
- **允许链接:** 是
- **内容:** 已准备好(标题 + 三工具介绍 + 链接 + 技术栈 + feedback 征求)
- **URL:** https://www.reddit.com/r/SideProject/submit/

### 第二步:r/IMadeThis(现在就能发)
- **门槛:** 极低
- **允许链接:** 是
- **适合:** 展示做的东西,语气更轻松
- **标题:** "I made a free pet symptom checker and card maker"
- **URL:** https://www.reddit.com/r/IMadeThis/submit/

### 第三步:r/Entrepreneur(攒 karma 后)
- **门槛:** 低
- **内容:** building in public 故事,创业经历分享

### 第四步:r/Pets / r/dogs(需 karma)
- **门槛:** 需要一定 karma 和账龄
- **策略:** 先在上述 subreddit 攒 karma + 回答问题帮人
- **注意:** Rule 4 禁广告,Rule 6 禁自链
- **正确做法:** 纯文字回答症状问题(不带链接),链接放个人简介

## Reddit 养号建议

- 每天回答 2-3 个 r/dogs / r/AskVet 的问题(不带链接,纯知识分享)
- 在 r/SideProject 的帖子里积极回复评论
- 2-4 周后 r/Pets 的门槛就够过了

## 已准备的内容

### r/SideProject 帖子(已填入表单)

**标题:** I built 3 free pet tools after losing track of my dog's health history

**正文:**
```
My dog turned 5. His records were everywhere — food notes in chats, vaccines in photos, blood tests in a drawer. Every vet visit, I'd rebuild everything from memory.

So I built three free tools. No account needed, no app to download:

Pet Symptom Checker — 20 common symptoms, when to call vet
Pet Card Maker — 6 styles, save as image, share
Care Schedule — shared vaccine calendar for family

https://www.joinplanet.pet/tools

Tech: Next.js, pure frontend, state encoded in URL for sharing.

Building PLANET — full health timeline + vet handoffs. 100 founding memberships to fund development.

Feedback welcome!
```

### r/IMadeThis 帖子

**标题:** I made a free pet symptom checker after my vet asked me questions I couldn't answer

**正文:**
```
Last month my vet asked "when did the symptoms start?" and I had no idea. So I built a free symptom reference tool:

20 common dog/cat symptoms, what they might mean, what to watch for, and when to call the vet.

Not a diagnosis — just a calmer first step than googling at 2am.

https://www.joinplanet.pet/tools/symptoms

Also made a pet card maker and shared vaccine calendar. All free, no signup.
```

# 系统⑥：event 的创建与查看 — 生命周期审计（2026-09-22）

> 审计员：只读子代理。范围：planet-api internal/modules/{timeline,sharing}+pets export 口径+photo-sweep 一致性、APP timeline/composer/photo-upload/公开分享页/导出、契约 §2.3/§2.4。基线已排除（L29/L34/L35、记录分类建议、timeline-facts 裁决、撤销 195/195 已修）。

## 1. 生命周期状态图（三条线）

### 1.1 事件线（pet_events）
```
手动事件（note/photo/symptom/weight/vet_visit/vaccine/deworm）
  创建 POST /pets/{id}/timeline：幂等必需键+auto 禁入+类型注册表校验+occurred_at 禁未来
    +可写&归档闸+多家庭必须带活跃 family_id+照片四道闸（归属目录/对象存在/字节±20%/CT 白名单）
    +记账+weight 重算同事务
  → active ──编辑 PATCH /timeline-events/{id}──→ active
      守卫：仅 source=user（AUTO_EVENT_IMMUTABLE）+记录者或圈主+viewer 拒+归档拒
      +payload 整体替换+编辑口拒绝内联照片+换图回退旧账记新账同事务+旧对象 post-commit trash
  → deleted（软删终态；行保留审计，无事件级恢复出口）
      守卫：auto 不可删+归档禁删+幂等声明同事务（重放 204）+照片记账回退+对象 trash 联动
auto 事件（medication/transfer/care_task_completed/care_task_undone）：
  RecordAuto 同调用方事务+dedupe 唯一索引 ON CONFLICT DO NOTHING；
  撤销完成=occurrence 侧同事务 RetractAuto 软删 completed+写 undone → 记录页不留「完成+撤销并存」
投影：scope=facts 默认白名单 9 类/all 放开管理类；类型过滤在 SQL 内 LIMIT 作用于可见行；
  单宠与聚合同序同 cursor；照片事件批量签 1h 读 URL
```

### 1.2 照片对象线（R2）
```
领票（15min TTL+写权限+归档闸+30 张/h 限速+配额预检 402）→ 直传（压缩→双 PUT）
  票据复用（>1min 余量）；过期弃旧票前先 abandon 旧对象；持久化台账+启动兜底 abandon >24h 死票
→ 挂接成功（四道闸+记账+认领销账）｜未挂接 → abandon（引用安全闸：被引用不删 204；幂等；跨宠 404）
→ 事件删除/换图 → trash（fail-safe，仍被引用不动）→ R2 生命周期 7 天 → photo-sweep 兜底
  （48h 宽限+dry-run 默认+apply 前 EXISTS 点查）
```

### 1.3 分享链接线（share_links）
```
创建（owner-only+归档禁新增；快照先物化凭证后落库「后续编辑不得偷改收件人所见」；
  token 哈希落库明文仅回一次；幂等重放可取回，不可恢复→409 IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE）
→ active ──撤销（owner 幂等+审计同事务）→ revoked（终态）
→ active ──过期→ expired（终态）；转移联动全撤
匿名查看 GET /shares/{token}：IP 限流+哈希查找+宠物未删 EXISTS；撤销/过期/不存在/损坏一律 410 SHARE_GONE；
  已打开页面=快照语义；分享摘要只投影 FactTypes 与记录页同口径；快照默认剥 photo 引用
【include_photos=true 半成品→E1】
导出：仅 owner 单读事务；含 pet/profile/medications/tasks/task_logs/timeline；不含照片字节与 share/handoff
```

## 2. 覆盖矩阵（要点）

| 节点 | 后端 | 前端 | 契约 | 守卫 |
|---|---|---|---|---|
| 事件创建（7 类） | ✅ | ✅ zod 双校验 | ✅ | ✅ 幂等+四道闸 |
| 照片领票→直传→挂接 | ✅ | ✅ 全链（票据复用/死票兜底） | ✅ | ✅ |
| 挂接失败重试/票过期 | ✅ abandon 引用闸 | ✅ 换票+表单保留照片 | ✅ | ✅ |
| 离线队列（创建） | ✅ 幂等重放 | ✅ 保序/锁/合并 | ✅ | ⚠️ 丢弃无提示（E2） |
| 查看 facts/all/分页 | ✅ | ✅ | ✅ | ✅ |
| 编辑/删除 | ✅ 换图对账/软删+回退+trash | ✅ 分级确认 | ✅ | ✅ |
| 撤销完成（事件侧） | ✅ 成对同事务 | ✅ | ✅ | ✅ |
| weight 冗余一致性 | ✅ 增改删三路同事务重算；PATCH 直改拒绝 | ✅ | ✅ | ✅ |
| 分享创建/匿名查看/撤销 | ✅ 410 统一口径 | ✅ 410 分支 | ✅ | ✅ 快照语义 |
| include_photos | ❌ 半成品（E1） | ❌ 只渲染 photo_data | ⚠️ | ❌ key 泄入匿名页 |
| 导出 | ✅ owner-only | ✅ | ⚠️ 照片口径未落字（E5） | ✅ |
| 已删宠物/归档宠 | ✅ 404/410、读放行写全禁 | ✅ 错误态/读写分级 | ✅ | ✅ |

## 3. 漏洞清单

| # | 级别 | 类型 | 发现与证据 | 处置 |
|---|---|---|---|---|
| E1 | P2 | 做了一半的流程+隐私口径 | include_photos=true 时 payload 原样返回——photo.key/thumb_key 私有对象坐标进匿名页（同函数 false 分支注释自认这是泄漏）；公开页与 PDF 只渲染 photo_data——R2 照片收件人什么都看不到，创建页文案却承诺「包含照片」 | **本批修复（裁决推定）**：匿名查看时服务端签 1h URL 附 photo_url，绝不返回裸 key |
| E2 | P2 | 没有出口的状态 | PRODUCT §6.4 承诺「失效会从队列移除并提示」；实现完全忽略 {discarded, firstError}，4xx 丢弃零反馈（形似成功，事实被静默永久丢弃）；且 402 配额满（可恢复）也触发永久丢弃 | **本批修复**：丢弃告知+402 保留重试 |
| E3 | P2 | 契约与实现口径冲突（需裁决） | PRODUCT §6.4 承诺「照片断网入队」；实现是照片必须先传 R2 成功才可能入队（完全断网即丢，仅表单保留）；§6.4 清单漏 deworm | **待 founder 裁决**（改文档=照片在线能力，或做离线暂存）+文档修复 |
| E4 | P3 | 迁移窗口编辑死路 | 编辑口拒绝内联照片，遗留内联照片事件改 caption 必失败且报错不指引 | 工程修复（前端预检提示，顺手项） |
| E5 | P3 | 导出「完整」语义未说清 | 照片仅引用无字节；含管理类事件与 facts 投影口径不同——契约未落字 | 文档修复（登记） |
| E6 | P3 观察 | 文档化的人工依赖拖挂态 | trash 失败对象+sweep 含软删事件判定 → 需运维介入（文档已自洽的两把尺） | 登记已知取舍 |
| E7 | P3 | 注释与实现不符 | abandon 列表超限「宁可失败」vs media.List 静默截断只删前 16 个仍 204（触发前提需存储侧被破坏） | 工程微修（登记） |
| E8 | 未确认（轻） | 快照物化在事务外 | 竞态窗口内数据变化进快照或创建失败，无正确性损害 | 工程取舍（登记） |

## 4. 结论

事件主链（创建→查看→编辑→删除→撤销→分享→导出）的守卫密度是全仓最高水准；离零漏洞差三件事：**include_photos 收口成有真实语义的完整流程（E1，本批修）、离线队列「丢弃」终态的告知出口（E2，本批修）、照片断网承诺与现实对齐（E3，待裁决）**——剩余均为迁移窗口与文档口径小修。

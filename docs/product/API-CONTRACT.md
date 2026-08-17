# PLANET App API 契约 v1（Phase 1 执行版）

> 2026-08-17 深夜执行版。前后端 agent 以本文件为唯一接口真相；字段名、路径、错误码不得单方更改。
> Base：`/api/v1`。认证：`Authorization: Bearer <token>`（auth 模块签发）。
> 通用错误：`{"error": "..."}`；日期=ISO8601 UTC 时间戳；`log_date`/生日=YYYY-MM-DD（circle 本地时区语义）。

## F1 认证

- `POST /auth/request-code` `{email}` → `{ok, expires_in}`；开发模式（无 RESEND_API_KEY 或 AUTH_DEV_MODE=1）额外返回 `{dev_code}` 并打印到 stderr
- `POST /auth/verify` `{email, code}` → `{token, user:{id, email, display_name}}`（登录注册合一；code 10 分钟有效，一次性）
- `GET /me` → `{user, circles:[{id,name,timezone,role, pets:[{...pet 完整对象，同 GET /pets/{petID}},...], pet:{...deprecated, = pets[0]，无宠物为 null}], entitlements:["*"|"..."]}`（`circles[].pets` 为该圈全部宠物，按 id 升序；顶层 `pet` 是向后兼容的旧字段，仅取第一只，App 应改用 `pets`）
- `PATCH /me` `{display_name}`（1-40 字符，首尾空白裁剪）→ `{user:{id,email,display_name}}`

## F2 圈子

- `POST /circles` `{pet_name, species?, breed?, timezone?}` → 建 circle+pet+owner 一体 `{circle:{id,name,timezone,invite_code}, pet:{...}}`
- `POST /circles/join` `{invite_code}` → 以 caregiver 加入 `{circle, pet}`；**圈成员数达上限（free 档=2，含 owner）→ 403 `{"error":"member limit reached","limit":2}`**
- `GET /circles/{circleID}` → `{circle, members:[{user_id, display_name, email, role, joined_at}]}`
- `POST /circles/{circleID}/invite` → `{invite_code}`（owner only，滚动刷新旧码）
- `DELETE /circles/{circleID}/members/{userID}`（owner only）
- `PATCH /circles/{circleID}` `{name?, timezone?}`（owner）

## F3 宠物与用药

- `POST /pets` `{name, species?, breed?, birthday?}` → 在**调用者的第一个 circle**（按 id 最早）建新宠，201 `{pet:{...完整 pet 对象}}`；无任何 circle → 400 `{"error":"create a circle first"}`；**该圈宠物数达上限（free 档=2）→ 403 `{"error":"pet limit reached","limit":2}`**（多宠入口；校验同 POST /circles 的首宠：species ∈ dog/cat/other 默认 dog，birthday=YYYY-MM-DD 或缺省）
- `GET /pets/{petID}` → `{pet:{id,name,species,breed,birthday,allergies[],conditions[],emergency_contacts{primary,vet,authorized_decision_maker},notes,avatar_key}}`
- `PATCH /pets/{petID}` 任意子集字段（member 可改）
- `GET /pets/{petID}/medications` → `{active:[...], past:[{id,name,dose,schedule,started_on,ended_on}]}`
- `POST /pets/{petID}/medications` `{name,dose?,schedule?,note?}` → 建档 active + **自动生成 timeline 事件** `{medication, event}`
- `PATCH /medications/{medicationID}` `{dose?,schedule?,note?,active?}`（active=false 时写 ended_on=今天 + 生成 "Stopped" 事件）
- `DELETE /medications/{medicationID}`（owner，硬删+级联其事件）

## F4 今日照护

- `GET /pets/{petID}/today?date=YYYY-MM-DD`（默认 circle 今天）→ `{date, tasks:[{id,title,time_of_day,note,medication_id?, log:{status,by_user_id,by_name,at,note}|null}]}`
- `POST /pets/{petID}/tasks` `{title, time_of_day:"08:00", note?, medication_id?}` → `{task}`
- `PATCH /tasks/{taskID}` `{title?,time_of_day?,note?,active?}`
- `DELETE /tasks/{taskID}`（owner）
- `POST /tasks/{taskID}/log` `{status:"done"|"skipped", note?, date?}` → upsert；**并发竞争时返回 409 + 现有 authoritative log** `{log}`（App 静默采用，不弹错误——spec §21）
- `DELETE /tasks/{taskID}/log?date=` → 撤销（undo）

## F5 时间线与附件

- `GET /pets/{petID}/timeline?before=<eventID>&limit=30&types=symptom,weight...` → `{events:[{id,type,occurred_at,title,body,severity,data,recorded_by,by_name,source,attachments:[{id,kind,url,filename}]}], next_cursor}`（按 occurred_at DESC）
- `POST /pets/{petID}/events` `{type, title, body?, occurred_at?, severity?, data?}` → `{event}`（weight 类型要求 data.weight_kg 数值）
- `PATCH /events/{eventID}` / `DELETE /events/{eventID}`（记录者或 owner；删除二次确认在 UI）
- `POST /pets/{petID}/attachments` multipart `file` + `event_id?` → 存本地 `./uploads/{random32hex}.{ext}` → `{attachment:{id,kind,url}}`；**存储配额（free 档=50MB/圈）：该圈全部附件 `SUM(size)` + 本次 size 超限 → 413 `{"error":"storage limit reached","used_bytes":X,"limit_bytes":Y}`**
- `GET /circles/{circleID}/usage`（member 可查）→ `{storage_bytes, storage_limit_bytes, pet_count, pet_limit, member_count, member_limit}`（配额用量总览，storage 为该圈全部附件字节和）
- `GET /api/v1/files/{key}` 公开读（随机 key 即权限，分享页要用）

## F6/F7 分享与就诊

- `POST /pets/{petID}/shares` `{kind:"summary"|"care", ttl_hours:24|72|168, reason?, includes?:{profile,allergies,medications,events,weight,visits}}` → `{share:{id,kind,token,url,expires_at,view_count}}`
- `GET /pets/{petID}/shares` → `{shares:[{id,kind,url,expires_at,revoked_at,view_count,status:"active"|"expired"|"revoked"}]}`
- `DELETE /shares/{shareID}` → revoke（owner）
- `GET /s/{token}` **公开 Web 页**（无 JSON API）：summary=就诊摘要 HTML（打印友好），care=Care Card（今日任务+紧急联系+医疗决定人，"Health history stays private."）；过期/撤销显示中性提示；每次有效访问 view_count+1
- `GET /invite/{code}` 公开：`{pet_name, photo_url, inviter_name}` 预览（App 深链用）

## F8 数据生命周期

- `GET /pets/{petID}/export` → `application/json` 全量（pet+medications+tasks+logs+events+attachments 清单，含下载 URL）
- `DELETE /pets/{petID}`（owner，确认在 UI）→ 级联硬删（circle 若无宠物则一并删）
- `DELETE /me` → 注销（删用户+级联其会话；若为唯一 owner 则先要求处理 circle）

## 权益层（内部）

- webhook `order_created` 落 claim 后**同时** `INSERT entitlements (user_id,'*','founding')`（以 email_hash 关联已有/将来的 users 行，ON CONFLICT DO NOTHING）
- `can(userID, key)`：存在未过期 `feature_key IN (key,'*')`

## 命名与纪律（后端 agent 必读）

- 时间：入库 UTC；`log_date`/`started_on` 按 circle.timezone 计算"今天"
- 一律参数化 SQL；错误返回语义化短句（spec §64：不写 "Something went wrong"）
- 每个 handler ≤60 行，查询进各自模块文件；不改 main.go / api.go

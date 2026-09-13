# APP 客户端分层

## 依赖规则

```text
features/*  →  core/*, ui/*, 同 feature/model
features/*  →  禁止其他 features/* 互引
features/*  →  禁止直接 planetApi（L3–L4 走 extension，L0–L2 走 foundation）
```

## 包职责

- **foundation** — L0–L2 读写、invalidate 图、pending today
- **extension** — L3–L4 聚合与写（分享、趋势、handoff）
- **collaboration** — 责任视图（读 handoff-summary / care-responsibility）
- **activation** — 激活状态与引导路由
- **capabilities** — 功能诚实开关
- **presentation** — 用户可见 copy 与术语

## 守卫脚本

`scripts/verify-client-layers.sh`

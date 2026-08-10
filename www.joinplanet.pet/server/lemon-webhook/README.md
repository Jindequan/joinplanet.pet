# PLANET Lemon webhook receiver

这是独立于 landing page 的 Go 服务。它只保存订单号、客户邮箱、Variant、付款状态和退款状态，不保存宠物病历。

## 启动

```bash
export LEMON_SQUEEZY_SIGNING_SECRET='your-signing-secret'
export LEMON_LIFETIME_VARIANT_ID='your-variant-id'
export LEDGER_PATH='/var/lib/planet/memberships.jsonl'
export PORT='8080'
go run .
```

Lemon Webhook URL：

```text
https://your-server.example.com/webhook
```

程序验证 `X-Signature`、按 webhook id 去重，并把最新状态追加到 JSONL 文件。`MAX_MEMBERSHIPS` 默认是 `100`，也可以通过环境变量调整。

landing page 可以把 `NEXT_PUBLIC_PROGRESS_API_URL` 设置为 `https://your-server.example.com/progress`，页面会展示已付款人数、下一位会员序号和剩余名额。

如果暂时不启用 webhook，仍然可以从 Lemon 导出订单做人工导入；但自动兑付、退款同步和实时名额控制必须依赖 webhook 或一次性导入程序。

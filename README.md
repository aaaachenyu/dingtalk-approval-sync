# DingTalk Approval to Google Sheet

当钉钉审批完成后，本服务会获取审批实例详情，按 `approval_instance_id` 去重，然后追加写入 Google Sheet。它同时支持两种触发方式：

- HTTP 事件推送：监听钉钉 `bpms_instance_change` 审批实例完成事件。
- 定时补偿查询：按审批模板 `processCode` 拉取最近完成的审批实例，避免事件推送漏单。

## 写入列

默认写入以下列：

1. `approval_instance_id`
2. `审批编号`
3. `审批标题`
4. `申请人`
5. `部门`
6. `审批完成时间`
7. `付款金额`
8. `付款对象`
9. `付款用途`
10. `备注`
11. `附件链接`

## 安装

```bash
npm install
cp .env.example .env
```

编辑 `.env`，填入钉钉应用凭证、审批模板 `processCode`、Google Sheet ID 和 Google 服务账号凭证。

## 钉钉配置

1. 在钉钉开放平台创建企业内部应用。
2. 给应用添加权限：
   - 工作流实例读权限
   - 如果要生成审批附件下载链接，还需要工作流实例写权限
   - 如果后续要把申请人 userId 解析成姓名，可再加成员信息读权限并扩展代码
3. 在事件订阅里选择 HTTP 推送，配置：
   - 请求地址：`https://你的域名/dingtalk/events`
   - Token：填入 `.env` 的 `DINGTALK_CALLBACK_TOKEN`
   - AES Key：填入 `.env` 的 `DINGTALK_CALLBACK_AES_KEY`
4. 订阅审批实例完成事件，规则建议：
   - `/v1.0/event/bpms_instance_change/processCode/{你的PROC编码}/type/finish`

## Google Sheet 配置

1. 在 Google Cloud 创建 Service Account，并启用 Google Sheets API。
2. 下载服务账号 JSON，放在项目目录，例如 `service-account.json`。
3. 把这个服务账号邮箱共享到目标 Google Sheet，至少给编辑权限。
4. 在 `.env` 里设置：

```bash
GOOGLE_SHEET_ID=你的表格ID
GOOGLE_SHEET_RANGE=Approvals!A:K
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

也可以不用文件，直接设置 `GOOGLE_SERVICE_ACCOUNT_JSON` 为完整 JSON 字符串。

## 本地运行

```bash
npm start
```

启动后可访问：

- `GET /health`
- `POST /dingtalk/events`

如果本地测试钉钉 HTTP 回调，可以用 ngrok、Cloudflare Tunnel 或部署到公网服务器。

## 手动补偿拉取

```bash
npm run poll
```

这会按 `.env` 的 `POLL_LOOKBACK_MINUTES` 查询最近审批实例，获取详情后写入 Google Sheet。

## 回填已有行

如果旧数据已经写入 Google Sheet，但金额、付款对象、用途等字段为空，可以运行回填：

```bash
npm run backfill
```

回填会读取当前 Sheet，按 `approval_instance_id` 或“审批编号”匹配钉钉审批实例，只补空字段，不覆盖已有值。默认查询最近 `POLL_LOOKBACK_MINUTES` 分钟的审批，也可以临时指定更长范围：

```bash
BACKFILL_LOOKBACK_MINUTES=43200 npm run backfill
```

先预览不写入：

```bash
BACKFILL_DRY_RUN=true npm run backfill
```

Windows CMD 可这样写：

```bat
set BACKFILL_LOOKBACK_MINUTES=43200
npm run backfill
```

## 本地明文回调测试

仅本地测试时设置：

```bash
ALLOW_PLAINTEXT_CALLBACK=true
```

然后发送：

```bash
curl -X POST http://localhost:3000/dingtalk/events \
  -H "Content-Type: application/json" \
  -d "{\"EventType\":\"bpms_instance_change\",\"type\":\"finish\",\"processInstanceId\":\"你的审批实例ID\"}"
```

## 部署

### PM2

```bash
npm install -g pm2
pm2 start src/index.js --name dingtalk-approval-sync
pm2 save
```

### Docker

```bash
docker build -t dingtalk-approval-sync .
docker run -d --name dingtalk-approval-sync --env-file .env -p 3000:3000 dingtalk-approval-sync
```

### Render

仓库里已包含 `render.yaml`。在 Render 里选择 Blueprint 或 Web Service 后，补齐 `.env.example` 里的环境变量即可。不要上传 `.env` 文件。

如果使用 `GOOGLE_APPLICATION_CREDENTIALS`，需要把服务账号 JSON 作为 Secret File 上传，或改用 `GOOGLE_SERVICE_ACCOUNT_JSON` 环境变量。

### Railway

仓库里已包含 `railway.json`。在 Railway 新建项目并连接 GitHub 仓库后，补齐环境变量即可。

Railway 推荐使用 `GOOGLE_SERVICE_ACCOUNT_JSON`，直接把服务账号 JSON 压成一行后放进环境变量。

## 去重策略

服务会做两层去重：

- 启动时读取 Google Sheet 的第一列 `approval_instance_id`，避免重复追加历史数据。
- 成功写入后记录到本地 `data/state.json`，用于快速判断。

## 字段映射

钉钉表单字段名可能不同，请在 `.env` 调整：

```bash
FIELD_PAYMENT_AMOUNT=付款金额,金额,支付金额
FIELD_PAYEE=付款对象,收款方,供应商
FIELD_PURPOSE=付款用途,用途,付款事由
FIELD_REMARK=备注,说明
FIELD_ATTACHMENTS=附件,付款附件,上传附件
```

服务会按字段名、字段别名 `bizAlias` 做匹配。

## 付款用途中文翻译

服务会把常见西语付款用途追加中文翻译，例如：

```text
NOMINA COLABORADORES INTERNOS 01Q05

中文：内部员工工资
```

如需关闭：

```bash
TRANSLATE_PURPOSE_TO_CHINESE=false
```

只回填现有 Sheet 的“付款用途”中文翻译：

```bash
npm run backfill:translate-purpose
```

如果旧行已经被写成 `原文 / 中文...` 的旧格式，可用同一个命令清理并重写为末尾中文摘要格式：

```bash
npm run backfill:rewrite-purpose
```

先预览不写入：

```bash
BACKFILL_DRY_RUN=true npm run backfill:translate-purpose
```

说明：钉钉新版审批详情通常返回发起人 `userId`。如果接口响应里包含 `originatorUserName`，服务会优先写姓名；否则写入 `userId`。如需强制转换成姓名，需要给应用额外添加成员信息读权限，再接入用户详情接口。

## 参考文档

- [钉钉获取企业内部应用 accessToken](https://dingtalk.apifox.cn/api-139698997)：`POST https://api.dingtalk.com/v1.0/oauth2/accessToken`
- [钉钉审批实例开始、结束、终止事件](https://dingtalk.apifox.cn/doc-3659374)：`bpms_instance_change`
- [钉钉获取审批实例 ID 列表](https://dingtalk.apifox.cn/api-141006691)：`POST https://api.dingtalk.com/v1.0/workflow/processes/instanceIds/query`
- [钉钉获取单个审批实例详情](https://dingtalk.apifox.cn/api-141004134)：`GET https://api.dingtalk.com/v1.0/workflow/processInstances`
- [Google Sheets 追加写入](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)：`spreadsheets.values.append`
## Multiple DingTalk Approval Processes

Use `DINGTALK_PROCESS_CODES` when more than one approval process should sync into the same Google Sheet:

```bash
DINGTALK_PROCESS_CODES=PROC-aaa,PROC-bbb,PROC-ccc
```

`DINGTALK_PROCESS_CODE` still works for a single process. If `DINGTALK_PROCESS_CODES` is set, polling and backfill use that list.

For DingTalk HTTP event push, subscribe each process code to the same callback URL:

```text
https://your-render-domain.onrender.com/dingtalk/events
```

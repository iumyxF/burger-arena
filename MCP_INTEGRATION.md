# 麦当劳 MCP 集成说明

本文依据项目现有的 `tools/fetch-mcd.mjs` 和 `index.html` 说明实际接入方式。MCP 用于开发维护阶段获取餐品数据，游戏运行时读取内置数据。

## 实际使用的 Server 与 Tool

| 项目 | 当前实现 |
|---|---|
| MCP Server | 麦当劳中国 MCP Server |
| 服务地址 | `https://mcp.mcd.cn` |
| Token 申请入口 | [麦当劳开放平台 MCP](https://open.mcd.cn/mcp) |
| 接入入口 | `tools/fetch-mcd.mjs`，使用 Node.js 内置 `fetch` 发起 HTTP POST |
| 协议 | JSON-RPC 2.0；初始化请求声明 MCP 版本 `2025-06-18` |
| 身份验证 | `Authorization: Bearer <MCD_MCP_TOKEN>` |
| 实际业务 Tool | `list-nutrition-foods` |
| Tool 参数 | `{}`，获取餐品营养列表 |

当前仅调用上述一个业务 Tool，没有接入下单、支付、优惠券或门店查询功能，也没有调用 `tools/list`。`initialize` 和 `notifications/initialized` 是协议交互，不是业务 Tool。

## 调用流程

```text
维护者运行 tools/fetch-mcd.mjs
  → 读取项目根目录 mcd.config.json 中的 Token
  → initialize：发送协议版本、客户端信息
  → notifications/initialized：发送初始化完成通知
  → tools/call：调用 list-nutrition-foods，arguments 为 {}
  → 提取响应中的营养数据表并解析为餐品数组
  → 默认替换 index.html 内的 MCD 数据块
  → 玩家打开游戏，读取内置数据并生成卡牌属性
```

脚本将服务返回的 `mcp-session-id` 保存到当前进程，后续请求通过 `Mcp-Session-Id` 请求头携带。响应支持纯 JSON 和 SSE 中的 `data:` 消息。

实际业务调用的请求体为：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list-nutrition-foods",
    "arguments": {}
  }
}
```

脚本拼接 `result.content` 中的文本，从中提取包含 `success` 的 JSON，检查成功标志后解析 `data` 字段里的多行 CSV。当前解析器按逗号拆分，依赖既有字段顺序；若服务改变返回结构或字段中出现带引号的逗号，需要调整解析器。

## 数据如何进入玩法

当前 `index.html` 内置 160 条餐品记录，这是随项目保存的数据快照，不代表接口始终返回固定数量，也不代表全部记录都进入卡池。

| 接口字段 | 游戏字段 | 用途 |
|---|---|---|
| `productName` | `n` | 按餐品名关联武器和辅助卡 |
| `energyKcal` | `kcal` | 伤害倍率、风味词条及卡面展示 |
| `protein` | `p` | 营养归一化、热量占比与卡面展示 |
| `fat` | `f` | 营养归一化、热量占比与卡面展示 |
| `carbohydrate` | `c` | 营养归一化、热量占比与卡面展示 |
| `sodium` | `na` | 暴击与风味词条计算 |
| `calcium` | `ca` | 保留在数据中，当前未用于战斗属性 |

接口中的 `desc`、`energyKj` 未写入游戏数据。游戏将营养数值归一化，并根据蛋白质、碳水和脂肪的热量占比等规则生成风味词条。例如，巨无霸对应「巨无霸连射枪」，大薯条对应「薯条霰弹枪」，麦乐鸡5块对应「鸡块追踪枪」。

武器的连射、追踪、穿透等机制由游戏设计决定；营养数据参与伤害、暴击、风味词条及辅助效果，不直接决定枪型、弹数或射程。「咖啡因」也是游戏按低热量等条件生成的词条，并非接口提供的咖啡因检测数据。

## 配置与运行

仅刷新数据时需要支持内置 `fetch` 的 Node.js（可使用 18 或以上版本）及有效 MCP Token，无需安装 npm 依赖。

1. 从 [麦当劳开放平台 MCP](https://open.mcd.cn/mcp) 获取 Token。
2. 将 `mcd.config.example.json` 复制为项目根目录下的 `mcd.config.json`，填写配置：

```json
{
  "MCD_MCP_TOKEN": "你的 MCP Token"
}
```

3. 在项目目录运行以下命令之一：

```bash
# 获取并更新 index.html 中的营养数据
node tools/fetch-mcd.mjs

# 实际调用接口并打印摘要，不更新游戏数据
node tools/fetch-mcd.mjs --dry

# 实际调用接口并导出 JSON，不更新 index.html
node tools/fetch-mcd.mjs --out data.json
```

若配置文件不存在，脚本会先创建空配置并提示填写 Token；因此 `--dry` 在首次运行时也可能创建配置文件。相对导出路径以项目根目录为基准。

默认更新只替换 `index.html` 中 `/*MCD:START*/` 至 `/*MCD:END*/` 的数据块。更新后重新打开或刷新游戏即可使用新数据，不会自动新增卡牌。

Token 仅从本地配置读取，不写入 HTML；`mcd.config.json` 已被 Git 忽略。发布游戏时只发布所需静态文件，不要将该配置文件放入公开站点。

## 结果检查与失败处理

- 成功时打印 Server 名称、餐品数量和前三条餐品摘要；默认模式还会打印注入结果。
- 脚本检查六种武器对应的餐品是否存在，缺失时发出警告，但仍会继续输出；游戏对找不到的餐品优先回退到巨无霸数据。
- 缺少 Token、配置 JSON 错误、401、429、业务返回失败、无法解析响应或解析到零条记录时，脚本给出提示并退出，不会更新游戏数据。
- 当前没有自动重试或定时刷新。接口不可用时，玩家仍可使用已有数据游玩。

本文依据代码与内置快照核对，未重新发起线上调用；接口最新可用性及返回数量以实际执行结果为准。

## 业务价值

- **让餐品数据成为互动内容**：将营养表转化为可选择、可搭配的卡牌，使玩家在短局中接触餐品名称和营养差异。
- **增强主题辨识度**：真实餐品与武器、辅助卡建立关联，让麦当劳主题参与玩法。
- **降低体验门槛**：维护者集中获取数据，玩家无需申请 Token，也无需等待接口响应，下载即可离线体验。
- **便于维护内容**：通过统一脚本刷新数据，减少手工录入；刷新后可检查卡牌属性变化，再发布新版游戏。

以上是当前设计提供的价值，项目尚未提供用户留存、转化或营销效果的量化验证。游戏中的营养映射属于娱乐规则，不构成饮食建议。

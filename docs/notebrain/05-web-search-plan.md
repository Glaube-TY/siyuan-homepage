# 联网搜索 — 开发计划

## 核心定位

联网搜索**不是 Skill**，而是输入框本轮全局搜索能力。通过三个模式控制：
- **off**：不暴露 web_search；web_read_page 作为全局网页读取工具仍可用。
- **smart**：暴露 web_search；web_read_page 仍可用。本地优先，仅在有明确外部信息需求时 Planner 考虑联网。
- **required**：暴露 web_search；web_read_page 仍可用。最终回答前至少调用一次可用联网能力。

## 输入框模式

输入栏新增联网按钮（iconLanguage），点击切换模式：
- **off**：默认灰色
- **smart**：蓝色轻高亮
- **required**：橙色高亮

设置 `enabled=false` 时按钮隐藏。

## 工具

### web_search

| 字段 | 说明 |
|------|------|
| query | 搜索关键词 |
| limit | 返回条数（默认5，最大10） |
| 返回 | results: [{title, url, snippet, sourceName, provider, contentPreview?}] |

- 只返回候选，不返回完整正文
- 搜索结果只是候选，不能自动成为 footerReferences

### web_read_page

| 字段 | 说明 |
|------|------|
| url | 网页 URL（http/https） |
| maxChars | 最大字符数 |
| 返回 | {url, title?, description?, text, markdownChars, truncated, links[]} |

- 成功读取到非空正文后才可作为 grounding evidence，可用于 final_answer.references
- 不自动跟随链接，不递归爬取
- links 候选供 Planner 继续读取

## Provider 优先级

1. **AnySearch**（重点推荐）— REST API via forwardProxy，支持匿名
2. **custom_json** — 自定义端点（SearXNG 等）
3. **Tavily**（备选）— REST API via forwardProxy

后续预留：SearXNG、Brave、阿里云、百度、Exa、Firecrawl。

## 约束

- 所有外部请求走 `forwardProxy`（思源代理），不直接浏览器 fetch
- API Key 不进入 prompt、debug、conversationContext
- 搜索候选不自动成为底部参考；Planner 必须显式引用
- 网页正文、links 不进入历史上下文
- 不新增 npm 依赖
- 不使用 Vercel AI SDK tool calling 定义工具
- web 工具继续使用 ToolContract → ToolRegistry → ToolExecutor → JSON observation
- HTML→Markdown 优先使用思源 Lute，失败则本地 fallback
- 联网模块顶层无副作用，配置错误不影响插件启动

## 发布策略

- 第一阶段重点：AnySearch provider
- 设置页提供测试搜索和测试网页读取
- `window.__kbAgentDebug()` 统一调试入口

## Skill 设置页可见性

联网搜索**不是普通内置 Skill**，不在 Skill 设置页的内置 Skill 列表中显示。`web_search` 的注册由输入框 off/smart/required 模式控制；`web_read_page` 是全局网页读取工具，只要存在 `webSearchSettings` 就注册，不受 Skill 开关影响。不要在 UI 中把联网搜索能力与网页读取能力混为一谈，避免用户误以为关闭搜索就能关闭网页读取。

联网能力说明由 `prompt-renderer.ts` 根据本轮 `webAccessMode` 和 `toolManifest` 条件注入，不通过 Skill section 渲染。

## 当前实现状态（已验证）

### 工具暴露规则

`web_search` 由 `resolveWebAccessMode` 控制；`web_read_page` 是全局网页读取工具，只要存在 `webSearchSettings` 就注入，不受 `settings.enabled` 或 off/smart/required 模式控制。

- **off**：
  - `conversationContext.currentTurn` 中**不注入** `webAccess`，但 `webReadAccess` 在存在 `webSearchSettings` 时**注入** `{ enabled: true }`。
  - `run-agent-turn.ts` 中**不注册** `web_search`，但**注册** `web_read_page`。
  - Planner 可读取用户明确提供的 URL 网页正文，但不能搜索。
- **smart**：
  - `conversationContext.currentTurn` 中注入 `webAccess`（mode=smart）和 `webReadAccess`。
  - `run-agent-turn.ts` 中注册 `web_search` 和 `web_read_page`。
  - Planner 自主决定是否调用。
- **required**：
  - `conversationContext.currentTurn` 中注入 `webAccess`（mode=required）和 `webReadAccess`。
  - `run-agent-turn.ts` 中注册 `web_search` 和 `web_read_page`。
  - `agent-loop.ts` 中保留 required guard：最终回答前若未调用 `web_search` 或 `web_read_page`，会拦截 answer 并提示，连续拦截超过上限后 fail closed。

### webSearch.enabled 语义

- `webSearch.enabled` 只控制输入框联网搜索按钮和 `web_search` 搜索能力。
- 关闭 `webSearch.enabled` 后，`web_search` 不注册，但 `web_read_page` 仍注册。
- `web_read_page` 使用 `readProxyEndpoint`、`readPageMaxChars`、`timeoutMs` 等配置，这些配置在 `webSearchSettings` 存在时始终传递。

### 关键文件

- `conversation-context-builder.ts`：`resolveWebAccessMode`（仅 `buildWebSearchAccess` 使用）/ `buildWebSearchAccess` / `buildWebReadAccess`（只要存在 `webSearchSettings` 就注入 `{ enabled: true }`，不读 `settings.enabled`，也不依赖 `resolveWebAccessMode`）
- `run-agent-turn.ts`：根据 `conversationContext.currentTurn.webAccess` / `webReadAccess` 决定是否注册工具和创建 provider
- `agent-loop.ts`：required guard（`webAccess?.mode === "required"` 时检查 callCounts；off 模式下 `webAccess` 为 undefined 不触发）
- `prompt-renderer.ts`：三路分支 — off 模式仅 web_read_page 时渲染「网页读取说明」；smart/required 模式渲染「联网搜索说明」

### 验证口径

- off 模式下，`conversationContext.currentTurn` 中有 `webReadAccess`（`{ enabled: true }`），但没有 `webAccess`。
- off 模式下，运行时 `toolRegistry` 中不存在 `web_search`，但存在 `web_read_page`。
- off 模式下，`prompt-renderer.ts` 注入「网页读取说明」而非「联网搜索说明」。
- smart/required 模式下，工具按设置正常注册，required guard 仍然有效。
- 不通过检测 URL、关键词、外部资料字样等方式在 off 模式下自动打开联网搜索工具。

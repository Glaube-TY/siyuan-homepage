# Agent Workbench Context Management

本文说明 Agent Workbench 提供给 Planner 的会话上下文、阶段摘要和上下文压缩规则。最高原则仍以 `00-first-principles.md` 为准。

## Planner 可见上下文

Planner 当前可见三类上下文：

1. 当前用户请求。
2. `conversationContext` JSON。
3. 本轮工具 observation JSON。

`conversationContext` 来自当前会话状态，只用于帮助 Planner 理解历史对话处境。它不是工具 observation，不参与工具注册、Skill 绑定或 Workbench 自动决策。

## conversationContext 结构

允许包含：

- `currentTurn`：当前用户问题、当前 scope 轻量信息、当前 attachedDocs 轻量信息。
- `stageSummaryStatus`：已有阶段摘要数量、最后已总结轮次、未总结完整轮次数、最后摘要创建时间和提示说明。
- `compressed`：仅当已经执行压缩后展示 `compressedContextSummary`，并携带压缩消息数、轮次数、阶段摘要数、最新压缩阶段和时间等轻量状态。
- `recentTurns`：未 compacted 的 user + completed assistant 对话原文；compacted 消息不进入。
- grounded 历史 references 元信息：只允许 `grounded:true` 的资源元信息，不包含参考资料正文。

不得包含：

- 历史工具 observation。
- 完整工具返回 data 或正文证据。
- `ToolDispatch`、`ToolResult`、`workbenchEvents`。
- debug trace、full prompt。
- internal path、realPath、internalMapping。
- 工具返回正文、搜索候选正文、read_docs 正文回放。

如果下一轮需要历史 references 指向的正文，Planner 应根据可信资源 ID 自主调用 `read_docs`。Workbench 不自动读取，也不把旧 turn 的工具结果放回当前 turn observation。

## 阶段摘要

当前模型是阶段摘要压缩，不是每轮摘要。

`final_answer` 的 answer 协议支持可选字段：

```json
{
  "type": "answer",
  "args": {
    "body": "回答正文",
    "references": [],
    "stageSummary": {
      "summary": "阶段摘要正文"
    }
  }
}
```

`stageSummary.summary` 最多 1500 字。建议 300-1000 字；简短阶段可 150-300 字。打招呼、确认、继续、无新增信息时不写。

stageSummary 不预设固定格式，也不限定具体领域。它是当前会话内的通用历史阶段摘要，只要求忠实概括最近未总结对话中对后续继续对话有帮助的信息。适合输出的情况包括：连续多轮对话后形成了值得后续保留的关键信息或结论；当前回答包含对后续对话有参考价值的判断、规则或方案；用户明确要求保存阶段摘要；或不总结会导致后续压缩丢失重要上下文。简单寒暄、确认、过渡回复、无新增信息时不要输出。

阶段摘要由 Planner 自主判断是否生成。Workbench 只记录 Planner 给出的正文和覆盖边界，不根据语义判断是否应该摘要，不调用 LLM 二次摘要。Planner 可参考 `conversationContext.stageSummaryStatus.unsummarizedTurnCount` 和 `pressureLevel` 判断是否生成 stageSummary，但 Workbench 不强制 Planner 生成摘要。

阶段摘要只总结“上一条阶段摘要之后，到当前最终回答为止”的新对话。它不是长期记忆，不写回思源文档，不进入全局设置或长期记忆。

阶段摘要不得记录：

- 工具 observation 原文。
- ToolDispatch / ToolResult。
- workbenchEvents。
- debug trace。
- full prompt。
- internal path / realPath。
- 工具返回正文。
- 未经 grounding 的参考资料。

## 压缩规则

上下文压缩从"每轮摘要压缩"切换为"阶段摘要覆盖边界压缩"。

核心规则：

- 没有任何阶段摘要时，自动压缩 `no_op`，手动压缩返回"当前还没有历史摘要，暂时无法压缩"（toast 提示，不写入聊天消息）。
- 手动压缩按钮只有存在未压缩阶段摘要覆盖时才可用；没有阶段摘要或已压缩到最新时按钮禁用，popover 显示原因。
- 压缩失败（无阶段摘要覆盖、边界缺失等）属于上下文管理 UI 操作状态，不属于 conversation messages：不写入 messages，不显示在聊天流，不持久化为 conversation message，不带 regenerate/retry 按钮，不计入 context usage，不进入 conversationContext。
- 压缩失败提示使用全局 toast（`showMessage`），不使用聊天消息。
- 只 compact 已被最新阶段摘要覆盖的完整问答轮次。
- 完整问答轮次定义为一个 user 消息，后面匹配一个 completed assistant 消息；loading、error、incomplete assistant 不算完整轮次。
- compact 标记必须 user + assistant 成对设置。
- 不得单独 compact user、assistant 或孤立 user。
- 最新阶段摘要覆盖边界之后的所有对话必须保留原文。
- 当前 user、loading assistant、error assistant、incomplete assistant 必须保留。
- 已 compacted 消息不重复处理。
- 阶段摘要边界对应消息找不到时，压缩 `no_op` 并写 debug event，不错误 compact。

`compressedContextSummary` 每次完全由 `stageSummaries` 重新渲染，格式类似：

```text
阶段 1（第 1-6 轮）：
...

阶段 2（第 7-11 轮）：
...
```

这样多次压缩不会重复追加同一阶段摘要。超过 `maxCompressedSummaryChars` 时只做非 LLM rolling 截断，marker 为：

```text
[更早阶段摘要已折叠，不进入 Planner]
```

## 压缩前后可见性

压缩前：

- `stageSummary` 正文不进入 Planner。
- 只展示 `stageSummaryStatus`。
- 未 compacted 的对话原文仍在 `recentTurns` 中可见。

压缩后：

- `compressedContextSummary` 进入 Planner。
- compacted 消息不再全文进入 `recentTurns`。
- 未覆盖、未 compacted 的后续对话继续以原文进入 `recentTurns`。

这样避免“阶段摘要正文 + 原文”重复占用上下文。

## References 规则

footer references 只来自 Planner 在 `answer.references` 中显式列出的 grounded references。Workbench 不会自动把 `structure_result`、`search_candidate` 或 `read_content` 追加为 footer references。

历史 references 只有 `grounded:true` 的元信息可以进入 `conversationContext`。搜索候选和结构结果只可作为 grounding evidence，不自动成为最终引用。

## workbenchEvents 边界

已完成 assistant 消息可以持久化轻量 `workbenchEvents` 用于刷新后复现折叠的处理过程。它们只服务 UI 展示，不进入 `conversationContext`，不进入 Planner prompt，不作为历史工具 observation 回放。

## 明确不做

- 不调用 LLM 二次压缩。
- 不做 Reasonix archive。
- 不做长期记忆。
- 不写回思源文档。
- 不新增业务工具。
- 不把阶段摘要设计成普通 Planner 工具。
- agentMemory 不再保存回答摘要（answerSummary / answerItems 已移除），阶段摘要是唯一压缩摘要来源。
- 普通回答默认不带 stageSummary，只有阶段形成时才带。
- regenerate 删除阶段摘要时会清空压缩状态（compressedContextSummary、compressionState）并解除 compacted 标记，避免 stale compressedContextSummary。
- 工具 observation、workbenchEvents、ToolDispatch、ToolResult、debug trace 不进入后续上下文。
- 手动压缩无阶段摘要覆盖时写 `CONTEXT_COMPRESSION_MANUAL_SKIPPED_NO_STAGE_SUMMARY_COVERAGE` debug event；自动压缩保留 `CONTEXT_COMPRESSION_SKIPPED_NO_STAGE_SUMMARY_COVERAGE`。debug payload 不包含工具 observation、正文或 internal path。

## 上下文窗口来源

上下文窗口 Token 数不是自动检测的，当前来源：

1. 优先使用用户在模型配置中填写的 `contextWindowTokens`（输入+输出总窗口）。
2. 如果未填写，fallback 到 `DEFAULT_MAX_CONTEXT_TOKENS`（128000）。

UI 文案说明：
- `maxContextSource === "model_config"` 时显示"模型配置"。
- `maxContextSource === "default"` 时显示"默认估算窗口"。

Max Tokens 是输出上限（模型单次生成最大 token 数），对应 LLM 请求的 `maxOutputTokens` / `max_tokens`。留空表示不限制/使用服务商默认。

Context Window Tokens 是总上下文窗口（输入+输出），用于上下文用量估算和自动压缩触发阈值计算。留空则使用默认估算窗口（128000）。两者不要混淆。

OpenAI-compatible 供应商可以重复添加，用于连接不同的 OpenAI-compatible 服务端（如本地 Ollama、vLLM、不同云平台的兼容接口）。每个 provider 可独立设置 Base URL、API Key 和模型列表。其他官方固定供应商（MiMo、DeepSeek、Kimi 等）仍只能添加一次。

早期设置 `maxContextItems` / `maxContextTextLength` 已废弃删除，它们是 QA 上下文构建遗留，不再出现在当前设置页面。

`agentReadMaxCharsPerDoc` 仍有效，用于 `read_docs` 工具单次读取每篇文档的字符预算。


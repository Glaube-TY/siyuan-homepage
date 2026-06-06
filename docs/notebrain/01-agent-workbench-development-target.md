# Agent Workbench 开发目标

本文档描述 AI Knowledge / Agent Workbench 的当前开发目标。最高原则见 `00-first-principles.md`，本文只补充工程目标和验收口径。

## 定位

Agent Workbench 是思源中的个人知识工作台和透明 Agent Harness，不是知识库业务流程控制器，也不是纯 RAG 架构。

- Workbench 负责注册工具、渲染工具清单、执行工具、记录事件、回灌本轮 observation。
- Planner / Model 是唯一业务决策者。
- Tool 是全局独立能力，只校验参数、执行动作、返回 observation。
- Skill 是中文能力说明包，只说明能力、边界和通用建议，不拥有工具、不绑定工具、不规定固定步骤。
- 思源检索与阅读只是内置能力之一，不代表整个项目被定位为某一种检索架构；不要恢复旧版编号式或旧检索智能体命名方向。

## 当前链路

用户输入进入统一聊天入口后，Workbench 构造极简 Planner 上下文。Planner 现在会看到三类上下文：

1. 当前用户请求。
2. 对话上下文 JSON。
3. 本轮工具 observation JSON。

具体 prompt section 包括：

1. 用户请求。
2. 对话上下文 JSON。
3. 可参考 Skill 说明。
4. 可用工具 manifest。
5. 本轮全部工具 observation。
6. `tool` / `answer` / `stop` 输出协议。

Planner 决定下一步后，Workbench 只执行以下通用动作：

- `tool`：查找全局工具、执行工具、写入 ToolDispatch / ToolResult 事件、把 observation 回灌给 Planner。
- `answer`：通过隐藏 system action 完成本轮回答。
- `stop`：停止本轮并返回清楚原因。

Workbench 不根据用户问题、关键词、候选结果、正文内容、引用数量或回答文本选择下一步。

## 对话上下文 JSON

`conversationContext` 是历史对话摘要，不是工具 observation，也不是旧 turn 工具结果回放。

它只包含：

- 历史 user 问题。
- assistant 最终回答。
- references 资源元信息（如 sourceType、docId、blockId、resourceId、title、provider）。
- scope 元信息。
- attachedDocs 元信息。
- compacted / compressed summary 和必要元数据。

它不包含：

- 参考资料正文。
- 历史工具 observation 或完整工具返回 data。
- Workbench 事件、ToolDispatch、ToolResult。
- debug trace、full prompt。
- internal path、realPath、internalMapping。

如果下一轮 Planner 需要历史 references 指向的资料正文，应根据 `docId` / `blockId` / `resourceId` 自主调用读取工具。Workbench 不自动读取，也不把历史工具结果当作当前轮 observation。

## Observation JSON 化

Workbench runtime 不解析具体工具 observation 内容，不把工具结果加工成自然语言。

- 工具参数是 JSON，工具返回给 Planner 的 observation 也是 JSON。
- 工具 execute 返回 `ToolResult`（`{ ok, data, error? }`），不返回自然语言 plannerText。
- **ToolExecutor 是唯一 JSON observation envelope 生成者。** 工具 execute 返回 `ToolResult`，ToolExecutor 统一包成 JSON envelope。工具不在 observation 层重组/删字段/渲染。
- ToolExecutor 统一把 observation 包成 JSON envelope：
  - 成功：`{ ok: true, toolName, data: <safeOutput 原样> }`
  - 失败：`{ ok: false, toolName, error: { code, message, details?, hint?, recoverable? } }`
- `prompt-renderer` 对 observation 统一 `JSON.stringify`（pretty print），不做工具专属的 switch / if 渲染。
- `summary` 只用于 UI/trace，不进入 Planner prompt。
- 底部“参考资料”只显示 Planner 在 `answer.references` 中显式列出的 grounded references。Workbench 不再自动把 observation 中的资源元信息追加为 footer fallback。
- 安全截断只在极端 emergency guard 情况下触发（200000 字符），不静默丢弃字段。工具自己的 limit/maxChars 控制常规输出大小。
- 新增工具不需要修改 Workbench runtime。

- **ToolManifest 是 Planner/provider 可见的 JSON-compatible manifest。** 不包含 Zod `inputSchema`。包含 `inputJsonSchema`（canonicalized JSON Schema）和 `inputHint`（中文补充）。ToolRegistry 在注册时 canonicalize 并缓存 schema；无效 schema 回退 inputHint。
- **Schema sanity 是开发期保障。** `checkToolSchemaSanity` 在 DEV 模式下检查所有 plannerVisible 工具的 JSON Schema 结构正确性。检查结果写入 debug ring buffer，通过唯一入口 `window.__kbAgentDebug("all")` 或 `window.__kbAgentDebug("json")` 手动查看。**默认不自动打印 console**，不作为业务流程控制，不进入 Planner prompt，不阻断运行。

- **observation 默认全量回灌当前 turn，不由 prompt-renderer 取最近 N 条。** 本条 turn 内所有工具 observation 都可回溯。记忆保护由 ObservationLog 的 `maxEntries` 兜底做极端控制。

- **emergency truncation 采用 head+tail 方式并显式标记。** 超过 `EMERGENCY_SAFETY_LIMIT` 时截断保留首尾两端，中间段标记省略，不静默丢弃字段。

- **Debug 默认静默、内存有界。** Agent Workbench 不自动 console 打印。所有调试数据存入内存 ring buffer：最近 3 次 turn trace、最多 200 条生命周期 debug event、最近一次 schema sanity。唯一手动入口：`window.__kbAgentDebug("all")` 返回完整 debug 对象，`window.__kbAgentDebug("json")` 返回 JSON 字符串，`window.__kbAgentDebug("status")` 返回状态概要，`window.__kbAgentDebug("clear")` 清空所有数据。无自动剪贴板/下载/console 提示。开启 console：`localStorage.KB_AGENT_WORKBENCH_DEBUG = "1"`。所有 debug 数据不进入 Planner prompt，不阻断运行。

## UI 事件流

`workbenchEvents` 是轻量 UI 事件流，可随已完成 assistant 消息持久化，用于刷新后复现本轮执行过程。

持久化事件只包含类型、步骤、时间、工具名、轻量参数预览、执行结果摘要、错误码、耗时和短消息。它不保存完整 observation data、工具返回正文、prompt、debug trace、recentTurnTraces、internal path、realPath、internalMapping 或 sourceBlockIds 大数组。

`workbenchEvents` 只用于 UI 展示，不进入 `conversationContext`，不进入 Planner prompt，也不参与工具或 Skill 选择。

UI 展示层只把关键工具事件格式化为中文人类可读的“处理过程”，并且运行中和完成后都默认折叠。界面只展示 `ToolDispatch`、`ToolResult`、`TurnFailed` 对应的工具步骤；`TurnStarted`、`AssistantMessageStarted`、`AssistantFinal` 可继续保存在 runtime/debug/storage 中，但不作为用户可见步骤展示。`ToolDispatch` 与 `ToolResult` 按同一次工具调用合并为一条步骤：调度中显示正在搜索知识库、正在读取文档正文等中文状态；成功后显示工具输出摘要；失败后显示失败摘要。不再使用旧 Agent 标题、“正在准备上下文 / 正在组织上下文”这类旧状态文案作为正常路径展示。

最终回答的显示流式是 UI 层逐步展示已经生成的最终回答，不改变 Planner / Tool / `final_answer` 边界，不增加第二次模型调用，也不实现真实模型 token streaming。

## 最终回答来源展示

最终回答的 references 优先来自 Planner 在 `answer.references` 中显式给出的来源。Planner 应只引用当前对话上下文或本轮工具 observation 中真实出现过的资源 ID，不得编造 docId、blockId 或 title。

底部“参考资料”只显示 Planner 在 `answer.references` 中显式列出的资源。Workbench 不再自动把 `structure_result`、`search_candidate` 或 `read_content` 追加为 footer fallback。如果 Planner 没写 references，footerReferences 为空。

**Explicit references 必须经过 grounding 校验。** Grounding 可信来源包括：
1. 本轮工具 observation 真实返回的资源 ID（read_docs / list_knowledge_map / search_scope）。
2. 当前 conversationContext 里已有的历史 references — **只有 `grounded:true` 的历史 reference 才可信**。
3. 用户本轮 attachedDocs。
4. 当前 scope 中明确的 docId/rootDocId/docIds。

未通过 grounding 的 reference 会被丢弃，不进入 footerReferences / citedReferences / agentMemory / conversationContext。丢弃时会写 `REFERENCE_DROPPED_UNGROUNDED` debug event，但默认不 console。

conversationContext references 携带 `referenceReason`（planner_explicit / read_content / structure_result / search_candidate）和 `readLevel`（content / structure / candidate），区分已读正文、结构来源、搜索候选。只有 `grounded:true` 的 references 才能进入 conversationContext；旧会话中没有 `grounded:true` 的 references 不能作为下一轮 grounding 来源，防止坏 docId 污染历史上下文。

`fallbackRefs` 仍从 observation log 提取，但只用于 `groundingSet` 校验，不再自动进入 footerReferences。`read_docs` 返回的正文引用优先级最高；`list_knowledge_map` 的结构结果和 `search_scope` 的搜索候选只作为 grounding evidence，不会自动显示为参考资料。正文中不得把结构结果或搜索候选说成“已阅读正文”。

## 与 Reasonix 的对照

Reasonix 的 thin harness 思路对本项目有参考价值：

借鉴的部分：

- **Thin Harness**：Workbench runtime 只做通用执行编排，不承担业务逻辑。
- **Tool Registry + Plugin**：工具通过统一接口注册和执行。
- **Event Stream**：标准化事件流用于 UI 展示和调试。
- **原样回灌**：Reasonix 工具 Execute 返回 string 并原样回灌模型。本项目更进一步，规范为 JSON observation envelope，因为知识库工具需要保留 docId/blockId/cursor/errors/warnings 等结构化字段。
- **PlannerProvider 抽象**：当前实现为 prompt JSON provider（`PromptJsonPlannerProvider` 接收结构化 `PlannerContext`，内部调用 `renderPlannerPrompt`）。`PlannerProvider` 接口已预留 `mode` 字段和 future provider-native seam 类型（`native_tool_call`）。未来 native provider 也必须归一为现有 `PlannerDecision` 协议（tool/answer/stop），不得引入第二套 decision 协议。`AgentLoop` 不直接调用 `renderPlannerPrompt`。

不照搬的部分：

- **coding-agent 专用工具**（complete_step、todo evidence、写文件验收等）：本项目是知识库场景，不涉及文件编辑验收。
- **run_skill / subagent skill**：当前 Skill 是独立中文提示语能力包，不拥有工具、不绑定工具。未来如果 Skill 很多，可以考虑 Skill index + 按需注入，但仍不得让 Skill 拥有工具或规定固定流程。
- **allowedTools skill 绑定**：所有工具对所有 Skill 可见，不做 per-skill 工具过滤。
- **finalReadiness / complete_step**：不实现，Planner 自行判断何时回答。
- **阶段摘要 context compression**：发送前仍可根据上下文用量自动触发压缩；使用当前模型 `contextWindowTokens` 估算，无模型配置时 fallback 默认值；常规压缩不调用 LLM，仅使用 Planner 已提供的 `stageSummary` 做边界 compact；仅在达到硬阈值（forceCompressionRatio，默认 90%）且常规压缩无法安全压缩时，允许触发一次性的 Emergency Context Compaction 由 LLM 生成应急阶段摘要；只 compact 已被 Planner `stageSummary` 覆盖的完整 user + completed assistant 问答轮次；未覆盖对话保持原文；`compressedContextSummary` 完全由当前会话 `stageSummaries` 渲染；没有阶段摘要覆盖时自动压缩 no-op、手动压缩返回不可安全压缩提示（toast，不写入聊天消息）；历史工具 observation 不进入上下文；这是会话上下文预算管理，不是长期记忆，也不是业务流程控制；Planner 可参考 `unsummarizedTurnCount` 判断是否生成 stageSummary，但 Workbench 不强制生成。

## 工具目标

工具输出必须真实、简单、可继续传参。

### list_knowledge_map

查看思源知识结构，只返回目录、节点、关系等结构信息，不读取正文。返回的 `docId` 可传给 `read_docs`。

### search_scope

根据 `query` 查找候选结果。搜索结果只是候选，不代表已读取正文。返回的 `docId` 可传给 `read_docs`。

当前支持参数：

- `query`
- `limit`

### read_docs

根据 `docId`、`blockId` 或 `cursor` 读取文档/块正文内容。只有此工具返回的正文可用于详细总结、分析、比较。

## Skill 目标

内置知识库 Skill 是中文操作手册，而不是流程代码。

它应说明：

- 结构结果不是正文。
- 搜索结果只是候选。
- 阅读工具返回的正文才可用于详细内容分析。
- `docId`、`blockId`、`cursor` 必须来自工具返回或用户显式提供。
- 是否查看结构、搜索、读取或回答，由 Planner 根据用户请求和 observation 自主决定。

自定义 Skill 应能复用同一套全局工具，不需要修改 Workbench 主循环。

## Debug

Debug 只服务开发排查，不进入 Planner prompt。

保留能力：

- 安全 payload 清洗。
- 文本长度与短 hash 元信息。
- 事件日志查看 / JSON dump / clear。
- 生命周期日志查看。
- 当前 UI、模型、工具 reader 实际调用的轻量 debug event。

不保留旧流程控制 helper、隐藏 focus scope、validation gate 或 action guard 概念。

## Planner Prompt 验收

Planner prompt 必须保持通用、中文、面向模型使用。

不得出现：

- 代码文件名或内部映射字段。
- 旧链路名。
- 调试字段。
- 运行时预算、去重、剩余步骤或过程协议字段。
- 任何暗示 Workbench 可替 Planner 做业务选择的说明。

## 验收标准

1. AgentLoop 只处理 `tool` / `answer` / `stop`。
2. `final_answer` 不出现在普通工具清单，只由 `answer` 协议触发。
3. 三个思源工具是全局独立只读能力。
4. Skill 不拥有工具、不绑定工具。
5. 工具 JSON observation 清楚保留结构、候选、正文、错误、warnings、cursor 等字段，Planner 自行读取判断。
6. 工具返回真实资源 ID，不使用隐藏 handle。
7. Workbench 不自动搜索、读取、继续读取或最终回答。
8. Planner prompt 不暴露内部开发概念。
9. TypeScript 和 production build 通过。

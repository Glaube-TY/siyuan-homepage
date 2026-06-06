# 第一原则 — Skill-first Agent Workbench

本文件是思源笔记 AI 知识库的最高优先级规则。

## 极简硬原则

1. **代码只提供通用 Agent Workbench 能力，不承担业务决策。**
   Workbench 只负责校验参数、执行工具、返回 observation。不替 Planner 选工具，不根据工具结果自动调用下一个工具。

2. **AI Planner 是唯一业务决策者。**
   是否查看结构、搜索、读取、继续读取或回答，完全由 Planner 根据用户请求和 observation 自主决定。

3. **Tool 是全局独立能力。**
   每个工具只校验参数、执行动作、返回 observation。工具之间不能被代码串成固定流程。所有工具对所有 Skill 可见。

4. **Skill 只是中文能力说明。**
   Skill 描述工具能力、边界和通用建议。不拥有工具、不绑定工具、不规定固定步骤，不写成具体场景规则库。

5. **工具结果暴露真实可调用资源 ID。**
   使用 docId、blockId、url、fileId、resourceId。不使用隐藏 handle 映射。不暴露 path、internalMapping、realPath 等内部字段。

6. **Summary 是 UI/trace 字段，不影响 Planner data。**
   summarizeResult 返回一行中文摘要，仅供 UI 事件流和 debug trace。Planner 从 JSON envelope 的 data 字段读取工具原始输出。outputSchema 是工具契约校验（非业务流程控制），校验失败返回 invalid_tool_output error，不把脏数据回灌 Planner。

7. **final_answer 是结束本轮的全局 system action。**
   final_answer 不出现在普通工具清单，仅通过 answer 协议触发。进度展示通过 UI 事件流实现。references 只是展示来源，不是证据门槛。

8. **运行时提示语通用、中文、面向未来扩展。**
   不暴露内部代码结构、文件名、旧链路名、调试术语。

9. **Planner 可见工具清单包含机器可读 JSON Schema。**
   优先使用工具显式 `inputJsonSchemaOverride`；没有 override 时才通过 Zod 4 官方 `z.toJSONSchema(schema, { io: "input" })` 作为 fallback；禁止手写解析 Zod 内部 `_def`/`typeName` 结构。provider-visible tool parameters schema 应为 JSON-compatible、canonicalized、root `type: "object"`、`additionalProperties` 明确。`inputHint` 保留为人类友好补充，不替代 JSON Schema。

## 绝对禁止

- 代码根据用户问题、关键词、搜索结果、证据、预算、回答文本自动选择下一步。
- 工具之间互相调用来串流程（如 search_scope 自动调用读取工具）。
- 流程控制字段：recommendedAction、suggestedAction、fallbackAction、forcedNextTool、preferredNextStep、shouldUseWhen、finalizeAnswer、AUTO_*ACTION 等。
- 旧读取工具 alias、read_block_context 出现在 Planner 可见工具中。
- 在运行时提示语中暴露 adapter、schema、trace、diagnostics、harness、fallback、旧链路名等内部术语。
- 把 Skill 写成针对具体问题类型、文档类型或测试场景的规则库。
- 用正则/关键词/自然语言内容判断流程。

## 上下文压缩原则

1. **自动压缩是上下文预算管理，不是业务流程控制。**
   压缩只根据上下文用量和策略决定是否合并旧摘要，不替 Planner 选工具、不决定回答时机、不控制对话流程。

2. **历史工具 observation 不进入上下文。**
   conversationContext 不包含 workbenchEvents、ToolDispatch、ToolResult、历史 observation、正文、debug trace。需要历史正文时 Planner 自主调用读取工具。

3. **自动压缩不调用 LLM。**
   压缩只使用 Planner 已通过 `final_answer.stageSummary` 给出的会话内阶段摘要；Workbench 不生成摘要，不从回答正文截断摘要，也不读取历史工具 observation。

4. **压缩摘要过长时滚动处理。**
   `compressedContextSummary` 完全由 `stageSummaries` 渲染，过长时前面折成 `[更早阶段摘要已折叠，不进入 Planner]`，不把超长摘要塞进 Planner。

5. **stageSummary 是阶段摘要，不是每轮摘要。**
   Planner 只在最近未总结对话形成稳定阶段时返回 `stageSummary`。Workbench 只记录摘要正文和覆盖边界，不判断语义，不把阶段摘要写入长期记忆或思源文档。

6. **自动压缩使用当前模型上下文窗口。**
   估算上下文用量时使用当前模型的 `contextWindowTokens`；无模型配置时 fallback 到默认值。`contextWindowTokens` 只用于预算估算和压缩触发，不影响 Planner 决策或工具选择。

7. **只 compact 阶段摘要覆盖的完整问答轮次。**
   没有阶段摘要覆盖时自动压缩 no-op；未覆盖对话保持原文。已标记 compacted 的消息不会再次进入压缩候选，避免重复处理。

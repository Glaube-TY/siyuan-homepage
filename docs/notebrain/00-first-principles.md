# 第一原则 — Skill-first Agent Workbench

本文件是思源笔记 AI 知识库的最高优先级规则。

## 极简硬原则

1. **轻量架构优先。**
   Agent Workbench 必须保持轻量、可解释、低冗余。它不是复杂工作流引擎，也不是后台多轮修复器。运行链路应尽量短：Planner 产生一次决策，Tool 执行一次能力，Observation 以紧凑 JSON 返回，Composer 基于结果作答。除非安全边界必需，不应叠加多层重复校验、多轮后台 LLM 修复、多层状态机或隐式重试流程。架构优化优先减少无意义等待、重复模型调用和重复工具调用。

2. **代码只提供通用 Agent Workbench 能力，不承担业务决策。**
   Workbench 只负责校验参数、执行工具、返回 observation。不替 Planner 选工具，不根据工具结果自动调用下一个工具。

3. **AI Planner 是唯一业务决策者。**
   是否查看结构、搜索、读取、继续读取或回答，完全由 Planner 根据用户请求和 observation 自主决定。

4. **失败要显式、快速、可诊断。**
   Planner 输出不是合法 JSON 时，应快速失败并给出可诊断 reasonCode/message，不应在后台反复调用模型修复。例外——一次性 Planner 决策修正：当本轮已存在至少一个成功工具 observation，且 Planner 决策输出属于格式类错误（如 invalid_json、json_parse_failed、output_truncated 等）时，Runtime 可以追加一条紧凑的协议错误 observation，让 Planner 再决策一次。禁止：重复修正、后台循环、重试工具、自动换模型、从 reasoning/thinking 提取 JSON、指定下一步工具、替 Planner 生成最终回答、对网络/鉴权/超时/用户取消做 repair。第二次仍失败必须快速停止。Tool 参数不符合 schema 时，应由 ToolExecutor 返回 invalid_args 或等价失败 observation，说明缺失或错误字段；不要通过额外 Planner/LLM retry 反复猜测参数。Tool 执行失败时只返回失败状态和原因，不应包装成成功，也不应触发隐式补救流程。失败是 Agent 协议的一等结果，不是必须被隐藏或自动修复的异常。失败要快速返回，但用户可见错误必须人类可读。内部错误码、provider 原始错误、JSON 解析细节、reasoning-only 等只进入 debug/trace，不直接展示给普通用户。若本轮已有成功工具步骤，失败提示可以说明已完成的步骤，但不得把未完成任务包装成成功。

5. **Tool 是全局独立能力。**
   每个工具只校验参数、执行动作、返回 observation。工具之间不能被代码串成固定流程。所有工具对所有 Skill 可见。

6. **校验只做协议和安全边界，不做业务替代决策。**
   运行时校验只负责协议合法性、schema 合法性和安全字段边界，例如禁止 internalPath、realPath、internalMapping 等内部字段泄漏。运行时不应做业务语义判断，不应根据工具名自动推导下一步，也不应替 Planner 决定工具调用顺序。若参数合法但业务目标不充分，应让 Tool 返回明确 observation，交由 Planner 决策是否继续。

7. **Skill 是面向 Planner 的能力说明与能力策略包。**
   Skill 可以说明能力边界、证据原则、通用使用策略、推荐工具使用顺序、工具适用边界和误用禁忌；可以点名本能力域内的工具并解释它们的差异。Skill 不能拥有工具、绑定工具、强制流程，也不能写具体题材、具体项目、具体问题类型、关键词触发或测试用例补丁。Skill 可以指导 Planner 更好地使用能力，但代码不得根据 Skill 内容自动串流程或自动选择工具。

   内置 Skill 开关是**设置层面的能力可见性边界**。关闭某个内置能力时，本轮不注入对应能力说明，也不注册该能力域下的内部工具；这不是 Skill 拥有 Tool，而是 composition root 对内置能力域做统一可见性控制。全局读取类工具（如 `read_docs`、`web_read_page`）是全局独立能力，不属于普通 Skill，不由 Skill 开关控制。

   全局能力可以由运行时上下文说明，不必做成 Skill；联网搜索（`web_search`）属于本轮全局搜索能力，由输入框 off/smart/required 模式控制。输入框联网搜索模式只控制搜索能力，不控制明确资源读取能力（如 `web_read_page`）。

8. **工具结果优先暴露真实可调用资源 ID。**
   优先使用 docId、blockId、url、fileId、resourceId。不使用隐藏 handle 映射。禁止暴露 internalPath、realPath、internalMapping、隐藏文件系统路径或内部映射。官方 API 明确要求的用户可见路径参数（如 createDocWithMd 的 path）可以作为工具参数或 target 出现。

9. **Observation 保持紧凑 JSON。**
   Tool observation 应保持紧凑、结构化、可供 Planner 读取。成功、失败、拒绝、无效参数都应以明确 JSON envelope 表达。Observation 不应混入长篇自然语言解释、内部调试信息、confirmationId、visualCompare、beforeSnapshot、afterSnapshot 或内部路径。需要诊断的信息放入 trace/debug，不进入 Planner 可见 observation。

10. **Summary 是 UI/trace 字段，不影响 Planner data。**
    summarizeResult 返回一行中文摘要，仅供 UI 事件流和 debug trace。Planner 从 JSON envelope 的 data 字段读取工具原始输出。outputSchema 是工具契约校验（非业务流程控制），校验失败返回 invalid_tool_output error，不把脏数据回灌 Planner。

11. **final_answer 是结束本轮的全局 system action。**
    final_answer 不出现在普通工具清单，仅通过 answer 协议触发。进度展示通过 UI 事件流实现。references 只是展示来源，不是证据门槛。

12. **全局 Prompt 保持通用，领域策略放进 Skill。**
    全局 Prompt / Runtime Prompt 只说明通用 Agent 协议、环境、可用工具清单、输出格式和安全边界，不预设具体业务场景。领域内的工具使用建议、顺序建议和误用禁忌应放入对应 Skill，而不是写入全局 Prompt 或运行时代码。这样可以保持通用框架干净，同时让不同 Skill 具备自己的能力策略。

13. **运行时提示语通用、中文、面向未来扩展。**
    不暴露内部代码结构、文件名、旧链路名、调试术语。

14. **Planner 可见工具清单包含机器可读 JSON Schema。**
    优先使用工具显式 `inputJsonSchemaOverride`；没有 override 时才通过 Zod 4 官方 `z.toJSONSchema(schema, { io: "input" })` 作为 fallback；禁止手写解析 Zod 内部 `_def`/`typeName` 结构。provider-visible tool parameters schema 应为 JSON-compatible、canonicalized、root `type: "object"`、`additionalProperties` 明确。`inputHint` 保留为人类友好补充，不替代 JSON Schema。

## 工具 JSON 极简原则

1. **Tool input schema 必须只包含执行该能力真正需要的最小参数。**
   若工具只需要 id 和 content，就不要再要求 summary、reason、mode、extraContext 等非必要字段。UI/trace 需要的信息应由 Runtime 内部生成或从必要参数推导，不应强迫 Planner 额外填写。

2. **Tool input 参数越少越好，字段语义越单一越好。**
   不要为了兼容多个业务场景而把一个工具 schema 做成复杂大对象；也不要把可选参数变成事实必填。参数缺失时返回 invalid_args，不在 Runtime 中猜测或补全。

3. **Tool observation 必须保持紧凑 JSON。**
   成功只返回继续决策必要的信息；失败只返回明确失败状态、错误码和简短原因。不要在 observation 中混入长篇自然语言解释、内部调试信息、confirmationId、visualCompare、beforeSnapshot、afterSnapshot、internalPath、realPath、internalMapping。

4. **Runtime 不负责替 Planner 修复工具调用。**
   JSON 格式错误、参数 schema 错误、工具执行失败，都应快速返回明确失败。是否修改参数、换工具、再次调用、追问用户或结束回答，由 Planner 根据 observation 自主决定。例外——一次性 Planner 决策修正（同上文原则 4）：仅在已有成功工具结果且错误为格式类时，允许追加一次性协议错误 observation 给 Planner 再决策一次。

5. **禁止后台隐式重试循环。**
   除非是单次网络瞬断等纯基础设施容错，Runtime 不应对同一个 Planner 决策反复检测、反复修复、反复请求模型或反复调用工具。失败是协议的一等结果，应暴露给 Planner，而不是被 Runtime 隐藏。

6. **校验边界要轻。**
   Runtime 校验只做协议合法性、schema 合法性和内部字段安全边界；不做业务语义判断，不替 Planner 判断"下一步应该怎么做"。

## 回答风格与参考资料

1. **回答正文风格由 Planner/AI 自主决定。**
   全局 Prompt 和 Runtime 不限制文体、结构、Markdown、长短，只规定 JSON 协议和安全边界。

2. **参考资料是结构化 JSON 字段。**
   references 由 Planner 在 answer.args.references 中输出 JSON 数组，由代码 grounding 和渲染为底部参考资料。不要求模型在正文中手写参考文献格式。

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

3. **常规阶段摘要压缩不调用 LLM；Emergency Context Compaction 例外。**
   常规压缩只使用 Planner 已通过 `final_answer.stageSummary` 给出的会话内阶段摘要；Workbench 不生成摘要，不从回答正文截断摘要，也不读取历史工具 observation。
   当上下文用量达到硬阈值且常规阶段摘要压缩无法安全压缩时，允许触发一次性的 Emergency Context Compaction：由 LLM 基于未覆盖的完整问答轮次生成应急阶段摘要。Emergency Compaction 是上下文预算管理的 system action，不是普通工具，不出现在 Tool manifest，不写 ObservationLog，不读工具 observation，不写长期记忆，只生成当前会话内阶段摘要。

4. **压缩摘要过长时滚动处理。**
   `compressedContextSummary` 完全由 `stageSummaries` 渲染，过长时前面折成 `[更早阶段摘要已折叠，不进入 Planner]`，不把超长摘要塞进 Planner。

5. **stageSummary 是阶段摘要，不是每轮摘要。**
   Planner 只在最近未总结对话形成稳定阶段时返回 `stageSummary`。Workbench 只记录摘要正文和覆盖边界，不判断语义，不把阶段摘要写入长期记忆或思源文档。

6. **自动压缩使用当前模型上下文窗口。**
   估算上下文用量时使用当前模型的上下文窗口大小配置；无模型配置时使用默认值。上下文窗口大小只用于预算估算和压缩触发，不影响 Planner 决策或工具选择。

7. **只 compact 阶段摘要覆盖的完整问答轮次。**
   没有阶段摘要覆盖时自动压缩 no-op；未覆盖对话保持原文。已标记 compacted 的消息不会再次进入压缩候选，避免重复处理。

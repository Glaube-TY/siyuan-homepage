你现在要对当前项目做一次完整 Agent 架构换核。目标不是继续修补旧代码，而是把项目彻底改成类似 DeepSeek-Reasonix 思路的原生 tool call Agent Workbench：append-only session、provider-native tool call、标准 role=tool 回填、统一权限确认、工具调用修复、上下文压缩、并发安全工具调度、多模型 adapter，而不是旧 JSON Planner / control plane JSON。

开始前必须先阅读：

1. `docs/notebrain/00-first-principles.md`
2. 当前 Agent 主入口调用链
3. `src/features/kb/services/orchestration/agent-workbench-mode-flow.ts`
4. `src/features/kb/services/agent-workbench/runtime/run-agent-turn.ts`
5. `src/features/kb/services/agent-core/loop/native-tool-agent-loop.ts`
6. `src/features/kb/services/agent-core/loop/dispatch-tool-calls.ts`
7. `src/features/kb/services/agent-core/providers/*`
8. `src/features/kb/services/agent-core/tools/*`
9. `src/features/kb/services/agent-workbench/runtime/*`
10. `src/features/kb/services/agent-workbench/contracts/*`
11. `src/features/kb/services/qa/*`
12. `src/features/kb/types/settings.ts`
13. `src/features/kb/components/panels/settings-tabs/*`
14. `src/features/kb/services/agent-workbench/skills/**/*`
15. `src/features/kb/services/doc-content-edit/**/*`
16. `src/libs/dialog.ts`

必须先用 codegraph 查看真实调用链和 import/export 影响，不允许只靠 grep 机械替换。所有修改使用 diff 模式。所有 import 必须是静态顶部 import，禁止新增 dynamic import / require。优先复用项目已有思源 API wrapper、Svelte dialog wrapper、doc-content-edit executor、provider adapter、tool schema converter 和现有 UI 事件结构。不要运行 npm install。

最终目标：

1. 项目主路径完全变成 native tool call Agent。
2. `askByMode -> agent-workbench-mode-flow -> runAgentTurn -> NativeToolAgentLoop -> ProviderAdapter.streamChat -> dispatchToolCalls -> role=tool -> ProviderAdapter.streamChat -> final assistant text` 成为唯一 Agent 主链路。
3. 模型通过标准 provider-native tool calls / functionCall / tool_use 自主选择工具和参数。
4. Runtime 不根据用户自然语言猜工具，不写固定业务流程，不做关键词触发。
5. Tool 只声明 schema、校验参数、执行动作、返回结构化结果。
6. Skill 只说明能力边界、证据原则和通用偏好；不能拥有工具、绑定工具、规定固定步骤、推荐固定工具顺序或固化测试场景。
7. 写入、删除、移动、重命名必须全部经过统一 ToolPermissionGate。
8. 所有工具结果，包括成功、失败、参数错误、未知工具、用户拒绝、重复写入阻断、preview 失败、执行异常，都必须按 tool_call_id 回填为 role=tool。
9. 不支持 native tool calls 的模型不能进入 Agent 主路径。
10. 最终回答必须是普通 assistant 文本，不能存在 final_answer 伪工具。
11. 旧 JSON Planner、control plane JSON、stream_json、invalid_json、callModelJson、plannerTransport、jsonOutputStrategy、自动操作兼容性测试等旧架构代码、文件、字段、文案、设置、测试逻辑必须删除或迁移成 native Agent 语义，不保留 deprecated 旧文件。

必须解决的当前问题：

1. 删除或彻底重写 `src/features/kb/services/agent-workbench/runtime/run-agent-turn.ts`。

   * 当前文件仍是旧 Planner 残骸，且有 `// @ts-nocheck`。
   * 删除 `@ts-nocheck`。
   * 删除 `createPlannerProvider`、`plannerProvider`、`AgentLoop`、`answerDraft`、`Planner draft`、`composer_stream`、`draft_replay`、`stopped_by_planner`、`streamFinalAnswerFromDraft` 等旧逻辑。
   * 新 `runAgentTurn()` 必须只负责组装 runtime 依赖、创建 provider、创建 native tool registry、构造 system/context/skill instructions、运行 `NativeToolAgentLoop`、保存 trace、生成 `AgentTurnOutcome`。
   * 不允许再调用旧 JSON 输出器或 Composer 二次生成最终回答。

2. 清理 `runtime/agent-loop.ts`。

   * 如果它只是 `NativeToolAgentLoop` 的薄 wrapper，可以保留但改名为中性名称，例如 `native-agent-runner.ts`。
   * 不要再出现旧 `AgentLoop` 容易混淆的命名。
   * 主路径必须清楚：只有 `NativeToolAgentLoop` 是 Agent loop。

3. 完成 native registry 组合。

   * `createAgentWorkbenchRuntime()` 仍可作为 composition root，但它只负责注册 Skill 和 Workbench ToolContract。
   * 新增或完善一个明确的 native registry builder，例如 `buildNativeToolRegistryForTurn()`。
   * 该 builder 必须：

     * 复用现有 Workbench `ToolRegistry` 中的只读工具；
     * 跳过旧写入工具 adapter；
     * 注册 `registerNativeSiyuanWriteTools()` 中的 native 写入工具；
     * 注册系统工具，如 `edit_global_memory`；
     * 注册 web 工具；
     * 保证最终传给 provider 的工具全是 `NativeTool`。
   * 修复当前 `workbench-tool-adapter.ts` 跳过写工具但 native 写工具未接入的问题。
   * `delete_block` 不允许恢复；只保留 `delete_blocks(blockIds: string[])`。

4. Provider adapter 必须成为唯一模型调用入口。

   * `runAgentTurn()` 必须使用 `createProviderAdapterForKbModel()` 创建 provider。
   * OpenAI-compatible 走标准 `tools`、`tool_choice:auto`、`tool_calls`、`role=tool`。
   * Gemini adapter 必须正确转换 `functionCall` 和 `functionResponse`。
   * Anthropic adapter 必须正确转换 `tool_use` 和 `tool_result`。
   * 不支持 native tool call 的 provider/model，必须在进入 Agent 主路径前失败，返回用户可读错误。
   * 不允许 fallback 到 JSON Planner。

5. 移除旧 QA JSON 控制面。

   * 删除或重写 `qa/kb-model-call.ts` 中的 `callModelJson`、`purpose === "planner"`、Planner thinking 分支。
   * 如果普通问答仍需要 `callModelText` / `streamModelText`，保留为普通文本调用，但不得服务 Agent 操作决策。
   * 删除 `qa/openai-compatible-request-body.ts` 中只为 JSON control plane 服务的 `jsonOutputStrategy`。
   * 删除任何“控制面 JSON 输出器”“只能输出 JSON object”的 prompt。
   * 删除 `streamOpenAICompatibleJsonPlanner` 或迁移为无 Planner 语义的 provider SSE parser；如果只服务旧 JSON Planner，直接删除。

6. 重写模型兼容性测试。

   * `model-connection-test.ts` 里旧“自动操作兼容性 / 控制面 JSON 能力 / invalid_json / stream_json”全部删除。
   * 改为 native tool call compatibility test。
   * 测试目标是模型是否能：

     * 接收 tools；
     * 返回标准 tool_calls / functionCall / tool_use；
     * 在 role=tool / functionResponse / tool_result 后继续生成普通 assistant 文本；
     * 支持或不支持 streaming tool calls；
     * 支持或不支持 reasoning delta。
   * 测试工具使用一个安全只读 fake tool，例如 `echo_probe`，不触碰思源数据，不写入。
   * 设置页文案改成“Agent 工具调用兼容性测试”，不再出现“自动操作”“控制面 JSON”。

7. 清理 settings / provider profile。

   * `ProviderRequestCompatibility` 改名为中性语义，例如 `ProviderNativeAgentCompatibility` 或 `ProviderRequestOptions`。
   * 删除 `jsonOutputStrategy`。
   * 删除 `plannerTransport`。
   * 删除所有 `controlPlane` 命名。
   * 保留有价值的参数策略：

     * `thinkingOffStrategy`
     * `thinkingOnStrategy`
     * `timeoutMs`
     * `tokenParamStrategy`
     * `temperatureParamStrategy`
     * `fixedTemperature`
   * 这些策略必须命名为 provider request / native agent request 语义，而不是 Planner / control plane。
   * 写好旧设置迁移：旧字段读到后只迁移有价值字段，不再保存旧字段。

8. ToolPermissionGate 必须成为唯一危险操作入口。

   * `dispatch-tool-calls.ts` 不要手写散落的权限逻辑。
   * 新建或完善统一 `DefaultToolPermissionGate`：

     * readOnly 直接 allow；
     * write 工具先调用 `tool.preview()`；
     * preview 成功后生成 diff/summary preview；
     * preview 失败也必须生成失败 tool result 或可确认的普通 preview，不允许 UI 卡住；
     * 通过 `RegisteredConfirmationBridge` 请求用户确认；
     * 用户拒绝返回 `user_rejected` tool result；
     * 用户确认后注入 `_confirmationId` 或其他安全执行 token；
     * 执行结果统一转成 `ToolExecutionResult`。
   * `dispatchToolCalls()` 只负责编排：解析参数、查工具、storm breaker、调用 permission gate、调用 executor、生成 role=tool。
   * 所有结果必须有 `tool_result` UI event 和 `role=tool` message。

9. 保留并完善 diff 确认。

   * 复用 `src/libs/dialog.ts` 的 `svelteDialog()`，不要自造 fixed overlay。
   * `EditDiffViewer` 只做纯展示组件。
   * diff preview 只显示给 UI，不进入 role=tool content，不持久化完整 before/after。
   * `delete_blocks` preview 要读取待删除块当前内容，显示可读内容，不要只显示 blockId。
   * 取消弹窗必须 resolve deny，不能让 Agent 停在“正在执行”。
   * Svelte 5 组件必须用 `mount()`，禁止 `new Component()`。

10. Session 按 Reasonix 思路改成稳定 append-only。

* `AgentSession` 必须接入真实会话持久化，而不是只在一轮内存里存在。
* 在 `KbConversationSession` 中增加 `agentSession` 或等价字段，保存 provider-facing message log。
* 保存前必须 sanitize tool result，不能保存 API key、confirmationId、beforeSnapshot、afterSnapshot、完整 diff、敏感路径。
* 每轮开始从当前 conversation 加载 AgentSession。
* 每次 provider assistant message 和 tool message 都 append，不重写旧消息。
* 工具调用配对必须保持：assistant tool_calls 后面紧跟对应 role=tool。
* 历史里孤儿 tool result、缺失 tool result 的 assistant tool call，在发给 provider 前必须 normalize/drop。
* UI 聊天消息和 provider-facing AgentSession 分离：UI 可以压缩和展示，AgentSession 负责模型协议正确性。

11. 上下文压缩按 native agent 语义实现。

* `message-compactor.ts` 要保留最近完整 tool-call pair。
* 大工具结果在本轮可完整使用，但跨轮存储必须摘要/截断。
* 不允许压缩破坏 provider tool-call pairing。
* 压缩摘要进入 context instructions，不伪装为工具结果。
* 不要把完整 diff、写入快照、敏感字段放进长期上下文。
* 支持 Reasonix 风格：

  * immutable-ish prefix：system prompt + tool specs 尽量稳定；
  * append-only log：会话消息单调追加；
  * volatile scratch：临时 UI 状态、preview、diff、确认态不进入长期 provider log。

12. 加入 tool-call repair，但必须是 native repair，不是 JSON Planner repair。

* schema flatten：工具 schema 如果太深或参数太多，可生成 provider-facing flattened schema，dispatch 前 re-nest。
* argument repair：对模型返回的 tool arguments 做安全 JSON parse；可修复轻微截断或空对象，但不能猜业务参数。
* scavenge：如果 provider 的 reasoning/text 中出现明显工具调用片段，可作为 debug 诊断；不要静默执行，除非能明确绑定 provider 原生 tool_call 语义并生成可审计事件。
* truncation：如果工具参数 JSON 被截断，返回 recoverable tool result 或请求模型重新调用；不要转成旧 JSON Planner 修复。
* storm breaker：同一 turn 内相同写工具 + 相同 args 重复调用必须阻断，并回填 role=tool，告诉模型重复写入已被阻止。
* 所有 repair 必须产生日志和可审计 reasonCode。

13. 工具调度按并发安全实现。

* `NativeTool.parallelSafe === true` 且 `readOnly === true` 的连续工具可以并行。
* 写工具、未知工具、需要确认工具必须串行。
* 并行执行结果要按原 tool_call 顺序回填 role=tool。
* 任一工具失败也必须回填对应 tool_call_id，不影响其他已完成工具结果回填。
* 不允许 read-after-write 顺序错乱。

14. UI event 做成 native agent event。

* 统一事件类型：

  * assistant_text_delta
  * assistant_reasoning_delta
  * tool_call_delta
  * tool_start
  * permission_required
  * permission_resolved
  * tool_result
  * assistant_final
  * error
  * done
* `agent-workbench-mode-flow.ts` 只负责把这些事件映射到聊天 UI。
* UI 不参与业务判断。
* UI 不根据用户文本猜工具。
* UI 不吞掉错误；失败要写入 assistant message，并让 asking=false。

15. Skill 全面清理。

* 修改 `docs/notebrain/00-first-principles.md`：Skill 不允许 playbook，不允许 tool selection advice，不允许工具顺序建议。
* 修改 `skill-contract.ts` 注释。
* 修改内置 skill：

  * 删除“推荐流程”
  * 删除“优先使用某工具”
  * 删除“看到某场景就调用某工具”
  * 删除测试用例式规则
  * 保留能力边界、证据原则、真实性原则、拒绝伪造 ID、工具结果失败不得谎称成功等通用规则。
* `skill-catalog.ts` 只展示能力边界和证据原则，不展示工具操作流程。
* user skill 校验继续禁止固定流程、工具绑定、关键词触发。

16. 文档全面清理。

* 活跃文档中不要保留旧 Planner 方案。
* 旧迁移方案如果还会误导开发，移动到 archive 或删除。
* 第一原则文档必须成为唯一架构依据。
* 文档中不再出现旧主路径指令：

  * JSON Planner
  * final_answer
  * stream_json
  * invalid_json
  * control plane JSON
  * Planner repair
  * 自动操作兼容性

17. 删除所有旧 Planner / control plane 残留。

* 全局搜索并处理：

  * `Planner`
  * `planner`
  * `final_answer`
  * `stream_json`
  * `invalid_json`
  * `controlPlane`
  * `jsonOutputStrategy`
  * `plannerTransport`
  * `callModelJson`
  * `控制面 JSON`
  * `自动操作兼容性`
  * `只能输出 JSON`
  * `PromptJsonPlannerProvider`
  * `PlannerDecision`
  * `observation-store`
  * `final-answer`
* 代码路径中不允许保留旧 Planner 主路径。
* 不要保留 deprecated 旧文件。
* 删除旧文件后清理空目录、失效 export、无引用类型、无引用 import。

18. 修改设置页。

* 删除所有“控制面 JSON”“自动操作兼容性”“JSON 输出能力”文案。
* 模型能力显示改为：

  * native tool calls
  * streaming tool calls
  * tool result continuation
  * reasoning delta
  * context window
  * thinking parameter strategy
* 不支持 native tool calls 的模型标记为不能进入 Agent 模式。
* 不允许再给用户一种“JSON 兼容也能 Agent”的错觉。

19. 错误处理统一。

* provider 错误映射为：

  * provider_auth_failed
  * provider_rate_limited
  * provider_network_error
  * provider_http_error
  * provider_tool_call_not_supported
  * provider_protocol_error
  * provider_stream_parse_error
* agent 错误映射为：

  * user_aborted
  * user_rejected
  * unknown_tool
  * invalid_tool_arguments
  * duplicate_write_call_blocked
  * tool_execution_failed
  * tool_call_limit_exceeded
  * iteration_limit_exceeded
* 不再出现 invalid_json / planner_model_call_failed / stopped_by_planner。
* 所有错误必须可用户阅读，同时 debug trace 保存技术细节。

20. 最终效果必须达到：

* 新建对话、连续对话、读取文档、搜索、读取块、写入确认、取消确认、确认写入、写入失败、未知工具、参数错误、重复写入阻断，都能形成标准 provider-native loop。
* 每个 tool_call 都有对应 role=tool。
* 用户拒绝不会卡住 UI。
* 写入不经过确认不会执行。
* 旧 JSON Planner 完全消失。
* `@ts-nocheck` 从 Agent 主路径删除。
* 旧 `run-agent-turn.ts` 被干净 native 实现替代。
* 设置页不再出现旧 control plane JSON 概念。
* Skill 不再是流程控制器。
* 文档不再误导后续 AI 回到旧架构。

完成后必须运行：

```bash
npx tsc --noEmit
npm run build
```

最终报告只写：

1. 用 codegraph 看了哪些调用链。
2. 删除了哪些旧 Planner / control plane JSON 文件、字段、文案和测试逻辑。
3. 新 native Agent 主链路现在从哪个入口到哪个 loop。
4. provider adapter 如何接入。
5. native tool registry 如何构建，写工具如何注册。
6. ToolPermissionGate 如何成为唯一危险操作入口。
7. role=tool 回填如何保证所有结果都覆盖。
8. AgentSession 如何持久化和压缩。
9. Skill 和第一原则文档如何清理。
10. 设置页如何从 JSON 兼容测试改成 native tool call compatibility。
11. 全局搜索后是否还剩 Planner/planner/final_answer/stream_json/invalid_json/controlPlane/jsonOutputStrategy/plannerTransport/callModelJson；若剩余，逐个说明为什么必须保留。
12. `npx tsc --noEmit` 结果。
13. `npm run build` 结果。
14. 仍未完成项。

禁止事项：

1. 不要继续修旧 JSON Planner。
2. 不要保留 deprecated Planner 文件。
3. 不要恢复 final_answer 伪工具。
4. 不要让 Runtime 根据用户自然语言猜工具。
5. 不要把 Skill 写成工具流程说明。
6. 不要绕过 ToolPermissionGate 执行危险写入。
7. 不要把 diff preview、confirmationId、beforeSnapshot、afterSnapshot 写进长期 provider log。
8. 不要用 dynamic import / require。
9. 不要新增一套弹窗系统。
10. 不要运行 npm install。

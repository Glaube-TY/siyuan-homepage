# KB Agent — First Principles (Skill-first Agent Workbench)

本文件是思源笔记 AI 知识库助手的最高优先级规则。后续每一轮修改都必须先重新阅读本文件，确认未违反本文件。

## 第一铁律（最高优先级）：AI Planner 是唯一业务动作决策者

### Codex / Claude Code 式 Agent Workbench

当前项目对齐的目标不是"自动问答系统"，也不是"工作流 Agent"，而是 **Codex / Claude Code 式 Agent Workbench**：

- AI Planner 是唯一业务动作决策者。
- Harness 只能做 `validate` / `execute` / `observe` / `return_to_planner`。
- Tool 是独立能力。AI 决定何时调用，Harness 只负责执行和返回结果。
- Skill 是给 AI 的"能力手册 / 工作方法 / 工具关系说明"，**不是代码流程控制器**。
- MCP / 自定义 Skill 未来都通过同一套 `SkillRegistry` / `ToolRegistry` 动态接入，**不写硬编码流程**。

### Skill-first，而不是 State-machine-first

历史架构反复出问题的根本原因，是把状态机、Evidence Gate、`allowedActions`、recovery / continuation / fallback 当成"流程控制中枢"，在间接控制 AI 选工具。

v3 明确改为 **Skill-first Agent Workbench**：

- AI Planner 自己阅读 Skill 描述，自己决定调用什么 Tool。
- Harness 不再在代码里规定"先 search、再 list、再 read、最后 answer"。
- `allowedActions` 只能表达硬可用性（权限、预算、工具是否存在、是否有候选），不得表达流程建议。
- `evidence_gate` 只能输出 observation，不能把流程收窄成"只能回答"。
- 状态机只能用于 UI 状态和 trace，不能驱动业务流程。

### 默认项目身份与默认目标

- 当前项目默认身份是 **"思源笔记 AI 知识库助手"**。
- 默认目标是 **帮助用户完成知识管理相关任务**（检索、查找、总结、解释、对比、引用等）。
- 具体如何找资料（要不要先列知识地图、要不要聚焦子目录、要不要读历史引用），由 AI Planner 根据内置知识库问答 Skill 和工具 observation 自主决定。
- 除非用户明确不需要知识库，或问题明显无需知识库资料，否则 AI 可以使用知识库问答 Skill。
- Skill 可以提供工具说明、工具关系、工具使用建议、边界提醒，**但不能由代码强制执行**。
- 内置 Skill 的优先级可以高，但优先级只影响 prompt 展示，不影响代码自动调用。

### 全局身份统一

Planner 可见的全局身份统一为：

> 你是运行在思源笔记中的 AI 助手，可直接回答，也可参考已启用的 Skill 说明和全局工具完成任务。

不得自称模型、厂商、MiMo、小米、OpenAI。

### 中文提示语要求

项目中给 AI Planner 的所有可见提示语必须使用中文，包括但不限于：
- Tool 的 title / description / capability / boundary / inputHint
- Tool observation 的 summary
- Skill 的 prompt 段落
- Planner 的 system prompt
- 错误信息的 Planner 可见摘要

工具 `name` 可以保留英文机器名（如 `search_scope`、`read_candidate_docs`、`final_answer`）。

### 禁止基于内容/关键词/正则判断流程

代码不得根据问题文本、工具结果文本、回答文本中的关键词、正则表达式或自然语言内容自动选择下一步业务动作。流程决策完全由 AI Planner 基于 observation 事实做出。

## 工具结果只能 observation → Planner

- 工具执行结果无论成功、失败、0 命中、无候选、参数错误、预算耗尽、证据不足，都只是 observation。
- observation 必须返回给 AI Planner，由 AI Planner 决定下一步。
- 代码不得根据工具结果直接或间接选择下一个业务工具。
- 代码不是 agent，不能替 AI Planner 做 search / list / focus / read / answer 的下一步业务决策。

## 绝对禁止的业务回退

以下行为一律禁止，即使被命名为 fallback、recovery、continuation、recommendedState、suggestedAction、auto route、guard、edge、state transition、debug hint 也不允许：

- `search_scope` 失败或 0 命中后，代码自动 `list_scope_docs`。
- `list_scope_docs` 返回目录清单后，代码自动 `read_candidate_docs`。
- `read_candidate_docs` 无强候选后，代码自动读取 `inventoryOnly` 文档。
- 工具参数错误后，代码自动换另一个业务工具。
- 证据不足后，代码自动 `answer`。
- 预算耗尽后，代码构造 `answer`。
- validation 失败后，代码替换成另一个业务 action。
- `evidence_gate` / graph edge / state machine 生成 `search_scope` / `list_scope_docs` / `focus_doc_scope` / `read_candidate_docs` / `read_docs` / `read_block_context` / `answer`。
- `fallback` / `recovery` / `continuation` / `recommendedState` / `suggestedAction` / `recommendedAction` / `fallbackAction` / `auto next tool` / `forcedNextTool` / `preferredNextStep` / `shouldUseWhen` / `fallbackIfNoHits` 影响业务动作选择。

## 允许的非业务 fallback

只允许以下非业务层 fallback：

- LLM JSON 解析失败后 raw parse fallback。
- streaming compose 失败后 non-stream compose fallback。
- provider transport retry。
- UI 展示降级。

这些 fallback 绝不能生成、替换、建议或自动路由业务工具动作，不能改变 AI Planner 原始选择的 action 类型。

## 角色分工（v3 Agent Workbench）

| 角色 | 职责 | 不得做 |
|------|------|--------|
| **AI Planner** | 读 Skill、读工具清单、读 workspace observation、自己选择下一个工具 | 不会写代码、不会绕过 Harness 调工具 |
| **Skill** | 描述"我能解决什么 / 工具使用建议 / 我有什么边界" | 不得在代码层强制工具调用顺序 |
| **Tool** | 提供一个独立能力 | 不得知道自己"在哪一步"被调用 |
| **Harness** | validate / execute / observe / return_to_planner | 不得替 AI 选工具、不得写流程 |
| **SkillRegistry** | 集中注册 builtin / user / MCP skill 的 manifest | 不得在注册时绑定状态机 |
| **ToolRegistry** | 集中注册 builtin KB tool / MCP tool / skill-provided tool | 不得根据 provider 改写工具列表 |
| **Evidence Gate** | 评估证据状态：够不够 / 缺哪类 / 是否还有预算 | 不得建议下一业务工具 |
| **State Machine** | 维护 UI 状态和 trace 状态 | 不得驱动业务工具选择 |

## Skill 是通用能力包说明

Skill 是通用能力包说明，不是具体问题类型规则库：

- Skill guidance 可以写"使用建议 / 检索策略 / 证据边界"。
- 策略建议必须是通用策略，不是针对某个问题类型的补丁。
- 不要按问题类型、文档类型、主题类型分支写规则。
- 可以建议：用户表达可能是概念化、泛称、简称或非文档原词；检索词不必等同用户原话。
- 可以建议：Planner 可以根据用户意图、文档树标题、上下文、同义词、上位词、相关实体、时间线、主题词，自主组织检索词。
- 可以建议：文档树用于理解知识库范围、栏目结构、标题线索和候选方向。
- 可以建议：搜索不到时可考虑换词、拆词、使用同义词、上位词或主题词，由 Planner 自主决定。
- 可以建议：候选文档只代表可能相关，具体结论应基于已读取摘录。
- 策略建议只帮助 Planner 判断，不是工具执行顺序，不是自动流程。
- 不要把 toolNames 写成绑定、拥有、执行顺序或启用条件。
- 优化效果优先优化 Skill guidance、Tool manifest、observation，而不是改底层代码或写流程判断。

## final_answer 是全局最终回答工具

final_answer 是全局 system tool，不属于任何 Skill，适用于所有场景：

- final_answer 是通用回答工具，适用于知识库问答、普通聊天、未来所有 Skill / MCP / 操作型能力。
- body 必填：Planner 提供的回答正文。
- references 可选：Planner 显式传入的引用句柄，用于 UI footer 展示来源。
- evidenceMode 可选：Planner 自我标注，不作为代码流程控制条件。
- 不强制要求证据、不因缺少 references 而失败、不根据知识库证据状态判断是否允许回答。
- 引用句柄校验只用于防止伪造引用和泄露内部 ID，不是业务流程控制。
- 校验失败时只过滤无效 resource IDs，不拒绝整个回答。
- 未来 Skill / MCP / 操作型能力不应被知识库证据概念限制。

## Codex / Claude Code 式核心循环

```
User Question
    ↓
Harness 准备 workspace、context、scope、tool manifest、skill manifest
    ↓
AI Planner 读 Skill + 读 Tool manifest + 读 workspace observation
    ↓
AI Planner 自主选择 Tool（可能是 search / list / focus / read / answer / 其他）
    ↓
Harness validate / execute / observe
    ↓
Tool 返回原始 observation
    ↓
Harness 把 observation 回给 AI Planner（不得裁剪成"只能答"）
    ↓
AI Planner 继续自主决定：再调一个 tool / 调 answer / 调其他 skill
    ↓
最终 AI Planner 输出 answer，Harness compose / 展示
```

代码不得在以上循环外，再造一条"业务路线"。

## 内置知识库问答 Skill

项目默认身份对应的内置 Skill：

- `name`: `builtin_knowledge_base_qa`
- `title`: 知识库问答
- `description`: 基于思源知识库检索、读取、组织证据并回答
- `roleInstruction`: 你是思源笔记 AI 知识库助手，默认基于知识库资料回答用户问题。
- `whenUseful`: 用户问题需要从知识库中检索、阅读、组织证据时使用。
- `toolNames`:
  - `list_knowledge_map`
  - `search_scope`
  - `list_scope_docs`
  - `focus_doc_scope`
  - `read_candidate_docs`
  - `read_previous_evidence`
  - `get_conversation_used_references`
- `guidance`: 可根据问题选择搜索、目录、历史引用、候选读取等工具。工具可以组合使用，没有强制顺序。引用是可选建议，不是强制规则。
- `boundary`: 不写入、不删除、不修改笔记。资料不足时要明确说明范围。不得输出 docId / blockId / path 等内部标识。
- `priority`: 100
- `enabledByDefault`: true

未来还可以继续注册：

- `builtin_summarize_documents`（基于现有 tool 组合）
- `builtin_compare_documents`
- `builtin_extract_definitions`

但这些 Skill 都只能通过 `SkillRegistry` 注入 prompt 描述，不能在代码层自动调用工具。

## MCP / 自定义 Skills 扩展原则

未来 MCP / 自定义 Skill 接入时：

- 只注册 skill / tool manifest（name / description / tools / guidance / boundary）。
- 不改状态机。
- 不写硬编码流程。
- 不在 Planner 可见工具里塞进 read_docs、auto-route、recovery 类工具。
- Skill 优先级可以高，但优先级只影响 prompt 展示，不影响代码自动调用。
- Tool 是能力，不是流程节点；任何 tool 不得知道自己"应该在第几步被调用"。

## 用户自定义 Skills 约束

用户自定义 skills 与内置 skills 同样必须通过 SkillRegistry / ToolRegistry 接入；不得绕过 Harness 直接执行动作。

- 用户 skill 使用 markdown + frontmatter 格式，存储在 `notebrain/skills/user/` 目录。
- 用户 skill 只能声明能力描述，不能定义 JS 执行代码。
- 用户 skill 不能绕过 ToolRegistry / BudgetGuard / Permission / ExecutionEngine。
- 用户 skill 引用不存在的 toolName 时，只作为 unavailable observation 或加载诊断，不自动创建工具。
- 用户 markdown skill 不得绕过 Workbench 执行动作。

## Tool 是能力，不是流程节点

- 每个 Tool 必须是独立能力，签名稳定。
- Tool 不知道自己处于"搜索阶段"还是"读取阶段"。
- Tool 不返回"建议下一步"信息。
- Tool 返回的 observation 必须是事实数据，不带"你应该"语义。
- `read_docs` 仍然是 execution-only helper：只能由 `read_candidate_docs` 或 `read_previous_evidence` 内部使用，不出现在 Planner 可见工具中。

## 全局 System Tools

`final_answer` 和 `progress_answer` 是全局 system tools，不属于任何 Skill：

- `final_answer`：向用户输出最终回答，成功后结束本轮 Agent 循环。
- `progress_answer`：向用户输出进展信息，成功后不结束本轮 Agent 循环。
- 这两个工具始终对 Planner 可见，不受任何 Skill 启用/禁用状态影响。
- `final_answer` 不要求证据、不因缺少 references 失败；`evidenceMode` 仅是 Planner 自我标注，不控制成功/失败。

## DisplayReference / ResourceRef 抽象

引用是通用可展示来源，不是知识库专属证据：

- **ResourceRef**（安全句柄）：Planner 可见的引用标识，底层真实 docId/blockId/path/url 仅工具内部使用。
- **DisplayReference**：通用引用展示结构，包含 handle、sourceType、title、subtitle、snippet、url、provider、openAction、metadata。
- **sourceType** 支持：`siyuan_doc`（思源文档）、`web_page`（网页）、`file`（文件）、`mcp_resource`（MCP 资源）、`api_result`（API 结果）、`operation_result`（操作结果）、`unknown`。
- 工具可以返回 resourceId / referenceHandle 给 Planner 使用。
- UI footer 展示 DisplayReference，后续可按 sourceType 打开思源文档、网页、文件或 MCP 资源。
- 代码不得从"存在已读资料"自动生成 references，不得从普通候选自动生成 references（除非候选已被工具注册为可展示 DisplayReference）。
- 引用解析失败时返回结构化 observation，不由代码补引用、删回答或自动换下一步。

## 工具结果和错误 observation 标准化

- 工具调用错了就错了，不要代码兜底，不要自动修参，不要自动换工具。
- ToolResult 失败时返回结构化错误：`{ ok:false, error:{ errorCode, message, recoverable, field?, expected?, received?, hint? } }`。
- 常见错误码：`invalid_args`、`handle_not_found`、`handle_expired`、`wrong_handle_type`、`out_of_scope`、`resource_not_found`、`permission_denied`、`tool_internal_error`。
- 错误 message / hint 必须中文，并给 Planner 可理解的修正信息。
- observation 不得包含真实 docId/blockId/path/internalMapping。
- Planner 根据 observation 自己决定下一步。

## Evidence Gate 降级为 Observation Producer

- Evidence Gate 只能判断证据状态：是否足够、缺少哪类、是否还有预算。
- Evidence Gate 不能建议下一个业务工具。
- Evidence Gate 不得输出会影响 Planner 选择的 `READ_REQUIRED` / `MAP_LOADED` / `EVIDENCE_SUFFICIENT` 作为业务路线。
- Evidence Gate 输出只能进入 observation，让 AI Planner 自己决定继续读 / 转入 answer / 转入其他 skill。

## State Machine 降级为 UI/Trace Status Producer

- 状态机只用于 UI 状态展示（idle / thinking / composing / done）和 trace 记录。
- 状态机不得驱动业务工具选择。
- 状态机不得在某个 state 强行要求某个 tool。
- 状态机迁移只能由 Planner 行为驱动，不能反向驱动 Planner。

## 代码禁止替 AI 安排路线

禁止新增或保留任何形式的"业务路线控制概念"，包括但不限于：

- `recommendedAction`
- `suggestedAction`
- `recommendedAction`
- `fallbackAction`
- `continuation`
- `recovery`
- `auto route`
- `preferredNextStep`
- `shouldUseWhen`
- `forcedNextTool`
- `priority workflow`
- `fallbackIfNoHits`
- `STATE_RECOVERY` / `RECOVERY` / `CONTINUATION`
- `AUTO_.*ACTION`

`allowedActions` 只能表达硬可用性：

- 权限
- 预算
- 工具是否存在
- 是否有候选

`allowedActions` 不得表达流程建议、优先顺序、强制下一动作。

## read_docs / candidate 边界

- `read_docs` 是 execution-only。
- `read_docs` 只能由 AI Planner 明确选择 `read_candidate_docs` 或 `read_previous_evidence` 后内部执行。
- `read_docs` 不得出现在 Planner `allowedActions` 中。
- `list_scope_docs` 无 query 时只产生 inventory / navigation observation，不是可读证据候选。
- `inventoryOnly` 文档不能被 `read_candidate_docs` 直接读取为证据。
- `read_candidate_docs` 没有 strong / readable candidates 时，只能返回 `no_readable_candidates` observation，然后回到 AI Planner。
- 代码不能退回读取 `inventoryOnly` / top-K 清单文档。

## trace / debug 边界

- Trace 可以记录 tool result / observation / status。
- Trace 不得记录 `suggestedAction` / `recommendedAction` / `fallbackAction`。
- Trace 中不得出现让人误以为代码建议下一业务动作的字段。
- 允许记录 `route=return_to_planner` / `route=compose_guard`。
- 不允许记录 `route=search_scope` / `route=read_candidate_docs` / `route=focus_doc_scope` / `route=answer` 这类业务下一步。

## 每轮守门清单（硬性 grep）

每轮修改 agentic-rag 前后都必须检查：

```bash
rg "recommendedAction|suggestedAction|fallbackAction|STATE_RECOVERY|RECOVERY|CONTINUATION|AUTO_.*ACTION|fallbackIfNoHits|forcedNextTool|preferredNextStep|shouldUseWhen" src/features/kb/services/agentic-rag
rg "read_docs" src/features/kb/services/agentic-rag
rg "inventoryOnly" src/features/kb/services/agentic-rag
```

注意：grep 范围是 `src/features/kb/services/agentic-rag`，**不**包括 `docs/notebrain`。`docs/notebrain` 文档本身必须包含禁止字段清单的描述，命中不等于违规。

### 守门白名单（命中后人工确认即合规）

以下位置出现禁止字段是**有意为之**的，不得删除：

- `src/features/kb/services/agentic-rag/workbench/flow-control-guard.ts` — 维护禁止字段清单本身。
- `src/features/kb/services/agentic-rag/workbench/self-check.ts` — 包含自检相关文字。
- `docs/notebrain/*.md` — 文档的"禁止"段落、清单表格、状态说明。
- `src/features/kb/services/agentic-rag/workbench/planner-visible-data-guard.ts` — 真实 ID / path 守门。

### 禁止出现位置（grep 命中后必须人工判断是否在白名单）

下列位置出现禁止字段一律视为违规，必须改掉：

- 运行时对象 / 配置文件 / 测试 fixture
- `ToolContract` 实例与 `ToolRegistry` 注册表
- `SkillContract` 实例与 `SkillRegistry` 注册表
- `ObservationStore` 中的 `ObservationEntry.facts` / `summary` / `reasonCode`
- `PlannerDecision.args`（含 `tool` / `answer` / `stop` 三种决策的 args）
- 任何传入 AI Planner 的 context / prompt 段落正文

### 处理原则

- 命中后**先**判断位置是否在白名单。**不要**因为 grep 命中就删除 `flow-control-guard.ts` 中的禁止字段清单。
- 命中位置不在白名单时，回正到 `observation → Planner` 单向流，而不是"删除 + 隐式使用"。
- 工具失败 / 0 命中 / 无候选 / 参数错误 / 预算耗尽 / 证据不足 的处理路径必须是 observation → Planner。

## 偏离处理原则

- 一旦发现代码替 Planner 做业务决策，本轮只做回正。
- 不做新功能、不做性能优化、不做 prompt 美化、不做 provider 改造。
- 先恢复 Codex / Claude Code 式 Harness 基线，再继续开发。

## 禁止自动选择 focus resource IDs

**代码不得自动选择 focus resource IDs。**

focus_doc_scope 只能由 AI Planner 基于资料目录明确选择 handle，或由用户/上下文显式提供 handle。

Recovery / continuation / fallback 不能从 resourceIdMappings 中取前 N 个 handle 伪造 focus_doc_scope。

### 禁止项

- chooseFocusHandles
- first N resource IDs fallback
- auto focus from catalog order
- fallback focus without planner-selected resource IDs
- 从 knowledgeMap/resourceIdMappings 中自动取 handle 构造 focus_doc_scope
- 任何在 Planner 未明确输出 resource IDs 的情况下生成 focus_doc_scope 的逻辑

## 当前阶段边界：只读知识库 Agent

当前 AI 知识库只做只读 Agent。

- 允许 AI Planner 自主调用 `list_knowledge_map` / `search_scope` / `focus_doc_scope` / `list_scope_docs` / `get_doc_tree_context` / `read_candidate_docs` / `read_previous_evidence` / `get_conversation_used_references` / `answer`。
- `read_docs` / `read_block_context` 是 execution-only helper：只能由 `read_candidate_docs` 或 `read_previous_evidence` 内部使用，不出现在 Planner 可见工具中。
- 代码只能在 AI Planner 输出动作后 validate / execute / observe。
- `read_docs` 只能作为 `read_candidate_docs` 的内部执行，不暴露给 Planner。
- 任何"代码自动调用工具"的说法都必须改为"AI Planner 调用，代码执行"。
- 禁止写入、修改、删除、移动、创建笔记。
- 不实现 draft/write/confirmation/diff/patch 能力。
- 最终输出只能是回答、总结、分析、建议。

## 偏离检测与立即回正

强制检测规则，用于判断开发过程中是否偏离 Agentic RAG 主线：

- 任何日志出现 `PLANNER_SINGLE_ACTION_FAST_PATH_SAFE enabled=true`，视为偏离主线。
- 任何 Planner 可见动作 `decisionSource` 不是 `ai_planner`，视为偏离主线。
- `answer` 不是 `ai_planner`，视为严重偏离。
- `read_docs` 出现在 Planner `allowedActions` 中，视为严重偏离。
- `focus_doc_scope` 没有 planner-selected resource IDs，视为严重偏离。
- `evidence_gate` / 状态机直接生成工具动作，视为严重偏离。
- 检测到偏离时，下一轮开发必须优先回正，不允许继续做性能/体验/新功能。

## 最终回答前证据压缩规则

证据压缩也必须遵守"代码不理解自然语言"。

### 禁止

- extractQuestionTokens
- Intl.Segmenter
- unicode token
- n-gram
- keyword matching
- line.includes(question token)
- question/content score
- bestScore / bestStart 语义片段选择
- 基于用户问题选择"相关片段"
- 基于证据文本内容打分
- 基于语言拆分

### 允许

- 按文档读取顺序截取
- 按每篇文档平均预算截取
- 保留文档开头 + 中间 + 结尾
- 保留标题、titlePath、readLevel、sourceRole
- 按证据项顺序和预算做非语义压缩
- 截断说明使用中性文字，例如"以下内容因长度限制做了顺序截取"

## 禁止生产代码做

- 中文分词 / 英文分词
- 关键词提取 (keyword extraction)
- 短语提取 (phrase extraction)
- n-gram
- stop words / generic words
- query/title 语义匹配评分
- corpus frequency 语言推断
- 针对某种语言的文本规则
- 针对某个测试标题的规则
- 针对某个用户知识库的规则
- token specificity
- 针对任意自然语言文本的相关性打分

## 允许代码做

- 文档树结构处理
- 父子/兄弟/祖先/后代关系处理
- 安全 handle 映射
- 工具契约
- 状态机（只用于 UI / trace）
- 候选池 (Candidate Pack)
- 证据包 (Evidence Pack)
- 预算控制
- 权限/门禁 (Evidence Gate)（只输出 observation）
- trace
- 把原始用户 query 交给 AI planner 或 search_scope
- 按 AI 选择的 handle / candidate index 执行工具
- AI planner 读 Structure Pack 后选择 handle
- search_scope 使用原始 query 检索
- 代码根据 AI 选择的 handle 展开父子兄弟文档
- 代码根据结构关系和工具来源组织候选
- 代码根据证据是否已读、预算、权限、状态机计算 `allowedActions` / `forbiddenActions` / `evidenceStatus`
- 代码不得根据这些状态直接选择业务工具
- `evidence_gate` 只能判断证据是否足够、是否需要继续交给 Planner，不能选择 search/focus/read/answer
- `budget_guard` 只能阻止或要求返回 Planner，不能替 Planner 选工具

## 架构分工

| 角色 | 职责 |
|------|------|
| **代码** | 搭建桥梁、处理结构、传递原始 query、执行 AI 决策、维护 SkillRegistry / ToolRegistry |
| **AI Planner** | 读 Skill / 读 tool manifest / 读 observation / 自主选工具 / 输出 answer |
| **Skill** | 描述"我能解决什么 / 工具使用建议 / 我有什么边界"，不强制流程 |
| **Tool** | 独立能力，不感知流程阶段 |
| **检索引擎** | 根据原始 query 做精确关键词和模糊检索、返回相关文档 |

> 当前只读 Agentic RAG 采用 AI Planner 生成检索词 + 文档树 + 精确/模糊检索；向量检索已退出主线，未来如需语义检索应作为独立 Planner 工具重新设计。

## v3 是唯一主线

旧逻辑如果已被新架构替代，直接删除，不保留两套并行逻辑。

- v3 文档：`docs/notebrain/00-first-principles.md`（本文件）
- v3 设计：`docs/notebrain/agent-skill-workbench-v3-design.md`
- 旧 v1 / v2 设计如果还残留在代码中，按"v3 是唯一主线"原则回正。

## Prompt 极简化铁律

内部运行时 prompt 只面向 AI，不面向开发者。

### 允许保留

- AI 角色身份描述
- 只读知识库边界
- 当前激活的 Skill 描述
- 工具说明：工具是什么、参数怎么写、返回什么、边界是什么
- 参数格式
- 状态 observation：当前有哪些候选、已读证据数、允许动作、禁止动作
- 安全约束：禁止输出 docId/blockId/path
- 输出 JSON schema
- 一句轻提示："资料目录/文档树可帮助缩小检索范围"

### 禁止

- evidenceMode 必填、answer 必须有证据、Evidence Gate 作为当前主线等旧表达
- 对话类型分类（relationToPrevious / refine_previous_answer / expand_scope / same_target_followup）
- 追问类型分类（conversationReferents / refersToPreviousAnswer / correctionToPreviousAnswer）
- 上下文模式判断（coverageIntent / stableTarget / searchQuerySource）
- 处理顺序建议（"优先选择"/"必须先"/"请继续读取"/"请根据资料目录继续选择某工具"）
- 工具选择建议（"如果不能判断就检索"/"可考虑查看资料目录"/"应优先读取"）
- 轮次理解摘要
- 轮次上下文事实
- 对话指代解析
- 与上一轮关系说明
- 连续追问/追问或延续判断
- 回答聚焦本轮新增/补充/修正

### 核心原则

- AI Planner 是唯一业务动作决策者。
- Prompt 不能预设对话类型、追问类型、上下文模式、处理顺序。
- Prompt 不能写"优先选择/必须先/请继续读取/请根据资料目录继续选择某工具/如果不能判断就检索"等流程规训。
- 具体理解、处理、顺序和工具选择由 AI Planner 自己决定。

## 标准只读 Agentic RAG 链路（Skill-first Workbench）

全链路预期结果，可据此判断每次日志是否偏离：

1. 用户提问。
2. Harness 准备 SkillRegistry / ToolRegistry / ToolManifest / ObservationStore / BudgetGuard，不做业务工具决策。
3. AI Planner 读 Skill 描述 + Tool manifest + workspace observation，输出一个 `PlannerDecision`（type: "tool" | "answer" | "stop"）。
4. Harness `validatePlannerDecision`：校验决策结构、黑名单键、流程控制字段、answer args 白名单。
5. ExecutionEngine validate / execute / observe：依次检查工具注册性、execution-only 拒绝、BudgetGuard.check、tool.availability、inputSchema.safeParse、tool.execute、outputSchema 校验、observationFormatter、observationStore.push、consume budget。任何环节失败均生成 tool_failed observation，不抛出异常中断 PlannerLoop。
6. ObservationStore 返回给 Planner，Planner 看到最新 observations 后继续自主决策。
7. AI Planner 明确选择 answer 后（decision.type === "answer" 且 toolName === "answer"），才产生 answerDraft。answerDraft 不含真实 docId / blockId / path，只含 evidenceMode / body / displayedReferenceHandles（安全句柄）。
8. Harness compose final answer。
9. UI 展示状态、思考、最终回答和引用。
10. 全程 trace 记录 `decisionSource`、`action`、`evidenceCount`、`readDocCount`，但不输出真实正文 / query / title / reasoning 原文。

### read_docs / read_block_context 边界

- `read_docs` / `read_block_context` 都是 execution-only helper，不出现在 Planner 可见工具中。
- `read_docs` 只能由 `read_candidate_docs` 或 `read_previous_evidence` 内部使用。
- `read_block_context` 只能作为内部 helper 使用。
- Planner 可见的文档树上下文能力是 `get_doc_tree_context`。
- 如果必须提 materialize，只能作为 `read_docs` / `read_block_context` 这类 execution-only helper 的内部实现说明，不能作为业务流程控制阶段。

## 依赖优先原则

实现新功能前，必须先检查：
- package.json 已安装依赖
- src 中已有封装
- docs 中既有设计
- 当前模块已有工具函数

已有成熟依赖可用时，必须优先复用，不要自研重复实现。

当前项目中与 AI 知识库相关的优先依赖包括：
- `ai` / `@ai-sdk/openai-compatible`：LLM 调用、流式输出、模型 provider 统一封装（Kimi / Mimo / DeepSeek / 自定义接口四入口底层统一 OpenAI-compatible 协议）
- `zod`：schema 校验、结构化输出校验

> 当前模型入口为 Kimi / Mimo / DeepSeek / 自定义接口四类，底层统一 OpenAI-compatible 协议。"Claude Code 式 Harness"作为架构类比可保留，不代表 Claude provider 支持。

禁止：
- 已有依赖能稳定完成的工程能力，重新手写一套长期维护逻辑。
- 在没有审计依赖的情况下新增大模块。
- 因为局部问题绕开已有框架写临时补丁。

允许：
- 对项目特有规则自研，例如思源安全 handle、EvidenceGateV2、只读边界、第一铁律、引用过滤。
- 在迁移风险较高时先保留现有实现，但必须记录迁移计划。

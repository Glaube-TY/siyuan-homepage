# KB Agent — Skill-first Agent Workbench v3 Design

本设计文档配套 `docs/notebrain/00-first-principles.md` 一起使用。原则部分以 first-principles 为准，本文件补充具体模块结构、调用关系、扩展点。

## 1. 为什么旧架构反复出问题

v1 / v2 架构的核心问题是把"AI 决策"间接交给了一组看起来"中立"的代码机制：

1. **状态机驱动流程**：`STATE_*` 之间通过 edge / guard 串成"先 search、再 list、再 read、最后 answer"的隐式路线。AI Planner 只剩"按节点确认"的角色，一旦状态机跳错，下游就跟着错。
2. **`allowedActions` 表达流程建议**：表面上是"硬可用性"，实际常被塞入"应该优先做 X"。"先做 list_knowledge_map 再 search"这种流程规训，正是从这里漏出去。
3. **Evidence Gate 收窄为"只能 answer"**：当 Evidence Gate 输出 `EVIDENCE_SUFFICIENT=true` 时，代码层会把"可选动作"裁剪成只剩 `answer`，把"继续读 / 换 Skill"这条路封死。
4. **Recovery / Continuation / Fallback 替 AI 选工具**：0 命中、参数错误、预算耗尽时，代码自动路由到下一个工具。AI Planner 失去了在观察后继续判断的机会。
5. **Provider / 模型能力写进 Planner prompt**：把"哪个模型要发什么参数"塞进 Planner 上下文，让 AI 在思考下一步时还要替代码担心 provider 兼容性。

这些"间接控制"看起来都"中立"，实际叠加之后形成了一条隐式业务路线，AI Planner 没有真正的自主权。

## 2. 新架构：Skill-first Agent Workbench

### 2.1 一句话

> AI Planner 自己读 Skill 描述、自己读 Tool 清单、自己读 observation、自己选下一个 Tool。Harness 只是一个能 validate / execute / observe / return_to_planner 的工作台。

### 2.2 核心循环

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

### 2.3 关键不变量

- AI Planner 看见的"工具清单"和"可用 Skill"是它决策的唯一输入。
- Harness 不在 Planner 视野外做业务动作。
- Skill / Tool 都是 manifest 描述，代码层不绑定状态机。
- 任何 observation 都回到 Planner，不被裁剪成"只剩一个选项"。

## 3. SkillRegistry

### 3.1 职责

集中注册所有 Skill 的 manifest。包括：

- builtin skills
- user custom skills
- MCP skills

### 3.2 SkillContract 形态

```ts
interface SkillContract {
  name: string;                // 唯一名；例如 builtin_knowledge_base_qa
  title: string;               // 给 UI 展示用的标题
  description: string;         // 一句话简介，写入 Planner prompt
  roleInstruction: string;     // 本 Skill 的定位说明
  whenUseful: string;          // 适合场景（仅 prompt 说明，不得被代码用来自动启用 / 自动路由）
  boundary: string;            // 边界 / 禁止事项
  toolNames: readonly string[];// 本 Skill 说明中提到的全局工具名，不代表绑定、拥有、自动调用或优先顺序
  guidance: string;            // 工具使用建议（写入 prompt，不得含"必须先 / 必须读 / 证据够必须答"）
  priority: number;            // 展示优先级（只影响 prompt 展示顺序，不触发自动执行）
  enabledByDefault: boolean;   // 是否默认启用（只决定是否进入 enabledSkillNames 列表）
  buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection;
}
```

Skill 是给 AI Planner 的"能力手册"。Skill 不含 execute，不替 Planner 选工具。

### 3.3 SkillRegistry 行为

- `registerSkill(skill: SkillContract)`：注册一个 Skill。
- `unregister(name)`：移除一个 Skill。
- `list()`：列出当前所有 Skill。
- `renderForPlanner()`：把当前激活 Skill 渲染成 Planner prompt 片段。

### 3.4 约束

- SkillRegistry 不在注册时绑定状态机。
- SkillRegistry 不替 AI Planner 决定调哪个 Skill。
- SkillRegistry 不"自动激活"任何 Skill；激活与否由 Planner 自己判断 / 由用户在设置中预设。

## 4. ToolRegistry

### 4.1 职责

集中注册所有 Tool。包括：

- builtin KB tools（list_knowledge_map / search_scope / list_scope_docs / focus_doc_scope / get_doc_tree_context / read_candidate_docs / read_previous_evidence / get_conversation_used_references / answer）
- MCP tools
- user / MCP provided tools（注册进 ToolRegistry 后即成为全局工具）

### 4.2 ToolContract / ToolManifest 形态

```ts
interface ToolContract {
  name: string;                // 唯一名
  title: string;               // 给 UI 展示用的标题
  description: string;         // 给 Planner 看的工具说明
  capability: string;          // 工具能力描述
  inputSchema: ZodSchema;      // 参数 schema（必须真实 ZodSchema，不允许 undefined）
  outputSchema?: ZodSchema;    // 返回 schema（可选；存在时 ExecutionEngine 会校验 result.data）
  outputKind: ToolOutputKind;  // 输出物形态
  safety: ToolSafetyInfo;      // 安全等级对象
  boundary: string;            // 边界 / 禁止事项
  source: ToolSource;          // "builtin" | "mcp" | "skill" | "system"
  availability(ctx: ToolRuntimeContext): ToolAvailability;
  execute(args: ToolInput, ctx: ToolRuntimeContext): Promise<ToolResult>;
  observationFormatter(result: ToolResult, ctx: ToolRuntimeContext): ToolObservation;
}

interface ToolManifest {
  name: string;
  title: string;
  description: string;
  capability: string;
  inputSchema: ZodSchema;
  outputKind: ToolOutputKind;
  safety: ToolSafetyInfo;
  boundary: string;
  source: ToolSource;
  availability: ToolAvailability;  // 已求值的可用性快照
}

type ToolSource = "builtin" | "mcp" | "skill" | "system";

interface ToolSafetyInfo {
  readOnly: boolean;
  canWrite?: boolean;
  requiresConfirmation?: boolean;
  permissionScope?: string;
}
```

ToolManifest 不含 execute / observationFormatter，只暴露给 Planner。
ToolSafetyInfo 是对象结构，不使用 readonly / sideEffect 旧字段。

### 4.3 ToolRegistry 行为

- `registerTool(tool: ToolContract)`：注册一个 Tool（inputSchema 必须是真实 ZodSchema）。
- `unregister(name)`
- `list()`：返回所有 Tool
- `listVisibleToPlanner()`：返回 Planner 可见工具清单（必须排除 `read_docs` / `read_block_context` 等 execution-only helper）
- `getTool(name)`：根据名取 ToolContract
- `getPlannerToolManifest(budgetGuard?)`：返回 Planner 可见 ToolManifest[]（budget 不足时 availability 为 available:false）

### 4.4 约束

- ToolRegistry 不根据 provider / 模型 / 状态机改写工具列表。
- ToolRegistry 不做"在某个阶段只暴露部分工具"的逻辑。
- Tool 不感知"自己在第几步被调用"。

## 5. Builtin KB Skill

项目内置的知识库资料能力说明 Skill。

```ts
const builtinKnowledgeBaseQa: SkillContract = {
  name: "builtin_knowledge_base_qa",
  title: "思源知识库问答",
  description: "说明如何参考思源知识库相关全局工具能力进行结构查看、检索、读取和引用。",
  roleInstruction: "可使用思源知识库资料辅助回答。",
  whenUseful: "当用户请求涉及知识库资料的查找、总结、解释、对比或引用时可参考。",
  boundary: "只读知识库；不写入、不删除、不修改。可以使用工具返回的 docId/blockId/url/fileId/resourceId 作为后续工具参数；不得编造资源 ID。不得输出 path/internalMapping/realPath 等内部实现字段。",
  toolNames: [
    "list_knowledge_map",
    "search_scope",
    "focus_doc_scope",
    "read_candidate_docs",
  ],
  guidance: "（详见 guidance.ts，包含通用检索策略、结构查看/检索/读取能力、最近上下文和引用、final/progress 边界、JSON 输出规则等。全部使用推荐措辞，不是固定流程。）",
  priority: 100,
  enabledByDefault: true,
  buildPromptSection(ctx) { /* 渲染 Skill prompt 段落 */ },
};
```

### 5.1 内置 Skill 的 prompt 优先级

- `priority` 越高，越靠前展示在 Planner 上下文。
- 优先级只影响 prompt 展示顺序，不影响代码自动调用。
- 用户可在设置中关闭某个内置 Skill。

### 5.2 默认激活

- 项目默认激活 `builtin_knowledge_base_qa`。
- 除非用户明确不需要知识库，或问题明显无需知识库资料，否则 Planner 可以使用该 Skill。
- 是否使用 / 何时使用由 Planner 自主决定，代码不强制。

### 5.3 已落地的 Skill

- `skills/system/answer`：全局 system tool `final_answer`，提供最终回答能力，成功后结束本轮。
- `skills/system/progress-answer`：全局 system tool `progress_answer`，提供进展展示能力，不结束本轮。
- `skills/builtin/kb-retrieval`：内置知识库问答 Skill 已落地。
- `skills/user`：用户 markdown skill 已落地，包含 markdown loader / parser / register 完整链路。

### 5.4 可扩展的 Skill 示例

- `builtin_summarize_documents`
- `builtin_compare_documents`
- `builtin_extract_definitions`
- `mcp.notion_search`
- `mcp.github_issue_lookup`

这些 Skill 都只能通过 `SkillRegistry` 注入 prompt 描述，不能在代码层自动调用工具。

## 6. MCP / 自定义 Skills 接入方式

MCP / 自定义 Skill 接入规则：

1. **只注册 skill / tool manifest**：把 Skill 描述和它引入的 Tool 描述注册到 `SkillRegistry` / `ToolRegistry`。
2. **不改状态机**：旧的状态机字段不得因为新 Skill 改动。
3. **不写硬编码流程**：不在 Harness 里写"如果激活了 X Skill 就走 Y 路径"。
4. **不污染 Planner 可见工具**：`read_docs`、auto-route、recovery 类工具不得因为 Skill 注册而进入 Planner 可见清单。
5. **优先级只影响 prompt 展示**：高优先级只代表"Planner 更容易看到这个 Skill"，不代表"代码会自动调它"。
6. **Tool 不感知流程**：任何 Tool 不得知道自己"应该在第几步被调用"。

用户自定义 Skill 以 markdown 文件形式存放在 `skills/user/`，通过 `MarkdownSkillLoader` 加载，经 `assertNoFlowControlFields` 校验后注册到 `SkillRegistry`。

### 6.1 用户 Skill 元数据来源

用户 skill 运行时元数据以 `index.json` 的 `UserSkillIndexEntry` 为准：

- `title` 使用 `entry.title` 或 `entry.id`（为空时回退）；
- `priority` 使用 `entry.priority`；
- `enabledByDefault` 使用 `entry.enabled`；
- `SkillContract.name` 统一生成为 `user_${entry.id}`。

`frontmatter.id` 仅用于校验：空则允许，存在且与 `entry.id` 不一致则跳过 skill 并 diagnostic。
`frontmatter.title` / `priority` / `enabled` 不覆盖 index entry，不允许用户 markdown frontmatter 绕过 index.json 改变启用状态或排序。

## 7. read_docs / read_block_context 边界

- `read_docs` 是 execution-only helper，不出现在 Planner 可见工具中。
- `read_docs` 只能由 `read_candidate_docs` 或 `read_previous_evidence` 内部使用。
- `read_block_context` 是 execution-only helper，不出现在 Planner 可见工具中。
- `read_block_context` 只能作为内部 helper 使用。
- `read_previous_evidence` 是 Planner 可见的"读取历史引用证据"工具，由 Planner 主动选择；内部执行时使用 read_docs。
- Planner 可见的文档树上下文能力是 `get_doc_tree_context`。
- Harness 在 ExecutionEngine 中只做"Planner 选择 read_candidate_docs → 内部调用 read_docs 执行"，不做其它转换。

## 8. Evidence Gate 降级

- 旧实现：`EVIDENCE_SUFFICIENT` → 强制 answer。
- 新实现：Evidence Gate 只输出 observation：
  - `evidenceStatus`: `"empty" | "partial" | "sufficient" | "overflow"`
  - `missingCategories`: 例如 `["直接引用", "来源"]`
  - `budget`: 已读 / 配额
  - `recommendation`: **无**
- 是否继续读 / 是否转入 answer / 是否换 Skill，由 AI Planner 自己决定。

## 9. State Machine 降级

- 旧实现：`STATE_PLAN → STATE_SEARCH → STATE_READ → STATE_ANSWER` 之间由 edge / guard 强制迁移。
- 新实现：
  - 状态机只用于 UI 状态展示（idle / thinking / streaming / done / error）。
  - 状态机只用于 trace 记录。
  - 状态机迁移只能由 Planner 行为（执行了哪个 tool / 输出了 answer）触发，不能反向驱动 Planner。
  - 状态机不在某 state 强行要求某 tool。

## 10. allowedActions 重新定义

旧实现常被用来塞"流程建议"。新实现严格收窄为：

- 权限（用户是否允许该工具）
- 预算（是否还有调用次数 / token）
- 工具是否存在（ToolRegistry 里有没有）
- 是否有候选（仅"硬候选"，例如 read_candidate_docs 必须有 strong / readable candidates 才能允许）

不允许：

- 流程建议
- 优先顺序
- "在某个阶段只能选某工具"
- "证据不足时不能 read"

如果某个条件是"建议"，应当写到 Skill 的 `guidance` 字段里，由 Planner 看到，而不是写到 `allowedActions` 里强制。

## 11. 工具能力清单（v3）

以下工具是 Planner 可独立调用的能力，是否组合、如何组合由 Planner 决定：

- `list_knowledge_map`：查看知识图谱/文档树结构
- `search_scope`：搜索知识库
- `list_scope_docs`：列出范围文档
- `focus_doc_scope`：聚焦子目录
- `read_candidate_docs`：读取候选文档（返回真实 docId/blockId 和内容片段，可供 final_answer 引用）
- `read_previous_evidence`：读取历史引用证据
- `get_conversation_used_references`：获取对话已用引用
- `final_answer`：输出最终回答并结束本轮（全局 system tool）
- `progress_answer`：输出进展信息但不结束本轮（全局 system tool）

**示例不是代码流程**。上述工具没有调用顺序约束；Planner 可以根据问题和 observation 自主决定使用哪些工具、以什么顺序组合。

`final_answer` 和 `progress_answer` 是全局 system tools，不属于任何 Skill，始终对 Planner 可见。

`read_docs` / `read_block_context` 是 execution-only helper，不出现在 Planner 可见工具中。

## 12. 不变量与守门

### 12.1 grep 守门

每一轮修改后必须 grep：

```bash
rg "recommendedAction|suggestedAction|fallbackAction|STATE_RECOVERY|RECOVERY|CONTINUATION|AUTO_.*ACTION|fallbackIfNoHits|forcedNextTool|preferredNextStep|shouldUseWhen" \
  src/features/kb/services/agentic-rag
```

**白名单**（允许出现，禁止字段只在这里作为"反面教材"出现）：

- `src/features/kb/services/agentic-rag/workbench/flow-control-guard.ts`
  - 维护 `FORBIDDEN_FLOW_CONTROL_FIELDS` 禁止字段清单本身（`nextAction` / `recommendedAction` / ...）。
- `src/features/kb/services/agentic-rag/workbench/self-check.ts`
  - 自检断言调用，函数名 / 错误信息里出现"forbidden"等关键词。
- `docs/notebrain/00-first-principles.md` 与本文件
  - 文档里的禁止清单段落，用于解释规则。

**禁止出现位置**（命中后视为严重违规，必须立即回正）：

- 运行时 prompt 对象（`src/features/kb/services/agentic-rag/**/prompts/**`、`buildPromptSection` 拼装结果等）。
- `ToolContract` 实例及其运行时注册（`tool-registry.registerTool` 入参）。
- `SkillContract` 实例及其运行时注册。
- `ToolObservation.facts` / `SkillObservation.facts`。
- `PlannerDecision`（含 `PlannerToolDecision.args` / `PlannerAnswerDecision.args` / `PlannerStopDecision` 任何字段）。

**判定方式**：命中后人工判断文件归属；只要不是白名单内的 `flow-control-guard.ts` / `self-check.ts` / first-principles / 本 design 文档，全部视为问题。

### 12.2 execution-only 边界 grep

```bash
rg "read_docs" src/features/kb/services/agentic-rag
```

白名单：

- `src/features/kb/services/agentic-rag/workbench/tool-registry.ts` 中的 `EXECUTION_ONLY_TOOL_NAMES`。
- `src/features/kb/services/agentic-rag/workbench/budget-guard.ts` 中的 `resolveBudgetCategory`。
- `src/features/kb/services/agentic-rag/workbench/execution-engine.ts` 中的 `execution_only_helper` 拒绝分支。
- `src/features/kb/services/agentic-rag/workbench/skill-contract.ts` / `index.ts` 中的注释与导出。
- `src/features/kb/services/agentic-rag/workbench/self-check.ts` 中的 `assertNoPlannerVisibleExecutionOnlyTools`。
- first-principles / 本 design 文档。

**禁止出现位置**：`getPlannerToolManifest` 渲染结果、`PlannerRuntimeContext.toolManifest`。命中后必须删除或迁移到白名单路径。

```bash
rg "inventoryOnly" src/features/kb/services/agentic-rag
```

确认 `read_candidate_docs` 路径不会读取 `inventoryOnly` 为证据。

## 13. 迁移与回正

- v3 是唯一主线。
- 旧 v1 / v2 残留（state machine 驱动业务、recovery / continuation 业务回退、Evidence Gate 强制 answer 等）应按"v3 是唯一主线"原则回正。
- 局部 bug 修复应避免把流程"绑死"，而是让 Planner 看到更完整的 observation 后自己决定。

### 13.1 Legacy Quarantine

旧 `src/features/kb/services/agentic-rag/harness/` 与 `src/features/kb/services/agentic-rag/graph/` 主链路**暂时保留**，但它**不是** v3 workbench 的依赖来源。

边界规则：

- v3 workbench（`workbench/*`）**不** import 旧 `harness/contracts/tool-contract-registry`、旧 `harness/contracts/tool-contract`、旧 `harness/contracts/tool-contract-adapters`。
- v3 workbench **不** 引用旧 `harness/parity`、旧 `harness/state`、旧 `harness/trace`、旧 `harness/execution`、旧 `harness/context`、旧 `harness/guards`。
- v3 workbench **不** 引用旧 `planner/planner-action.ts` 的 `PlannerActionType` / `allowedActions` / `materializer`。
- v3 workbench **不** 引用旧 `graph/*` nodes / edges / state。

KB ToolContract 迁移时：

- **可以**复用 `tools/executors/*` 与 `tools/readers/*` 等底层 tool 实现。
- **不得**复用 `harness/contracts/tool-contract-registry.ts` 中的 `allowedNext` / `materializesTo` 等流程控制字段语义。
- **不得**把旧 `PlannerAction` / `allowedActions` / `materializer` 主链路迁入 v3 workbench。
- **不得**把旧 graph 节点 / edges / state machine 主链路迁入 v3 workbench。

清理原则：

- 旧 `harness/parity/*` 内部自闭合，仅由 `npm run test:kb-agent-parity` 脚本（`harness/parity/dev-runner.ts`）作为 dev 入口；无运行时入边的 parity 辅助文件可逐步移出主线。
- 旧 `harness/contracts/*` 仍被 `graph/graph.ts` / `graph/nodes/*` / `prompts/agent-planner-prompt.ts` 等运行时模块引用，迁移前**先保留**。
- 删除任何 legacy 文件前必须用 CodeGraph / grep 双重确认无运行时入边；只对"明确 dev-only 且无入边"的文件可执行。

禁止事项：

- 不创建 `harness-v4/` / `workbench-v2/` / `new-harness/` 这类分支目录。
- 不把 legacy 文件"软迁"到 workbench 同级再叫"新主入口"。
- 不在迁移期关闭主入口：旧 graph 链路与 v3 workbench 在 v3 主线确认完成前并存。

## 16. 当前目录结构状态

### 16.1 workbench/

- contracts/：SkillContract / ToolContract / PlannerDecision / SkillSource 接口定义
- registries/：SkillRegistry / ToolRegistry
- runtime/：BudgetGuard / ObservationStore / PlannerLoop
- guards/：flow-control-guard（禁止字段清单）
- evidence/：Evidence Gate
- self-check/：自检断言

### 16.2 skills/

- builtin/kb-retrieval/：内置知识库问答 Skill
- system/answer/：系统 answer tool
- user/：用户 markdown skill（loader / parser / register 完整链路）

### 16.3 shared/user-skill/

- user-skill-storage-types.ts：纯存储类型，不依赖 SkillContract
- user-skill-loader-types.ts：加载器类型，可依赖 SkillContract
- user-skill-rules.ts：纯校验函数（ID / filename / toolName / title / 危险 token 检测）
- index.ts：聚合导出上述三个子模块

### 16.4 storage/

- notebrain-plugin-storage.ts：思源插件内置数据 API 封装
- notebrain-storage-keys.ts：storage key 定义（内部校验 sessionId / filename）
- chat-session-store.ts：聊天会话存储（index.json + sessions/*.json）
- user-skill-store.ts：用户 skill 存储
- storage-migration.ts：旧存储到新结构的兼容迁移

### 16.5 tools/

- executors/：执行器（独立工具能力）
- readers/：读取器（独立读取能力）

### 16.6 workspace/

- 工作区管理（候选池、证据包）

### 16.7 scope/

- 作用域解析

## 17. 总结

v3 的核心是把 AI Planner 真正放回决策中心：

- Skill 描述"我能解决什么 / 工具使用建议 / 我有什么边界"。
- Tool 是独立能力，不感知阶段。
- Harness 只是 validate / execute / observe / return_to_planner。
- Evidence Gate / State Machine / allowedActions 全部降级为 observation / UI 状态 / 硬可用性。
- MCP / 自定义 Skill 通过 SkillRegistry / ToolRegistry 动态接入。
- 代码不再替 AI 安排路线。

## 15. v3 链路硬约束

为了让"Tool 执行 → Observation → Planner 再决策"真正闭环，v3 增加了如下硬约束：

### 15.1 PlannerLoop 每轮必读 ObservationStore

- `PlannerLoop.run` 每轮 `buildPlannerContext` **必须**从 `ObservationStore` 读最新 observations。
- `input.initialObservations` 只作为种子。
- `turn_started` / `tool_executed` / `tool_failed` / `tool_zero_hits` / `budget_exhausted` 必须在下一轮 PlannerContext 中可见。
- 代码不得根据 observation 自动选择下一工具。

### 15.2 预算耗尽 = observation，不 = 业务动作

- 预算全部耗尽时 append `budget_exhausted` observation。
- 允许 Planner 再看一次（如果未到 maxSteps），由 Planner 自己决定 answer / stop。
- 如果 maxSteps 也耗尽，则 fail closed；代码不替 Planner 生成 answer。
- `budget_exhausted` 不被代码映射到 answer / search / read。

### 15.3 终态唯一来源 = Planner 选 answer

- 最终回答**只能**由 Planner 明确选择 `answer` 工具来产生。
- 决策结构**不**含 `finalizeAnswer`。
- `answerDraft` **不**含真实 docId / blockId / path；只含 `evidenceMode` / `body` /
  `references`（安全句柄）。
- 真实引用映射由 `DisplayReferenceStore` 层处理（`register` / `resolve`）。

### 15.4 ToolSafety 对象结构

- v3 用对象表达 Tool 安全等级：
  `{ readOnly: boolean; canWrite?: boolean; requiresConfirmation?: boolean; permissionScope?: string }`
- 内置 KB 工具默认 `{ readOnly: true }`。
- 写入型 MCP 工具必须 `canWrite: true` 且 `requiresConfirmation: true`。
- v3 **不**引入任何自动确认逻辑（auto-confirm）。

### 15.5 SkillRegistry 会话级启用

- `SkillRegistry.getEnabledSkills(ctx)` **只**从 `ctx.userEnabledSkillNames` /
  `ctx.userDisabledSkillNames` 读取偏好，**不**通过全局单例 `setUserEnabled` 改写。
- 不同会话互不影响。
- `priority` 只影响展示顺序，不触发自动执行。

## 18. DisplayReference / ResourceRef 抽象

### 18.1 概念

引用是通用可展示来源，不是知识库专属证据：

- **ResourceRef**：Planner 可见的引用标识（真实 docId/blockId/url），底层实现细节仅工具内部使用。
- **DisplayReference**：通用引用展示结构，包含 `sourceType`、`title`、`snippet`、`url`、`provider`、`openAction`、`metadata`。
- **DisplayReferenceStore**：管理 DisplayReference 的注册和解析，提供 `register`、`resolve`、`resolveMany`、`size`、`reset` 方法。

### 18.2 sourceType

| sourceType | 说明 |
|------------|------|
| `siyuan_doc` | 思源文档（KB 工具产生的引用） |
| `web_page` | 网页 |
| `file` | 文件 |
| `mcp_resource` | MCP 资源 |
| `api_result` | API 结果 |
| `operation_result` | 操作结果 |
| `unknown` | 未知来源 |

### 18.3 约束

- 工具可以返回 `resourceId` / `referenceHandle` 给 Planner 使用。
- UI footer 展示 DisplayReference，后续可按 sourceType 打开思源文档、网页、文件或 MCP 资源。
- 代码不得从"存在已读资料"自动生成 references。
- 代码不得从普通候选自动生成 references（除非候选已被工具注册为可展示 DisplayReference）。
- 引用解析失败时返回结构化 observation，不由代码补引用、删回答或自动换下一步。
- `final_answer` 的 `references` 字段是通用 ResourceRef[]，来源不限思源文档。

## 19. 工具结果和错误 observation 标准化

### 19.1 ToolResult 结构化错误

```ts
interface ToolErrorDetail {
  errorCode: string;       // 错误码
  message: string;         // 中文错误描述
  recoverable?: boolean;   // 是否可恢复
  field?: string;          // 出问题的参数/字段名
  expected?: string;       // 期望的格式/范围/值
  received?: string;       // 实际收到的值（脱敏）
  hint?: string;           // 中文修正建议
}

interface ToolResult {
  ok: boolean;
  outputKind: ToolOutputKind;
  data: unknown;
  errorCode?: string;      // 向后兼容
  error?: ToolErrorDetail; // 结构化错误（推荐）
}
```

### 19.2 常见错误码

| 错误码 | 说明 |
|--------|------|
| `invalid_args` | 参数格式不正确 |
| `out_of_scope` | 超出作用域 |
| `resource_not_found` | 资源不存在 |
| `permission_denied` | 权限不足 |
| `tool_internal_error` | 工具内部错误 |
| `scope_missing` | 作用域缺失 |
| `prerequisite_missing` | 前置条件缺失 |
| `adapter_failed` | 适配器内部失败 |

### 19.3 ToolObservation 错误字段

```ts
interface ToolObservation {
  facts: {
    errorCode?: string;        // 向后兼容
    errorMessage?: string;     // 中文错误描述
    errorHint?: string;        // 中文修正建议
    errorRecoverable?: boolean; // 是否可恢复
    // ... 其他事实字段
  };
}
```

### 19.4 约束

- 错误 message / hint 必须中文，并给 Planner 可理解的修正信息。
- observation 不得包含真实 docId/blockId/path/internalMapping。
- 工具调用错了就错了，不要代码兜底，不要自动修参，不要自动换工具。
- Planner 根据 observation 自己决定下一步。

### 15.6 BudgetGuard 分类

- `read_previous_evidence` / `read_candidate_docs` 归入 read 预算。
- `search_scope` / `list_knowledge_map` / `list_scope_docs` / `focus_doc_scope` /
  `get_conversation_used_references` 归入 search 预算。
- `get_doc_tree_context` 归入 block 预算。
- 预算只影响硬可用性，不给建议动作。
- BudgetGuard 同时影响 Planner 可见 manifest availability（`getPlannerToolManifest` 可选传入 budgetGuard，
  budget 不足时 manifest availability 为 available:false / reasonCode:"budget_exhausted"）
  和 ExecutionEngine 执行层硬校验。

### 15.7 不再导出 builtinKbToolSchemas

- 旧 `builtinKbToolSchemas` 含 `undefined as z.ZodTypeAny` 占位，已删除。
- 不新增占位 schema 工厂；迁移旧 KB 工具时直接接入真实 Zod schema。
- `ToolRegistry.registerTool` 拒绝接受 `inputSchema` 为 undefined / 无 `parse` 的 Tool。

### 15.8 v3 self-check

- `assertNoPlannerVisibleExecutionOnlyTools`：execution-only helper 不得出现在 Planner 可见 manifest。
- `assertNoUndefinedToolSchemas`：所有 Tool 必须有真实 inputSchema。
- `assertNoFlowControlFieldsInSkill` / `assertNoFlowControlFieldsInTool` /
  `assertNoFlowControlFieldsInDecision` /
  `assertNoFlowControlFieldsInObservation`：禁止字段由统一 `flow-control-guard.ts` 维护
  （nextAction / recommendedAction / suggestedAction / fallbackAction / continuation /
  recovery / forcedTool / forcedNextTool / autoNextTool / preferredNextStep / shouldUseWhen /
  workflowSteps / nextStage / finalizeAnswer / recommendedState / fallbackIfNoHits /
  allowedNext / materializesTo / autoRoute，以及匹配 /^AUTO_.*ACTION$/ 的字段名）。
  检查递归使用 WeakSet 防循环，跳过 inputSchema / outputSchema。
  `runAllSelfChecks` 会遍历全部 tools，不跳过任何一个。
- `assertPlannerLoopReturnsObservationToPlanner`：运行时 probe，检查 PlannerLoop.run 是否调用 buildPlannerContext 且 observationStore 内有 observations。

## 16. 当前目录结构

```
agentic-rag/
  workbench/                         # 通用 Agent 工作台（不依赖具体 skill）
    contracts/                       # SkillContract / ToolContract / PlannerDecision
    registries/                      # SkillRegistry / ToolRegistry
    runtime/                         # PlannerLoop / PlannerContext / ExecutionEngine / ObservationStore / BudgetGuard
    guards/                          # flow-control-guard / planner-visible-data-guard / planner-visible-error
    evidence/                        # EvidencePack（句柄 ↔ 真实 anchor 映射）
    self-check/                      # 结构自检
    index.ts                         # 统一导出入口
  skills/                            # skill 包
    builtin/
      kb-retrieval/                  # 内置知识库检索 skill
        skill.ts                     # SkillContract 实现
        guidance.ts                  # prompt / guidance 文案
        register.ts                  # 注册到 SkillRegistry
        index.ts                     # 统一导出
        tools/                       # 真实 KB ToolContract 归属位置（list_knowledge_map 已迁移）
        adapters/                    # 对底层 executors/readers 的适配（kb-retrieval-tool-deps / list-knowledge-map.adapter）
        schemas/                     # Zod schema（list-knowledge-map.schema）
        observations/                # observationFormatter（list-knowledge-map.observation）
    system/
      answer/                        # system tool: answer
  create-agentic-rag-workbench.ts    # composition root：组合 workbench + skill 包
  tools/                             # 底层能力来源
    executors/                       # 原始执行器
    readers/                         # 原始读取器
  harness/                           # legacy quarantine（迁移前保留，不是 v3 workbench 的依赖来源）
  graph/                             # legacy quarantine（迁移前保留，不是 v3 workbench 的依赖来源）
```

说明：
- `workbench/` 是通用工作台，**不** import 任何具体 skill 包。
- `skills/builtin/kb-retrieval/` 是内置知识库检索 skill 包，可以 import `workbench/contracts` 和 `workbench/registries` 类型。
- `skills/builtin/kb-retrieval/tools/` 是 v3 ToolContract 实现，通过 adapters 注入 KB 依赖。
- `skills/builtin/kb-retrieval/adapters/` 适配底层 readers，注入 scope 和 resource ID mapping 保存器。
- `skills/builtin/kb-retrieval/schemas/` 存放 Zod schema 和输入输出类型。
- `skills/builtin/kb-retrieval/observations/` 存放 observation formatter。
- `tools/executors/` 和 `tools/readers/` 是底层能力来源，不是 v3 ToolContract 来源。
- `skills/system/answer/` 是 system tool answer，由 `create-agentic-rag-workbench.ts` 组合注册。
- `skills/user/` 是用户自定义 markdown skill 模块。
- `create-agentic-rag-workbench.ts` 是 composition root，同时 import workbench 和 skill 包。
- `harness/` 和 `graph/` 是 legacy quarantine，迁移前保留，但**不是** v3 workbench 的依赖来源。

## 17. Runtime Storage Layout

### 17.1 AI 知识库配置根目录

实际落盘位置由思源插件内部管理（通常在 `data/storage/petal/siyuan-homepage/` 下）。代码中使用相对 key 传给 `plugin.saveData` / `plugin.loadData`，不手动拼接物理绝对路径。

```
notebrain/                            # 插件数据空间内的相对 key 前缀
├── settings.json                     # AI 知识库全局设置 + 迁移状态
├── chat/                             # 聊天会话存储（分文件）
│   ├── index.json                    # 会话索引（轻量字段）
│   └── sessions/                     # 单个会话完整消息
│       └── <sessionId>.json
├── skills/                           # Skill 存储
│   └── user/                         # 用户自定义 markdown skills
│       ├── index.json                # 用户 skill 索引（元数据）
│       └── *.md                      # 用户 skill markdown 文件
├── mcp/                              # MCP 配置
├── cache/                            # 缓存
├── logs/                             # 日志
└── migrations/                       # 迁移记录
```

### 17.2 存储实现约束

- **不手动拼绝对路径**：代码中只使用相对 key（如 `notebrain/chat/index.json`）。
- **不使用 Node fs/path**：统一通过思源插件内置 `saveData` / `loadData` / `removeData` 方法访问。
- **适配层封装**：`notebrain-plugin-storage.ts` 封装插件实例管理，提供统一的 `saveData` / `loadData` / `removeData` 接口。
- **安全 key 生成**：`notebrain-storage-keys.ts` 负责生成安全的相对 key，防止路径穿越。

### 17.3 聊天存储设计

- `notebrain/chat/index.json` 只保存会话索引（id, title, createdAt, updatedAt, messageCount, lastMessagePreview, modelProfileId, pinned, archived）。
- `notebrain/chat/sessions/<sessionId>.json` 保存单个会话完整消息（messages, summary, references）。
- 打开软件时只读取 `index.json` 恢复聊天列表。
- 用户点开某个聊天时再读取对应 session 文件。
- 不允许把所有聊天消息继续放在一个大 JSON 中。
- sessionId 和文件名必须安全，禁止路径穿越。
- 写入 session 文件时优先使用临时文件再替换，降低写坏风险。

### 17.4 用户 Skill 存储设计

- `notebrain/skills/user/*.md` 保存用户 markdown skill 文件。
- `notebrain/skills/user/index.json` 只保存 id, title, filename, enabled, priority, updatedAt 等元数据。
- markdown 正文作为 Skill guidance。
- markdown skill 不允许作为 JS 代码执行。
- toolNames 只是声明本 Skill 说明中提到的全局工具名，不代表绑定、拥有、自动调用或优先顺序。
- 文件名使用安全 slug，不直接使用用户标题，防止路径穿越。

### 17.5 Legacy 数据源

- 旧 `kb-settings`（插件 storage 根目录）是 legacy 数据源。
- 旧 `kb-chat-sessions`（插件 storage 根目录）是 legacy 数据源。
- 迁移不删除旧文件，迁移状态写入 `notebrain/settings.json`。

### 17.6 约束

- AI 子系统运行时根目录是 `notebrain/`（相对 key 前缀）。
- 不要把用户 skill markdown 放进源码目录。
- 不要继续把 AI 知识库配置散放在插件 storage 根目录。
- 存储层只负责读写配置、聊天、skill 文本，不得根据聊天内容自动选择 search / read / answer。

## 18. Builtin Skills vs User Markdown Skills

### 18.1 Builtin Skills

- 由 TypeScript 代码实现，编译时确定。
- 通过 `SkillRegistry.registerSkill()` 注册。
- 实现完整的 `SkillContract` 接口。
- 例如 `builtin_knowledge_base_qa`。

### 18.2 User Markdown Skills

- 由用户在运行时创建，存储在 `notebrain/skills/user/` 目录。
- 使用 markdown + frontmatter 格式。
- 通过 `MarkdownSkillLoader` 加载并转换为 `SkillContract`。
- 不能定义 JS 执行代码，只能声明能力描述。

### 18.3 共同约束

- 两者都必须通过 `SkillRegistry` 接入。
- 两者都不得包含流程控制字段。
- 两者都不得绕过 Harness 直接执行动作。

## 19. SkillSource / SkillLoader Design

### 19.1 SkillSourceLoader 接口

```ts
interface SkillSourceLoader {
  readonly name: string;
  loadSkills(ctx: SkillLoadContext): Promise<SkillContract[]>;
}
```

### 19.2 设计原则

- System skill、Builtin skill、User markdown skill 都可以作为 SkillSource。
- SkillRegistry 只接收 SkillContract，不关心来源。
- 不允许 SkillSource 返回流程控制字段。
- 不允许用户 markdown skill 定义 JS 执行代码。

### 19.3 加载流程

1. `MarkdownSkillLoader` 从 `notebrain/skills/user/` 读取 markdown 文件。
2. 解析 frontmatter 和正文。
3. 转换为 `SkillContract`。
4. 通过 `SkillRegistry.registerSkill()` 注册。

## 20. User Markdown Skill Constraints

### 20.1 Frontmatter 支持字段

- `id`: skill 唯一标识
- `title`: 显示标题
- `enabled`: 是否默认启用
- `priority`: 展示优先级
- `toolNames`: 本 Skill 说明中提到的全局工具名

### 20.2 Markdown 正文

- 作为 `guidance` 字段内容。
- 描述 skill 的能力和使用建议。

### 20.3 边界约束

- 用户 skill 不能绕过 ToolRegistry / BudgetGuard / Permission / ExecutionEngine。
- 用户 skill 不能直接创建本地执行代码工具。
- 如果用户 skill 引用不存在的 toolName，只作为 unavailable observation 或加载诊断，不自动创建工具。
- 用户 skill 文件名使用 skill id 或安全 slug，不使用用户原始标题直接作为文件名。
- 读取时要防止路径穿越（例如 `../`）。
- 不要把真实 docId / blockId / path 放进 PlannerContext。

## 21. Answer Tool as System Tool

### 21.1 ToolSource 分类

- `builtin`: 内置工具，如 search_scope、list_scope_docs 等
- `mcp`: MCP 工具
- `skill`: Skill 提供的工具
- `system`: 系统工具，如 answer

### 21.2 Answer Tool 特性

- answer 是系统工具，不属于 kb-retrieval 私有工具。
- answer 的 source 为 "system"。
- answer 只承载 Planner 已经给出的 body / references（通用展示来源），校验后交给 Harness 生成 answerDraft。
- answer 不自动生成回答内容。
- answer 不根据证据状态改写 evidenceMode。
- answer 只能由 decision.type === "answer" 且 toolName === "answer" 触发。
- answer 仍需遵循 ToolContract 接口，不能绕过 ExecutionEngine。

### 21.3 与 Skill 的关系

- answer 不绑定特定 Skill。
- answer 可以被任何 Skill 的 toolNames 声明引用。
- answer 的可用性由 ToolRegistry / BudgetGuard / Permission 决定。
## 22. Builtin KB ToolContract Migration Status

- `list_knowledge_map` has been migrated as a v3 `ToolContract`.
- `get_conversation_used_references` has been migrated as a v3 `ToolContract`.
- Both tools are read-only standalone capabilities under `skills/builtin/kb-retrieval/tools/`.
- Both tools return only safe Planner-visible data through `ToolResult.data` and observation `content`.
- `list_knowledge_map` returns neutral notebook resource IDs, safe node resource IDs, sanitized titles, hierarchy, and counts only.
- `get_conversation_used_references` returns safe reference resource IDs, sanitized titles, and safe counts only.
- `search_scope` has been migrated as a v3 `ToolContract`.
- `search_scope` returns safe candidate resource IDs, sanitized titles, safe previews, ranks, scores, and counts only.
- `list_scope_docs` has been migrated as a v3 `ToolContract`.
- `focus_doc_scope` has been migrated as a v3 `ToolContract`.
- `list_scope_docs` returns only a safe document inventory for the current scope.
- `focus_doc_scope` consumes only explicitly selected resource IDs and returns only safe focused-scope document inventory.
- `read_candidate_docs` has been migrated as a v3 `ToolContract`.
- `read_candidate_docs` consumes only explicitly selected safe document resource IDs and returns safe content reference IDs, sanitized titles, safe snippets, and counts.
- `read_candidate_docs` uses a bottom-layer readonly document reader internally; `read_docs` remains execution-only and is not Planner-visible.
- `read_candidate_docs` stores real document mapping only through injected internal safe-mapping storage after safe output schema validation.
- `read_previous_evidence` has been migrated as a v3 `ToolContract`.
- `read_previous_evidence` consumes only explicitly selected safe displayed reference resource IDs or safe content reference IDs and returns safe content reference IDs, sanitized titles, safe snippets, and counts.
- `read_previous_evidence` uses a bottom-layer readonly document reader internally; `read_docs` remains execution-only and is not Planner-visible.
- `read_previous_evidence` stores real document mapping only through injected internal safe-mapping storage after safe output schema validation.
- These migrated tools do not read document body content unless that is their explicit capability.
- These migrated tools do not decide the next business action.
- These migrated tools do not call other KB tools or answer automatically.
- Legacy executors, graph, harness, and planner code remain quarantined references or bottom-layer compatibility code, not v3 flow sources.

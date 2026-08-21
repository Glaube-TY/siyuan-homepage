# Development workflow

## Locate before reading

- If `.codegraph/` exists, use `codegraph explore` before `rg` or opening files to locate symbols, callers, and blast radius.
- Read the complete execution path touched by the change. Do not browse unrelated modules.

## Ponytail: minimum effective change

Use Ponytail `full` for every coding task. Stop at the first option that works:

1. Skip work that is not required now.
2. Reuse an existing helper, type, component, token, registry, or pattern.
3. Prefer the standard library.
4. Prefer browser, CSS, Svelte, TypeScript, or SiYuan native capabilities.
5. Prefer an already-installed dependency.
6. Only then add the smallest implementation that satisfies the request.

Fix root causes at the shared boundary instead of adding guards to individual callers. Prefer deletion over compatibility layers, wrappers, speculative configuration, and parallel implementations. Do not simplify away validation, write verification, data-loss protection, permissions, security, accessibility, or explicit user requirements.

## 通用 Agent 架构原则

- Agent 必须保持通用、简洁和语言无关。全局提示只说明身份、运行环境、可用能力和工具使用边界，不得累积具体业务流程、历史故障补丁、测试步骤或特定问题的处置规则。
- 工具必须通过名称、简短用途、输入 Schema、返回契约和结构化错误码把能力说明清楚；工具选择、调用顺序和参数组合由模型依据这些契约自行决定。模型调用错误属于模型行为，不得用自然语言关键词、正则、词表或问题专用分支替模型决策。
- 模型经常误解能力时，先精简或修正系统提示、工具描述与 Schema；只有权限、数据安全、写入校验等确定性不变量才由运行时强制执行。
- 如果问题来自传输、状态恢复、上下文、工具执行、超时、重试、去重或终态交付等链路稳定性，必须修复共享链路根因，不得识别某种用户问题或正文措辞后打补丁。
- 新增 Agent 规则前先判断它属于提示与工具契约、确定性运行时约束，还是单次任务要求；单次业务要求不得进入全局 Agent 架构。优先删除过时规则和重复提示，不建立平行判断层。

## Small verification loop

- Run the narrowest existing verification that covers the change first.
- Add at most one small runnable check for new non-trivial logic; reuse an existing verifier when possible.
- Run typecheck, lint, and production build only when their scope is relevant to the change or before handoff.
- Do not launch browser or visual testing unless requested or the result cannot be verified otherwise.
- Before handoff, inspect the diff with Ponytail: remove unused files, one-use wrappers, dead exports, duplicate helpers, and speculative code.

## Performance boundaries

- Keep the production app bundle self-contained; `index.js` may run from a data URL, so do not disable `inlineDynamicImports` without a verified resource loader.
- Import charts from `src/utils/charts/echarts.ts`; register only the ECharts capabilities the project actually uses.
- Prefer modular or core third-party entry points. Do not import full `bundle` entry points when existing behavior uses only named modules.
- Put shared runtime helpers in `src/utils`; do not duplicate them in feature folders or keep internal legacy re-export paths.
- Keep non-critical startup work on the existing idle-task path and preserve unload cancellation, data validation, write verification, and failure isolation.

## 本地双 Agent 交接协议

本协议与具体 AI 客户端无关。所有角色通过项目根目录 `.agent-handoff/` 通讯；该目录必须保持 Git 忽略，禁止强制加入、提交或推送，也不得在清理忽略文件时删除。

### 角色与权限

- **规划/审查 Agent**：可以只读检查项目、工作区差异和不会改动受版本控制文件的验证结果。首次初始化或用户明确要求维护本协议时可修改 `AGENTS.md`、`.gitignore` 和交接文件；其他时候只能写 `.agent-handoff/LESSONS.md` 与 `.agent-handoff/NEXT_TASK.md`，不得修改业务代码、配置、依赖、生成物或提交历史。
- **执行 Agent**：负责实现 `NEXT_TASK.md` 中唯一的就绪任务；可以修改任务明确授权的项目文件，但不得修改 `LESSONS.md`、计划正文或任务范围。
- 角色不明确时，在改动业务文件前先向用户确认。同一时间只允许一个执行 Agent 处理一个任务。

### 规划与审查

- 规划前读取本文件、两个交接文件、当前代码和已有差异，保留用户已有修改。
- 每个新任务都必须全文覆盖 `NEXT_TASK.md`，使用新的任务编号并将状态设为 `ready`；不得在旧计划后追加新计划。
- 计划必须写清目标、事实与证据、必读文件、修改范围、明确不做、实施要求、验收标准、验证命令和关联经验。
- 审查时对照任务、实际差异和执行回执逐项核验。有问题则全文覆盖为新的修复任务；通过则全文覆盖为 `idle` 状态。
- `LESSONS.md` 只保存经代码、测试或实际故障验证且可复用的经验；合并重复项，修订或删除过时项，不把猜测、临时待办和完整任务历史写入其中。

### 执行与回执

- 每次执行前重新读取本文件、`LESSONS.md` 和 `NEXT_TASK.md`；只有状态为 `ready` 且任务编号明确时才能开始。
- 开始后只把任务状态改为 `running`；严格按范围实施并运行计划指定的验证，不得自行扩展目标或顺手重构。
- 完成后只把状态改为 `done`，并填写“执行回执”；无法继续时改为 `blocked`，写清已完成部分、阻塞证据和所需决策，不得用猜测绕过阻塞。
- 新发现的通用问题只能作为“候选经验”写入回执，由规划/审查 Agent 验证后再纳入 `LESSONS.md`。

### 共同边界

- 规划与执行端必须指向同一份本地项目根目录；不同克隆、独立工作树或远程沙箱不能依靠本目录完成通讯。
- 所有交接文件使用 UTF-8；不得写入密码、Token、个人隐私、机器专属秘密或大段源码/完整 diff。
- 交接文件缺失时，规划/审查 Agent 可以初始化；执行 Agent 必须停止并报告，不得自行编造任务。
- 文件通讯不会自动唤醒另一个对话；用户仍需发送简短的“执行交接任务”或“检查执行结果”来触发对应角色。

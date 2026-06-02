# KB Module Boundaries

本文件定义 src/features/kb 下各模块的职责边界和 import 规则。长期结构规则，非开发任务清单。

## 1. agentic-rag 目录分类

### 新主线

| 目录 | 职责 |
|------|------|
| workbench/ | 通用 Agent 工作台，Planner 循环 |
| skills/ | 能力说明和工具归属 |
| storage/ | 运行时数据读写 |
| shared/ | 纯类型与纯规则，可被 skills 和 storage 共同依赖 |
| create-agentic-rag-workbench.ts | Workbench 组装入口 |

### 可复用底层能力

| 目录 | 职责 | 说明 |
|------|------|------|
| tools/executors/ | 执行器 | 独立工具能力，不感知调用步骤 |
| tools/readers/ | 读取器 | 独立读取能力 |
| workspace/ | 工作区管理 | 候选池、证据包 |
| scope/ | 作用域解析 | 需确认不绑定旧 graph |

### Legacy Quarantine

| 目录 | 说明 |
|------|------|
| graph/ | 旧状态机图 |
| harness/ | 旧执行框架 |
| actions/ | 旧动作系统 |
| planner/ | 旧 Planner |
| runtime/ | 旧运行时上下文（新在 workbench/runtime/） |
| prompts/ | 旧提示词（新在 workbench/prompts/ 或 skills/） |
| safety/ | 旧安全守卫（新预算守卫在 workbench/runtime/budget-guard.ts） |
| evidence/ | 旧证据（新在 workbench/evidence/） |
| run-agentic-rag-turn.ts | 旧入口 |
| debug/ | 调试工具 |

## 2. 其他 services 模块

| 模块 | 职责 | 状态 |
|------|------|------|
| settings/ | 配置服务 | 独立 |
| session/ | 会话持久化 | legacy |
| qa/ | 模型/provider 通信 | 独立 |
| siyuan/ | 思源 API 封装 | 独立 |
| siyuan-sql-retrieval/ | SQL 检索 | 独立 |
| doc-graph/ | 文档图 | 独立 |

## 3. Import 规则

### 3.1 workbench/ 允许 import

- workbench/ 内部模块
- shared/flow-control/（纯常量和纯检测函数）
- zod
- siyuan 类型

### 3.2 workbench/ 禁止 import

- skills/（SkillRegistry 通过接口注入）
- storage/（通过适配器注入）
- shared/user-skill/（workbench 不得 import shared/user-skill）
- shared/（除 shared/flow-control/ 外）
- components/（UI 层）
- stores/（UI 状态）
- settings/（配置服务）
- qa/（模型通信）
- graph/、harness/、actions/、planner/、runtime/、prompts/、safety/、evidence/（legacy）

### 3.3 skills/ 允许 import

- workbench/contracts/（接口定义）
- workbench/guards/（守卫）
- workbench/registries/（注册中心，仅 register 入口）
- shared/user-skill/（纯类型和纯规则）
- skills/ 内部模块

### 3.4 skills/ 禁止 import

- storage/（存储实现）
- workbench/runtime/（运行时，通过接口注入）
- components/、stores/（UI 层）
- settings/、qa/（业务层）
- graph/、harness/、actions/、planner/（legacy）

### 3.4.1 skills/builtin/kb-retrieval/ 允许 import

- workbench/contracts/（接口定义）
- workbench/guards/（守卫）
- workbench/registries/（注册中心，仅 register 入口）
- tools/readers/（底层读取能力）
- shared/flow-control/（纯常量和纯检测函数）
- skills/builtin/kb-retrieval/ 内部模块

### 3.4.2 skills/builtin/kb-retrieval/ 禁止 import

- old harness/contracts/（旧框架）
- graph/、planner/、actions/（旧流程控制）
- storage/（存储实现）
- components/、stores/（UI 层）
- settings/、qa/（业务层）

### 3.5 storage/ 允许 import

- siyuan Plugin 类型
- storage/ 内部模块
- shared/user-skill/user-skill-storage-types（纯存储类型）
- shared/user-skill/user-skill-rules（纯校验函数）

### 3.6 storage/ 禁止 import

- workbench/（工作台）
- skills/（能力说明）
- shared/user-skill/user-skill-loader-types（含 SkillContract 依赖）
- components/、stores/（UI 层）
- settings/、qa/（业务层）
- graph/、harness/、actions/、planner/（legacy）

### 3.7 shared/ 允许 import

- workbench/contracts/（仅接口定义）
- shared/ 内部模块

### 3.7.1 shared/flow-control/ 职责

- 存放 flow-control 禁止字段纯常量和纯检测函数
- 可被 workbench/guards 和 shared/user-skill-rules 使用
- 不得依赖 workbench / skills / storage / UI / legacy

### 3.7.2 shared/flow-control/ 禁止 import

- workbench/（工作台）
- skills/（能力说明）
- storage/（存储实现）
- components/、stores/（UI 层）
- graph/、harness/、actions/、planner/（legacy）

### 3.8 shared/ 禁止 import

- storage/（存储实现）
- skills/（能力说明）
- workbench/runtime/、workbench/registries/（运行时）
- components/、stores/（UI 层）
- settings/、qa/（业务层）
- graph/、harness/、actions/、planner/（legacy）

### 3.9 components/ 允许 import

- stores/（UI 状态）
- types/（类型）
- constants/（常量）
- utils/（工具）
- settings/（配置读取）

### 3.10 components/ 禁止 import

- workbench/、skills/、storage/、shared/（AI 子系统）
- tools/、executors/、readers/（底层能力）
- graph/、harness/、actions/、planner/（legacy）

### 3.11 stores/ 允许 import

- types/（类型）
- constants/（常量）
- session/（会话持久化，legacy）
- qa/（模型通信）

### 3.12 stores/ 禁止 import

- workbench/、skills/、storage/、shared/（AI 子系统）
- components/（UI 层，避免循环依赖）

## 4. 职责边界

### 4.1 工作台（workbench/）

- 通用 Agent 工作台
- 只做 validate / execute / observe / return_to_planner
- 不替 Planner 选工具
- 不包含具体 Skill 实现

### 4.2 能力说明（skills/）

- 只负责 Skill 描述和工具归属
- 不包含执行逻辑
- 不自动调用工具
- 用户 markdown skill 不允许作为 JS 代码执行

### 4.3 存储层（storage/）

- 只负责读写数据
- 不包含业务逻辑
- 不根据内容自动选择工具
- 不使用 fs/path，不拼接绝对路径

### 4.4 共享层（shared/）

- 存放纯类型与纯规则
- 可被 skills/ 和 storage/ 共同依赖
- 不得依赖 storage / UI / workbench runtime / legacy
- shared/user-skill 拆分为：
  - user-skill-storage-types：纯存储类型，不依赖 SkillContract
  - user-skill-loader-types：加载器类型，可依赖 SkillContract
  - user-skill-rules：纯校验函数
- storage 不得 import loader types（含 SkillContract 依赖）

### 4.5 底层能力（tools/）

- 独立工具能力
- 不知道自己在哪一步被调用
- 不返回建议下一步信息

## 5. 用户 Skill ID 和 Filename 规则

### 5.1 ID 规则

- entry.id 是运行时正式 id，来自 index.json
- frontmatter.id 只用于校验：空则允许，存在且与 entry.id 不一致则跳过 skill 并 diagnostic
- SkillContract.name 统一生成为 user_${entry.id}
- entry.id 必须匹配 `/^[a-z0-9_-]+$/`（小写 slug）
- 不要求用户写 user. 前缀
- display title 可以中文

### 5.2 Filename 规则

- filename 必须匹配 `/^[a-z0-9_-]+\.md$/`
- 禁止路径穿越：`../`、`/`、`\`
- 文件名和 id 的关系由 index.json 管理

### 5.3 toolNames 规则

- toolName 必须匹配 `/^[a-z0-9_-]+$/`
- 禁止 read_docs / read_block_context（execution-only helper）
- 禁止 flow-control 关键词（大小写无关）
- buildPromptSection 只展示 ctx.toolManifest 中存在的工具

### 5.4 title 规则

- 运行时 title 以 entry.title 为准，为空时回退 entry.id
- frontmatter.title 不再覆盖 entry.title，仅作为导入/校验信息
- entry.title 必须：非空或回退 id、长度不超过 100、不包含换行和控制字符、不包含 forbidden tokens
- 校验函数：`validateEntryTitle`（内部）

### 5.5 priority / enabled 规则

- 运行时 priority 以 entry.priority 为准
- 运行时 enabledByDefault 以 entry.enabled 为准
- frontmatter.priority / frontmatter.enabled 不再覆盖 index entry
- 不允许用户 markdown frontmatter 绕过 index.json 改变启用状态或排序

### 5.6 diagnostic 规则

- diagnostic.message 不回显用户原始 toolName、title、markdown 内容
- filename 和 entryId 可保留（已通过安全校验）
- diagnostic 只给设置 UI 或日志，不进入 Planner observation

## 6. SkillLoadContext 规则

- SkillLoadContext 不包含当前问题
- SkillSource 只根据硬条件加载 skill
- Skill 是否适合当前问题，由 Planner 自行判断

## 7. 新代码 Import 入口

新代码应从具体模块入口导入，不要从 agentic-rag/index.ts 导入 legacy 聚合导出。

推荐入口：
- workbench/contracts/
- workbench/registries/
- workbench/runtime/
- workbench/guards/
- shared/flow-control/
- shared/user-skill/
- skills/builtin/
- skills/system/
- skills/user/
- storage/
- tools/executors/
- tools/readers/
- create-agentic-rag-workbench.ts

## 8. kb-session-store

kb-session-store.ts 是 legacy large store，当前不大拆。

## 9. 聊天存储方向

长期方向：index.json + sessions/*.json。
## 10. v3 KB ToolContract Migration Boundary

- `skills/builtin/kb-retrieval/tools/list-knowledge-map.tool.ts` owns the v3 `list_knowledge_map` contract.
- `skills/builtin/kb-retrieval/tools/get-conversation-used-references.tool.ts` owns the v3 `get_conversation_used_references` contract.
- Both tools are read-only and independent.
- Planner-visible output is limited to safe handles, sanitized titles, hierarchy or reference counts, and truncation flags.
- Real `docId`, `blockId`, `notebookId`, physical path values, and internal mappings must stay outside `ToolResult.data`, observation facts, observation content, and Planner prompt text.
- Adapters may use bottom-layer readers or injected providers, but they must not import legacy graph, harness contracts, planner, or actions.
- Legacy executor implementations remain legacy references only and are not v3 flow sources.

# Agent Runtime 开发规则

## 适用范围

修改 Agent、MCP、Skills、Provider、工具注册、Profile、会话、上下文、记忆、工作台、机器人或自动化时读取本文件；产品状态和路线另见 `product-scope.md`。

## 共享运行时

- 所有入口通过 Profile 和共享 Agent runtime 组装能力；不得为主页、机器人、后台任务或其他入口重写模型请求、tool loop、上下文压缩、确认、恢复、trace 或会话存储。
- Provider 原生 tool call 是控制平面。Runtime 负责消息组装、schema、流式解析、工具派发、匹配 ID 的 `role=tool` 结果、取消、权限、循环上限、重复写保护和合法历史配对；模型负责工具选择、参数和普通 assistant 最终文本。
- Agent 控制流必须语言无关。不得根据用户问题或模型正文的关键词、正则、词表、前后缀判断意图、工具需求、澄清、完成、重试或终态；正式 ID/URL/JSON/XML/SQL/Shell 解析、注入防护、脱敏，以及对已经结构化提供的搜索/过滤条件做解析除外。
- 模型误用工具时先修系统提示、工具描述和 Schema，不添加问题专用自然语言分支；传输、状态恢复、上下文、超时、重试、去重和终态问题修共享边界。

## 运行身份与能力层

- 入口（知识库、机器人、状态语、划词、主页、后台任务）通过版本化 Profile 进入同一组装入口；统一使用 `sessionId`、`runId`、`stepId/stepIndex`、`eventId`、`correlationId`。
- 能力按模型生成、上下文对话、工具 Agent、知识/记忆、MCP/Skills/领域扩展、后台 Job 六层组织；轻量入口只加载需要的层级，状态语不因统一而进入完整工具循环。
- 主页 Agent 只消费真实注册且经 Profile 过滤的能力快照；组件复用已有业务工具，不在组件内创建 Agent loop。

## Tool Contract

- Provider-visible 工具使用小而稳定的聚合列表，由模型在工具内选择 `action`。每个工具必须声明 name/title/description、输入 JSON Schema、安全元数据（`readOnly`、`canWrite`、`requiresConfirmation`）、执行函数和结构化结果（`ok`、`content`、`summary`、`errorCode`）。
- 参数必须实际影响执行、范围、输出或安全；工具不拥有对话流程，不能用 `reason/comment/note` 参数承载说明，使用指导放在 description/inputHint/boundary。
- Skills 是边界、术语、证据规则和使用建议的指令包；不拥有工具、不执行代码、不替模型选择工具或规定固定顺序，也不替代 Runtime 权限检查。没有关键词 Skill router、JSON Planner、`final_answer` 工具或额外 JSON 控制协议。

### 联网搜索

- `web_search` 是普通的 provider-visible Agent Tool；Knowledge Chat、Robot 和其他 Web Capability 入口共享同一 Tool/Router，不复制 Provider 实现。
- `smart` 模式由模型自主决定是否调用；`required` 只有在用户选择的结构化状态下，Runtime 才能要求本轮成功调用并获得有效候选；`off` 不向模型暴露 `web_search`。
- Runtime 不根据用户自然语言关键词、正则或词表判断联网需求；模型通过 Tool Call 结构化填写 `query`、`freshness`、`topic`、日期和域名过滤参数。
- Router 只消费结构化 Tool 参数及 Provider/Model capability，不重新理解或改写用户自然语言 query。
- 搜索结果是候选来源；重要事实需读取网页内容后才作为证据。Native-first → fallback 是搜索执行策略，不属于自然语言 Tool Selection。

## 权限、终态和上下文

- 只读工具可免确认；写工具默认需要 Runtime 权限策略和用户确认。trusted 写工具仍需预览、`confirmationId`、diff、安全检查、重复写保护和真实结果反馈。
- 最终回答只能依据真实 tool result，不能声称未验证的写入成功。运行状态从结构化事件、Observation、错误码和 revision 投影，模型声称完成不能替代环境回读。
- 权限取平台限制、Profile、用户设置、运行环境和单次授权的交集；未授权能力不能进入工具清单、系统提示或执行入口。轻量入口不加载完整 Agent loop，后台任务不因无人值守获得全部工具。
- 上下文按不可压缩约束/目标、当前状态/可靠结果、最近原文、分层摘要、按需检索的旧内容分层；每轮记录 Context Manifest。写结果未知先回读，只有安全检查点允许恢复。
- Provider 历史提交前必须保证 assistant tool call 紧邻匹配的 tool result，丢弃孤立或不完整配对；压缩时保留最新合法配对。搜索结果是候选，读取内容才是证据。

## 扩展能力

- 临时工作台在工具边界清理 HTML：拒绝脚本、事件、任意样式、外链、表单和非法思源 ID；首期只允许打开文档/块，不把写操作藏进 HTML。
- 长期记忆只保存有价值的身份、偏好、目标、约束、项目、关系、决定和经历，并保留来源/时间等可解释信息；不保存临时请求、工具输出、助手猜测、第三方事实、密码、令牌、验证码或高敏感人格推断。每轮只注入少量相关记忆。
- Agent 自动化与通知分离。后台任务继承目标 Profile 权限；高风险、不可逆或结果未知动作不能绕过保护；同一时间槽幂等且不并发启动同一任务，运行记录有界且不记录 API Key、完整正文、本地绝对路径或无必要推理。

### 临时工作台

- AI 只能组合白名单语义标签和 `wb-*` 视觉类；完整 HTML 存在 `notebrain/workbenches/`，入口只保存 ID，统一管理来源、引用和空间占用。
- 聊天只显示打开工作台入口，内容由项目统一弹窗容器展示；首期只允许打开思源文档/块，不把写操作藏进 HTML。该能力可按 Profile 给本地聊天、机器人、主页或后台任务使用。

### 全局记忆

- 旧版“单一思源文档即全局记忆”已停用，不迁移或删除用户原文档。当前使用本地 `profile.json`、`index.json`、`items/{id}.json`，Agent 只接触语义 ID，不接触文件路径。
- 记忆类型包括身份、偏好、目标、约束、项目、关系、决定和经历；记录重要度、置信度、强化次数、来源和时间，由 `memory_manage` 搜索、记住、更新和遗忘。
- 知识库与机器人共享记忆；状态语只读，划词入口无状态。自动学习、搜索、筛选、编辑、置顶和删除服从记忆中心设置；低风险自动学习可免逐次确认，关闭时写入仍需确认。

### Agent 自动化

- 链路固定为 `Job Definition → Scheduler → Sensor（仅心跳）→ Background Agent Profile → Run Ledger`；支持一次、每日、每周、每月、固定间隔和心跳任务。
- Job、可变状态和运行记录分片保存在 `notebrain/agent-automation/`。支持暂停、编辑、复制、删除、运行一次；结果可只留运行记录，或发送到本地 AI/机器人，并可新建或绑定已有会话。
- 机器人会话只显示当前默认/活跃 Provider 对应的 QQ、微信或飞书会话，不混用渠道路由。Runner 离线时按策略跳过或只补最新一次，不批量回放错过任务。
- 跨端边界：桌面/Electron 仅承诺应用运行期间的桌面、QQ、飞书能力；Kernel/Docker 仅承诺 Kernel-safe Agent、Sensor 和外联出站；移动端仅承诺任务管理、结果查看和已注册固定通知；普通浏览器仅承诺标签页打开期间运行。没有在线 Runner 时不能伪装成准时执行。

### 对外 MCP 服务

- 外部 MCP 能力只通过官方 `siyuan.agent.registerCapability` / `unregisterCapability` 注册和清理；不在插件内另起 HTTP、SSE 或 stdio Server。
- Robot 与外部 MCP 共享同一份 Kernel `NativeToolRegistry`；外部服务只按固定的顶层工具和 action 白名单生成过滤后的 Schema，不复制业务实现。
- 默认只读，仅限明确授权且已审核的写操作；`homepage_components` 仅允许收藏的 `homepage_favorites.add/remove/move_to_group/create_group/rename_group/delete_group/reorder` 七项及纪念日的 `homepage_anniversary.add/update/archive/restore/delete_permanently/create_category/update_category/archive_category/delete_category` 九项显式白名单。永久删除事件及删除分类须显示不可恢复后果，并使用明确的危险操作确认按钮；仅删除插件记录，不删除思源文档。每次调用仍在 Kernel 重新检查完整服务 active、当前会员状态、精确 action 白名单、aggregate 元数据、`isReadOnlyCall` 和严格 `preflightValidate`，不能仅信任客户端 Schema。
- `siyuan_database` 仅开放 `update_cell`、`clear_cell` 和受限 `add_rows/remove_rows/add_key/remove_key` 写入。前两项的外部 Schema 和运行时均严格限定 `databaseId/rowId/keyId/expectedFieldName` 四项必填，`update_cell` 另需非空、最多 1000 字符的 `valueText`；只操作一个普通 text 单元格，禁止额外参数及其他类型，内部工具契约不变。清空前必须读到非空原值，预览须显示旧值、空文本目标及移除后果，并使用“确认清空”按钮。授权身份必须同时匹配工具名和 action，未知业务域拒绝。预览及回读复用 `readAttributeViewSafeOutput` 的原始数据路径（500 行、含 raw、跳过可能保存视图的渲染），不自动映射绑定块；目标、字段名/类型或完整旧值无法核对时拒绝确认。内存审批仅存有界目标摘要及指纹，文本截断须明确标记。
- 外部 `add_rows` 严格互斥地接受 `databaseId` 与单项 `detachedRows:[{title}]` 或单项 `blockIds:[blockId]`，禁止附加字段、默认值和批量；脱离块标题须为已去首尾空白的 1–200 字符且无控制字符。关联模式首期仅支持可用笔记本中文档直属普通段落，经 `getBlockByIdReadonly` 精确定位，核对正文格式、文档、父块、属性及官方绑定映射，已关联或身份不明时拒绝。预览只保留有界纯文本摘要，明确区分原始 blockId 与执行后生成的 itemID。
- 两种新增均沿用原有业务工具和确认队列，允许可完整核对的空库；已有条目最多 500 条，字段、原始行身份、业务值或视图顺序无法完整核对时拒绝。批准后复核数据库及原始块状态，写后须证明只新增一条、真实新 itemID 与模式及绑定关系匹配、原有记录/字段/顺序不变。关联还须核对原始正文、格式、文档、父块和其他属性不变；3.8.8 允许新增目标 `custom-avs` 关联、派生 `av-names` 及同步时间/hash 的系统变化，不将其当作正文变更。partial 或无法验证时结果未知且禁止重放；不影响内部 Agent 原有最多 20 条的新增契约。
- 外部 `remove_rows` 只接受 `databaseId`、单项真实 itemID 数组 `rowIds` 和单项完整精确标题数组 `expectedTitles`，拒绝绑定块/单元格/字段 ID 冒充及额外参数。审批显示条目类型、真实 itemID、移除后果和适用的原始块/文档身份，使用“确认移除条目”危险按钮。脱离块移除独立记录及字段值；绑定块首期只解除文档直属普通段落的关联。批准后复核完整数据库和原始块状态；写后须证明仅少一条、其他字段/成员/顺序不变，原始正文、格式、父块和文档保留，且仅移除目标数据库关联。业务事务 `removeAttrViewBlock.srcIDs` 始终使用 itemID；内部批量参数保留最多 20 条，完整读取最多 500 行，范围不完整时拒绝，提供标题时精确匹配。事务开始后异常返回现有 `write_result_unknown` 不可恢复终态，使内部 Agent 停止；外部回读不确定仍返回 `mcp_write_result_uncertain`，禁止重放。
- 写入采用独立的 Kernel 内存开关，默认关闭，不改变既有服务设置持久化 Schema。服务关闭、会员失效和 shutdown 立即撤销运行期授权与所有未执行确认；重启不恢复写入许可。切换写入 Schema 沿用注册回滚，失败尽力恢复只读。
- 外部 `add_key` 只接受 `databaseId/keyName/keyType` 三项必填，类型固定 text，名称须已去首尾空白、1–50 字符且无控制字符；复用原有字段工具和 `normalizeFieldName` 拒绝重名，内部其他类型契约不变。新增前最多 29 字段、500 条目，审批显示库名/ID、新名称、普通文本、前后数量及默认追加位置，targetId 为 null。完整原始状态指纹用于批准后复核；写后须返回真实新 keyId，证明只追加一个字段、旧字段顺序/条目/业务值及库身份不变。首期只支持字段列完整且顺序与原始字段一致的 table 视图，3.8.8 仅允许末尾追加匹配新 keyId 的默认列配置，其余视图配置逐项保持；范围不完整或结构变化无法解释时拒绝确认或返回结果未知。原始写 API 开始后异常返回 `write_result_unknown` 不可恢复终态，外部回读未知不重放；其他字段类型和视图写入仍拒绝。
- 外部 `remove_key` 仅接受必填 `databaseId/keyId/expectedKeyName`，名称已去首尾空白、1–50 字符且无控制字符，须精确匹配普通 text 字段；禁止额外参数，不改变内部其他类型契约。沿用 30 字段、500 条目、1MB 上限，完整核对原始列和行身份，分别统计总条目、原始单元格、非空文本、已有空值及无记录数量，影响数为字段本身加非空值数量。预览显示永久移除字段及全部值、插件不可撤销的警告，使用“确认删除字段”危险按钮。首期只支持字段列完整且顺序一致、无实际筛选/排序/分组/冻结及未知配置的 table 视图；批准后复核完整原始状态，写后仅排除目标原始列及各视图对应列，严格核对其他字段/值/条目/顺序及库身份。只调用原字段删除业务工具，保持 removeRelationDest 默认 false；写入开始后异常为 `write_result_unknown` 不可恢复，回读不确定为 `mcp_write_result_uncertain`，均禁止重放。原生 API 无完整原子 CAS，最后复核与删除间仍有并发窗口。
- 外部 `diary_task.manage_task` 仅开放严格的 `create + task={taskname}`、`set_status + target={blockId} + completed`、`update + target={blockId} + task={taskname}` 和 `delete + target={blockId} + deleteMode=delete|log`，内部 Agent/Robot 契约保留。审批用严格只读索引及权威文档身份定位现有今日日记，复用模板映射定位 day 根下 newTasks；不创建日记、不修模板、不清理或重建索引。已有任务首期仅支持结构完整、无复杂字段、隐藏属性或项目关系的普通任务；核对原生块树、Markdown、属性及任务索引，状态或名称无需变化时拒绝确认。直接删除仍须显式指定 deleteMode=delete、不写日志，预览显示真实任务身份、当前状态、数量及风险，使用“确认删除任务”危险按钮；首期只接受仍有其他任务保留的列表，拒绝最后一项及无法核对的列表聚合结构，不删除父列表。批准后复核本地日期、配置、文档及区域完整状态，通过内部目标约束传至原业务工具；修改前由 Kernel 内部闭包再次只读复核，不按名称查找替代任务。写后核对真实任务身份、区域、请求范围内的变化、原有块及其他区域保留；索引 partial 或回读不确定均停止重放，不声称未写入。删除后还须核对任务及直属段落确实不存在、父列表仅发生匹配剩余成员的派生文本变化、其他块和索引保留，直接删除不新增日志；删除请求发出后异常同样视为结果未知。显式 log 模式只使用已存在且唯一的同日 taskLog，复用业务纯函数生成真实文档 ID 与本地日期来源的日志，使用“确认记录日志并删除”危险按钮。内部受控目标禁止调用创建日记入口；追加日志后须用插入回执和原生块身份核对仅新增一份预期日志、原任务及其他区域未变，才能删除任务。最终以日志已验证状态核对删除及索引；两次写入不具原子性，日志请求发出后的失败或回读不明均为结果未知，不补写、不重删、不自动回滚日志。原生块写入无原子 CAS，最后复核至写入仍有并发窗口。
- 普通外部 MCP 客户端优先使用思源官方 OAuth；管理员 API Token 属于内核高权限凭据，不能视为普通受限 MCP 凭据。Kernel 控制 RPC 的人工确认不能约束持有管理员 Token 的程序；OAuth MCP 客户端仍须经过 action 白名单、运行期授权和逐次确认。
- 写操作按业务域读取受控目标信息及收藏、纪念日或数据库业务状态，生成含明确操作、目标、数量及后果的有界内存预览；目标未知时拒绝创建确认，界面以纯文本展示。待确认 ID 由插件控制 RPC 同意或拒绝，同意不立即执行。客户端用相同工具、action、完整参数及 ID 重试，Kernel 检查有界结构化 JSON 指纹（对象键排序、数组保序）、两分钟有效期及授权状态，重新读取并比对审批时的状态摘要；状态变化或读取失败使确认失效，通过后才原子消费批准并调用既有业务工具，保留业务层已有的冲突检查。确认 ID 必须使用安全随机源，最多保留 20 条，不复用 Robot 确认。
- 数据库更新必须报告单条全成功；清空须核对结果中的目标身份及完整旧值指纹，再回读原始带身份的空 text 记录，缺失记录或无法证明空值时返回结果未知。两项操作都须回读目标文本、身份和不相关普通字段；partial、failed 或无法确认均返回结果未知，不能自动重试。思源单元格接口没有原子 CAS 保证，最后复核至实际写入间仍有极短并发窗口。
- 写后通过现有业务读取能力核对目标；任何执行或回读结果不确定都明确返回未知状态，禁止自动重放。ID、原始参数、凭据和敏感内容不得进入长期存储或日志。
- 设置使用独立的 `homepage-mcp-server-settings` 严格 schema；缺失按关闭处理，损坏只进入错误状态且不覆盖原值。会员失效时注销能力但保留开启偏好，恢复后再注册。
- 注册失败必须回滚已成功注册的能力；注销按逆序执行并保留失败项。输出只返回有界结构化数据或固定错误，不返回原始 envelope、堆栈、密钥、令牌、身份标识或绝对路径。
- 前端只通过 Kernel 控制 RPC 读取和修改状态，不在前端伪造关闭状态；会员事件触发轻量 reconcile，Kernel 以低频定时器补偿，并在 shutdown 清理定时器和能力。
- 既有外部 MCP Client 继续使用 `settings.mcp`，与主页对外 MCP 服务的开关、状态和生命周期完全分离。
- 对外 MCP 服务属于主页设置 → AI 中心的全局 Agent Platform 设置；不得挂载到 AI 知识库对话自身的 MCP Client 设置页。

涉及 Agent runtime 的改动按影响范围运行 typecheck/build 和相关功能检查；不要因为修改普通 UI 而加载本文件。

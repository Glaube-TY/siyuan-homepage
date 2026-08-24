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

涉及 Agent runtime 的改动只运行覆盖该链路的既有 verifier；再按影响范围运行 typecheck/build。不要因为修改普通 UI 而加载或验证本文件。

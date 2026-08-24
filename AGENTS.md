# 项目 AI 规范

本文件只管理仓库级边界、按需规则路由和本地交接，不承载主题、Agent、SQL、通知或性能的具体实现规则。功能规则放在 `docs/agent/`，只在任务涉及对应领域时读取；不要把它们复制回本文件，也不要再建立新的 `first-principles` 文档。

## 工作前提

- 先检查当前工作区差异并保留用户已有修改；修改前读完实际相关路径，修改后检查 diff 和与范围匹配的验证结果。
- 只读取当前任务需要的规则和代码。一个任务跨越多个领域时读取对应的多个 `docs/agent/*.md`；不相关的规则不要加载。
- 具体功能规则缺失或与当前架构冲突时先报告并修正规则分层，不用猜测补齐，也不在调用方临时添加平行约束。

## 全局边界

- 所有功能限定在插件自己的作用域内，不破坏思源本体、用户主题、其他插件或用户文档；操作应可解释、可回退、可关闭。
- 不覆盖用户已有设置、业务数据、凭据、通知历史或其他持久化内容。读取失败、文件损坏或状态未知不得当作空数据；涉及写入时保留校验、回读和数据损失保护。
- 不为了省事省略权限、安全、无障碍、错误处理或用户明确要求；报告结果必须以实际代码、验证和运行结果为准。

## 按需开发规则

开始修改前按任务范围读取对应文件：

- UI、Svelte、CSS/SCSS、布局、主题、响应式或无障碍：[`docs/agent/ui-design.md`](docs/agent/ui-design.md)。
- Agent、MCP、Skills、Provider、工具、Profile、会话、上下文、记忆、工作台、机器人或自动化：[`docs/agent/agent-runtime.md`](docs/agent/agent-runtime.md)。
- SQL、索引、SQLite、业务数据、视图 scope、JSON 存储、schema/version 或迁移：[`docs/agent/data-and-indexing.md`](docs/agent/data-and-indexing.md)。
- 系统/移动通知、Webhook、飞书、通知规则、历史或移动计划：[`docs/agent/notification-center.md`](docs/agent/notification-center.md)。
- 启动、bundle、ECharts、定时器、可见性、并发或大数据加载：[`docs/agent/performance.md`](docs/agent/performance.md)。

`docs/agent/` 是按需开发规则目录，不是全局第一原则目录。各文件引用的 `docs/` 架构文档负责当前实现事实；两者冲突时先修正规则和文档边界，再改代码。

## 本地双 Agent 交接

`.agent-handoff/` 只用于同一项目根目录的本地通信，必须 Git 忽略，不得强制加入、提交、推送或清理删除。

- 规划/审查 Agent 负责只读检查、写入明确的 `NEXT_TASK.md` 和复核回执；只有首次初始化或用户明确维护协议时才改本文件、`.gitignore` 或交接文件，不能改业务代码。`LESSONS.md` 只保存已验证的可复用经验。
- 执行 Agent 开始前必须重读本文件、`LESSONS.md` 和 `NEXT_TASK.md`，只有明确编号且 `status: ready` 才能执行；严格限于任务范围，不改计划正文或 `LESSONS.md`，完成写 `done` 回执，受阻写 `blocked` 证据。
- 双方必须使用同一项目根目录；交接文件用 UTF-8，不写密码、Token、隐私、机器秘密、大段源码或完整 diff。同一时间只允许一个执行 Agent；角色不明确或执行交接文件缺失时先报告。

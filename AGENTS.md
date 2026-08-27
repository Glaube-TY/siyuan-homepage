# 项目 AI 规范

本文件只管理仓库级边界、按需规则路由和本地交接，不承载具体实现规则。功能规则放在 `docs/agent/`，只在任务涉及对应领域时读取。

## 工作前提

- 任何参与本仓库工作的 AI Agent 在审查、规划或修改前，必须首先读取本文件，再按任务范围读取对应的 `docs/agent/` 规则和实际相关代码。
- 先检查当前工作区差异并保留用户已有修改；修改前读完实际相关路径，修改后检查 diff 和与范围匹配的验证结果。
- 只读取当前任务需要的规则和代码。一个任务跨越多个领域时读取对应的多个 `docs/agent/*.md`；不相关的规则不要加载。
- 具体功能规则缺失或与当前架构冲突时先报告并修正规则分层，不用猜测补齐，也不在调用方临时添加平行约束。

## 全局边界

- 所有功能限定在插件自己的作用域内，不破坏思源本体、用户主题、其他插件或用户文档；操作应可解释、可回退、可关闭。
- 不覆盖用户已有设置、业务数据、凭据、通知历史或其他持久化内容。读取失败、文件损坏或状态未知不得当作空数据；涉及写入时保留校验、回读和数据损失保护。
- 不为了省事省略权限、安全、无障碍、错误处理或用户明确要求；报告结果必须以实际代码、验证和运行结果为准。

## 按需开发规则

开始修改前按任务范围读取对应文件：

- 所有的前端UI、布局、主题、响应式或无障碍：[`docs/agent/DESIGN.md`](docs/agent/DESIGN.md)。
- Agent、MCP、Skills、Provider、工具、Profile、会话、上下文、记忆、工作台、机器人或自动化：[`docs/agent/agent-runtime.md`](docs/agent/agent-runtime.md)。
- SQL、索引、SQLite、业务数据、视图 scope、JSON 存储、schema/version 或迁移：[`docs/agent/data-and-indexing.md`](docs/agent/data-and-indexing.md)。
- 系统/移动通知、Webhook、飞书、通知规则、历史或移动计划：[`docs/agent/notification-center.md`](docs/agent/notification-center.md)。
- 启动、bundle、ECharts、定时器、可见性、并发或大数据加载：[`docs/agent/performance.md`](docs/agent/performance.md)。

`docs/agent/` 是按需开发规则目录，不是全局第一原则目录。各文件引用的 `docs/` 架构文档负责当前实现事实；两者冲突时先修正规则和文档边界，再改代码。

## 每轮项目验收

每次完成代码、配置、依赖、构建脚本或生成物修改后，先验收再报告完成；纯文档修改执行 `git diff --check`。

- 范围：`git status --short`、`git diff --stat`、`git diff --check`。
- Svelte：按影响范围执行 `pnpm build:app`、`pnpm build:kernel`。
- TypeScript：`pnpm typecheck`；需要时可用 `pnpm exec tsc --noEmit` 或 `npx tsc --noEmit`。
- 语法与静态检查：`pnpm lint`。
- 功能回归：执行任务相关的已有测试或手工检查。
- 最终打包：代码、依赖或构建改动执行 `pnpm build`；发布任务检查实际产物。

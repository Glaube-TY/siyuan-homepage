# 🏠 思源主页插件

> 从个性化首页，到 AI 知识工作台。

思源主页插件最开始只是为了让思源笔记拥有一个更好看、更顺手、更符合个人习惯的首页。随着功能不断增加，它现在已经不只是一个“主页美化插件”，而是逐渐变成了一个集首页布局、组件工作台、日记任务、数据展示、文档入口和 AI 能力于一体的知识工作台。

从 4.x 开始，主页插件加入了 AI 知识库问答、编辑器工具栏 AI、主页 AI 状态语、Agent 工具、MCP 和本地密钥保护等能力。你可以在思源中直接围绕自己的笔记、日记、任务、网页资料和数据库内容进行对话，也可以在编辑器中选中文字后快速翻译、解释、润色或调用自定义技能。

如果你只是想搭建一个漂亮的思源首页，它可以做到；如果你希望把思源变成一个更主动、更智能的个人知识工作台，它也正在朝这个方向发展。

***

## 效果预览

PC 端：

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/%E4%B8%BB%E9%A1%B5%E6%8F%92%E4%BB%B6%E7%A4%BA%E4%BE%8B.webp" alt="思源主页插件组件工作台示例" style="max-width: 800px; width: 100%;" />
</div>

<div align="center">
<img src="https://blog.glaube-ty.top/upload/0d031562-6a57-426e-a4e1-93e04acfc282.webp" alt="0d031562-6a57-426e-a4e1-93e04acfc282.webp" style="max-width: 800px; width: 100%;" />
</div>

主页支持拖拽布局、组件缩放、主题搭配和多种效率模块组合。你可以把常用文档、任务、日记、天气、热搜、图表、倒计时、WebView 等内容放在一个统一入口里，让每次打开思源都能快速进入自己的工作状态。

移动端：

<div align="center">
<img src="https://blog.glaube-ty.top/upload/e7136c93-ce92-4b0f-8782-175369b3cac9.png" alt="e7136c93-ce92-4b0f-8782-175369b3cac9.png" style="max-width: 400px; width: 100%;" />
</div>

<br />

***

## 4.x：从主页到 AI 知识工作台

过去，主页插件更多是一个漂亮、灵活、功能丰富的思源首页；从 4.x 开始，它开始逐步加入 AI 能力、Agent 工具、MCP、外部 Skill 和更丰富的工作台组件，让主页从“信息展示入口”进一步变成“知识工作台”。

4.x 主要扩展了这些方向：

- **AI 知识库问答**：围绕思源本地文档、任务日记、网页资料和知识结构进行对话。
- **编辑器工具栏 AI**：在编辑器中选中文字后，直接调用 AI 问答、翻译、解释、润色和自定义技能。
- **主页 AI 状态语**：根据真实统计数据生成主页状态语，让每次打开主页都有新的提醒和鼓励。
- **Agent 工具能力**：基于模型原生 tool-call 协议，提供聚合工具与 action 能力，支持知识库检索、文档读取、任务日记、数据库、文档编辑、MCP 和外部 Skill 管理。
- **本地密钥保护**：大模型与联网搜索 API Key 本地加密保存，减少配置文件明文暴露风险。

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/%E4%B8%BB%E9%A1%B5%E6%8F%92%E4%BB%B6AI%E9%97%AE%E7%AD%94%E7%A4%BA%E6%84%8F%E5%9B%BE.webp" alt="思源主页插件 AI 知识库问答示例" style="max-width: 600px; width: 100%;" />
</div>

AI 知识库问答示例：在思源中直接围绕本地文档、任务日记、网页资料和知识结构进行对话。

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/%E7%BC%96%E8%BE%91%E5%99%A8%E5%B7%A5%E5%85%B7%E6%A0%8FAI.webp" alt="编辑器工具栏 AI 示例" style="max-width: 600px; width: 100%;" />
</div>

编辑器工具栏 AI 示例：选中文字即可调用 AI 问答、翻译、解释、润色和自定义技能。

***

## 核心能力

主页插件可以理解为三个层面的能力：

1. **主页搭建**：自定义标题、状态语、头像、横幅、按钮、组件区域、布局尺寸和页面风格。
2. **组件工作台**：通过拖拽、缩放和布局模板，把不同组件组合成自己的工作空间。
3. **AI 知识工作流**：围绕本地文档、网页资料、任务日记、数据库和编辑器选区进行智能处理。

你可以把它当作一个好看的思源首页，也可以把它逐步搭成一个项目主页、读书主页、日记主页、研究工作台或者个人仪表盘。

***

## 当前支持的组件

目前主页插件支持的组件共 **35个**。

| 类型   | 组件        | 说明                              |
| ---- | --------- | ------------------------------- |
| 笔记数据 | 收藏文档      | 展示常用或收藏的文档，方便快速打开               |
| 笔记数据 | 任务管理      | 收集散落在文档中的任务，进行基础汇总管理            |
| 笔记数据 | 任务管理 Plus | 更高级的任务管理组件，支持更灵活的筛选和排序          |
| 笔记数据 | 最近文档      | 按时间顺序展示最近编辑或打开过的文档              |
| 笔记数据 | 最近日记      | 展示最近的日记，可切换列表或日历样式              |
| 笔记数据 | 快速笔记      | 快速查看和打开指定目录下的笔记                 |
| 笔记数据 | 子文档       | 展示指定文档下的子文档，适合做项目入口             |
| 笔记数据 | 条件文档      | 按关键词、标签等条件筛选文档                  |
| 笔记数据 | 复习文档👑    | 可标记特定的文档、内容块进行未来的复习，支持艾宾浩斯遗忘曲线。 |
| 笔记数据 | 便签 👑     | 轻量便签组件，适合临时记录和固定提醒              |
| 笔记数据 | 强化日记 👑   | 更完整的日记工作台，包含任务、记录、回顾、日历等能力      |
| 信息资讯 | 热搜        | 展示不同平台的热搜信息                     |
| 信息资讯 | 每日一言      | 展示每日一句，支持自定义内容和外部来源             |
| 信息资讯 | 新闻资讯 👑   | 展示新闻资讯内容                        |
| 信息资讯 | 星座运势 👑   | 展示星座运势信息                        |
| 信息资讯 | 历史上的今天 👑 | 展示历史上的今天相关内容                    |
| 可视化  | 热力图       | 类似 GitHub 主页的创作热力图，可展示块数或文档活跃情况 |
| 可视化  | SQL 查询    | 通过 SQL 查询思源数据并展示结果              |
| 可视化  | 可视化图表     | 支持进度条、词云等可视化展示                  |
| 可视化  | 数据库图表 👑  | 数据库图表组件，目前仍在开发中                 |
| 可视化  | 统计卡片 👑   | 以卡片形式展示统计数据                     |
| 日常工具 | 番茄钟       | 专注计时工具，支持自定义样式和系统级提示            |
| 日常工具 | 倒数日       | 添加多个倒数日或纪念日事项                   |
| 日常工具 | 今日天气      | 根据城市信息展示天气                      |
| 日常工具 | 时钟        | 时钟组件，支持经典、简洁、表盘等样式              |
| 日常工具 | 音乐播放器 👑  | 音乐播放组件                          |
| 日常工具 | 黄历 👑     | 展示黄历相关信息                        |
| 日常工具 | 图片轮播 👑   | 图片轮播展示组件                        |
| 日常工具 | 赛博木鱼 👑   | 轻量娱乐和放松组件                       |
| 日常工具 | 倒计时 👑    | 更偏计时器形式的倒计时组件                   |
| 日常工具 | 固定资产 👑   | 固定资产记录与管理组件                     |
| 日常工具 | 记账 👑     | 记录收支流水、资产账户、预算概览和统计分析           |
| 自定义  | 文档编辑器     | 在主页中嵌入指定思源文档块或编辑器区域             |
| 自定义  | 文字内容      | 添加自定义 Markdown 或文字内容            |
| 自定义  | 网页浏览器     | 通过 WebView 嵌入网页内容               |

> 注：标注 👑 的组件为会员相关组件；具体可用范围以插件内实际显示为准。

***

## 组件工作台：把主页搭成自己的入口

主页插件的重点不是简单展示几个卡片，而是让你可以按照自己的工作方式重新组织思源入口。

你可以用它搭建：

- **每日工作台**：任务管理、番茄钟、日记、快速笔记、天气、倒数日。
- **读书工作台**：收藏文档、子文档、条件文档、便签、可视化图表。
- **研究工作台**：SQL 查询、数据库图表、文档编辑器、WebView、AI 知识库。
- **个人仪表盘**：热力图、统计卡片、固定资产、天气、历史上的今天。
- **生活主页**：音乐播放器、图片轮播、每日一言、黄历、星座运势。

你可以根据自己的使用习惯拖拽组件、调整大小、隐藏不用的组件，也可以通过模板快速恢复或切换主页布局。

***

## 强化日记组件：把日记、任务和复盘整理成工作台

强化日记组件不是单纯显示最近日记，而是围绕“今天要做什么、记录了什么、需要复盘什么”搭建的日记工作台。它适合把日记模板、任务迁移、快速记录、复盘提醒和计划承接放在一个统一入口里管理。

目前支持：

- **日记工作台**：集中查看今日概览、任务、快速记录、复盘、日历、项目和通知。
- **快速记录**：把临时想法、事件、灵感或分类记录写入今日日记的快速记录区。
- **任务管理**：围绕日记中的任务做查询、状态更新、迁移、推迟和删除，减少任务散落在不同文档里的管理成本。
- **复盘中心**：支持日 / 周 / 月 / 年复盘，包含待处理复盘、历史复盘、跳过/恢复和复盘内容编辑。
- **计划承接**：在周期复盘之间承接上一次计划，让周计划、月计划和年计划能够连续追踪。
- **模板与结构设置**：可以配置日记笔记本、日/周/月/年模板、快速记录分类、复盘字段、提醒窗口和标题别名。

<div align="center">
<img src="https://blog.glaube-ty.top/upload/d919fd56-c393-4b6d-966a-864f21197571.webp" alt="d919fd56-c393-4b6d-966a-864f21197571.webp" style="max-width: 600px; width: 100%;" />
</div>

***

## 记账组件：在主页里管理日常收支

记账组件是一个轻量的本地账本工作台，适合把日常收支、资产账户和月度统计放进主页统一管理。

目前支持：

- **快速记一笔**：支持支出、收入和转账，一级/二级分类、备注、日期和资产账户都可以在弹窗里完成。
- **流水管理**：流水页默认展示本月记录，也可以切换月份、年份、收支类型和分类筛选。
- **资产账户**：支持现金、银行卡、互联网账户等资产管理，并根据流水计算余额。
- **统计分析**：支持本月、近 30 天和本年视图，包含收支趋势、分类统计、日历明细和每日汇总。
- **本地 JSON 存储**：记账数据保存在插件作用域下的 `accounting/` 目录，按年度分片保存流水，便于备份和迁移。

<div align="center">
<img src="https://blog.glaube-ty.top/upload/06ebd8e6-57c2-4059-a8d9-11f473255c1c.png" alt="记账组件首页卡片" style="max-width: 400px; width: 100%;" />
</div>

<div align="center">
<img src="https://blog.glaube-ty.top/upload/e5376795-725f-4225-b1c6-d1941eba5af9.webp" alt="记一笔弹窗" style="max-width: 500px; width: 100%;" />
</div>

<div align="center">
<img src="https://blog.glaube-ty.top/upload/88e52980-e7e0-4721-b180-17ef40842863.webp" alt="记账分析页" style="max-width: 600px; width: 100%;" />
</div>

***

## Webhook 外联通知桥：将插件内的任务提醒、纪念日提醒等统一发送到外部通知渠道

将插件内的任务提醒、纪念日提醒等统一发送到外部通知渠道。

支持通用 Webhook 和飞书机器人。

<div align="center">
<img src="https://blog.glaube-ty.top/upload/fc895119-cefe-4170-a1e1-3d6cd18157da.webp" alt="fc895119-cefe-4170-a1e1-3d6cd18157da.webp" style="max-width: 600px; width: 100%;" />
</div>

***

## 机器人助手：与飞书机器人对话实现远程操控思源笔记

<div align="center">
<img src="https://blog.glaube-ty.top/upload/8b3dbadf-8288-4f5e-bd2c-9cd1c6ac678d.webp" alt="1cab1410-6d3f-4b0e-83c8-3853d0c5c995.webp" style="max-width: 600px; width: 100%;" />
</div>

***

## 音乐播放器：在主页中播放音乐

<div align="center">
<img src="https://blog.glaube-ty.top/upload/75c7dad8-67aa-43b4-809f-46f421627f9a.webp" alt="75c7dad8-67aa-43b4-809f-46f421627f9a.webp" style="max-width: 600px; width: 100%;" />
</div>

***

## AI 知识库：不只是聊天，而是理解你的思源

AI 知识库是 4.x 之后最重要的变化之一。

它不是简单地把一个聊天框塞进插件里，而是让 AI 能够围绕思源中的真实内容工作。

目前 AI 知识库支持从侧边栏或标签页进入对话，可以根据需要调用不同工具完成任务。

AI 的回答不再只是凭空生成，而是可以结合你在思源中的真实资料进行处理。

> 该项目没有使用传统的 RAG 方式去建立知识数据库，或使用向量检索进行 RAG 的搭建。
>
> 项目直接使用相关的查询工具，并优化了知识图谱类型的工具，直接让 AI 进行问题的理解和调用工具进行知识库问答。
>
> 因此是完全基于一种类似 Agentic RAG 的方式进行的。

***

### AI 知识库功能介绍

AI 知识库目前支持丰富的功能设置，如：

- **内置聚合工具与 action 设置**
- **MCP 服务配置**
- **外部 Skill 说明包配置**
- **智能联网搜索**
- **全局记忆**
- **快捷提示语**
- **主页状态语 AI 智能生成**
- **编辑器工具栏 AI 工具处理**
- **内置工具分组与设置页样式优化**

#### MCP 服务

AI 知识库现在可以作为 MCP Client 连接外部 MCP Server，让 Agent 在需要时调用外部服务提供的工具。

目前支持 Streamable HTTP、SSE 和 stdio 三种传输方式。其中 stdio 仅支持 PC/Electron 环境，HTTP/SSE 需要提供可访问的服务 URL。

MCP 现在通过 `mcp_manage` 聚合工具管理：可以列出 Server、保存/删除配置、同步工具、查看工具说明，并通过 `call_tool` action 调用已同步的 MCP 工具。设置页可以按 Server 和工具控制连接、暴露、启用和 trusted 状态，也会展示工具数量、只读/写入分类、风险标记、同步时间和当前环境限制。

#### 外部 Skill 说明包

第三方、AI 安装和旧自定义 Skill 现在统一以外部 Skill 索引方式管理，不再默认每轮全文注入上下文。Agent 会先看到简短索引，需要真正使用时再通过 `skill_manage.list`、`skill_manage.read` 和 `skill_manage.read_file` 按需读取说明。

设置页提供外部 Skill 总开关、安装开关、旧全文注入兼容开关、单次读取上限和索引重建。外部 Skill 可以安装到 `notebrain/skills/installed`。安装、停用和重建索引等写操作通过 `skill_manage` 对应 action 执行，仍然需要确认。

#### 内置聚合工具 / Action 能力

现在的 Agent 能力已经不再是“内置 Skill 管理内置工具”。内置能力直接注册为模型可见的聚合工具，每个聚合工具通过统一的 `action` 字段选择具体能力，具体参数放在 `args` 中。

例如，模型看到的不是一大批零散工具，也不是先选择某个内置 Skill 再调用工具，而是看到类似 `siyuan_kb`、`diary_task`、`siyuan_database` 这样的顶层工具。需要搜索知识库时调用 `siyuan_kb` 的 `search` action；需要读取正文时调用 `siyuan_kb` 的 `read_docs` action；需要修改数据库时调用 `siyuan_database` 的写入 action，并经过确认流程。

这样做的目的有三个：

- **减少工具数量**：模型面对的是少量稳定的聚合工具，而不是几十个细碎工具。
- **保留能力边界**：每个 action 仍然有独立参数、只读/写入标记、风险说明和确认规则。
- **便于设置和帮助**：设置页按聚合工具展示能力；不确定参数时可以通过 `agent_tool_help` 查询工具和 action 说明。

内置工具概览：

| 工具                   | 能力范围                                 | 典型 action                                                                    |
| :------------------- | :----------------------------------- | :--------------------------------------------------------------------------- |
| `siyuan_kb`          | 知识库搜索、正文读取、文档信息、知识结构、时间列表、大纲、引用和特殊检索 | `search`、`read_docs`、`list_map`、`outline`、`refs`                             |
| `diary_task`         | 强化日记、任务、快速记录、复盘和日记结构管理               | `overview`、`query_tasks`、`find_docs`、`manage_task`、`manage_review`           |
| `siyuan_database`    | 思源数据库查询、条目读取、字段和单元格的受控写入             | `list`、`read`、`find_rows`、`update_cell`、`add_rows`、`view`                    |
| `siyuan_doc_edit`    | 文档块读取、块属性、引用、状态、创建、插入、移动、删除和正文替换     | `read_blocks`、`block_attr`、`insert_block`、`move_block`、`replace_doc_content` |
| `siyuan_tree`        | 笔记本、文档树和路径解析                         | `notebook`、`doc_tree`、`doc_path`                                             |
| `siyuan_meta`        | 标签和书签管理                              | `tag`、`bookmark`                                                             |
| `siyuan_asset`       | assets、OCR、标注、未使用资源和受限工作区文件          | `read`、`manage`、`workspace_file`                                             |
| `siyuan_riff`        | Riff 卡包和闪卡复习管理                       | `deck`、`card`                                                                |
| `skill_manage`       | 外部/用户 Skill 说明包的列出、读取、安装、停用和重建索引     | `list`、`read`、`read_file`、`install`、`reindex`                                |
| `mcp_manage`         | MCP Server 配置、工具同步、工具说明和工具调用         | `list_servers`、`save_server`、`sync_tools`、`call_tool`                        |
| `notebrain_file`     | Notebrain 工作区文件读写和本地命令执行             | `list_dir`、`read_file`、`write_file`、`run_command`                            |
| `web_fetch`          | 网页读取和 HTTP 请求                        | `read_page`、`http_get`、`http_post`                                           |
| `edit_global_memory` | 全局记忆的受控更新                            | 直接传入完整 `memory` 文本进行全量替换                                                     |
| `agent_tool_help`    | 查看当前工具和 action 的说明、参数和风险边界           | `list_tools`、`describe_tool`、`describe_action`                               |

***

### 编辑器工具栏 AI：选中文字就能处理

编辑器工具栏 AI 的目标是减少复制粘贴。过去如果你想让 AI 解释、翻译或润色一段文字，通常需要把文字复制到外部 AI 工具里，再把结果复制回来。现在可以直接在思源编辑器中选中文字，点击工具栏中的 AI 按钮处理。

目前支持的能力包括：

- AI 问答
- 翻译
- 解释
- 润色
- 自定义技能
- 技能排序
- 技能停用
- 技能删除
- 技能显示位置管理
- 技能级模型参数设置

你也可以为不同技能配置不同模型、温度、输出长度和流式输出方式。例如，翻译可以使用一个稳定模型，润色可以使用另一个更擅长表达的模型，自定义技能则可以根据具体场景单独设置。

如果你愿意，还可以选择附带当前文档标题和选区附近上下文，让 AI 更理解当前文字所在的笔记环境。

***

### 主页 AI 状态语

状态语不再只是固定模板。开启 AI 智能生成后，主页可以根据真实统计数据生成一句新的状态语，例如记录天数、笔记数量、文档数量、任务数量等。

你可以把它理解为主页上的一句动态提示：它不直接替你工作，但可以让你每次打开主页时，都看到一句和自己当前状态有关的话。

主页 AI 状态语支持：

- 自定义模板
- AI 智能生成
- 单独选择大模型
- 设置生成风格
- 设置返回字符上限
- 设置思考模式
- 悬浮刷新按钮
- 自定义状态语与 AI 状态语分别刷新

如果生成失败，插件也会明确提示，不会误显示为自定义内容。

***

## 本地密钥保护

4.x 对大模型与联网搜索 API Key 做了本地加密保存，避免配置文件中直接出现明文密钥。设置页中的密钥输入框默认隐藏，可通过眼睛按钮临时查看。

需要说明的是，这里的安全目标是减少配置文件明文暴露风险，它是本地加密保存，不等同于系统密钥链，也不应该被理解为绝对安全。

简单来说：

- API Key 不直接明文暴露在配置文件里。
- 设置页默认隐藏密钥。
- 需要查看时可以临时显示。
- 本地加密是安全增强，不是绝对防护。

***

## 使用教程与更新日志

主页插件功能比较多，如果你是第一次使用，建议先查看详细教程：[📖 详细使用教程](https://blog.glaube-ty.top/zhu-ye-cha-jian)

如果你想了解每个版本具体更新了什么，可以查看完整更新日志：[📄 完整更新日志](https://blog.glaube-ty.top/archives/019d23a8-9381-70b7-8561-68c22fb1aedf)

***

## 相关文章

- [思源主页插件：记账组件](https://blog.glaube-ty.top/archives/019f4131-8e53-7108-bdea-f7e2fbfd6269)

* [思源主页插件：音乐播放器](https://blog.glaube-ty.top/archives/019f0e6c-3524-7035-9fe9-bb6798c067ae)
* [思源主页插件：机器人助手](https://blog.glaube-ty.top/archives/019f0458-4361-7054-ad8c-d80b229b46d9)
* [思源主页插件：Webhook 外联通知](https://blog.glaube-ty.top/archives/019f0434-0699-7345-b007-d5718f574299)

- [思源主页插件：复习文档组件](https://blog.glaube-ty.top/archives/019eefa2-66fe-74bc-8184-9045dd405d82)
- [思源主页插件：Ai 知识库](https://blog.glaube-ty.top/archives/019ebc77-d03e-73df-b6ec-10b18545d4a7)
- [思源主页插件：强化日记工作台](https://blog.glaube-ty.top/archives/019e5f59-4a9c-727b-bd6a-a32c4d604a48)
- [主页插件任务管理Plus组件设置教程](https://blog.glaube-ty.top/archives/019d2a4b-733a-707a-b226-b305e4aafe35)
- [主页插件 —— 任务管理 Plus](https://ld246.com/article/1751797033411)
- [主页插件 —— 实用又美观的信息汇总页面](https://ld246.com/article/1751795938779)

***

## 支持开发

如果这个插件对你有帮助，欢迎给作者点个赞或打赏一杯咖啡。这会鼓励作者继续更新，也能支持后续更多功能的维护和开发。

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/ReQR.png" alt="赞赏二维码" style="max-width: 600px; width: 100%;" />
</div>

[💖 特别鸣谢](https://blog.glaube-ty.top/da-shang)

***

## 加入讨论

目前我在开发的插件有主页、读书笔记、空文档清理、彩色图标等，所以统一使用一个讨论频道，方便查看和管理反馈。

欢迎在频道中反馈问题、分享布局、交流玩法。

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/TCQR.jpg" alt="讨论频道二维码" style="max-width: 400px; width: 100%;" />
</div>

[👥 加入腾讯讨论频道](https://pd.qq.com/s/2ks4079x0)

***

## VIP 权益

[👑 VIP 权益](https://blog.glaube-ty.top/archives/019d3f20-03d4-70fd-8afe-dff8bb2107ab)

***

## 参考项目

本插件部分功能参考了以下优秀项目，感谢开源社区提供的灵感与基础能力。

| 项目                                                                          | 说明                                       |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| [SiYuan](https://github.com/siyuan-note/siyuan)                             | 本插件基于思源插件能力和 Kernel API 构建               |
| [Svelte](https://github.com/sveltejs/svelte)                                | 本插件主要前端界面使用 Svelte 构建                    |
| [Vite](https://github.com/vitejs/vite)                                      | 本插件使用 Vite 进行开发与打包                       |
| [AI SDK](https://github.com/vercel/ai)                                      | AI 知识库和模型调用流程使用 AI SDK 相关能力              |
| [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)    | 任务管理 Plus 组件参考了其图标化的任务模式和实现逻辑            |
| [Echarts](https://github.com/apache/echarts)                                | 本插件中的图表能力主要来自 Echarts                    |
| [ECharts Wordcloud](https://github.com/ecomfe/echarts-wordcloud)            | 可视化图表中的词云能力来自 ECharts Wordcloud          |
| [Emoji Picker Element](https://github.com/nolanlawson/emoji-picker-element) | 本插件中的 Emoji 选择器组件来自 Emoji Picker Element |
| [Lucide](https://github.com/lucide-icons/lucide)                            | 部分组件和界面图标使用 Lucide 图标                    |
| [Howler](https://github.com/goldfire/howler.js/)                            | 本插件中的音乐播放功能来自 Howler                     |
| [music-metadata](https://github.com/Borewit/music-metadata)                 | 音乐文件元数据读取能力来自 music-metadata             |
| [Mousetrap](https://github.com/ccampbell/mousetrap)                         | 本插件使用 Mousetrap 来处理键盘快捷键                 |
| [Quill](https://github.com/slab/quill)                                      | 本插件中的便签组件来自 Quill                        |
| [Sortable](https://github.com/SortableJS/Sortable)                          | 本插件中的组件拖拽布局和技能排序来自 Sortable              |
| [Multiselect](https://multiselect.janosh.dev/)                              | 本插件中的多选框来自 Multiselect                   |
| [Tyme](https://github.com/6tail/tyme4ts)                                    | 本插件部分日期算法来自 Tyme                         |
| [UAPI SDK TypeScript](https://github.com/AxT-Team/uapi-sdk-typescript)      | 本插件的热搜组件相关功能使用了 UAPI SDK TypeScript      |
| [Floating UI](https://floating-ui.com/)                                     | 本插件中的浮动预览窗口来自 Floating UI                |
| [Zod](https://github.com/colinhacks/zod)                                    | Agent 工具参数、配置和运行时输入校验使用 Zod              |
| [Ajv](https://github.com/ajv-validator/ajv)                                 | 部分 JSON Schema 校验能力来自 Ajv                |
| [DOMPurify](https://github.com/cure53/DOMPurify)                            | HTML 内容安全净化使用 DOMPurify                  |
| [CryptoJS](https://github.com/brix/crypto-js)                               | 本地密钥加密保存使用 CryptoJS                      |
| [JSZip](https://github.com/Stuk/jszip)                                      | 数据导入导出、打包相关能力使用 JSZip                    |
| [Lark OpenAPI SDK](https://github.com/larksuite/oapi-sdk-nodejs)            | 飞书机器人与外联能力使用飞书 OpenAPI SDK               |
| [Swiper](https://swiper.com.cn/)                                            | 本插件中的轮播图组件来自 Swiper                      |

***

## 免责声明

- 本插件只用于信息汇总展示与个人效率辅助，所有插件数据均在本地使用。
- AI 功能需要用户自行配置大模型或联网搜索服务，相关服务的费用、稳定性和内容结果由对应服务商决定。
- AI 生成内容仅供参考。涉及重要信息、文档编辑、删除数据等操作时，请务必自行确认。
- 本插件数据仅用于个人信息管理，禁止用于商业用途等违规行为。
- 开发者对使用本插件造成的任何损失不承担责任。


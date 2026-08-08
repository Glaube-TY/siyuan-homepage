# 🏠 思源主页插件

> 从个性化首页，到 AI 知识工作台。

思源主页插件是一款面向思源笔记的个性化首页与知识工作台插件。它可以把思源主页搭成符合个人习惯的信息入口，也可以进一步围绕笔记、日记、任务和 AI 能力，把思源变成更主动、更智能的个人工作系统。

插件的能力大致可以分为四个方向：个性化首页搭建、可组合的组件工作台、日记/任务/记账等个人管理功能，以及 AI 知识库、编辑器 AI、MCP 和外部连接等 AI 知识工作流。

无论你只是想搭一个好看的首页，还是希望让思源帮助你处理日常任务和知识工作，都可以从安装这个插件开始。

[🌐 插件官网](https://glaube-ty.top/sites/siyuan-homepage/index.html) · [📖 使用教程](https://glaube-ty.top/tutorials/siyuan-homepage/) · [💻 GitHub](https://github.com/Glaube-TY/siyuan-homepage)

***

## 效果预览

PC 端组件工作台：主页由多个组件组合而成，支持拖拽布局、组件缩放、主题搭配和多种效率模块，把常用文档、任务、日记、天气、热搜、图表等放在一个统一入口里。

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/%E4%B8%BB%E9%A1%B5%E6%8F%92%E4%BB%B6%E7%A4%BA%E4%BE%8B.webp" alt="思源主页插件组件工作台示例" style="max-width: 800px; width: 100%;" />
</div>

实际主页效果：把组件按自己的使用习惯摆放后，每次打开思源都能快速进入工作状态。

<div align="center">
<img src="https://glaube-ty.top/images/content/pasted-image-20260726-154556-665.webp" alt="PC 端主页实际效果" style="max-width: 800px; width: 100%;" />
</div>

移动端提供专门的主页布局和组件目录，针对触屏操作进行适配，并使用移动端共享配置，不是简单缩放 PC 主页布局。

<div align="center">
<img src="https://glaube-ty.top/images/content/pasted-image-20260726-155511-010.png" alt="移动端主页" style="max-width: 400px; width: 100%;" />
</div>

<br />

***

## 4.x：从主页到 AI 知识工作台

从 4.x 开始，主页插件逐步加入 AI 知识库、Agent 工具、MCP 和外部 Skill 等能力，让主页从“信息展示入口”进一步变成“知识工作台”。当前版本已经具备这些体验：

- **AI 知识库会话持久化**：会话历史、思考状态、联网状态和上下文压缩状态都会随会话保存，重启思源后可以恢复继续对话。
- **两种对话入口**：可以从侧边栏 Dock 或新标签页进入 AI 对话。
- **灵活的知识范围**：支持当前笔记本、当前文档及子文档、当前文档邻域、全库问答，也可以手动附加特定文档。
- **块级证据读取**：Agent 可以按块读取思源中的真实内容作为回答依据。
- **行内证据来源**：回答正文的对应位置可以显示来源，点击即可跳转到相应的思源文档、块或网页。
- **受控内容修改**：文档新增、修改、移动和删除执行前都有确认；删除操作和内容修改使用不同的确认展示。
- **输出截断提示**：模型达到单次输出上限时，会明确提示回答可能未结束。
- **编辑器选区 AI**：选中文字即可调用问答、解释、翻译、润色和自定义技能。

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

主页插件可以理解为四个层面的能力：

1. **主页搭建**：自定义标题、状态语、头像、横幅、按钮、组件区域、布局尺寸和页面风格。
2. **组件工作台**：通过拖拽、缩放和布局模板，把不同组件组合成自己的工作空间。
3. **个人管理工作流**：任务、强化日记、快速记录、复盘、记账、固定资产、提醒和通知。
4. **AI 与外部连接**：AI 知识库、编辑器工具栏 AI、Web 搜索、MCP、外部 Skill、Webhook、飞书机器人。

你可以把它当作一个好看的思源首页，也可以把它逐步搭成一个项目主页、读书主页、日记主页、研究工作台或者个人仪表盘。

***

## 运行环境与数据说明

- 插件支持思源的桌面客户端、浏览器、Docker 和移动端环境，最低思源版本为 3.6.5。不同环境下能力存在差异，PC 客户端的能力最完整。
- WebView、stdio 类型的 MCP、本地工作区文件操作和本地命令等能力依赖 PC/Electron 环境；HTTP/SSE 类型的 MCP 和普通网络服务则取决于对应服务地址是否能够访问。
- 主页布局配置与业务数据并非全部使用同一种保存方式：桌面主页布局按设备分别保存，移动端主页使用移动端共享配置。
- 日记、记账、AI 会话等业务数据不按设备视图隔离；在同一思源工作空间并正确启用同步后，可在不同设备间继续使用。
- 会员状态变化只会影响对应功能的可用范围，不会删除你已有的业务数据。

***

## 当前支持的组件

目前主页提供 **34 个稳定组件**，另有 **1 个数据库图表组件**仍处于开发和试验阶段；移动端组件目录保留了相关入口，PC 端暂未开放常规添加。

| 类型   | 组件         | 说明                              |
| ---- | ---------- | ------------------------------- |
| 笔记数据 | 收藏文档       | 展示常用或收藏的文档，方便快速打开               |
| 笔记数据 | 任务管理       | 收集散落在文档中的任务，进行基础汇总管理            |
| 笔记数据 | 任务管理 Plus  | 更高级的任务管理组件，支持更灵活的筛选和排序          |
| 笔记数据 | 最近文档       | 按时间顺序展示最近编辑或打开过的文档              |
| 笔记数据 | 最近日记       | 展示最近的日记，可切换列表或日历样式              |
| 笔记数据 | 快速笔记       | 快速查看和打开指定目录下的笔记                 |
| 笔记数据 | 子文档        | 展示指定文档下的子文档，适合做项目入口             |
| 笔记数据 | 条件文档       | 按关键词、标签等条件筛选文档                  |
| 笔记数据 | 复习文档 👑    | 标记文档或内容块按遗忘曲线安排复习               |
| 笔记数据 | 便签 👑      | 轻量便签组件，适合临时记录和固定提醒              |
| 笔记数据 | 强化日记 👑    | 日记工作台，包含任务、记录、复盘、日历等能力         |
| 信息资讯 | 热搜         | 展示不同平台的热搜信息                     |
| 信息资讯 | 每日一言       | 展示一条每日语录，支持自定义内容和外部来源           |
| 信息资讯 | 新闻资讯 👑    | 展示新闻资讯内容                        |
| 信息资讯 | 星座运势 👑    | 展示星座运势信息                        |
| 信息资讯 | 历史上的今天 👑  | 展示历史上的今天相关内容                    |
| 可视化  | 热力图        | 类似 GitHub 主页的创作热力图，可展示块数或文档活跃情况 |
| 可视化  | SQL 查询     | 通过 SQL 查询思源数据并展示结果              |
| 可视化  | 可视化图表      | 支持进度条、词云等可视化展示                  |
| 可视化  | 统计卡片 👑    | 以卡片形式展示统计数据                     |
| 日常工具 | 番茄钟        | 番茄工作法计时工具，支持自定义样式和系统级提示         |
| 日常工具 | 纪念日 👑     | 管理纪念日和重要日期，支持多种展示样式和提醒          |
| 日常工具 | 今日天气       | 根据城市信息展示天气                      |
| 日常工具 | 时间与日期      | 展示时间、日期和日历信息，支持经典、简洁、表盘等样式      |
| 日常工具 | 音乐播放器 👑   | 播放本地或 NAS 音乐，支持封面、歌词和歌单           |
| 日常工具 | 黄历 👑      | 展示黄历相关信息                        |
| 日常工具 | 图片轮播 👑    | 图片轮播展示组件                        |
| 日常工具 | 赛博木鱼 👑    | 轻量娱乐和放松组件                       |
| 日常工具 | 倒计时 👑     | 更偏计时器形式的倒计时组件                   |
| 日常工具 | 固定资产 👑    | 固定资产记录与管理组件                     |
| 日常工具 | 记账 👑      | 记录收支流水、资产账户、预算概览和统计分析           |
| 自定义  | 文档编辑器      | 在主页中嵌入指定思源文档块或编辑器区域             |
| 自定义  | 文字内容       | 添加自定义 Markdown 或文字内容            |
| 自定义  | 网页浏览器      | 通过 WebView 嵌入网页内容               |

> 注：标注 👑 的组件为会员相关组件，具体可用范围以插件内实际显示为准。

***

## 组件工作台：把主页搭成自己的入口

主页插件的重点不是简单展示几个卡片，而是让你可以按照自己的工作方式重新组织思源入口。

你可以用它搭建：

- **每日工作台**：任务管理、番茄钟、日记、快速笔记、天气、纪念日。
- **读书工作台**：收藏文档、子文档、条件文档、便签、可视化图表。
- **研究工作台**：SQL 查询、统计卡片、文档编辑器、WebView、AI 知识库。
- **个人仪表盘**：热力图、统计卡片、固定资产、天气、历史上的今天。
- **生活主页**：音乐播放器、图片轮播、每日一言、黄历、星座运势。

组件支持拖拽和缩放，每个组件可以独立设置内容和样式；桌面主页按设备分别保存布局，移动主页使用移动端共享配置，还提供布局模板方便快速恢复或切换主页布局。

***

## 强化日记组件：把日记、任务和复盘整理成工作台

强化日记组件不是单纯显示最近日记，而是围绕“今天要做什么、记录了什么、需要复盘什么”搭建的日记工作台。它适合把日记模板、任务迁移、快速记录、复盘提醒和计划承接放在一个统一入口里管理。

目前支持：

- **日记工作台**：集中查看今日概览、任务、快速记录、复盘、日历、项目和通知。
- **今日概览**：汇总今日任务、逾期任务、记录数量、进行中的项目和复盘状态。
- **快速记录**：把临时想法、事件、灵感或分类记录写入今日日记的快速记录区。
- **任务管理**：围绕日记中的任务做查询、状态更新、迁移、推迟和删除，减少任务散落在不同文档里的管理成本。
- **项目**：根据任务标签聚合相关任务和记录，查看项目健康度、风险和时间线。
- **日历**：查看每天的日记、任务、记录、复盘和节气节日信息。
- **通知**：配合通知中心，把日记、复盘和任务提醒送到桌面、移动端或外部渠道。
- **复盘中心**：支持日 / 周 / 月 / 年复盘，包含待处理复盘、历史复盘、跳过/恢复和复盘内容编辑。
- **计划承接**：在周期复盘之间承接上一次计划，让周计划、月计划和年计划能够连续追踪。
- **模板与结构设置**：可以配置日记笔记本、日/周/月/年模板、快速记录分类、复盘字段、提醒窗口和标题别名，并支持模板健康检查。

强化日记还提供快捷入口：通过插件命令可以快速打开工作台、新建任务或快速记录。AI 知识库的 Agent 也可以通过 `diary_task` 工具查询和受控管理日记、任务、快速记录与复盘相关内容。

<div align="center">
<img src="https://glaube-ty.top/uploads/attachments/halo/5443ff04-871f-4dcd-ac40-69a53eeafeb9.webp" alt="强化日记工作台总览" style="max-width: 600px; width: 100%;" />
</div>

***

## 记账组件：在主页里管理日常收支

记账组件是一个轻量的本地账本工作台，适合把日常收支、资产账户和月度统计放进主页统一管理。

目前支持：

- **快速记一笔**：支持支出、收入和转账，一级/二级分类、备注、日期和资产账户都可以在弹窗里完成。
- **流水管理**：流水页默认展示本月记录，也可以切换月份、年份、收支类型和分类筛选。
- **资产账户**：支持现金、银行卡、互联网账户等资产管理，并根据流水计算余额。
- **统计分析**：支持本月、近 30 天和本年视图，包含收支趋势、分类统计、日历明细和每日汇总。
- **本地存储**：记账数据保存在插件数据目录下，按年度分片保存流水，便于备份和迁移；也可以使用思源快捷键命令直接打开完整记账窗口。

记账数据只保存在你自己的思源工作空间中，不依赖第三方云服务，也不支持第三方账单自动同步。

<div align="center">
<img src="https://glaube-ty.top/uploads/attachments/halo/60add4ba-45b7-42c6-b164-b3d5e276aa26.png" alt="记账组件首页卡片" style="max-width: 400px; width: 100%;" />
</div>

<div align="center">
<img src="https://glaube-ty.top/uploads/attachments/halo/04ccc0a4-9610-47e9-b96c-cca04a73de5e.webp" alt="记一笔弹窗" style="max-width: 500px; width: 100%;" />
</div>

<div align="center">
<img src="https://glaube-ty.top/uploads/attachments/halo/b20b5afd-cdc8-4707-83e5-0fc1856bdf18.webp" alt="记账分析页" style="max-width: 600px; width: 100%;" />
</div>

***

## 通知中心与 Webhook 外联通知

通知中心负责把主页插件产生的提醒，送到你真正会注意到的地方：桌面系统通知、手机本地通知，或者飞书群和任意支持 Webhook 的服务。

可以接收以下插件内部提醒：

- 任务提醒与任务摘要；
- 纪念日和倒计时提醒；
- 强化日记的日记、复盘、任务整理和项目进展提醒；
- 复习文档到期提醒；
- 专注结束和休息结束提醒。

通知中心支持两类外联渠道：

- **通用 Webhook**：向指定地址发送 POST 请求，可自定义请求头和 JSON 载荷模板；
- **飞书机器人**：填写群机器人 Webhook 地址和签名密钥，可选文本或富文本格式，使用 HMAC-SHA256 签名校验。

通知中心是会员功能。Webhook 和飞书外联通过思源内核代理发送，不依赖机器人助手的本地网关，可用于桌面、移动端和 Docker 等思源环境；实际投递仍取决于当前环境的网络访问能力和系统后台限制。外联渠道提供测试发送，投递结果会记录在“最近投递结果”中，方便排查。

<div align="center">
<img src="https://glaube-ty.top/images/content/notification-center-external-settings-20260731.webp" alt="通知中心外联设置" style="max-width: 600px; width: 100%;" />
</div>

***

## 机器人助手：与飞书机器人对话实现远程操控思源笔记

机器人助手解决的是“离开电脑后如何快速记录和操作思源笔记”的问题。配置完成后，你可以在手机上给飞书机器人发消息，让它帮你完成快速记录、新建任务和查看任务等操作，内容会直接写入思源笔记。

它的工作方式是：插件在电脑上启动一个本地飞书网关（依赖 Node.js），通过飞书开放平台的“长连接接收事件”与飞书保持连接，再把收到的消息交给思源中的插件处理。

目前支持的操作包括：

- 快速记录：发送一段普通文字，选择对应的记录操作即可写入；
- 新建今日任务；
- 查看今日任务和逾期任务；
- 发送“帮助”查看当前支持的命令列表。

需要说明的是：

- 机器人助手依赖电脑端的本地网关，需要 PC 客户端和 Node.js 环境，并且网关进程保持运行才能收发消息；
- 普通文本消息会先进入待确认状态，由你回复数字确认后才执行，不会自动写入内容；
- 只有加入安全白名单的飞书账号才能操作；
- 机器人助手是会员功能，它与通知中心的区别是：通知中心是“思源主动把提醒推送到飞书”，机器人助手是“你在飞书里向思源发消息执行操作”。

<div align="center">
<img src="https://glaube-ty.top/uploads/attachments/halo/60b853d2-612b-4ed1-b6f3-ab57cedf3fb7.webp" alt="向机器人发送待记录内容" style="max-width: 600px; width: 100%;" />
</div>

***

## 音乐播放器：在主页中播放音乐

音乐播放器支持电脑本地音乐与 NAS 音乐两种来源：桌面端可以直接播放电脑中的音乐文件，也可以连接 Navidrome 等兼容 Subsonic 1.16.1 / OpenSubsonic 的音乐服务器；移动端使用单独设计的全屏播放器，通过 NAS 获取歌曲、封面、歌词和播放队列。

| 音乐来源 | 适用环境 | 主要能力 |
| --- | --- | --- |
| 本地音乐 | 思源桌面客户端 | 文件夹扫描、元数据索引、内嵌/同名封面与歌词、本地收藏和歌单 |
| NAS 音乐 | 桌面端、移动端 | 服务器曲库、专辑、艺术家、搜索、收藏、播放列表和跨设备队列 |

### NAS 连接与自动切换

NAS 模式可以同时保存局域网地址和远程地址，并分别测试两条线路。智能测试会检查地址是否可用、连接延迟，以及本地与远程地址是否指向同一台服务器。播放器优先使用本地连接，本地不可用时自动切换远程地址。

- 使用 Subsonic Token Auth，不把明文密码拼接到请求地址；
- NAS 密码通过 AES-GCM 加密后保存在插件共享设置中；
- 远程访问建议使用 HTTPS，HTTP 只适合受信任的 VPN 或内网环境；
- 配置界面显示线路状态、延迟、当前地址和服务端能力，播放器界面只保留精简连接信息。

<div align="center">
<img src="https://glaube-ty.top/images/content/siyuan-homepage-music-nas-connection-settings-20260808.webp" alt="NAS 音乐服务器本地地址、远程地址与连接状态设置" style="max-width: 690px; width: 100%;" />
</div>

### 桌面端播放器

桌面端可以在歌曲、专辑、艺术家、收藏、播放列表和搜索之间切换，并显示封面、歌词、音质、播放进度、队列和当前连接状态。歌曲列表按页读取，大型曲库也不会一次加载全部内容。

<div align="center">
<img src="https://glaube-ty.top/images/content/siyuan-homepage-music-nas-desktop-20260808.webp" alt="桌面端 NAS 音乐播放器" style="max-width: 800px; width: 100%;" />
</div>

本地模式继续支持 MP3、WAV、OGG、FLAC、AAC、M4A 等格式，可以递归扫描子目录、建立轻量元数据索引、读取内嵌或同名封面与 `.lrc` 歌词，并支持本地收藏、歌单、M3U8 导入导出和 JSON 备份。电脑端还可以启用右下角迷你播放器，离开主页后继续控制播放。

### 移动端播放器

移动端只读取 NAS 音乐，不访问电脑本地文件夹。正在播放、歌词、音乐库和播放队列使用独立的多级页面，不会把桌面弹窗直接缩小到手机屏幕。

<div align="center">
<img src="https://glaube-ty.top/images/content/siyuan-homepage-music-mobile-now-playing-20260808.webp" alt="移动端 NAS 音乐播放器正在播放页面" style="max-width: 360px; width: 48%; min-width: 260px;" />
<img src="https://glaube-ty.top/images/content/siyuan-homepage-music-mobile-library-20260808.webp" alt="移动端 NAS 音乐库多级菜单" style="max-width: 360px; width: 48%; min-width: 260px;" />
</div>

移动端悬浮快捷按钮中可以启用耳机图标入口，不必先打开移动主页。播放器页面关闭后，插件内的常驻播放实例仍会保留当前歌曲、队列和进度；播放期间悬浮主按钮会显示动态效果。

<div align="center">
<img src="https://glaube-ty.top/images/content/siyuan-homepage-music-mobile-quick-action-20260808.webp" alt="移动端悬浮快捷按钮中的音乐播放器入口" style="max-width: 400px; width: 100%;" />
</div>

> [!IMPORTANT]
> 音乐播放器是会员组件。本地音乐依赖思源桌面客户端的文件系统，网页端、Docker 和移动端不能直接读取电脑音乐文件夹；移动端需要先配置 NAS。移动系统可能要求首次点击后才能播放音频，锁屏后台播放能力取决于思源 WebView 和系统策略。同一设备、同一主页界面只应放置一个音乐播放器。

完整配置、移动端操作、歌词封面、收藏歌单、播放队列与故障处理请查看：[音乐播放器详细教程](https://glaube-ty.top/tutorials/siyuan-homepage/music-player/)。

***

## AI 知识库：不只是聊天，而是理解你的思源

AI 知识库是 4.x 之后最重要的变化之一。它不是简单地把一个聊天框塞进插件里，而是让 AI 能够围绕思源中的真实内容工作：先从你的笔记中查找资料，再根据需要读取文档，在你确认后修改内容。

本项目不依赖预先构建的向量数据库。Agent 会根据用户问题，动态调用思源知识库搜索、文档读取、块级证据、文档结构、引用与反链等工具，再基于真实读取到的内容生成回答。这是一种以工具调用为核心的 Agentic RAG 工作流。

这里有几个值得了解的点：

- 不预先建立向量数据库，不代表完全不需要检索：搜索仍然存在，但搜索结果只是候选；
- 找到候选后，Agent 需要继续读取正文或块级证据，才能把它当作回答依据；
- 回答中的来源来自 Agent 真实读取到的内容，而不是搜索时看到的标题摘要；
- 文档树、引用和反链属于知识结构信息，用于帮助 Agent 定位和梳理，而不是“完整知识图谱”。

<div align="center">
<img src="https://glaube-ty.top/uploads/attachments/halo/10c0778d-058c-4b38-a2c6-b4e10ce27782.webp" alt="AI 知识库标签页对话" style="max-width: 600px; width: 100%;" />
</div>

### AI 知识库核心体验

- **两种入口**：侧边栏 Dock 对话和新标签页对话，两个入口使用同一套模型和功能设置，但知识范围不同；
- **多会话管理**：可以新建、切换、重命名和删除会话；
- **会话持久化**：会话历史随会话保存，重启思源后可以恢复继续对话；
- **知识范围选择**：当前笔记本、当前文档及子文档、当前文档邻域、全库问答；
- **手动附加文档**：搜索并附加特定文档，附加后 AI 只围绕这些文档工作；
- **深度思考**：在所选模型和接口支持 reasoning 输出时，可以展开查看模型返回的推理过程；
- **联网方式**：支持智能联网、必须联网和关闭联网三种模式，可逐轮选择；
- **上下文用量提示**：输入区显示当前上下文大致用量，接近上限时会提醒；
- **手动和自动压缩**：长对话中可以手动压缩上下文，当上下文压力达到安全阈值时，发送前会触发紧急压缩；
- **工具执行过程**：回答中的工具调用过程可以展开查看；
- **停止、重试、重新生成和删除本轮**：随时可以中断或调整对话；
- **会话恢复**：已完成并保存的会话会在重启后恢复；回答进行中发生异常退出时，系统会恢复最近持久化的内容并显示中断提示，但尚未写入的最后一部分流式内容可能无法恢复。

### 证据来源与行内引用

AI 回答不再只在结尾列出来源，而是可以在回答正文的对应语句后直接显示来源标记，点击即可跳转到来源位置。

- 引用来源可以包括思源文档、网页、MCP 资源、文件和 API 结果；只有经过来源校验（grounding）、确认 Agent 本轮真实读取过的内容，才能作为正式引用展示；
- 搜索结果只是候选，不会被直接当作“已读证据”引用；
- 点击引用可以定位到对应的思源文档、内容块，或在新标签页打开网页；
- 旧会话如果没有结构化行内引用数据，仍会使用回答底部的来源列表兼容显示。

### 受控内容修改

Agent 不只是读取，也能在你允许时修改内容。目前支持新建文档、插入内容块、更新内容块、移动内容块、删除内容块、重命名文档、删除文档、替换文档正文，以及数据库和任务日记写入。主页相关的组件布局与分栏调整，以及记账、纪念日、收藏、固定资产、复习、专注、快速笔记等业务数据，也可以通过 `homepage_manage` 和对应的 `homepage_*` 工具在确认后写入；写入遵循真实存储的 revision 冲突保护，主页在打开时会自动热刷新到最新数据。

安全体验包括：

- 写操作执行前都会显示确认，你确认前不会执行；
- 内容修改可以展示前后差异，方便核对改动；
- 新增和删除操作使用不同的提示样式；
- 删除操作会突出显示目标、路径和风险；
- 如果目标内容在确认期间被其他窗口修改，会拒绝继续覆盖；
- 高风险操作不能被“信任设置”完全绕过运行时安全校验，参数校验和安全检查始终生效。

说明：当前没有实现完整的 Agent 修改自动撤销系统，重要修改请依赖思源的历史或快照机制。

### AI 知识库功能介绍

AI 知识库的主要能力可以概括为：

| 能力   | 说明                                |
| ---- | --------------------------------- |
| 知识范围 | 当前笔记本、当前文档及子文档、文档邻域、全库和手动附加文档     |
| 对话能力 | 多会话、深度思考、联网模式、上下文压缩和会话恢复          |
| 证据能力 | 正文读取、块级证据、行内引用和来源跳转               |
| 执行能力 | 文档、任务、日记、数据库、主页布局/组件以及记账/纪念日/收藏等业务数据读写 |
| 扩展能力 | MCP、外部 Skill、自定义 Skill、全局记忆和快捷提示语 |

#### MCP 服务

AI 知识库可以作为 MCP Client 连接外部 MCP Server，让 Agent 在需要时调用外部服务提供的工具。

目前支持三种传输方式：

- **Streamable HTTP**：通过 URL 连接，桌面端和移动端都可以使用；
- **SSE**：通过 URL 连接，桌面端和移动端都可以使用；
- **stdio**：在本机启动命令，只支持 PC/Electron 环境。

通过 `mcp_manage` 聚合工具可以管理 Server 配置、同步工具、查看工具说明并调用已同步的 MCP 工具。设置页可以按 Server 和工具控制连接、暴露、启用和 trusted 状态，也会展示工具数量、只读/写入分类、风险标记和同步时间。

需要说明的是：标记为 trusted 后，工具仍会经过参数校验和安全检查，并保留调用记录，只是可能减少人工确认的次数，并不代表完全跳过所有安全检查。

#### 外部 Skill 说明包

技能相关能力分为三类：你自己编写的**用户自定义 Skill**、安装到本地工作区的**外部 Skill**，以及旧版的全文注入兼容方式。

- Agent 默认只看到经过清洗的安全索引（标题、摘要、触发条件等），不会把 Skill 全文注入每轮对话；
- 需要真正使用时，Agent 再通过 `skill_manage` 按需读取 Skill 内容；
- Skill 正文不会直接作为系统提示使用，也不能修改工具权限或绕过写入确认；
- 设置页支持外部 Skill 总开关、安装开关、旧全文注入兼容开关、单次读取上限和索引重建；
- 设置页可以直接启用或停用外部 Skill；删除本地 Skill 和重建索引会要求用户确认。Agent 通过 `skill_manage` 执行安装、卸载或重建等写操作时，也需要经过对应的安全确认。

#### 内置聚合工具 / Action 能力

现在的 Agent 能力以“聚合工具”的形式注册给模型：每个顶层工具通过统一的 `action` 字段选择具体能力，参数放在 `args` 中。例如模型看到的不是几十个零散工具，而是 `siyuan_kb`、`diary_task`、`siyuan_database` 这样少量稳定的顶层工具。

除了知识库、日记、文档与数据库等能力外，插件主页自身的组件、布局、分栏，以及记账、纪念日、固定资产、收藏、复习、专注、音乐、快速笔记等业务数据也以 `homepage_manage` / `homepage_accounting` / `homepage_anniversary` 等聚合工具开放给 Agent：既可以直接按你当前真实主页读取和调整组件布局，也可以在组件未放在主页时继续操作共享业务数据。所有写入都需要确认，且遵循真实存储的 revision 冲突保护。

这样做的目的有三个：

- **减少工具数量**：模型面对的是少量稳定的聚合工具，而不是几十个细碎工具；
- **保留能力边界**：每个 action 仍然有独立参数、只读/写入标记、风险说明和确认规则；
- **便于设置和帮助**：设置页按聚合工具展示能力，不确定参数时可以通过 `agent_tool_help` 查询工具和 action 说明。

内置工具概览：

| 工具                   | 能力范围                                 | 典型 action                                                                    |
| :------------------- | :----------------------------------- | :--------------------------------------------------------------------------- |
| `siyuan_kb`          | 知识库搜索、正文读取、块级证据、文档信息、知识结构、时间列表、引用和特殊检索 | `search`、`read_docs`、`read_evidence`、`get_doc_info`、`list_by_time`、`extra_search` |
| `diary_task`         | 强化日记、任务、快速记录、复盘和日记结构管理               | `overview`、`query_tasks`、`find_docs`、`manage_task`、`manage_record`、`manage_review` |
| `siyuan_database`    | 思源数据库查询、条目读取、字段和单元格的受控写入             | `list`、`read`、`find_rows`、`update_cell`、`add_rows`、`view`                     |
| `siyuan_doc_edit`    | 文档块读取、块属性、引用、状态、创建、插入、移动、删除和正文替换     | `read_blocks`、`create_doc`、`insert_block`、`update_block`、`delete_blocks`、`replace_doc_content` |
| `siyuan_tree`        | 笔记本、文档树和路径解析                         | `notebook`、`doc_tree`、`doc_path`                                             |
| `siyuan_meta`        | 标签和书签管理                              | `tag`、`bookmark`                                                             |
| `siyuan_asset`       | assets、OCR、标注、未使用资源和受限工作区文件          | `read`、`manage`、`workspace_file`                                             |
| `siyuan_riff`        | Riff 卡包和闪卡复习管理                       | `deck`、`card`                                                                |
| `homepage_manage`    | 主页组件、布局与分栏的读取和管理（含旧布局残留清理）       | `overview`、`list_widgets`、`get_widget`、`list_widget_types`、`get_layout`、`list_sections`、`add_widget`、`update_widget`、`move_widget`、`remove_widget`、`update_layout`、`create_section`、`remove_section`、`set_active_section`、`cleanup_unresolved_widgets` |
| `homepage_quick_note`| 主页快速笔记的写入与状态查看                    | `status`、`write`                                                             |
| `homepage_focus`     | 专注统计查询与已完成会话补记                   | `stats`、`record_session`                                                      |
| `homepage_accounting`| 记账流水、资产账户与收支统计                   | `overview`、`query_records`、`summary`、`add_record`、`update_record`、`archive_record`、`list_accounts`、`add_account`、`archive_account`、`category_report` |
| `homepage_fixed_assets`| 固定资产的增改、归档与分期成本统计              | `list`、`get`、`add`、`update`、`archive`、`cost_summary`                        |
| `homepage_anniversary`| 纪念日、生日、周年和重要日期的管理               | `list`、`get`、`add`、`update`、`archive`、`restore`、`delete_permanently`、`list_categories`、`create_category`、`update_category`、`delete_category` |
| `homepage_favorites` | 收藏文档、分组归属和顺序                      | `list`、`add`、`remove`、`move_to_group`、`list_groups`、`create_group`、`rename_group`、`delete_group`、`reorder` |
| `homepage_review`    | 插件自有的文档/块复习计划                     | `list`、`summary`、`schedule`、`update_plan`、`complete`、`postpone`、`finish`、`remove` |
| `homepage_music`     | Subsonic/Navidrome 云端音乐、歌单与播放器控制     | `status`、`search`、`list_playlists`、`create_playlist`、`rename_playlist`、`delete_playlist`、`add_to_playlist`、`favorite`、`unfavorite`、`play`、`pause`、`resume`、`set_volume` |
| `skill_manage`       | 外部/用户 Skill 说明包的列出、读取、安装、停用和重建索引     | `list`、`read`、`read_file`、`install`、`uninstall`、`reindex`                     |
| `mcp_manage`         | MCP Server 配置、工具同步、工具说明和工具调用         | `list_servers`、`save_server`、`sync_tools`、`list_tools`、`read_tool`、`call_tool`  |
| `notebrain_file`     | Notebrain 工作区文件读写和本地命令执行（仅 PC/Electron） | `list_dir`、`read_file`、`write_file`、`delete_path`、`run_command`                 |
| `web_fetch`          | 网页读取和 HTTP 请求                        | `read_page`、`http_get`、`http_post`                                           |
| `edit_global_memory` | 全局记忆的受控更新                            | 直接传入完整 `memory` 文本进行全量替换                                                     |
| `agent_tool_help`    | 查看当前工具和 action 的说明、参数和风险边界           | `list_tools`、`describe_tool`、`list_actions`、`describe_action`               |

***

### 编辑器工具栏 AI：选中文字就能处理

编辑器工具栏 AI 的目标是减少复制粘贴。过去如果你想让 AI 解释、翻译或润色一段文字，通常需要把文字复制到外部 AI 工具里，再把结果复制回来。现在可以直接在思源编辑器中选中文字，点击工具栏中的 AI 按钮处理。

目前支持的能力包括：

- AI 问答（打开侧边栏并带入选中文字，适合继续追问）
- 解释
- 翻译
- 润色
- 自定义技能
- 技能排序
- 技能停用
- 技能删除（仅限自定义技能）
- 技能显示位置管理（工具栏或菜单）
- 技能级模型参数设置

每个技能都可以独立选择模型、温度、输入长度和输出长度，支持流式输出；也可以选择附带当前文档标题和选区附近上下文，让 AI 更理解当前文字所在的笔记环境。处理结果在选区附近弹出显示，弹窗提供复制、重新生成和关闭三个操作。

***

### 主页 AI 状态语

状态语不再只是固定模板。开启 AI 智能生成后，主页可以根据真实统计数据（记录天数、笔记数量、文档数量、任务数量等）生成一句新的状态语，让你每次打开主页都看到一句和自己当前状态有关的话。

主页 AI 状态语支持：

- 使用真实统计数据，不编造数据
- 自定义模板（支持变量）和自定义 AI 提示语
- 单独选择大模型
- 设置生成风格
- 设置返回字符上限
- 设置思考模式
- 手动刷新（悬浮刷新按钮）
- 失败时明确提示，不会误显示为自定义内容

***

## 快捷入口与快捷键

以下命令已注册为思源插件命令，其中“打开主页”和“快速笔记”默认带有快捷键，其余命令可以在思源“设置 → 快捷键”中自行绑定（快捷键只在支持命令的桌面环境生效）：

| 命令 | 默认快捷键 | 说明 |
| -- | ----- | -- |
| 打开主页 | `Ctrl+Shift+H`（macOS 为 `Cmd+Shift+H`） | 打开思源主页 |
| 快速笔记 | `Ctrl+Shift+Q`（macOS 为 `Cmd+Shift+Q`） | 打开快速笔记弹窗（需先在主页设置中开启） |
| 打开记账 | 无默认 | 打开完整记账窗口 |
| 打开强化日记工作台 | 无默认 | 打开强化日记工作台 |
| 强化日记工作台：新建任务 | 无默认 | 快速新建任务 |
| 强化日记工作台：快速记录 | 无默认 | 快速记录 |
| 新标签页 AI 对话 | 无默认 | 在新标签页打开 AI 对话 |

***

## 本地密钥保护

大模型与联网搜索的 API Key 在插件中以本地加密方式保存，避免配置文件中直接出现明文密钥。设置页中的密钥输入框默认隐藏，可通过眼睛按钮临时查看。

需要说明的是：

- 这里的安全目标是减少配置文件明文暴露风险；
- 本地加密不等同于操作系统密钥链，也不应该被理解为绝对安全；
- 当你调用模型、搜索、Webhook、MCP 或机器人服务时，相关请求仍会发送到你配置的第三方服务；
- 插件不会声称所有 AI 数据始终不离开设备。

***

## 使用教程与更新日志

主页插件功能比较多，如果你是第一次使用，建议先查看详细教程：[📖 详细使用教程](https://glaube-ty.top/tutorials/siyuan-homepage/)

如果你想了解每个版本具体更新了什么，可以查看完整更新日志：[📄 完整更新日志](https://glaube-ty.top/tutorials/siyuan-homepage/changelog/)

***

## 相关文章

- [思源主页插件：AI 知识库](https://glaube-ty.top/tutorials/siyuan-homepage/ai-knowledge-base/)
- [思源主页插件：强化日记工作台](https://glaube-ty.top/tutorials/siyuan-homepage/enhanced-diary-workbench/)
- [思源主页插件：记账组件](https://glaube-ty.top/tutorials/siyuan-homepage/bookkeeping/)
- [思源主页插件：音乐播放器](https://glaube-ty.top/tutorials/siyuan-homepage/music-player/)
- [思源主页插件：机器人助手](https://glaube-ty.top/tutorials/siyuan-homepage/robot-assistant/)
- [思源主页插件：通知中心与 Webhook 外联通知](https://glaube-ty.top/tutorials/siyuan-homepage/webhook-notifications/)
- [思源主页插件：复习文档组件](https://glaube-ty.top/tutorials/siyuan-homepage/review-documents/)
- [主页插件任务管理 Plus 组件设置教程](https://glaube-ty.top/tutorials/siyuan-homepage/task-management-plus/)
- [主页插件 —— 任务管理 Plus](https://ld246.com/article/1751797033411)
- [主页插件 —— 实用又美观的信息汇总页面](https://ld246.com/article/1751795938779)

***

## 支持开发

如果这个插件对你有帮助，欢迎给作者点个赞或打赏一杯咖啡。这会鼓励作者继续更新，也能支持后续更多功能的维护和开发。

<div align="center">
<img src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/ReQR.png" alt="赞赏二维码" style="max-width: 600px; width: 100%;" />
</div>

[💖 特别鸣谢](https://glaube-ty.top/da-shang/)

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

[👑 VIP 权益](https://glaube-ty.top/tutorials/siyuan-homepage/vip-benefits/)

***

## 参考项目

本插件部分功能参考了以下优秀项目，感谢开源社区提供的灵感与基础能力。

| 项目                                                                          | 说明                                       |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| [SiYuan](https://github.com/siyuan-note/siyuan)                             | 本插件基于思源插件能力和 Kernel API 构建               |
| [Svelte](https://github.com/sveltejs/svelte)                                | 本插件主要前端界面使用 Svelte 构建                    |
| [Vite](https://github.com/vitejs/vite)                                      | 本插件使用 Vite 进行开发与打包                       |
| [AI SDK](https://github.com/vercel/ai)                                      | AI 知识库和模型调用流程使用 AI SDK 相关能力              |
| [siyuan-kit-svelte](https://www.npmjs.com/package/siyuan-kit-svelte)        | AI 知识库对话界面复用了 siyuan-kit-svelte 的基础组件     |
| [Echarts](https://github.com/apache/echarts)                                | 本插件中的图表能力主要来自 Echarts                    |
| [ECharts Wordcloud](https://github.com/ecomfe/echarts-wordcloud)            | 可视化图表中的词云能力来自 ECharts Wordcloud          |
| [Lucide](https://github.com/lucide-icons/lucide)                            | 部分组件和界面图标使用 Lucide 图标                    |
| [Howler](https://github.com/goldfire/howler.js/)                            | 本插件中的音乐播放功能来自 Howler                     |
| [music-metadata](https://github.com/Borewit/music-metadata)                 | 音乐文件元数据读取能力来自 music-metadata             |
| [Mousetrap](https://github.com/ccampbell/mousetrap)                         | 本插件使用 Mousetrap 来处理键盘快捷键                 |
| [Quill](https://github.com/slab/quill)                                      | 本插件中的便签组件来自 Quill                        |
| [Sortable](https://github.com/SortableJS/Sortable)                          | 本插件中的组件拖拽布局和技能排序来自 Sortable              |
| [Multiselect](https://multiselect.janosh.dev/)                              | 本插件中的多选框来自 Multiselect                   |
| [Tyme](https://github.com/6tail/tyme4ts)                                    | 本插件部分日期算法来自 Tyme                         |
| [UAPI SDK TypeScript](https://github.com/AxT-Team/uapi-sdk-typescript)      | 本插件的热搜和天气组件使用了 UAPI SDK TypeScript       |
| [Floating UI](https://floating-ui.com/)                                     | 本插件中的浮动预览窗口来自 Floating UI                |
| [Zod](https://github.com/colinhacks/zod)                                    | Agent 工具参数、配置和运行时输入校验使用 Zod              |
| [Ajv](https://github.com/ajv-validator/ajv)                                 | 部分 JSON Schema 校验能力来自 Ajv                |
| [DOMPurify](https://github.com/cure53/DOMPurify)                            | HTML 内容安全净化使用 DOMPurify                  |
| [CryptoJS](https://github.com/brix/crypto-js)                               | 本地密钥加密保存使用 CryptoJS                      |
| [JSZip](https://github.com/Stuk/jszip)                                      | 数据导入导出、打包相关能力使用 JSZip                    |
| [Lark OpenAPI SDK](https://github.com/larksuite/oapi-sdk-nodejs)            | 飞书机器人与外联能力使用飞书 OpenAPI SDK               |
| [Swiper](https://swiper.com.cn/)                                            | 本插件中的轮播图组件来自 Swiper                      |
| [elliptic](https://github.com/indutny/elliptic)                             | 会员授权校验使用 elliptic 加密算法                    |

***

## 免责声明

- 主页布局、组件配置和插件业务数据主要保存在用户自己的思源工作空间或插件数据目录中。
- AI、联网搜索、MCP、Webhook、机器人等功能会按用户配置向对应第三方服务发送必要请求，第三方服务的费用、可用性、隐私政策和输出结果由对应服务商负责。
- AI 生成内容仅供参考，涉及重要信息、文档编辑、删除数据等操作时，请务必自行确认。
- 文档写入、数据库修改和删除操作必须由用户自行确认后再执行。
- 请遵守法律法规和第三方服务条款。
- 请在执行重要修改前做好备份，并自行核对 AI 生成结果和写入目标。
- 项目代码授权范围以仓库中的 [LICENSE](https://github.com/Glaube-TY/siyuan-homepage/blob/main/LICENSE) 为准。

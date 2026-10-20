# 主页插件性能优化发布前验收

审查基线：`be26b2181d20ca86744081b92c208c55bc77b8cd`。版本保持 5.1.10，最低思源 3.8.6，SDK 1.2.9。

> 前半部分保留历史记录；2026-10-20 各轮实测及用户批准后的部署补验分别在文末单列。最新结论：受限 Kernel 读写 PASS；两份正式 JS 已备份部署、安装哈希与 dist 一致，官方重载请求成功、Kernel running；前端内存实例与真实 UI 性能仍未验收，不代表发布 PASS。

**2026-10-19 历史结论：BLOCKED，核心 A～M 尚未实测。2026-10-20 已补齐本机只读 Kernel API 验收，结论为 API PASS，见文末；完整 UI 与业务写入验收仍未完成，不得据 API PASS 宣布可以发布。**

2026-10-19 该轮只增加本报告，不改生产逻辑、测试期望、版本、索引格式或共享快照架构。不创建 tag、Release 或发布分支，不部署在线插件。

## 隔离环境调查

开始时 main 与指定基线一致、工作区干净；已读取 AGENTS、performance、data-and-indexing、DESIGN，并用 CodeGraph 检查实际调用链。

- 本机存在 SiYuan 客户端及 Kernel 进程；只读 `POST /api/system/version` 返回 code 0、3.8.7。没有读取正式任务/项目/日记或真实索引。
- 可访问的仓库配置中未找到 Docker/Compose 测试实例配置；Docker CLI 不可用，不能检查容器挂载。未扫描 NAS、未登录未知远端、未修改容器或网络配置。不能据此断言机器外不存在测试实例。
- 仓库存在有效开发部署目标，目标目录可访问且以本地路径表示，但没有证据证明它是独立测试工作区、与正式数据不同目录或采用独立配置/索引；**部署配置存在不等于隔离已确认**。
- 工具界面清单没有可操作原生应用或浏览器页面；进程命令行没有发现显式调试端口。Chrome DevTools 和 Playwright 的只读页面清单查询均因缺少配置的 Chrome 可执行文件失败。这是 UI 工具环境依赖问题，不是插件性能回归，未安装浏览器或修改客户端启动参数来绕过。
- 未确认工作空间目录差异、NAS/Docker 挂载边界、独立插件配置和独立数据/索引；因此没有执行写入测试，也未切换正式工作空间、创建笔记本、清理/重建索引或重启正式实例。

解除阻塞需要维护者提供已存在测试实例的隔离证据与可操作客户端：确认数据目录与正式目录不同、挂载不指向正式数据、插件配置/索引独立；只在该已确认实例中安装待测包。报告不包含目录、部署目标、项目标题或凭据。

## 源码审查与自动化可确认的边界

- `getTaskIndexResult()` → `readTaskIndexSnapshot()`：普通展示严格读快照，不进入逐块校验/删除维护；正式失效清理和写入确认路径仍在。
- `refresh()`：核心读取成功且生命周期/权限/版本有效后发布 state；日历及日期详情独立加载。`drainWorkspaceRefresh()` 保留单飞、尾队列、失败保留 pending、旧结果隔离和卸载保护；没有恢复固定 400ms 二次整页刷新。
- 项目创建 → `refreshEnhancedDiaryProjectIndexAfterCreation()`：保留受影响根节点的定向维护、目录/磁盘快照检查和写后回读。
- 生命周期 `refreshInternal()`：保留严格磁盘读取及业务校验，语义不变时不写项目索引；真实变化保存并回读。创建前两次校验未删。
- 这些是审查及 fixture 结论；没有据此证明真实客户端弹窗时序、DOM 渲染、Kernel 写入/同步耗时或跨设备一致性全部合格。

## 自动化与构建

所有构建命令的进程环境均设置 `SIYUAN_SKIP_DEV_DEPLOY=1`。构建前确认仓库 dist/dev 为普通目录；构建只生成仓库内产物，未覆盖已配置的真实插件目标。

| 命令 | 退出状态与覆盖结果 | 命令耗时（秒） |
| --- | --- | ---: |
| `pnpm verify:task-index-sync-performance` | 0；28 场景 | 9.6 |
| `pnpm verify:enhanced-diary-project-index` | 0；聚合 PASS，含 150 日期及历史/诊断保护 | 39.3 |
| `pnpm verify:enhanced-diary-project-create-performance` | 0；23 组 + 24/21/18 条维护/服务/生命周期测量 | 98.0 |
| `pnpm verify:enhanced-diary-workspace-actions` | 0；29 组 | 4.2 |
| `pnpm verify:siyuan-api-compat` | 0；A–H | 1.1 |
| `pnpm verify:notification-storage-read` | 0；真实 checked/storage 路径、六个设置加载器、调度恢复及失败零写入 | 1.3 |
| `pnpm verify:piccaro-cross-platform` | 0；生产挂载/真实 Swiper Autoplay、两次定时切换、可见性/销毁/引导并存 fixture | 2.5 |
| `pnpm verify:music-player-mini-layout` | 0；真实布局/Observer 回调及 Svelte 渲染 fixture | 2.5 |
| `pnpm verify:homepage-operation-guide` | 0；真实控制器/生命周期/本地偏好/渲染 fixture | 2.0 |
| `pnpm typecheck` | 0 | 14.6 |
| `npx tsc --noEmit` | 0 | 16.8 |
| `pnpm lint` | 0 | 19.2 |
| `pnpm build:app` | 0；含 TypeScript/Svelte/SCSS 编译 | 63.2 |
| `pnpm build:kernel` | 0 | 10.1 |
| `pnpm build` | 0；完整打包及仓库内镜像同步 | 65.3 |

没有自动化失败，没有修改期望或生产代码来让测试变绿。两项浏览器页面探测的错误单独归为环境依赖问题：缺少 Chrome executable / Chromium distribution，不能据此把未运行的实机 UI 记为通过。

上表耗时是整条测试/构建命令的墙钟时间，部分命令并行运行；**不是任何真实思源操作的耗时**。Node/API fixture、Svelte 脚本回调及编译检查不等于隔离客户端测试。

产物实际检查通过：

- 源码 `plugin.json` 与 `dist/plugin.json` SHA-256 完全一致；源码/package/产物版本均为 5.1.10，minAppVersion 3.8.6、SDK 1.2.9 未改。
- `package.zip` 共 118 个条目，5,507,664 字节。逐项核对 ZIP 中 plugin.json、index.js、index.css、kernel.js 与本次 dist 文件的字节 SHA-256 全部相同，三个 bundle/样式文件均非空。
- ZIP SHA-256：`c9cbb09574fd29e6d74a30922eac455a183e3071921c60bfb01aa7850ccaa623`。
- app/kernel/完整构建全部设置自动部署关闭；完整构建日志只有仓库 dev 的 copied 0 / unchanged 105 / deleted 0，未出现真实插件目录部署。原配置目标没有被用作待测部署目录。
- 产物保留在本地仓库，未提交打包文件、未安装客户端、未创建发布记录。此 SHA 是当前本地产物身份，不是已发布版本的验收标记。

## 实机操作和性能记录

完成的业务实机操作：**0**。仅进行了前述只读环境/版本探测。未在真实插件实例开启 taskIndexDiagnostics，未取得真实操作前后计数。

以下所有步骤的点击至处理中、写入确认、弹窗关闭、最新状态显示、文件读写、API 耗时、刷新次数均为 **N/A（未执行）**，不能填 0 或用合成时间代替：

| 步骤 | 隔离实机操作 | 本轮状态 / 实测耗时 | 必须核对 |
| --- | --- | --- | --- |
| A | 启动测试思源并打开主页 | 未执行 / N/A | 首屏可用、无阻塞错误 |
| B | 进入强化日记工作区 | 未执行 / N/A | 核心先显示，非关键面板独立 |
| C | 创建一个根项目 | 未执行 / N/A | 正确测试容器、只创建一次 |
| D | 创建一级子项目 | 未执行 / N/A | 正确层级、最终项目索引持久化 |
| E | 创建多级子项目 | 未执行 / N/A | 父子/祖先关系及归档限制 |
| F | 创建一条任务 | 未执行 / N/A | 写入确认后关闭，不等待日历、不重复 |
| G | 完成任务 | 未执行 / N/A | 文档、索引与最终显示一致 |
| H | 取消完成 | 未执行 / N/A | 正确恢复，不被旧请求覆盖 |
| I | 添加关联快速记录 | 未执行 / N/A | 不重复、项目关联正确 |
| J | 项目视图查看任务/记录 | 未执行 / N/A | 与测试文档及正式索引一致 |
| K | 切换各页、月份和日期 | 未执行 / N/A | 无无限刷新、旧结果不覆盖新选择 |
| L | 关闭后重新打开工作区 | 未执行 / N/A | 状态恢复，旧实例停止更新 |
| M | 重启测试实例后读取同批数据 | 未执行 / N/A | 磁盘持久化结果一致 |
| N | 两个独立测试端同步 | 未执行 / N/A | 只有确有两个隔离端才测；不能用正式端替代 |

## 取得隔离环境后的人工验收步骤

1. 先由维护者核对测试实例的数据目录、容器挂载和独立插件配置/索引；未核实前不安装、不写入、不重启正式实例。使用下文校验过的本地待测包，只安装到测试实例，版本仍为 5.1.10。
2. 打开测试客户端开发工具，Network/Performance 开始记录，按 A～M 顺序各做必要的一次操作；测试项目与任务只存在于隔离数据中。保留同一批测试数据用于 M，避免用重建/清空索引制造成功结果。
3. 对 F～I 分别记录点击、处理中状态首次显示、业务确认、弹窗关闭、核心最新状态的时间点及差值。对 C～E 区分文档/标题创建、属性确认、索引维护/回读、面板显示阶段。数值缺失保持 N/A，失败保留原因，不重复提交已确认成功的写入。
4. 在调试器选中已确认的主页插件实例，通过其 `taskIndexDiagnostics` 执行 enable(true)、reset()、操作前 snapshot()、单次操作、操作后 snapshot()。只分享 databaseCommits、targetedRefreshes、broadCleanups、indexReads、indexWrites、writeBytes、noopWritesSkipped、dataUpdatedEvents、workspaceRefreshes 的数值差；完成或异常后均 enable(false)。不假设某个全局变量名。
5. 通过 Network 单独汇总项目索引与 recent-doc-snapshot 的读取、写入次数及耗时；taskIndexDiagnostics 主要度量任务路径，不能代替这两个文件的测量。分别记录完整核心刷新和项目面板刷新；真实新事件需要尾刷新时保留原因，不能一律认为第二次读取就是回归。
6. 核对测试文档、索引和界面结果；再在测试端开发工具中临时阻断**已定位的日历/日期详情读取阶段**，确认不反转核心成功，不要全局阻断与核心共享的 API 或修改数据文件来模拟错误。恢复拦截后确认可重试。
7. 在隔离数据内验证无业务变化不写任务/项目索引、真实变化保存、确认失效任务经正式维护清理、读取失败保留原文件。索引损坏/丢写等破坏性故障优先继续用已有 fixture，勿损坏测试实例以外的数据；项目部分成功提示应明确“勿重复创建”。
8. 执行 L/M；有两个已确认隔离端时再做 N。分享记录前移除正文、标题、路径、ID、Token 及原始请求内容，只保留步骤代号、数值和标准错误类别。无须新增持续日志或共享业务副本。

## 重复写入、数据一致性及剩余风险

本轮重新执行的合成验证确认：

- 4500 条任务前台读取：1 次索引读取、0 次逐块 API、0 次写入；targeted/broad 无变化各 0 写入；有变化的组合维护为 1 写入并回读。这里不把 fixture 毫秒数当成实机指标。
- 5/50/200 根项目的无变化单次/连续两次生命周期校验均为 0 次项目索引写入；成功创建子项目为 1 次最终维护写入，重名拒绝为 0。归档/恢复、父子关系、严格读取、移动中断及回读失败用例通过。
- 实际生产 recent-doc 准备/提交函数配合 mock API 的无变化用例：两次校验仍为共享快照 2 次写入、4 次读取，而项目索引写入为 0。这是已知保留行为，不是新发现的实机频率。
- 工作区 fixture 中创建任务、完成/取消完成、添加记录各 1 次核心刷新；项目创建处理函数各 1 次面板刷新。未验证真实父子组件 effect、延迟 Kernel 事件及客户端调度下的次数。

recent-doc-snapshot 的**真实客户端频率、单次耗时和同步影响均未测得**。本轮不修改共享快照服务，不据合成次数认定它是实机主瓶颈。

已有 fixture 继续验证损坏/版本/权限/网络失败不覆盖写前基线、已观测外部变化被拒绝覆盖、历史关系保护、业务写后回读、过期响应和卸载清理；未完成真实重启持久化与多端同步。当前维护队列限于本 JS 实例，写前检查/写后回读不是跨端原子 CAS；旧公共展示缓存等边界见前轮报告，不能扩大为全部入口的一致性保证。

本轮未发现需修改生产代码才能继续自动化验收的新回归；已确认阻塞来自测试环境隔离与 UI 工具条件。既无实机收益数据，也无实机主瓶颈证据，本轮不继续性能重构，不决定拆分 task-index.json。

## 发布判定

**BLOCKED，不能进入发布放行。** 自动化与打包即使全部通过，也不能满足缺失的隔离核心验收。

发布前必须补齐：环境隔离证据、A～M 实机操作与时间/次数记录、核心一致性及日历/详情失败隔离；N 按确有两个测试端的条件执行。确认后重新给出 PASS 或列明非关键缺口的 CONDITIONAL。本报告不是发布授权。

## 本地 Kernel API 实测（2026-10-20）

本轮基线 `c0dec396f1351b667209f29ec94fc41236f87a51`。用户授权直接使用本机思源进行只读验证，地址固定为 `http://127.0.0.1:6806`；不依赖 NAS、Docker 或远程环境。**已执行范围的 API 合约与只读性能验收：PASS。UI 和业务写入：未验收，完整发布放行仍未满足。**

### 实测方法与安全边界

- 当前进程及用户/系统环境原先均未设置 Token；凭据通过 PowerShell 7 `Read-Host -MaskInput` 的遮蔽标准输入进入临时进程环境，只供该进程及子进程使用，结束后移除。没有放入命令行、脚本、数据文件、报告或 Git。
- 新增 `node scripts/verify-local-kernel-readonly.mjs`：固定 loopback、接口/请求体白名单、最多 64 次请求、单请求 10 秒超时、8 MiB 响应上限、150ms 请求间隔、不跟随重定向。结果仅保留字段名/类型、状态、字节数、计数及耗时。
- 从 `{}` 请求 version、lsNotebooks 开始，选择响应中一个未关闭笔记本，目录最多取一个文档；路径、块和属性 ID 仅来自已成功读取的真实结果。SQL 仅在这个已知文档 ID 上选择结构化字段并 `LIMIT 1`，没有正文搜索、全库扫描或自造块 ID。
- 最终验证轮 44 次只读请求，包括每种正常接口/文件样本 3 次、缺失文件 3 次、一次去掉 Authorization 的对照及生产函数调用；另有首次诊断轮 42 次和三次既有 `--live-read`，合计 89 次有界读取。下表只统计最终轮各 3 次直接请求，未混入首轮、生产适配及 live-read 时间。
- 直接响应仅在内存中解析，不保存正文、名称、ID、路径或原始对象。PNG 只读字节、不展示内容；项目索引只做读取/解析，所有写入端口和未放行接口均拒绝。最终轮 blockedCalls=0、真实写入=0；本轮未读取 recent-doc 快照或改任何业务设置。

### 真实响应结构与代码匹配

真实 Kernel 版本为 **3.8.7**，版本响应 `data:string`。带 Authorization 的正常请求均 HTTP 200、成功 envelope `code:number(0)` / `msg:string` / `data`；去掉 Authorization 的 getFile 对照为 HTTP 401，JSON `code:number(-1)`、`msg:string`，没有 data。该对照确认本轮使用的鉴权有效。

| 接口/字段 | 实测类型或行为 | 证据状态 / 生产代码匹配 |
| --- | --- | --- |
| lsNotebooks `data` | object，包含 `notebooks:array`、`boxDocEnabled:boolean` | 真实接口已确认；checked 包装解包后读取 notebooks 正确 |
| 每个 notebook 的字段类型并集 | id/name/icon:string；sort/sortMode/subFileCount/newFlashcardCount/dueFlashcardCount/flashcardCount:number；closed/encrypted/unlocked:boolean | 真实接口已确认；没有输出值或对象 |
| listDocsByPath `data` | box/path:string，files:array，effectiveSortMode:number | 真实接口已确认；box、path 与请求一致 |
| files 条目 | id/name/path/icon/name1/alias/memo/bookmark/hSize/hMtime/hCtime:string；count/size/mtime/ctime/sort/subFileCount/newFlashcardCount/dueFlashcardCount/flashcardCount:number；childrenSortMode:null | 所列样本类型真实接口已确认；childrenSortMode 的非 null 形式尚未确认 |
| getPathByID `data` | notebook/path:string | 真实接口已确认；与前置笔记本及目录路径相等，创建位置判断字段正确 |
| getChildBlocks `data` | array；出现 id/type/subType/content/markdown:string，后两项可缺失 | 真实接口已确认；本次 4 个 p 块同时省略 content 和 markdown，没有输出正文；现有 subType 兼容和 optional 字段正确 |
| batchGetBlockAttrs `data` | 真实块 ID → object，各属性值为 string；两个请求条目均存在 | 真实接口已确认；按 ID 映射解析正确，没有把映射键作为日志输出 |
| SQL 响应 | data:array；选出的 id/type/subtype/root_id/box/path/updated:string；顶层另含 limit:number、truncated:boolean | 真实接口已确认；结果 ID 等于前置文档 ID，sqlChecked 正确取 data 数组 |
| getFile 正常 PNG | HTTP 200，image/png，17,960 字节，无 JSON envelope | 真实接口已确认；getFileChecked 接受 ArrayBuffer |
| getFile 正常任务/项目 JSON 文件 | HTTP 200，application/json；直接是文件对象，没有 code/msg/data 包装 | 真实接口已确认；任务根为 version/updatedAt/items，项目根为 version/updatedAt/containerSignature/complete/roots/nodes，现有读取正确 |
| getFile 缺失文件 | **HTTP 202**，application/json，`code=404`、msg:string、data:null | 真实接口已确认；不是 HTTP 404，必须识别 JSON code；getFileOrNullChecked 实测返回 null |
| getFile 未鉴权 | HTTP 401，JSON code=-1 | 真实接口已确认；不能把 HTTP/JSON 错误解释成空文件 |
| 网络故障、超时、空文件、索引损坏/错误版本、权限变化 | 未人为停止 Kernel 或损坏文件 | 本轮尚未实测；仍仅有既有 Fixture/源码验证，不能称为真实故障验收 |

本章没有用官方源码推断未出现的字段值；表中未出现的可选变体均不自动升级为“真实确认”。此前官方源码/Fixture 的证据继续保留，不能替代本表实测。

### 真实本地 API 性能

耗时从 fetch 开始至响应体读取完毕，**不包含**请求间隔、esbuild 或脱敏输出。每行样本均为同一请求 3 次，不是高频压力测试；只能说明本机这批样本，不代表 UI 延迟或大型数据库吞吐。

| 接口/文件样本 | 正常读取成功 | HTTP / API code | 平均 ms | 最小 ms | 最大 ms | 响应字节（三次） |
| --- | --- | --- | ---: | ---: | ---: | --- |
| /api/system/version | 3/3 | 200 / 0 | 22.24 | 17.3 | 32.06 | 34/34/34 |
| /api/notebook/lsNotebooks | 3/3 | 200 / 0 | 17.92 | 16.81 | 18.57 | 723/723/723 |
| /api/filetree/listDocsByPath | 3/3 | 200 / 0 | 18.91 | 18.14 | 20.4 | 528/528/528 |
| /api/filetree/getPathByID | 3/3 | 200 / 0 | 17.91 | 17.62 | 18.28 | 100/100/100 |
| /api/block/getChildBlocks | 3/3 | 200 / 0 | 18.04 | 17.88 | 18.21 | 1525/1525/1525 |
| /api/attr/batchGetBlockAttrs | 3/3 | 200 / 0 | 17.03 | 16.72 | 17.52 | 232/232/232 |
| /api/query/sql | 3/3 | 200 / 0 | 12.36 | 2.9 | 17.15 | 241/241/241 |
| getFile:plugin-icon | 3/3 | 200 / 无 envelope | 21.55 | 20.14 | 22.55 | 17960/17960/17960 |
| getFile:task-index | 3/3 | 200 / 无 envelope | 21.6 | 20.65 | 22.75 | 51958/51958/51958 |
| getFile:project-index | 3/3 | 200 / 无 envelope | 20.24 | 19.42 | 21.03 | 8267/8267/8267 |
| getFile:missing | 0/3 | 202 / 404 | 19.65 | 18.88 | 20.37 | 168/168/168 |

正常行成功率均 3/3，无 HTTP 错误、无非零 API code；正常文件行没有 API code。缺失行文件读取成功率为 0/3，但 **3/3 均正确得到预期 not_found**，不是测试失败。未鉴权对照只有 1 次，HTTP 401 / code=-1，属于主动对照而非运行异常。

### 生产函数真实调用与修正

10 项实际生产代码检查通过：lsNotebooksChecked、浏览器相对 URL 的 lsNotebooks、requestChecked 的受限目录读取、getPathByID、getChildBlocksChecked、batchGetBlockAttrs、sqlChecked、getFileChecked 二进制、getFileOrNullChecked 缺失语义，以及现存项目索引的 `readCreationIndex()` 严格解析。

项目严格解析通过 esbuild 临时导出原私有函数，未修改生产可见导出；运行时端口连接真实本地 Kernel，未替换返回数据。仅把不应触发的维护入口替换成直接拒绝，任何写入均拒绝。没有调用完整重建、生命周期刷新或项目创建。

首轮普通 lsNotebooks 检查曾为 TypeError：它明确使用浏览器原生相对 URL，而不是 runtime port。在纯 Node 中直接调用该路径缺少浏览器 origin。修正的是验证脚本：将该相对 URL 的测试传输绑定到固定 loopback，添加环境中的 Authorization，仍使用 Kernel 的真实响应；同时独立验证 checked 入口。没有修改生产实现、Mock 返回或放宽测试期望来掩盖问题。

实际发现并修复的错误假设是 **`src/types/api.d.ts` 的 `DocFile.mtime:string`**：现改为 number。现有项目目录运行时检查本来就要求 number，转换索引更新时间也使用 String，因此没有发现该处运行时字段错读；既有项目 fixture 已用数字 mtime，原样保留，新增 live verifier 对真实目录 ID/name/path/mtime 类型和映射做断言。其余本次检查的生产字段与真实接口相符，不额外重构。

### 实际任务索引只读性能

已先审查既有 `scripts/verify-task-index-sync-performance.mjs --live-read`：真实端口只允许读取固定 task-index.json，post/putFile 全部拒绝；前置 fixture 不会写到 Kernel。三次独立运行均 exit 0、status=ok、54 条任务、每次 1 次真实文件读取、0 次逐块 API、0 次索引写入。

- 文件实测大小 **51,958 字节**；三次直接 getFile 的大小一致。
- 生产 `getTaskIndexResult()` 真实读取/解析耗时：**43.9、41.8、41.6ms**；平均 **42.43ms**，最小 41.6ms，最大 43.9ms。该计时不含打包与进程启动。
- 本机样本只有 54 条任务，不能与 4500 条合成 fixture 混算，也不能据此宣称大型库卡顿已经解决。

### 尚未执行的写入与 UI 验收

本地只读验证不再受隔离环境缺失阻碍；但创建项目/任务/快速记录、完成/撤销完成等会影响正式文档与共享状态，本轮没有执行，也没有 UI 点击、弹窗关闭、渲染或重启同步的真实测量。

继续做完整业务写入前，需要单独确认以下正式目标的影响范围，临时笔记本不能隔离这些文件：

- `/data/storage/petal/siyuan-homepage/task-index.json`：任务创建/状态/关联与正式维护。
- `/data/storage/petal/siyuan-homepage/enhanced-diary-project-index.json`：项目创建、生命周期与项目关系维护。
- `/data/storage/petal/siyuan-homepage/recent-doc-snapshot.json`：多个索引消费者的共享变更快照。
- `/data/storage/petal/siyuan-homepage/enhanced-diary-project-record-index.json`：项目快速记录关系；创建日记还可能维护同目录 enhanced-diary-index.json。

本轮只报告这些目标，没有授权扩展为正式写入测试。后续经用户明确确认安全目标和共享索引影响后再执行；不以 NAS 或容器未连接为理由阻止已授权的本地只读验证。

### 本轮验证结果

| 验证 | 真实结果 |
| --- | --- |
| `node scripts/verify-local-kernel-readonly.mjs` | exit 0；44 次有界真实读取，10 项生产检查通过，无写入/未授权接口尝试 |
| `node scripts/verify-task-index-sync-performance.mjs --live-read` | 3 次均 exit 0，真实本机读取，54 条，0 写入 |
| `pnpm verify:siyuan-api-compat` | exit 0，A–H |
| `pnpm verify:remote-kernel-compat` | exit 0 |
| `pnpm verify:enhanced-diary-project-index` | exit 0，聚合 PASS |
| `pnpm verify:enhanced-diary-project-create-performance` | exit 0，23 组 + 63 条合成测量；仅作回归，不替代实测 |
| `pnpm verify:task-index-sync-performance` | exit 0，28 个合成场景；与上述 live-read 分开 |
| `pnpm typecheck` / `npx tsc --noEmit` | 均 exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm build:app` / `pnpm build:kernel` / `pnpm build` | 均 exit 0，SIYUAN_SKIP_DEV_DEPLOY=1，未部署正式插件 |
| `git diff --check` | exit 0 |

最终修改仅为真实只读 verifier、mtime 类型声明及本报告；版本与 schema 未改。未生成用户真实数据的 Fixture 或导出业务内容；正式索引从未被用于写入基准测试。

## 本地 Kernel 真实写入验证（2026-10-20）

本轮基线 `68bb648a6ae468159275e5d84a899a23682db5b7`，本机 Kernel **3.8.7**，固定连接 loopback，Authorization 成功。已读取规则、上一轮报告并用 CodeGraph 检查 checked API、创建文档、标题解析及调用方。开始时工作区干净。以下为真实请求与生产函数结果，未用合成耗时代替实测，也未连接其他实例。

### 授权、测试对象与边界

- 先只读列出笔记本；没有把任何已有笔记本当作测试对象。终端列明范围，用户明确确认本阶段 Kernel 写入后，创建 **1 个唯一标记测试笔记本、1 篇测试文档（H1、H2、普通段落）、1 条测试任务**。
- 所有目标 ID 均来自真实返回或该文档的子块读取。写入前记录意图，结果未知时停止、不自动重试。只在本轮文档中设置 1 个测试属性、将这 1 条任务完成；总计 **5 次写入请求**：笔记本、文档、属性、插入任务、完成任务各 1 次。没有删除、重复创建、修改已有业务文档或设置。
- 使用 `src/api.ts` 的生产函数，经运行时端口发送实际请求，未替换 Kernel 响应。传输固定本机、15 秒超时、8 MiB 响应上限、64 次单进程请求预算、请求间隔 150ms，禁止重定向；端点和有效载荷逐项放行。没有调用共享文件写入、索引重建、删除或配置 API。
- Token 仅放在遮蔽输入的进程环境，进程退出清理。测试脚本、对象归属账本和脱敏测量仅保留在本机临时目录，未提交实际名称、ID、路径、正文或凭据。账本 `homepage-local-write-objects.json` 可供维护者本机定位清理范围；**测试笔记本及全部内容仍保留，由用户决定清理**。
- 本次仅获 Kernel 写入及其可能触发正常共享索引维护的确认。没有确认强化日记测试配置安全，也没有授权直接维护正式业务索引，因此没有执行完整强化日记业务 A～H。

### 真实字段、错误假设与最小修正

1. `createNotebookChecked()` 实际返回的 `data` 为 `{ notebook: object }`，并非直接的 Notebook。第一次创建 HTTP 200/code 0 后，验证脚本原本读取顶层 id 的断言失败，立即停止；通过再次只读列出笔记本，精确匹配本轮保存的唯一标记及已确认创建记录，取得真实 ID，**没有再次创建**。修正 `createNotebookChecked` 的返回声明为 `{ notebook: Notebook }`，同时修正同接口旧入口声明（旧入口失败仍为 null）。运行时返回与现有调用方不变，未把已成功创建误作可重试失败。
2. 文档创建返回有效 ID；`listDocsByPathChecked()` 恰好列出 1 篇文档，`getPathByID()` 的 notebook/path 与该笔记本和目录结果一致。
3. 实际 H1/H2 都返回 `id:string、type:string、subType:string、content:string、markdown:string`，分别为 **type=h、subType=h1/h2**，不是小写字段 subtype。生产 `getEnhancedDiaryHeadingLevel()` 真实解析结果为 1、2，无需修改标题运行时逻辑。
4. 测试属性通过 `setBlockAttrsChecked()` 写入，并经 `getBlockAttrsChecked()` 与 `batchGetBlockAttrs()` 两种真实路径回读一致；批量响应为块 ID 到属性对象的映射。
5. `appendBlockChecked()` 返回 1 个事务、1 个 doOperation；事务含 timestamp:number、doOperations:array、undoOperations:null。operation.id 指向新列表块，真实子块继续定位唯一任务项。任务实际结构为 **list type=l/subType=t → list item type=i/subType=t**。两者含 id/type/subType/content/markdown；补充本地 `BlockSubType` 声明缺失的 `t` 字面量，未改变运行时。
6. `getBlockKramdownChecked()` 返回 `{ id:string, kramdown:string }`，其中列表标记与复选框之间可以存在 `{: ...}` 内联属性。临时脚本最初按普通 Markdown 的标记位置断言失败，后续只读检查确认此格式，再剥除测试断言中的 IAL 进行标记检查；没有修改生产返回、Mock 或任务正文来满足断言。这些停顿均在完成写入前，没有重复插入任务。
7. `updateTaskListItemMarkerChecked(id,"x")` 成功后，重新读取 Kramdown 及父列表的子块，确认同一任务从 `[ ]` 变为 `[x]`。任务属性含 id:string、updated:string。受限 `sqlChecked()` 只查询本次根文档内 3 个已知标题/任务 ID，返回 id/type/subtype/root_id/box/updated 字符串，3 条均属于新文档与新笔记本；SQL 使用小写 subtype，与子块 API 的 subType 区别已确认。
8. 后续只读检查正式任务索引：测试任务恰好 1 条、root_id 匹配、checked=true、Markdown 为已完成状态。该观察证明本次新增任务最终进入正常索引维护结果；没有调用手动合并、重建或写入索引来制造此结果。

以上 notebook 包装、标题和任务结构、属性回读、完成状态均有真实接口证据；新增兼容 fixture 仅使用合成标识和文本，执行生产 wrapper，保留 notebook 包装与 Kramdown IAL，覆盖 checked 错误抛出、旧入口失败 null。它是回归保护，不是额外实机证据。

### 真实本地请求耗时

以下写请求各执行一次；计时从 fetch 发出到响应体读完，单位 ms，不含人为安全间隔、脚本打包、断言排查或用户确认等待，**不是点击到界面反馈时间**：

- 创建笔记本 **41.58**；创建文档 **93.71**；插入任务 **27.54**。
- 设置标题属性 **22.27**；单条属性回读 **17.21**；批量属性回读 **17.64**。
- 文档列表 **18.64**；首次路径读取 **18.43**；首次 H1/H2 子块读取 **4.16**。
- 完成任务请求 **39.97**；紧随其后的 Kramdown 回读 **16.97**；最终任务子块回读 **18.14**；受限 SQL **18.92**。
- 任务索引直接 getFile：初始 **19.87**、写入后 **21.94**、后续一致性检查 **41.49**，响应分别为 51,958 / 52,717 / 52,717 字节。
- 既有 `verify-task-index-sync-performance.mjs --live-read` 生产 `getTaskIndexResult()`：**48.3ms，55 条，1 次文件读取、0 次逐块 API、0 次写入，exit 0**。与上一轮 54 条的小样本分别记录，不据此推断大型库或 UI 性能改善。
- 核心写入脚本累计 **42 次请求**（含安全停止后的只读恢复检查），全部 HTTP 200，普通 envelope 均 code 0；后续一致性读取 1 次、生产 live-read 1 次，准备阶段另有 2 次只读请求。断言失败属于验证脚本假设，不是 HTTP/API 失败。
- 未执行项目业务索引维护、UI 点击、弹窗关闭、项目面板刷新或重启；这些耗时及完整刷新次数均 **未测量**。

### 共享文件前后观察

四个文件均存在、JSON version 均为 1；只读取得字节数、条目数、顶层 updatedAt、SHA-256，未保存或输出完整文件内容。以下更新时间为 UTC：

- `task-index.json`：51,958 → 52,717 字节，items **54 → 55**；updatedAt `2026-10-20T02:33:39.613Z` → 首次后读 `2026-10-20T02:37:43.334Z`，后续 `2026-10-20T02:39:44.707Z`。哈希先 `244c526416424c4a…` → `91d43abd18269588…`，后续为 `aff0fc06d7839f74…`；后续确认新任务已完成。不同观察时间存在异步维护，不能用时间戳差值冒充单次任务状态更新延迟。
- `enhanced-diary-project-index.json`：8,267 字节，roots 2、nodes 16；updatedAt `2026-10-13T14:55:18.634Z`，哈希 `633ed7efe1615ddb…` 前后相同。
- `recent-doc-snapshot.json`：95,176 → 95,801 字节，docs **129 → 130**；updatedAt `2026-10-20T02:33:39.332Z` → `2026-10-20T02:37:42.344Z`，哈希 `6a90c5fcc007bf03…` → `bedc6a8d82086a8c…`。
- `enhanced-diary-project-record-index.json`：2,430 字节，items 3；updatedAt `2026-10-13T14:55:19.037Z`，哈希 `85809488b042e708…` 前后相同。

脚本直接写入只有本轮笔记本、文档和块，**共享文件直接写入 0 次**。变化与新增文档/任务及插件正常维护相符，但没有连接实际插件 diagnostics 或捕获每次写入，不排除其他前台活动；**哈希变化不是写入次数**。不能确认无变化时 recent-doc-snapshot 的真实重复写入频率。没有回写旧文件恢复哈希，没有清空正式任务或替换无关项目；两个项目索引原字节哈希保持一致。没有观察到本轮测试对象重复或写后状态不一致，不能据此证明所有既有条目及跨端并发完全无风险。

### 尚未完成的业务与 UI 验收

**受限 Kernel 读写：PASS。完整插件业务/UI：未验收；整体发布条件未补齐。** 本轮没有自动点击界面、修改正式强化日记配置、调用项目/任务/记录业务写入服务或开启实际插件诊断。没有测量弹窗与渲染、工作区完整刷新次数、重启恢复或跨端同步，不宣称最初卡顿已在真实 UI 证明改善。

继续业务验收前，维护者需先确认强化日记目标笔记本、日期文档、项目容器都指向专用测试数据，并明确同意共享 `task-index.json`、`enhanced-diary-project-index.json`、`recent-doc-snapshot.json`、`enhanced-diary-project-record-index.json` 及必要的日记索引维护。不能仅因有临时笔记本就视为这些文件隔离。

确认后人工顺序：进入工作区 → 创建根项目 → 创建子项目 → 创建任务 → 完成 → 取消完成 → 添加关联测试项目的快速记录 → 关闭重开工作区。每步只提交一次，回读核对文档/关系/索引；短期开启既有 taskIndexDiagnostics 记录数值差异，完成后关闭，分别测处理中、写入确认、弹窗关闭、状态展示及刷新次数。如不能确保目标范围，停止业务写入。测试笔记本保留供维护者定位及自主清理，不能删除共享索引以清理测试痕迹。

### 本轮回归与构建

- `pnpm verify:siyuan-api-compat`：exit 0，A–I，新增真实结构对应的合成 wrapper 回归。
- `pnpm verify:enhanced-diary-project-index`：exit 0，聚合 PASS。
- `pnpm verify:enhanced-diary-project-create-performance`：exit 0，23 组，24 项维护、21 项服务、18 项生命周期合成测量。
- `pnpm verify:enhanced-diary-workspace-actions`：exit 0，29 组。
- `pnpm verify:task-index-sync-performance`：exit 0，28 场景；另列上述真实 live-read 结果。
- `pnpm typecheck`、`npx tsc --noEmit`、`pnpm lint`：均 exit 0。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均 exit 0；构建使用 `SIYUAN_SKIP_DEV_DEPLOY=1`，只生成仓库产物及既有仓库 dev 镜像，不部署正式实例。`git diff --check` 通过，修改文件均保留 LF。版本 5.1.10、最低思源 3.8.6、SDK 1.2.9 及各索引 schema 均不变。

## 本机实际插件版本与 UI 验收入口核对（2026-10-20）

基线 `89340e48e61cd1439b2afea5c4af98885e2cde93`，开始时 HEAD 一致、main 工作区干净。已读 AGENTS、data-and-indexing、performance、DESIGN 及既有报告，使用 CodeGraph 检查部署、初始化、工作区刷新链路，并对索引未同步提示的文件核对当前磁盘源码。本轮没有修改生产代码、重新生成 Mock、重跑合成性能测试、构建或部署；只读连接本机 Kernel 3.8.7。

### 安装文件、构建产物与实际运行边界

使用真实 `/api/file/getFile` 读取本机 Kernel 所提供的插件根目录文件，并与仓库 dist 及现有开发部署配置所指目录逐字节哈希核对。四个配置目标文件均与 Kernel 实际提供的文件相同，目标是独立普通目录，既非仓库 dev 路径也非该路径的符号链接。因此没有仅以版本号推断代码状态，也没有把仓库 dev 镜像误当成正式安装文件。

- `index.js`：dist **7,527,324 字节**，SHA-256 `21273fe0f8d6478943c03c3cffea4ee446e5f135996bfebd010289442e1f1708`；已安装 **46,620,495 字节**，SHA-256 `9f054aa8e9c97e03fd2e12d17164dacbc71383ba15dbbedfbe12a8aa74a7eb3c`。**不一致**，安装文件含内联 source map。
- `kernel.js`：dist **1,787,293 字节**，SHA-256 `72b0374f3972ab7a8957595c3fd37f8c8db1ad23935d35cef8d9e485cf362090`；已安装 **10,410,978 字节**，SHA-256 `6f1401973ce7539f363548a035327e178fb8c9dff4bef9d9c395f6d87051dee8`。**不一致**，安装文件含内联 source map。
- `index.css`：两边均 **1,354,453 字节**，SHA-256 `7b5c06207fc0c4f4b37c316ce3a6c0b38154449aa84af69003b3a414b22478eb`，完全一致。
- `plugin.json`：两边均 **1,402 字节**，SHA-256 `e61aa3fe0b34cb1d562aba5dadb57194ce28d4d6fca00ccb539da6b805641a7e`，完全一致；都为 5.1.10，最低版本 3.8.6。没有根据此相同版本号推断两个 JS 相同。

进一步解析安装文件已有的 inline source map，未执行其中代码或保存源码副本：前端包 2,436 个 source 中，1,142 个可映射的仓库 src 源文件全部与当前工作区一致（1,122 个字节级一致，其余 20 个仅差构建移除的文件头 BOM）；Kernel 包 511 个 source 中，422 个仓库 src 源文件全部一致（411 个字节级一致、11 个仅差 BOM）。API、任务数据 API、项目索引、项目创建服务、任务运行时、工作区 Svelte 的嵌入源码均直接匹配。第三方/非仓库 sources 未与本机依赖逐个重验。没有改动任何源文件 BOM。

因此本机文件应描述为 **与当前仓库源码相符的调试构建，尚非 dist 正式产物**，不能据哈希不同就认定为旧功能代码。source map 只证明安装包中所带源码，不是当前前端内存实例已重新加载的证明。未取得前端内存中实际执行脚本的哈希或插件实例，不能宣布“最新正式构建已在当前 UI 验收”。

真实 `POST /api/plugin/getLoadedPlugin`（仅指定本插件）返回 HTTP 200/code 0，`state="running"、stateCode=2`，确认 Kernel 插件在运行；这不等同于前端插件实例已就绪。依据 [思源 v3.8.7 官方前端 loader](https://github.com/siyuan-note/siyuan/blob/v3.8.7/app/src/plugin/loader.ts)，前端从 loadPetals 返回的 js 执行插件，不能仅看静态文件或 Kernel running 状态推断前端内存代码。本轮没有请求加载全部插件源码、触发 loadPlugins、reloadPlugin、启停插件或调用业务 RPC。

只读进程检查发现 **4 个含本仓库路径的 Vite watch Node 进程**。未停止或更改它们；不据进程数量推断重复 UI 刷新。若切换正式构建，须先与用户协调暂停这些 watch，避免后续自动部署覆盖待测产物。已在本机临时目录准备两文件哈希及目标检查计划，**尚未执行**。

需要一致化的目标仅为本机 `/data/plugins/siyuan-homepage/index.js` 和 `kernel.js`，来源为当前 dist；CSS、manifest 无需更换。部署前应重新核对源/目标哈希并本地备份两个原文件；替换 kernel.js 可能触发 Kernel 文件监听自动重载，前端需单独重载。本轮已提出一次部署/重载确认，未获批准前保持原文件。该确认不包含停止任意其他任务、修改配置、切换项目容器或业务写入。

### 既有测试对象与当前业务配置

仅使用上一轮本机临时归属账本中的真实 ID，没有创建新的笔记本或文档。实际 API 重新核对通过：测试文档仍在专用笔记本，根目录只有该 1 篇文档；其列表中恰好 1 条原测试任务且仍为完成状态；正式任务索引恰好包含该任务 1 次、root_id 一致、checked=true。本轮直接写入 **0 次**，测试对象未清理，未修改其他用户笔记。

从真实 `enhancedDiaryConfig.json` 与当前项目索引只读核对，仅输出目标是否匹配：

- dailyNotebookId 已配置，**不指向专用测试笔记本**。
- projectStorage.mode 为 **parentDoc**；目标不是测试文档，所属笔记本也不是专用测试笔记本。
- 共享项目索引 containerSignature **与当前正式配置匹配，不指向测试目标**。报告与日志不记录实际签名、ID、用户名称或私人路径。
- 所以本轮创建项目/任务、添加快速记录等强化日记业务写入 **未获授权、未执行**。不能通过切换容器或重建项目索引来使测试“通过”；实际配置不能保证测试只作用于既有专用对象。

相关共享文件仍位于插件自己的 `/data/storage/petal/siyuan-homepage/`：`task-index.json`、`enhanced-diary-project-index.json`、`enhanced-diary-project-record-index.json`、`recent-doc-snapshot.json`。当前实测分别为 52,717 / 8,267 / 2,430 / 95,801 字节，version 均为 1，任务 55 条、项目 roots 2/nodes 16、记录关系 3 条、近期文档 130 条。两个项目域索引哈希仍与上一轮相同；任务与近期文档哈希已不同，但此为跨验收轮次的观察，不能归因于本轮 UI 或推算写入次数。

继续完整业务测试需要先确认安全配置及这四个共享文件和必要日记索引的影响，并单独取得用户明确许可。本轮部署确认没有授权覆盖、清空或恢复这些共享文件。没有把临时笔记本当作共享索引已经隔离的证据。

### 实际 UI 探查结果与真实耗时

Windows computer-use 成功列出正在运行的 SiYuan、Edge，并取得唯一思源窗口对象。首次窗口无可用导航文本；截图捕获返回 `FrameArrived timed out`，按恢复规则重新选择窗口、尝试激活并重试一次，仍为 `window capture timed out`。没有使用旧坐标或盲点输入，没有实际点击主页、工作区、页签或日期。

其他已存在的入口也分别检查：CUA 只有 IAB/MCP Apps、没有可用 Edge/思源页面连接；Chrome DevTools 和 Playwright 当前配置均指向缺失的 Chrome 可执行文件，读取页面清单失败。进程元数据未发现思源或 Edge 的 remote-debugging-port/pipe。未安装 Chrome、重复安装浏览器、重启 Edge、修改浏览器配置/调试端口或绕过认证来制造 UI 可用性。不能以这些工具失败认定插件卡顿。

真实 UI 已完成操作 **0 项**；首屏、核心状态、各页切换、月份/日期、关闭重开、弹窗关闭和最新状态展示的耗时均 **未测量**。没有访问实际前端 `taskIndexDiagnostics`，没有开启诊断；databaseCommits、targetedRefreshes、broadCleanups、indexReads、indexWrites、writeBytes、noopWritesSkipped、dataUpdatedEvents、workspaceRefreshes 的 UI 操作差值均 **未知，不是 0**。未证实也未排除真实 UI 卡顿、重复刷新或无变化索引重复写入。

本次成功的 16 次有界真实只读请求均 HTTP 200，普通 envelope code 0；固定 loopback、环境凭据、15 秒超时、不跟随重定向、请求间隔 150ms。主要请求耗时：安装 index.js **1451.80ms**、kernel.js **569.35ms**、CSS **51.64ms**、manifest **48.08ms**；getLoadedPlugin **28.18ms**；测试文档路径 **28.70ms**、列表 **57.99ms**、两次子块 **27.25/27.78ms**；配置读取 **44.91ms**、项目容器路径 **19.23ms**；任务/项目/近期文档/记录索引读取 **29.13/38.19/36.72/98.07ms**。均为单次 fetch 至响应体读完，不含安全间隔及后续哈希计算；不是 UI 耗时。

初次读取 index.js 因临时脚本原有 16 MiB 上限主动停止，未得到完整哈希；随后先只读核对配置目标文件确为 46.62MB，再将插件文件读取上限调整为 64 MiB 后完整读取。该次截断尝试及其先行 version 请求另计，未重试任何写入。调试文件体积会影响受测条件，但本轮没有比较正式构建的真实 UI 加载，**不能把大包判定为业务卡顿根因或宣称部署后必然改善**。

### 人工补齐与本轮结论

1. 让本机桌面会话保持可观察，人工确认思源窗口正常；若自动化仍不能捕获，直接人工操作，不反复安装浏览器。
2. 经批准并协调 watch 后，只替换上述两份 JS 并重载；重新从本机 API 核对安装哈希与 dist，再在前端确认 `window.siyuan.ws.app.plugins` 中本插件实例存在。文件一致与实例加载分别核对。
3. 在该真实前端 DevTools 中取得本插件的 `taskIndexDiagnostics`，确认存在后 `reset()`、`enable(true)`，保存操作前 `snapshot()`；不要输出整个插件实例或配置。
4. 先只读交互：打开主页 → 工作区 → 任务/项目/记录/日历 → 月份/日期切换 → 关闭重开。逐项记录点击时刻和目标核心内容可见时刻；每项取前后 snapshot 的上述数值差异，并使用 Network 汇总主要 Kernel API 耗时，不输出请求正文。工作区按现有实现可能正常维护共享索引，不把无业务写入等同于零文件维护。
5. 结束后在 finally 或手动收尾中 `enable(false)`。若需业务写入，必须另行确认测试配置/共享索引影响；每次只提交一次，未知结果不重试，用真实 API 回读。当前配置下不要点击创建/完成/记录等业务按钮。

**结论：本机安装文件和关键源码核对已完成、既有测试数据安全性复核 PASS；正式产物的一致化及真实前端 UI/性能验收 BLOCKED。** 阻塞是未批准部署/重载、当前 UI 控制链路不可观察及业务目标不是测试数据，不是“没有连接本机 Kernel”。没有新增性能回归的实测证据，也没有依据继续修改索引算法或拆分文件。

本轮仅更新本报告；按 AGENTS 执行 `git diff --check`，不机械重复既有 Fixture、typecheck/lint/build；没有生产代码改动、正式部署、版本修改、tag 或 Release。详细脱敏摘要、source map 对比及待批准两文件计划仅保存在本机临时目录，凭据不进入文件或报告。

## 用户批准后的本机正式 JS 部署与重载补验（2026-10-20）

本次承接 `5e4bde43719177df32e1eb621f42666a559d3984`。用户明确批准备份、更换两份 JS、重载，并协调暂停本仓库 watch；该批准不包含业务配置、共享索引或业务写入。执行前工作区干净，重新读取规则并用 CodeGraph 核对部署和生命周期；从前轮构建对应源码基线 `89340e4` 到本轮 HEAD，src、Vite 配置、package.json、plugin.json 均无差异，复用已验证正式产物。

### 实际执行与版本证据

- 按完整仓库 node_modules 路径、Vite watch 参数、进程创建时间重新校验身份，仅停止本仓库已确认的 **4 个 Vite watch 子进程**；停止后及部署后复核均剩余 **0 个**。没有终止思源、Edge 或其他项目进程。未自动重启 watch，避免覆盖正式产物；以后恢复开发监听可能再次部署调试包。
- 部署前校验 plan 中的源/目标路径、两个 SHA-256、目标 manifest 插件名称及本机 API 返回的安装文件哈希，确认指向上一轮核对的同一目录；未因版本号相同而跳过内容校验。
- 两份旧 JS 已完整备份并逐个校验旧哈希，存于本机临时目录 `homepage-production-backup-56991e4a-59a4-495e-b539-dd45e045b50a`，附本机恢复定位 manifest；没有提交备份、原始安装目录或凭据到 Git。
- 只对 `index.js`、`kernel.js` 创建本轮临时暂存文件，校验后在同目录原子 rename 替换，随后再次读文件校验。没有执行整目录镜像、删除旧资源、修改 CSS/manifest 或回写业务文件。正式目录未留下本轮暂存文件。
- 两份文件的本地读取和真实 `/api/file/getFile` 回读均与当前 dist 完全一致：`index.js` **7,527,324 字节**、SHA-256 `21273fe0f8d6478943c03c3cffea4ee446e5f135996bfebd010289442e1f1708`；`kernel.js` **1,787,293 字节**、SHA-256 `72b0374f3972ab7a8957595c3fd37f8c8db1ad23935d35cef8d9e485cf362090`。这是实际安装文件一致，不只是仓库构建成功。
- 仅发送 **1 次显式重载请求**：`POST /api/petal/setPetalEnabled`，payload 为现有本插件 packageName 与 enabled=true；返回 HTTP 200/code 0、enabled=true、version=5.1.10，返回 `js` 的 SHA-256 也等于正式 dist/index.js。没有先禁用插件、循环重试或重载其他插件。替换 kernel.js 还可能由 Kernel 监听自动触发重载，未将显式请求次数当作全部生命周期次数。
- 随后 `getLoadedPlugin` 返回 **state=running、stateCode=2**。已确认安装产物及 Kernel 运行状态，重载 API 已确认受理；尚未取得当前前端实例的脚本哈希或 UI 生命周期完成证据，不把响应成功等同于全部前端验收完成。

### 数据保护、实测与未完成项

部署前后分别读取 `enhancedDiaryConfig.json`、task-index.json、enhanced-diary-project-index.json、recent-doc-snapshot.json、enhanced-diary-project-record-index.json；这五个文件在本次短观察窗口的字节数、SHA-256 均相同。任务仍 55 条，原测试任务恰好 1 条、root_id 对应原测试文档、checked=true；实际文档路径仍属原专用笔记本，列表中也只有原任务且仍完成。没有新建或清理测试数据，没有切换日记/项目配置，没有直接写入、清空或重建共享索引。短窗口哈希相同不能证明长期零写入，也不能排除重复写入相同字节；实际插件 diagnostics 计数仍未采集。

本次 **20 次真实请求**全部 HTTP 200，普通 envelope 均 code 0；除已批准的单次插件重载入口外均为读取。保留环境变量凭据、15 秒超时、64 MiB 响应上限和有界请求；没有将 Token 放进命令参数、文件或报告。主要单次 fetch 至读完响应体的耗时（不含安全间隔、哈希计算，非 UI 点击计时）：

- 部署前旧 index.js/kernel.js 回读：**740.31 / 185.21ms**；部署后正式文件回读：**133.20 / 56.11ms**。文件体积与缓存等条件不同，不以这两组单次文件读取宣称真实界面提速。
- 显式重载接口：**4279.31ms**，返回体 **11,560,914 字节**；这是该请求至响应读完，不能解释为弹窗关闭或前端页面可用时间。
- Kernel 状态读取 **7.04ms**；测试文档路径 **19.04ms**；文档/任务子块 **17.54 / 18.11ms**。
- 任务索引部署前/后读取 **22.76 / 23.81ms**；项目索引 **23.42 / 22.63ms**；近期文档快照 **27.17 / 25.75ms**；记录索引 **21.82 / 24.91ms**。

重载后重新取得真实思源窗口对象并尝试捕获，仍返回 `FrameArrived timed out`，没有盲点点击或用脚本模拟工作区交互。未新增浏览器安装或修改调试设置；实际 UI 操作仍 **0 项**，首屏、工作区页签/月日切换、关闭重开、点击到处理中/弹窗关闭/最新状态、workspaceRefreshes 和其他 taskIndexDiagnostics 差值仍未测量。前轮人工补验步骤继续适用，但“等待部署批准”这一项已完成，需继续核对当前前端实例和真实交互。

本轮授权部署部分结论：**安装文件一致 PASS，显式重载请求 PASS，Kernel running PASS；真实前端 UI/性能仍 BLOCKED**。没有证据认定现有卡顿已解决，也没有发现需要修改索引算法的实测回归。完整强化日记业务仍指向非测试数据，配置/共享索引影响的授权未扩展。

验证：临时部署脚本、dist/index.js、dist/kernel.js 的 `node --check` 均 exit 0；全部部署保护断言、双路径哈希与回读通过；最后再次检查 watch 为 0、两目标哈希仍匹配。仓库仅更新本报告，执行 `git diff --check`，不重跑 Mock 或无代码变更的 typecheck/lint/build，不改版本、tag 或 Release。本机备份和脱敏部署记录保留，供用户回溯。

## 本机 Edge 真实前端与只读 UI 验收（2026-10-20）

基线 `b36169af2b4270ebd5166cad5686e04d5ddf2bdf`，开始时 main 工作区干净。本轮读取项目规则、既有报告并使用 CodeGraph 核对工作台入口、核心刷新、日历选择及索引维护路径；没有构建、部署、reloadPlugin、修改生产代码或重复运行 Fixture。正式 JS 安装哈希与 Kernel running 的证据见上一节，本轮新增的是实际浏览器前端与交互证据，未另取前端内存脚本的 SHA-256。

### 浏览器、认证与实际插件实例

- 使用本机已安装的 Microsoft Edge **155.0.4283.62** 和已有 Playwright，通过独立临时 profile 启动一个本轮实例。CDP 使用自动分配端口，实查监听仅在 **127.0.0.1**，没有安装浏览器、修改默认 profile、关闭用户原 Edge 或修改 Kernel 配置。
- 访问 `http://127.0.0.1:6806` 实际得到 `/check-auth`。用户在新窗口按官方流程完成锁屏密码与验证码解锁；没有向浏览器注入 API Token、请求头或 localStorage。解锁后真实页面为 `/stage/build/desktop/`，document 已 complete，登录控件消失。
- 在该真实页面只检查本插件相关布尔值：思源 app 运行时存在、`window.siyuan.ws.app.plugins` 包含 siyuan-homepage、本插件高级权限和 taskIndexDiagnostics 可用。没有输出插件完整对象、其他插件配置或用户正文。主页真实 DOM 和强化日记工作台均已打开，**不再仅凭 Kernel running 推断前端成功**。
- 此为 Browser Desktop 验收，不替代原生桌面客户端、移动端或跨端验收。临时 profile 仍可能加载系统已有扩展，不能把它描述为无其他前端活动的纯净环境。

### 实际操作及测量方法

通过实时 DOM、可访问名称和可见控件执行：顶栏“打开主页” → 思源命令面板“主页: 打开强化日记工作台” → 工作台导航“任务 / 项目 / 记录 / 日历 / 总览”。没有调用插件私有函数伪造点击，没有使用新建任务、快速记录、完成复选框或创建项目入口。日历为 Canvas；依据本次实际画布截图及元素尺寸定位日期，随后从详情 DOM 验证所选日期，而非猜测坐标。

点击起点为页面捕获到的真实 click 的 `performance.now()`；MutationObserver 与 requestAnimationFrame 记录新目标布局首次可见帧。以下均为**单次样本**，不包含用户登录及命令检索输入等待，不代表统计分位数，也不与旧版作性能对照。目标区域可见不等于所有后台请求完成或 Canvas 已完成绘制。处理中状态未可靠取得首帧时间，记为未测量，不能因数值缺失宣称没有 loading；首次工作台的真实加载提示曾被观察到。

以下点击时刻为当天 UTC，耗时单位 ms；API 数为点击至目标可见窗口内**发起**的请求，包含前端正常维护及其他并发活动，不等同于该按钮独占请求数：

- **A 打开主页**（04:23:09.952）：实际打开成功，首个 DOM 变更 **2.3**；连续可用时间及请求窗口未完整捕获，不报告冷启动耗时。后续工具观察间隔不计为 UI 延迟。
- **B 首次打开工作台**（04:27:38.768）：首个 DOM 变更 **1.5**，核心 `.workspace-layout` 可见 **690.9**；**44 个 API**。此时核心 state 已发布，非关键日历/日期详情可能仍继续加载。
- **C 任务页**（04:30:54.504）：首变更 **30.3**，task-panel 可见 **67.7**；**1 个 API**。
- **D 项目页**（04:30:57.970）：首变更 **3.2**，formal-project-panel 可见 **9.1**；**1 个 API**。面板出现与单个后续请求完成是不同边界。
- **E 记录页**（04:31:01.220）：首变更 **2.1**，record-panel 可见 **8.1**；**0 个 API**。
- **F 日历页**（04:31:06.568）：首变更 **1.5**，calendar-with-detail 可见 **9.3**；**0 个 API**。此数值不包含延迟初始化的 ECharts 内部绘制时间。
- **G 下个月**（04:31:21.002）：实际按钮点击、月份切换及后续 11 月画面已确认，首变更 **0.5**；内部 Canvas 就绪时间**未测量**。工具在 **4730.4** 后确认图表区域可见，这只是包含跨工具观察间隔的上界，不能解释为 4.73 秒渲染卡顿。该观察窗口 **0 个 API**。
- **H 选择日期**（04:31:49.058）：依据画布实际位置点击 15 日，首变更 **1.7**，详情区域可见 **20.9**；**1 个 API**。后续 DOM 确认日期为 `2026-11-15`、显示无日记状态，未点击创建。**约 24.8ms 后另有未捕获 TypeError，见下一节；这不是无异常通过。**
- **I 返回总览**（04:31:54.670）：首变更 **7.1**，overview-dashboard 可见 **12.5**；**0 个 API**。
- **J1 关闭工作台**（04:32:42.060）：点击实际标签内关闭图标，首变更 **19.5**，确认 workspace-page 从 DOM 移除；未连续测量关闭完成时间或请求窗口。
- **J2 重新打开**（04:32:59.153）：通过同一命令入口再次打开，首变更 **1.1**，总览可见 **22.8**；**1 个 API**。这是同一前端会话中的暖重开，不视为第二次冷加载或强制重读全部业务。
- **A2 暖切换主页**（04:33:09.974）：补充一次连续测量，首变更 **3.7**，主页搜索入口可见 **8.7**；**1 个 API**。明确与 A 的首次加载证据分开。

C～J 之后为核对日期结果曾再次切换日历，未另报一组优化数字。定位入口时一次零尺寸区域 right-click 等待超时、一次命令面板定位严格性检查失败，均未执行对应点击；这些属于自动化定位问题，不归为插件操作耗时。

### 实际请求、诊断与异常

首次工作台窗口的 44 个请求均观察到 HTTP 200、没有 requestfailed，分布为：file/getFile **16**、file/putFile **10**、query/sql **7**、storage/getRecentDocs **3**、attr/batchGetBlockAttrs **2**，touchEncryptedNotebooks、setUILayout、storage/setLocalStorageVal、listDocsByPath、exportMdContent、getChildBlocks 各 **1**。该窗口主要 Network 请求至 responseEnd 的最大耗时分别为：批量属性 **25.33**、文件写入 **21.00**、文件读取 **20.57**、Markdown 导出 **16.32**、SQL **5.24**、目录 **4.44**、子块 **4.22**。它们是浏览器网络测量，不能冒充完整核心函数或渲染耗时。

C 的请求为 touchEncryptedNotebooks（**3.73**）；D 为 getChildBlocks（**10.76**）；H 为 touchEncryptedNotebooks（**3.81**）；J2/A2 各为 setUILayout（**9.58 / 14.20**）。这些请求可能晚于目标帧才完成，列出的是对应请求最终取得的 Network 耗时。E/F/G/I 窗口无新 API。没有输出或保存业务请求正文、SQL 参数、响应内容或完整 HAR；后段观测曾瞬时提取文件请求的 path，仅保留白名单文件类别，未取得这 10 次写入的完整归属。

短期开启已有 taskIndexDiagnostics 并 reset 后，B 目标帧增量 indexReads **2**、readParseMs **25.1**；其余列出的切换至目标帧，任务诊断各项增量均为 **0**。最后一次成功取得的会话累计值为 indexReads **24**、readParseMs **250.1**，下列计数均 **0**：databaseCommits、targetedRefreshes、broadCleanups、indexWrites、writeBytes、noopWritesSkipped、dataUpdatedEvents、workspaceRefreshes。累计包含操作间等待与后台读取，不能全算在首次打开上。

`workspaceRefreshes` 仅覆盖生产 drain 中任务索引事件触发的协调刷新，不统计全部初始/非任务核心刷新；**0 不证明核心 refresh() 从未执行，也不证明所有共享文件零写入**。期间全页面累计观察到 **31 个 file/putFile 请求**，未完整捕获各次目的文件和发起栈，不能把 31 当作任务索引写入次数、主页插件独占写入次数或 recent-doc-snapshot 写入频率。额外一次 **10,003ms** 有界空闲观察没有新增 API；该样本未发现持续请求循环，但不证明长期不存在重复刷新。未直接插桩私有 refresh()，因此完整核心刷新调用次数仍未精确测得。

完整页面事件流的 Console error 为 **0**，但 pageerror 有 **1 次 TypeError**，时间为 **04:31:49.083Z**，即 H 点击后约 **24.8ms**、详情区域可见帧之后约 **3.9ms**。只看点击至可见帧的错误数会漏掉它，因此本报告明确列出尾部异常。所选日期和之后的总览、关闭重开仍能显示，但不能认定选日完整无异常。

该异常初次仅采集类别与时刻，**未取得 message/stack，尚不能归因于主页插件、ECharts、思源前端或其他扩展**。补抓来源时 Node 调试执行超时并重置，随后原 CDP 端口连接被拒绝；没有重复启动浏览器或修改生产代码来绕过问题。已核对本轮 Edge 根进程、仅属于本轮 profile 的进程和临时监听端口均已退出，没有关闭用户原 Edge。未能在工具重置前执行最后的 enable(false)；该开关仅为页面模块内存布尔值，随这个浏览器实例销毁结束，未写入设置、未开启持续日志。

### 四个共享文件的真实前后观察

测试前只读基线为 **03:38:37.628Z**，测试后为 **04:35:11.821Z**；窗口包含等待用户解锁、实际操作与其他前台/后台活动。只读脚本经进程环境凭据请求四个固定 getFile，均 HTTP 200、有效 version=1，未输出正文、ID、名称或私人路径；直接业务/索引写入均 **0**。结果：

- `task-index.json`：**52,717 → 52,717 字节，items 55 → 55**；updatedAt 均为 `2026-10-20T03:26:49.675Z`，SHA-256 均为 `3154a3bb0f0282dc528726cc7ca15d3d24c28cccdce60369d121c9fa39a8c9ad`。
- `enhanced-diary-project-index.json`：**8,267 → 8,267 字节，roots 2/nodes 16 不变**；updatedAt 均为 `2026-10-13T14:55:18.634Z`，SHA-256 均为 `633ed7efe1615ddb73088f4590bf8e9f8590790a5a5fdbd84a6ec98df7f3b52e`。
- `recent-doc-snapshot.json`：**95,801 → 97,351 字节，docs 130 → 130**；updatedAt `2026-10-20T03:37:36.362Z` → `2026-10-20T04:34:27.327Z`；SHA-256 `36ab80bc8374cf7e47a6aa84b56da2059c807b9229139daceee3008eadbf2102` → `a74a2955999c170f7e3ac0581497d68ab48e4f1bf2900d00c25c368d4f3ea9c7`。
- `enhanced-diary-project-record-index.json`：**2,430 → 2,430 字节，items 3 → 3**；updatedAt `2026-10-13T14:55:19.037Z` → `2026-10-20T04:27:39.252Z`；SHA-256 `85809488b042e7087dcd382ee07ab3caecf218d2608db87e4af85bdce1babff9` → `caf31845caeb3bc324884bc924a10f579b805eefebe6d9379c4da22277b968ee`。

源码路径 `loadEnhancedDiaryWorkspaceState()` 会调用 `refreshEnhancedDiaryProjectIndex()`、`refreshEnhancedDiaryProjectRecordIndex()`；后者经过近期文档准备、writeDirect 与 prepared.commit，因此 UI 只读操作不代表所有派生文件只读。记录索引更新时间落在首次工作台加载附近，与该维护路径相符，**没有逐请求目的文件证据，不能据此排他归因**。近期快照同条目数但大小变化，也不能认定只是更新时间改变。未比较全部关系的语义内容，没有用旧哈希覆盖任何文件；不把哈希改变解释为错误，更不据此计算写入次数。两个未变化文件也不能排除写入相同字节。已有“近期快照可能重复写入”仍缺乏按文件归属的频率/耗时证据，本轮不改共享快照架构。

### 当前结论与唯一排错下一步

**真实前端实例、主页及工作区打开已确认；A～J 只读交互均实际执行。UI 验收仍为部分完成，不能宣布整体验收 PASS。** 未见本样本中核心区域长期 loading，首次核心可见 690.9ms，各页切换可见 8.1～67.7ms；没有旧版同环境基准，不宣称已量化改善最初卡顿。未取得月份 Canvas 精确完成时间、全部核心刷新调用次数，且选日之后存在真实未定位 TypeError，不能把它藏在“区域可见”的成功数字后。

当前唯一排错下一步：维护者在本地 Edge 打开上述地址并解锁，DevTools（F12）Console 开启 Preserve log，进入强化日记工作台 → 日历 → 下月 → 选择日期，保存**首个 TypeError 的脱敏 message/stack 及发生时刻**。只需排错信息，不提交密码、Token、用户正文或带请求体的完整 HAR；若堆栈含私有内容先遮蔽。先确认来源，再决定是否需要最小修复。

完整业务创建/完成/撤销、快速记录及项目关联仍**未获本轮授权、未执行**，当前配置仍指向正式日记和项目容器；不能自动切换到测试笔记本或覆盖共享索引。弹窗提交响应、业务一致性、重启与同步也未补验。没有创建新测试对象、清理旧对象、改版本/索引 schema/插件配置或执行发布。

本轮仅追加本报告；按 AGENTS 执行 `git diff --check`，不重复构建、部署、Mock、typecheck/lint。浏览器工具超时与 pageerror 分别记录，未把自动化失败当作插件卡顿根因。

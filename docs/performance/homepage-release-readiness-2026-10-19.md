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

## 日历选日 TypeError 定位与最小修复（2026-10-20）

基线 `7e172239ea3bcda49b86766e475a78f3d1b247ce`，开始时工作区干净。本轮按 AGENTS 读取 DESIGN、performance、data-and-indexing，使用 CodeGraph 核对 `handleChartClick → onSelectDate → loadSelectedDayDetail`、Svelte 更新与图表 render/dispose 路径。没有更改版本、索引 schema、刷新协调、存储架构或用户日记正文。

### 真实复现与完整技术证据

复用已安装 Edge 155.0.4283.62 与已有 Playwright；独立临时 profile、CDP 实查仅监听 127.0.0.1。首次准备窗口正常退出时尚未选日，重新打开本轮专用 profile 后，通过思源官方锁屏表单完成解锁，没有注入 API Token 或读取认证 Cookie。点击前已安装 `pageerror`、Console、CDP `Runtime.exceptionThrown` 和 `unhandledrejection` 监听，只保存技术异常及脱敏文件类别。

真实操作：打开主页 → 思源命令面板打开强化日记工作台 → 日历 → 下月。DOM 月份确认 **2026 年 10 月 → 2026 年 11 月**，根据本次实际 Canvas 截图与尺寸点击 15 日，详情 DOM 确认 `2026-11-15`。**仅执行 1 次日期点击**，详情检查后继续监听 **2200ms**，捕获完整错误即停止复现，没有点击任何创建/完成/编辑按钮。

- 点击：`2026-10-20T04:48:32.240Z`；CDP 异常：`04:48:32.276Z`，约 **36.2ms** 后；pageerror 接收于 `04:48:32.277Z`。
- 错误：**TypeError: Cannot set properties of null (setting 'innerHTML')**。
- 同一次异常由 pageerror 与 CDP 各报告一次，**不是两次业务异常**；CDP 未标记 Promise rejection，window unhandledrejection 未收到事件。
- 本轮详情检查于点击后约 46.7ms 完成，是断言确认时刻，不是首次绘制帧；不据此推算本轮异常与详情首次可见的先后。上一轮已有可见帧在异常之前的独立记录。

实际脱敏堆栈（V8 行列均从 1 开始；CDP 对应 0-based 436:18388）：

```text
TypeError: Cannot set properties of null (setting 'innerHTML')
    at t.setContent (plugin:siyuan-homepage:437:18389)
    at e._showTooltipContent (plugin:siyuan-homepage:439:2372)
    at e.eval (plugin:siyuan-homepage:439:907)
    at e._showOrMove (plugin:siyuan-homepage:437:26090)
    at e._showSeriesItemTooltip (plugin:siyuan-homepage:439:877)
    at e._tryShow (plugin:siyuan-homepage:437:25811)
    at e.manuallyShowTip (plugin:siyuan-homepage:437:24651)
    at eval (plugin:siyuan-homepage:437:23588)
```

通过 CDP `Debugger.getScriptSource` 取得该执行脚本，在内存去除思源 `(function anonymous(require, module, exports){...})` 及 sourceURL 包装后，**整个主体与修改前正式 dist/index.js 完全一致**；该 dist 为 7,527,324 字节，SHA-256 `21273fe0f8d6478943c03c3cffea4ee446e5f135996bfebd010289442e1f1708`，抛错所在 437/439 行逐行相同。最初直接比较含包装的脚本不相等，去掉完整宿主包装后才确认一致，没有把版本号或近似函数名当作代码匹配。正式包无 source map；依据一致 bundle 的具体语句和项目已安装 ECharts 5.6.0 的同名函数定位，而非猜测 Svelte 源码行。

### 真实根因与归属

归属为 **B：本插件打包的 ECharts 依赖，受插件图表更新方式触发**，不是日期详情数据结构错误，也不是本次捕获的思源本体或其他扩展堆栈。页面另有 3 条发生于选日前的浏览器扩展 Console error，其内容未保留；与上述明确的 plugin:siyuan-homepage 堆栈分开记录。

1. `WorkspaceCalendarChart.svelte:97–100` 正常选中日期，父页面 `loadSelectedDayDetail()` 更新选择与详情；`selectedDate` 的 Svelte effect 触发 `renderChart()`。
2. `renderChart()` 原有 `chart.resize()` 会刷新已悬浮的 Tooltip；ECharts `TooltipView._keepShow()` 安排 `_refreshUpdateTimeout`，稍后再执行 `manuallyShowTip()`。bundle 最后一个堆栈位置 437:23588 正是此 setTimeout 内调用，已直接核对语句。
3. 随后的 `chart.setOption(option, true)` 使用 notMerge，重建 Tooltip view。`TooltipView.dispose()` 未取消 `_refreshUpdateTimeout`；`TooltipHTMLContent.dispose()` 将 `el` 置 null。此时整个 ECharts 实例仍在运行，延迟回调的 `api.isDisposed()` 检查不能识别“仅旧 Tooltip 已销毁”。
4. 旧回调继续执行 `_showTooltipContent → TooltipHTMLContent.setContent`，在 `el.innerHTML = content + arrow` 抛错。对应已安装 `node_modules/echarts/lib/component/tooltip/TooltipHTMLContent.js:313`；dispose 在 391–397，`TooltipView.js` 的延迟刷新在 132–155、dispose 在 691–698。官方版本依据：[TooltipView 5.6.0](https://github.com/apache/echarts/blob/5.6.0/src/component/tooltip/TooltipView.ts)、[TooltipHTMLContent 5.6.0](https://github.com/apache/echarts/blob/5.6.0/src/component/tooltip/TooltipHTMLContent.ts)。

这是详情/选择更新后的独立 Tooltip 定时回调，因此详情可以已经显示而后续仍抛异常；不是 Promise 加载成功就能排除的错误。相同日历组件还用于总览紧凑日历，复用相同更新逻辑，故修复同时覆盖 full/compact。未发现证据要求修改任务/项目/记录服务，也不据此宣布所有其他图表均不存在类似依赖问题。真实旧版页面离开日历返回总览后另监听 2200ms，没有新增异常。

### 最小修复与行为回归

生产改动仅位于 `WorkspaceCalendarChart.svelte` 的一次 setOption：使用 **`{ replaceMerge: ["series"] }`** 更新，复用 Tooltip view，同时替换数据系列以移除旧月份条目。添加一行解释兼容原因的注释。没有关闭 Tooltip、屏蔽点击事件、吞掉异常、修改依赖或修改日期规则；原有权限、请求代次、销毁检查及核心刷新协调完全保留。

扩展现有 `verify-enhanced-diary-workspace-actions.mjs`，调用真实日历生产函数及 ECharts 5.6.0 的实际 model/view 生命周期，使用 Node SVG SSR 检查 Tooltip 身份复用、悬浮 formatter 可用、跨月数据替换、full/compact 两种布局和销毁期间的迟到 render；联动现有真实页面函数验证有/无日记、快速选日、旧请求迟到、加载失败、跨月、离开日历、关闭工作区、权限失效及卸载后返回。没有用 setOption 字符串匹配或纯 stub 宣称行为通过。

新增 Tooltip 身份断言在旧生产代码上 **exit 1**，提示 `selection must not dispose the tooltip while its keep-show callback can still run`；应用修复后专项验证 **32 组、exit 0**。最初用对象相等断言输出完整 ECharts 对象时，验证进程格式化过大而被终止；已改为布尔身份断言，该中断不计通过。SSR 验证覆盖实际模型生命周期，不替代浏览器 HTML Tooltip 的修复后实机复验。

### 网络附带观察及安全边界

本轮从工作台打开到选日尾部监听结束的有界观察中，已能识别的 getFile 类别为：task-index 2 次（最大 10.57ms）、recent-doc-snapshot 5 次（10.75ms）、项目索引 3 次（9.63ms）、项目记录索引 2 次（9.61ms）。同期捕获 **6 次 putFile**（最大 18.77ms），本次 multipart 元数据提取没有取得可靠目的文件，均保留为未分类，不能将其指认成某个共享索引或据此重构。保存的是类别、请求时刻、HTTP 状态与 Network 耗时，不保存文件内容、完整网络响应或 HAR。

较长的整个监听会话共观察到 21 次未分类 putFile（最大 59.16ms），包含等待和其他前台活动；与上述复现窗口分开，不与上一轮 10 次做性能比较，也不把请求数等同于某索引落盘次数。脚本未直接写入任何正式索引、文档或设置。关闭后已确认本轮 Edge 实例退出，并校验边界后删除仅本轮创建的临时认证 profile；未关闭用户原浏览器。脱敏异常摘要保留在本机临时目录，凭据和 Cookie 不进入诊断或 Git。

### 验证状态与实机复验边界

- `pnpm verify:enhanced-diary-workspace-actions`：32 组，exit 0。
- `pnpm verify:enhanced-diary-project-index`：聚合 PASS，exit 0。
- `pnpm verify:siyuan-api-compat`：A–I，exit 0。
- `pnpm typecheck`、`npx tsc --noEmit`、`pnpm lint`：均 exit 0。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均 exit 0，设置 `SIYUAN_SKIP_DEV_DEPLOY=1`；仅生成仓库产物及既有 dev 镜像，没有部署正式实例。单独 app 构建 56.72s、kernel 4.30s（Vite 输出，不是 UI 耗时），最终打包及 sync-dev 成功。
- 新 dist/index.js SHA-256 为 `2dda0f5f842afae1439f72196fe9ced4750aa96eca21cc605e98ac89132ce54b`；CSS 与 kernel.js 哈希仍分别为 `7b5c06207fc0c4f4b37c316ce3a6c0b38154449aa84af69003b3a414b22478eb`、`72b0374f3972ab7a8957595c3fd37f8c8db1ad23935d35cef8d9e485cf362090`，与旧正式产物一致。版本 5.1.10、minAppVersion 3.8.6、SDK 1.2.9 及依赖均未修改。
- `git diff --check` 通过；本轮三份修改文件均保留原 LF/UTF-8 格式。

**真实 TypeError 已定位，源码最小修复及专项回归已完成；修复后的正式插件尚未部署或重载，不能声称真实思源 UI 已复验通过。** 当前运行的仍是取得上述堆栈的旧正式 JS。需经用户另行批准备份并替换本机前端 JS、重载插件，确认实际执行新代码后，再执行相同真实 Canvas 选日及至少 2 秒尾部监听。批准前不覆盖正式插件，不把仓库新 dist 或 SSR 测试当成当前客户端已经修好。该异常的发布前关闭条件仍是这次真实复验，其他业务写入验收边界不变。

## 批准单文件部署后的真实选日复验（2026-10-20）

承接修复提交 `a07dc3728bf9a181b772e89fd0eb436fadb438ef`。用户明确批准：只备份并替换本机 `/data/plugins/siyuan-homepage/index.js`、重载主页插件并进行只读选日复验；不替换 CSS/kernel.js，不改业务配置。上一节“尚未部署/复验”的状态为批准前记录，本节补齐实际结果。

### 部署与执行代码一致性

- 开始时 main 工作区干净，仓库 Vite watch 为 **0**；重读规则及报告，通过 CodeGraph 核对调用链。复用上一轮全部检查已通过的 dist，没有重复构建。
- 校验安装目录与 Kernel 提供的旧文件一致，旧 index.js SHA-256 为 `21273fe0f8d6478943c03c3cffea4ee446e5f135996bfebd010289442e1f1708`。完整备份并回读验哈希，备份保留在本机临时目录 **homepage-calendar-backup-ab66f256-7ba3-4741-8d44-b7592e598ecf**，不提交备份或实际安装目录。
- 仅对 index.js 在目标同目录创建暂存文件、验哈希后原子 rename 替换。安装文件与 `/api/file/getFile` 回读均为 **7,527,347 字节**、SHA-256 `2dda0f5f842afae1439f72196fe9ced4750aa96eca21cc605e98ac89132ce54b`；没有整目录覆盖或清理其他资源。
- CSS、kernel.js、plugin.json 与原文件逐个验哈希一致。只发送 **1 次** `/api/petal/setPetalEnabled`（本插件、enabled=true），HTTP 200/code 0，返回 js 哈希匹配新文件；随后 Kernel 插件 **running/stateCode=2**。重载请求至读完响应体 **2710.29ms**，不是 UI 渲染时间。部署检查共 18 次请求均 HTTP 200，普通 envelope 均 code 0；除批准的重载外没有 API 写入。
- 独立临时 Edge 155.0.4283.62，CDP 实查仅绑定 127.0.0.1；通过官方锁屏表单解锁，没有注入 API Token。确认插件前端实例后，CDP 获取**实际执行的 plugin:siyuan-homepage 脚本**，去除思源宿主包装，主体文本完整匹配新 dist；其原始 UTF-8 dist 的哈希也匹配上述新值。至此确认安装文件、Kernel 状态及**被测 Edge 内存中的修复代码**，不推断其他已打开客户端的内存脚本状态。

### 新代码真实 Canvas 复验

在点击前启用 pageerror、Console、Runtime.exceptionThrown 与 unhandledrejection 监听。真实操作：关闭“主页操作提示” → 打开主页 → 思源命令面板打开工作台 → 日历 → 下月；DOM 月份从 **2026 年 10 月变为 11 月**。提示框曾短暂遮挡一次顶栏定位，关闭后再进入，没有 force click，定位等待不计作插件渲染耗时。

依据本次实际 Canvas 截图及尺寸，仅点击 **1 次 11 月 15 日**。点击时刻（北京时间）为 **2026-10-20T13:08:31.039+08:00**，DOM 确认选中 `2026-11-15`、画布仍存在，实际 HTML 悬浮提示仍含该日期。没有关闭 Tooltip 或屏蔽事件。以“详情日期文本匹配且 loading 消失后的可见帧”为终点，单次耗时 **981.3ms**；随后继续监听 **2500ms**：

- pageerror **0**，Runtime.exceptionThrown **0**，unhandledrejection **0**，Console warning/error **0**。
- 返回总览后另监听 **2200ms**，新增异常 **0**。
- 关闭工作台、确认其 DOM 移除后另监听 **2200ms**，新增异常 **0**。

**原选日 TypeError 的部署后真实 UI 复验：PASS（本次有界场景）。** 旧代码相同月份/日期路径可捕获 `Cannot set properties of null (setting 'innerHTML')`，新代码未出现该异常，且悬浮提示与详情继续工作。结论包含尾部及销毁监听，不只覆盖详情可见之前。

本次 **981.3ms** 如实保留。上一轮 20.9ms 终点仅为详情区域可见，本次要求具体日期匹配且 loading 消失，测量边界不同，不直接定性为同口径改善或退化。Resource Timing 缓冲最终达 250 项且未预先扩容，故**不使用事后空请求列表宣称选日 0 个 API**；未对该耗时作内核/渲染归因，不据此扩展索引性能重构。

### 配置、共享状态与收尾

部署前后五份受保护文件（强化日记配置、任务索引、项目索引、近期文档快照、项目记录索引）的大小/哈希均相同。UI 操作后另做 5 次固定 getFile 读取（均 HTTP 200，正式索引 version=1），并再次核对四份安装产物：

- 强化日记配置、task-index、项目索引哈希仍相同。任务仍 **55 条**，原专用测试任务在索引中恰好 1 条且 checked=true；测试文档/唯一任务还在部署后通过实际路径与子块 API 核对，没有重建或清理。
- recent-doc-snapshot 仍 **97,351 字节**，updatedAt `2026-10-20T05:08:52.147Z`；项目记录索引仍 **2,430 字节**，updatedAt `2026-10-20T05:08:04.588Z`。二者哈希与部署后基线不同，配置及另两索引不变；与 UI 读取链路维护派生索引相容，但无逐文件写入捕获，**不据哈希变化推算写入次数或排他归因**，没有恢复旧文件覆盖同步结果。
- 未创建、完成、撤销、编辑或删除用户任务/项目/记录，没有主动修改业务配置；直接业务/索引写入 **0**。批准的唯一安装文件写入与一次插件重载单独计数，不混称全程只读。
- 本轮 Edge 已退出，临时认证 profile 经目录边界校验后移除，没有关闭用户原浏览器。脱敏记录和旧 JS 备份保留在本机临时目录；Token 仅进入遮蔽输入的进程环境，退出清理，凭据/Cookie 不进入 Git 或报告。

本轮仓库仅追加本报告，执行 `git diff --check`；不重复上一提交已通过的 32 组工作区测试、项目索引/API verifier、typecheck、tsc、lint 与构建。**该 TypeError 场景的实机关闭条件已补齐；完整发布验收并未因此全部通过**：有日记日期、快速选日、API 故障/迟到请求仍主要为自动化覆盖，业务写入、原生客户端和多端同步未在本轮验收，未获得新增业务写入许可。版本、schema 和依赖保持不变。


## 日期详情读取失败与无日记分离（2026-10-20）

### 已确认的调用链与最小修复

本轮基线 `eee8ff85b33f359a516307b88388728e1ef0ebe6`，初始工作区干净。CodeGraph 核对 `loadSelectedDayDetail → loadWorkspaceDayDetail → getDiaryDocumentForDate → lookupDiaryDocumentForDate`，并继续核对基础日记索引读取链路。

原日期详情服务调用的 `getDiaryDocumentForDate` 将 missing/unreadable 都压成 null，服务自身 catch 又把其他异常转成 `emptyDetail`。页面把该返回当作成功结果缓存，因此 Markdown 导出、SQL 确认或解析失败可能显示为“无日记”，而且短期重选同日仍命中错误空态。另有一处同链路边界：宽松索引读取遇到不可读/不匹配时可返回空集合，仅切换三态查找仍不足以区分索引失败。

修复仅限日期详情链路：

- 服务直接使用 `lookupDiaryDocumentForDate`。exists 沿用原摘要/复习解析和详情结构；只有 missing 返回原无日记详情；unreadable 明确抛出“日期详情读取失败”，其余索引/解析异常向页面传递，不再转成空详情。
- 在已有 lookup 增加默认关闭的 `strictIndexRead` 选项，仅日期详情启用，复用现成 `getEnhancedDiaryIndexEntriesStrict` 验证磁盘文件、版本、完整性、笔记本及条目。其他日记查询调用方默认行为和 `getDiaryDocumentForDate` 返回契约保持原样。没有新索引或 schema；每次未缓存的详情只读一个现有索引文件，文档确认仍为单 ID 的有界 SQL，没有全文扫描或自动全量重建。
- 页面新增独立日期详情错误状态。新日期未缓存时先清空上一日期的详情；失败显示选中日期、“日期详情读取失败”和“重试”，不会显示成无日记。重试使用现有加载函数且不改变选择，不自动循环重试。使用现有工作区样式和提示方式，没有新弹窗体系。
- 仅当前请求成功后进入日期缓存，真实 missing 可以正常缓存；失败不缓存。成功重试恢复详情和缓存。仍然沿用 requestVersion、workspaceRefreshVersion、workspaceLifetime、componentAlive、advancedEnabled 保护；旧日期成功/失败不能覆盖新日期，卸载或权限撤销后不得发布迟到结果。离开日历但工作区仍存活时可保留当前日期已验证的缓存，不影响任务页。
- 非关键详情仍由原独立加载路径启动，失败或慢请求不阻塞核心任务、记录和项目发布。未更改核心刷新协调、ECharts Tooltip 修复、任务/项目写入服务或正式失效清理规则。只有现有权威缺失确认路径仍可清理真正失效的基础索引条目；读取失败不触发清理。

### 真实生产函数与受控故障回归

扩展既有 workspace-actions verifier，打包真实日记三态查找、严格索引验证、Markdown/摘要解析和日期详情服务，只控制 Kernel I/O。页面函数与重试事件表达式从真实 Svelte AST 提取，错误/有日记/无日记界面由真实 Svelte 组件 SSR 渲染，不以源码字符串存在性代替业务测试。

新增用例覆盖：合法缺失与正常日记、Markdown 导出失败/无效响应、SQL 暂时不可用、索引读取失败/损坏/未完整、解析异常、手动重试恢复、失败不缓存、已有有效缓存保留、旧日期迟到成功/失败、快速选日、离开日历、关闭与权限撤销、首次详情失败不阻塞核心状态，以及无自动重试和故障场景零写入。已有跨月份、慢请求、核心刷新协调及真实 ECharts model/view Tooltip 生命周期回归继续执行。

- `pnpm verify:enhanced-diary-workspace-actions`：**37 组，exit 0**（此前 32 组及本轮新增 5 组）。
- `pnpm verify:enhanced-diary-project-index`：聚合 PASS，exit 0。
- `pnpm verify:siyuan-api-compat`：A–I，exit 0。
- `pnpm typecheck`、`npx tsc --noEmit`、`pnpm lint`：均 exit 0。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均 exit 0，设置 `SIYUAN_SKIP_DEV_DEPLOY=1`，没有向正式思源实例部署或重载。构建日志中的既有 dev 镜像不代表正式插件被替换。

异常场景为生产函数配合受控 fixture 的验证，没有人为损坏用户日记、索引或配置来制造错误，也不宣称真实用户数据发生过这些全部故障。

### 本机真实只读核对与实机边界

通过进程环境变量鉴权连接 `127.0.0.1:6806`，真实 Kernel 版本 **3.8.7**。从真实配置及已验证索引取得一个现有日期/文档标识，再调用本轮新生产日期详情服务；Kernel I/O 连接真实 getFile、单 ID SQL 和 exportMdContent，未替换其返回数据。正常日期实际 hasDiary=true、docId 与索引一致；另一个索引中确认无条目的日期实际 hasDiary=false、状态为“无日记”。不记录实际日记日期、名称、标识、正文或配置。

共 **7 次请求，均 HTTP 200**：版本 1 次，getFile 4 次，SQL 1 次，Markdown 导出 1 次；普通 envelope 均 code 0。getFile 为真实文件 JSON，而非假定通用 envelope。正常日期生产服务调用 **43.17ms**（单次，含严格索引读取、SQL、导出与解析），对应三次请求分别 **12.63ms、7.24ms、17.22ms**；无日记验证的严格索引读取 **15.05ms**。这些是本次有界本机接口/服务测量，不是 UI 点击耗时，不与此前浏览器测量混算。

测试端口只允许上述只读接口，所有维护/写入入口直接拒绝；实际写入请求 **0**，被尝试的写入 **0**。没有创建、编辑或删除用户文档，没有直接覆盖正式索引或修改配置。Token 只进入遮蔽输入的进程环境，退出清理；临时摘要只含响应类别、字节数、耗时及成功布尔值，不含私人内容。

**结论：日期详情三态及错误/缓存/竞态自动化验收通过，正常读取和真实缺失的本地 Kernel 只读核对通过。** 本轮没有替换安装文件或重载插件；当前已安装前端仍为上一轮已完成 Tooltip 实机复验的构建。新版错误态按钮、失败后重试及新版浏览器迟到请求表现尚未做部署后 UI 复验，需另获部署许可后验证，不据本地构建宣称新版实机通过。此前所有真实测量数值保持不变；版本 5.1.10、所有索引 schema 和依赖均未修改。


## 日期详情部署复验、HTTP 失败挂起补修及业务写入准备（2026-10-20）

### 安装与执行证据

本轮基线 `33f9d41d4e59e175d04053db48845038846294d2`，初始工作区干净，CodeGraph 核对日期详情、日历、插件加载与正式业务写入链路。本仓库 Vite watch 为 0，开始验收复用上轮构建，没有重复构建。用户分别批准以下两个不同构建的 index.js 单文件部署与官方重载：

- 日期三态构建：从 `2dda0f5f842afae1439f72196fe9ced4750aa96eca21cc605e98ac89132ce54b` 替换为 `c6f140dfad24f54a0bd684bc291bc8629e49152ac5697c15dc7454688398d44d`，7,528,247 字节。
- 发现下述真实问题后重新验证/构建并获新批准，替换为补修构建 `578cc4a60cdb15303dc2eac0f85d1b3fc7abb60aa66354a8d81a1bf828f4e90e`，7,528,366 字节。

两次均校验目标归属、备份并验哈希、同目录原子替换 `/data/plugins/siyuan-homepage/index.js`、Kernel getFile 回读一致，再各调用一次 `/api/petal/setPetalEnabled`（仅本插件、enabled=true），HTTP 200/code 0，返回 JS 匹配目标。Kernel 均 running/stateCode=2，原文件备份留在本机临时目录。CSS、kernel.js、manifest、业务配置没有替换。dist/kernel.js 因共享源码打包与已安装文件不同，本轮授权只更新前端，不能宣称全部安装文件与新 dist 相同。

Edge 155.0.4283.62 使用独立临时 profile，CDP 实查仅监听 127.0.0.1。用户通过官方页面解锁，浏览器没有注入 API Token。c6f 构建的真实前端插件实例存在，执行脚本主体完整匹配 dist；578 补修构建也通过直接页面 CDP 核对执行脚本主体匹配，但这不等于已完成其可见 UI 复验。

### c6f 构建正常日期的真实 UI 与统一测量

实际通过主页按钮、思源命令面板打开工作台，进入日历。日期来自真实基础索引，使用真实 Canvas 鼠标点击，没有调用内部选日函数。分别显示正确日期、“有日记”及正常统计结构，或“无日记”，无错误重试按钮，未点击创建日记。

视口 1440×1400。T1 为 click 后详情区域首个可见帧（允许仍 loading，不代表业务就绪）；T2 为正确选中日期、loading 消失、预期结果连续两帧稳定。滚动条造成画布宽度从 892 到 902 像素时重新检查截图和定位，定位等待不计为点击耗时。

- 有日记样本 1：T1 **44.2ms**，T2 **96.8ms**，未缓存；点击窗口 4 个 API，其中详情相关 3 个：索引读取 **28ms**、单 ID SQL **3ms**、Markdown 导出 **8ms**，均 HTTP 200。另 1 个请求未归因为日期详情。
- 有日记样本 2：**19.0/23.2ms**，0 个 API，符合成功缓存命中。
- 有日记样本 3：**11.5/26.3ms**，0 个 API，符合成功缓存命中。样本 2/3 均先选另一日期再返回，是独立点击。
- 无日记样本 1：**18.8/55.0ms**；样本 2：**15.8/40.2ms**；样本 3：**14.9/50.0ms**。三个不同未缓存日期各读索引 1 次，分别 **17/4/5ms**，HTTP 200。

六次正常点击及其后 2200ms 监听：pageerror、Runtime.exceptionThrown、unhandledrejection、Console warning/error 均 **0**。此前 Tooltip TypeError 在这些点击中没有复发。以上均对应 c6f 构建，不冒充 578 构建完整复测，不与历史不同测量终点计算提升比例。

### 精确单次故障注入发现的新缺陷

实际 getFile 为 POST JSON `{path}`，索引响应为文件 JSON。先捕获正常选日请求 initiator stack，核对 bundle 的日期详情函数及 onSelectDate，再仅在本轮页面、指定未缓存日期点击窗口，对基础日记索引请求且调用栈属于选日链路时，注入 **1 次 HTTP 503/code=-1**。没有统一拦截 getFile、拦截 putFile 或改写 Kernel 文件；后续已禁用并移除 Fetch 拦截。

这是 **真实浏览器 UI + 受控故障注入**，不是 Kernel 自发故障。结果不通过：503 请求约 **35ms** 结束，但 **10 秒** 后详情仍 loading，没有错误与重试按钮。仅出现预期的浏览器 503 Console error；pageerror、Runtime.exceptionThrown、unhandledrejection 均 0。实际切任务页再返回、选择已成功缓存日期可以恢复显示（T1 21.2ms/T2 25.1ms、0 请求），不能据此宣布错误重试或迟到请求通过。

根因是 `src/index.ts` 的前端 getFile runtime 适配器只把 SDK success callback 包装为 Promise，未接 SDK failure callback。HTTP 失败不调用 success，Promise 永不结束，上层 getFileChecked/严格索引/日期详情 catch 无法执行。没有误显示无日记，但错误态也没有机会发布。

局部补修仅给该适配器接上 reject、SDK 已有第五参数 failCallback，并捕获 fetchPost 自身 Promise rejection。保留现有 SDK、正常 JSON/Blob、正式缺失语义和上层三态逻辑，没有新增传输架构、吞异常或修改 Tooltip。参数依据项目已安装 siyuan 1.2.9 的 FetchPost/APIPostTail 声明。

### 自动化结果及补修后的实机限制

扩展已有 API verifier，通过 TypeScript AST 提取真实 onload 注册的 getFile 适配器，执行该适配器和真实 checked wrappers，覆盖 JSON、Blob、显式 404、API 错误、SDK HTTP 失败回调和网络 rejection。旧代码新增断言 exit 1（pending 而非 rejected）；补修后通过。没有改变 Mock 期望规避失败。

- `pnpm verify:siyuan-api-compat`：**A–J，exit 0**。
- `pnpm verify:enhanced-diary-workspace-actions`：**37 组，exit 0**。
- `pnpm verify:enhanced-diary-project-index`、`pnpm verify:remote-kernel-compat`：均 exit 0。
- `pnpm typecheck`、`npx tsc --noEmit`、`pnpm lint`：均 exit 0。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均 exit 0，设置 SIYUAN_SKIP_DEV_DEPLOY=1。app 单项 37.86s、kernel 单项 4.41s 是构建耗时。正式部署另获批准，并非构建自动部署。

补修后恢复浏览器会话时，Playwright CDP 附着/导航超时；直接页面 CDP 求值也发生阻塞。一次恢复窗口为 hidden，该阶段点击不作为可见 UI 证据。独立有界进程的导航在 **60 秒** 内未完成，没有取得新日期样本。此调试/前端加载阻塞未归因，不能直接认定为插件性能回归，也不能拿未选日时零异常宣称补修实机通过。

**578 构建的“503 后错误提示 → 点击重试 → 恢复及缓存”尚未完成真实 UI 复验。** 快速交错选日、跨月迟到、请求期间离开、关闭再打开的本轮完整竞态也未全部取得真实证据，仍以生产函数回归为限。taskIndexDiagnostics 前后完整差值及逐文件 putFile 次数未成功采集，不报告为 0、不从哈希反推次数。

仅本轮 Edge 已关闭，端口及所属进程均消失。删除本轮临时认证 profile 的 PowerShell 操作被自动审批拒绝，工具仅返回 blocked by policy，未提供具体原因；未改用其他删除方式。该目录 **homepage-detail-edge-bnIfPR** 仍留在本机 TEMP，需手动清理认证数据。故障拦截已移除；诊断仅启用于本轮页面实例，没有更改持久化设置。

### 真实业务写入准备与共享状态

只读复核原专用测试账本：原文档仍在专用笔记本，测试任务恰好 1 条且已完成，正式任务索引对应 root 一致；任务索引仍 **55 条**，项目索引 **2 根/16 节点**。dailyNotebookId 指向正式笔记本；projectStorage.mode=**parentDoc**，父文档及其笔记本均非专用测试对象，真实单 ID 元数据有效，项目索引 complete=true、containerSignature 与配置一致。当前基础索引没有今日日记，正式任务/记录入口可能创建正式今日日记，专用测试笔记本不构成业务隔离。

最初与末次只读比较：配置、任务索引、项目索引大小/哈希不变；recent-doc 快照和项目记录索引有变化，大小仍 **97,351/2,430 字节**。相对于第二次部署后基线，末次仅 recent-doc 哈希变化。没有完整逐文件请求证据，不将变化排他归因或当作写入次数，没有恢复旧哈希。末次 5 次 getFile 均 HTTP 200，未直接写正式配置或业务索引。

后续整批授权的具体范围如下；**本轮仅准备，未取得该批业务写入批准，未执行**：

1. 在当前正式项目父文档下新增 1 个唯一测试标记的根项目文档，仅在新项目内新增 1 个子项目标题，不操作已有项目块、不切换项目配置。
2. 工作台新增 1 条同标记任务关联新项目，只完成及撤销该任务各一次；根据真实 operation ID/块树定位并写后回读，不重试不确定的创建。
3. 在当前正式日记笔记本新增 1 条同标记快速记录并关联测试项目，可能涉及创建当日日记。若新文档缺少正式模板结构则停止报告，不擅自补模板或修改已有日记结构。
4. 经正式服务增量维护 `/data/storage/petal/siyuan-homepage/` 下 task-index.json、enhanced-diary-project-index.json、enhanced-diary-project-record-index.json、enhanced-diary-index.json、recent-doc-snapshot.json。这些为全局共享文件，不是隔离副本；不直接覆盖、清空或重建。既有后台事件的其他派生维护需实测观察，不能承诺整个工作空间零副作用。
5. 不改插件配置。执行前复核当日、配置与签名；每个真实新对象的 ID、根文档、父子关系、属性和索引关联只记本机临时账本，同批使用唯一测试标记，每项创建只提交一次，部分成功或未知即停止后续写入。
6. 测试后保留对象，清理需另获批准：只按账本 ID 删除本轮新任务/记录块和新项目文档；新日记仅在确认没有后来用户内容时才能删，已有日记不删。走正式失效维护，不回写整份旧索引，不按名称批量删除。

**结论：部分完成，不能宣布发布验收通过。** c6f 正常三态已有真实 UI 证据；HTTP 失败挂起有真实受控复现、最小补修、自动化验证及获批部署，补修后的错误/重试与本轮完整竞态仍待实机验收。先补齐新版只读故障态验收，再按上述完整范围取得一次业务批准。版本 5.1.10、schema、Tooltip 修复不变，业务创建/编辑/删除 0；历史测量未重写。


## HTTP 失败恢复闭环及获批业务批次实测（2026-10-20）

### 新证据与最小补修

本轮基线 `d14e90ca307de989990ff1f8f6b35d2d926af4c6`，起始工作区干净。先核对安装文件、Kernel 回读及 dist 均为 `578cc4a60cdb15303dc2eac0f85d1b3fc7abb60aa66354a8d81a1bf828f4e90e`，没有先行重复部署。第 1 次有界浏览器恢复即成功：独立 Edge profile、CDP 仅监听 127.0.0.1，官方解锁后真实前端可用。没有把先前 Playwright 导航超时归因为插件性能问题。

578 构建在真实选日调用链中再次精确注入一次索引 getFile HTTP 503：请求 **31ms** 结束，**7 秒**后仍 loading；SDK failure callback 断点命中 **0**，没有外层 Promise rejection。由当前实际执行的思源前端 `main.4fd9fe98adb7cf8c365c.js:7426` 的 fetchPost 实现确认：JSON 错误被 processMessage 消费后，SDK 的 Promise 正常 fulfill，但 success/failure 两种 callback 均不调用。上一轮只补 failure callback 和 catch 没有覆盖这个实际分支，不能宣布 578 已完成故障恢复验收。

同一 SDK 还明确将 getFile 的 HTTP 202 交给 failure callback；结合此前真实 Kernel 的 code=404 缺失响应，旧补修直接 reject 所有 failure callback 也会破坏 getFileOrNullChecked 的确认缺失语义。本轮只修改 `src/index.ts` 原有 getFile 适配器：保留显式 code=404 响应供 checked wrapper 判断；其他失败回调拒绝；SDK Promise 结束仍未返回数据时拒绝未完成读取。正常 callback 已先 resolve，末尾 reject 不改变其结果。没有新增网络实现、重试定时器、吞异常、索引改造或 Tooltip 改动。

现有 API verifier 仍从生产 onload 的 AST 提取适配器，新增“SDK 吞掉错误但 Promise fulfill”分支，并把缺失 fixture 修正为实际 failure callback 分支，另测合法空字符串。新 fixture 在旧代码下先失败，补修后通过，不以调整空数据期望掩盖错误。

- `pnpm verify:siyuan-api-compat`：**A–K，exit 0**。
- `pnpm verify:enhanced-diary-workspace-actions`：**37 组，exit 0**。
- `pnpm verify:enhanced-diary-project-index`、`pnpm verify:remote-kernel-compat`：均 exit 0。
- `pnpm typecheck`、`npx tsc --noEmit`、`pnpm lint`：均 exit 0。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均 exit 0；设置 `SIYUAN_SKIP_DEV_DEPLOY=1`，没有构建自动部署。app 单项 47.45s 仅是构建时间。

用户针对新哈希再次明确批准后，只备份并原子替换 index.js，Kernel 回读一致，调用一次官方 setPetalEnabled 后 running；刷新当前已解锁页面，并通过 CDP 实际执行脚本主体完整匹配 dist。受测新文件 **7,528,471 字节**，SHA-256 `5fbdcc3453b82ab31ac3a85942805a908b305ac96a4d6f9e610033b985ba52b4`。CSS、kernel.js、manifest 和业务配置未部署；版本、依赖与所有 schema 不变。

### 5fbd 构建可见 UI 错误、重试与缓存

通过真实命令面板打开工作台、进入日历，并按实际 Canvas 布局鼠标选日；没有调用内部选日函数。页面重载后先重新关联 Network initiator：两次未命中拦截的选日实际正常读取，**不作为故障验收**。最终命中的请求同时满足当前页面 POST JSON 的精确基础索引 path、选日函数栈及本次未缓存日期点击窗口，只 fulfill **1 次 HTTP 503/code=-1**，未拦截 putFile、未改写 Kernel 文件，也未影响其他窗口。这是浏览器受控故障，不能描述为 Kernel 自发故障。

沿用 T1=点击后详情区域首个可见帧，T2=正确日期、loading 结束、目标状态连续两帧稳定。以下均先 bringToFront 并确认 visibility=visible、document.hasFocus=true，1440×1400 视口；单次有界样本，不与历史不同边界数字计算性能提升：

- 正常未缓存无日记：**T1 14.1ms / T2 50.8ms**；索引读取 1 次，HTTP 200、13ms。
- 正常成功缓存命中：**12.1 / 25.0ms**；API 0 次。
- 单次故障后错误态：**14.9 / 69.2ms**；目标索引 HTTP 503、33ms。窗口内还有 1 次加密笔记本租约请求 6ms，不归因为日期详情。
- 移除拦截后真实点击“重试”：**11.6 / 44.5ms**；重新读取索引 1 次，HTTP 200、12ms。
- 重试成功后先选另一日期再返回：**13.4 / 16.9ms**；API 0 次，符合成功详情缓存命中。

故障后正确选中日期保留，aria-busy=false，显示“日期详情读取失败”和“重试”，没有“无日记”或上一日期的有日记详情。至少 2.1 秒尾部观察只有一次失败索引读取，没有自动重试。点击重试后显示该日期真实无日记、错误消失、loading 结束，再观察至少 2.1 秒。任务页和项目页仍可切换使用。新页面最初三个未做前台焦点校准的样本 T1/T2 为 989.1/2002.3、784.2/1781.9、782.0/1797.5ms（对应请求分别 3、1、0 次），保留其测量边界，不将这些差异擅自归因于 Kernel 或插件卡顿。

有限竞态实测：跨月到两个基础索引中确有日记的日期连续真实点击，最终所选日期正确，T1/T2 **13.3/81.7ms**，两个选日合计索引/SQL/导出各 2 次；2.1 秒后旧结果未覆盖新日期。另对一个未缓存日期暂停单个基础索引请求，真实返回任务页后释放，再回日历，日期正确且 loading 结束。之后真实关闭重开工作台。上述监听期 pageerror、Runtime.exceptionThrown、unhandledrejection 均 **0**，Tooltip TypeError 没有复发；预期 503 Console error 与 SDK 故障提示不计为未捕获异常。没有在本轮人为撤销会员权限；该情形仍只有既有生产函数回归证据。

**HTTP 故障恢复只读 UI 验收：PASS，证据属于 5fbd 补修构建，578 的失败结论保留。**

### 已获批准业务批次：项目通过，任务阶段按规则停止

用户已明确批准此前列明的整批正式业务操作及共享索引正常维护，条件为只读错误恢复先通过。本轮通过后再次只读验证配置和项目索引哈希/签名与前轮一致，才执行。没有切换日记笔记本、项目容器或修改配置。所有新对象使用同一唯一测试标记；真实 ID 与清理范围只留本机临时账本，不提交名称、路径、ID 或正文。

1. 在当前正式 parentDoc 下，通过 UI **仅提交一次**根项目创建。createDocWithMd HTTP 200/code 0、请求 **35ms**，响应监听在提交后约 **98ms**取得真实文档 ID。随后 getPathByID 确认与正式父文档同笔记本且位于其子路径，项目索引及界面均包含该根项目。未对根项目表单关闭时刻安装连续采样，故不填精确关闭/显示耗时。
2. 在该新根项目中，通过 UI **仅提交一次**子项目创建。处理中 **1.7ms**、表单关闭 **288.0ms**、子项目详情标题出现 **302.2ms**。appendBlock HTTP 200/code 0、**7ms**，属性写入 **5ms**、回读 **2ms**。真实 getChildBlocks 回读为 h/h1；项目索引 rootProjectId、parentTargetId、ancestorTargetIds 均正确指向本次新根项目。没有重建完整项目索引。
3. 在任务表单中填写唯一测试任务，关联本次新子项目，**只点击一次“创建任务”**；处理中 **0.5ms**出现。正式服务调用 createDailyNote 一次，HTTP 200/code 0，真实 data.id 已存账本；该请求 **56ms**。但任务未确认写入，表单恢复可提交而未关闭，按规则立即停止后续业务写入，没有再次提交。

实际请求证据显示：新日记可导出 Markdown，但创建后的 5 次有界元数据查询均返回 0 行，其中任务最终写入前验证约在提交后 **191.1ms**执行；其他查询约为 187.9、353.3、664.5、1120.8ms。`submitNewTaskForWorkspace → getOrCreateTodayDiaryDocument → addNewTaskToDiary → validateEnhancedDiaryWriteTarget` 在无法确认目标元数据时拒绝写任务，没有把未知状态当空文档。稍后的只读复查 getPathByID 成功、单 ID 元数据为 1 行且属于配置日记笔记本，说明创建成功与 SQL 当时可见性不同步；本轮没有连续测定恢复可见的准确时间，不能给出其延迟阈值。对新日记的真实块读取只有 1 个非标题块、0 个标题及 0 个任务列表，也尚不具备正式强化日记模板结构。没有擅自补模板或改变日记格式。

因此不能宣布任务创建成功，也不能把“文档创建成功”写成“任务成功”。未继续完成/撤销任务、未添加快速记录、未执行这些对象的项目双链验收；这些仍需处理新日记准备/元数据可见性问题后，另行安排有界业务复验。本轮不扩大为任务服务或索引架构修复。已确认的根项目、子项目及本次新日记保留，**不自动删除**；日记没有测试任务，清理前仍须确认是否存在后来用户内容并另获清理许可。

关闭重开工作台后，新根项目和子项目仍可见，索引可回读。相较新增根项目后的快照，原有 16 个节点及原有 2 个根项目条目逐项相等；本次新根项目仅 updated 随子项目写入改变。项目索引从 **2 根/16 节点**变为 **3 根/17 节点**。任务索引始终 **55 条、52,717 字节，哈希不变**，无测试任务；没有清空、覆盖或恢复旧共享文件。

### 计数、共享状态与剩余边界

业务窗口内 taskIndexDiagnostics（启用前为 0，采集后已关闭）：databaseCommits=**3**、targetedRefreshes=**3**、broadCleanups=**0**、indexReads=**13**、indexWrites=**0**、writeBytes=**0**、noopWritesSkipped=**3**、dataUpdatedEvents=**0**、workspaceRefreshes=**0**。这只覆盖本页面运行时的该窗口；项目使用局部面板刷新，不能据此宣称全部环境永久无重复刷新。

同一较长观察窗口还包含人工只读回查、项目切换及其他正常前台活动：getFile 206 次、putFile 16 次（12–21ms，均 HTTP 200）。本轮 Network 全量元信息保留了次数，但 multipart 写入的逐文件归类不完整，**不能把这 16 次全归因为某一个索引或某一次创建，也不能用哈希变化倒推写入次数**。已有 recent-doc 重复写入风险未在本轮重构。

末次共享文件只读摘要（位于 `/data/storage/petal/siyuan-homepage/`，未提交文件内容）：配置 2,719 字节、哈希不变；任务索引如上；项目索引 9,091 字节、3 根/17 节点，预期变化；项目记录索引 2,430 字节、3 条，哈希变化；recent-doc 快照 98,675 字节/132 条，哈希变化；基础日记索引仍 10,891 字节/28 日，没有新增今日日记条目。后三者需与正常前台维护、元数据可见性分别解释，不声称它们被本测试排他改变或全部一致性已验收。没有直接写任何索引 JSON、重建索引、修改已有用户任务或回滚正常更新。

测试 Edge 已关闭，清理本轮 Cookie，相关测试进程和 49630/51110 监听均为 0。上一轮临时 profile `homepage-detail-edge-bnIfPR` 仍在；本轮 `homepage-recovery-edge-ohWB7e` 的常规 PowerShell 删除同样被自动审批拒绝（blocked by policy，未提供具体原因），未尝试替代删除方式。两个 TEMP profile 需用户手动清理，报告不包含其中认证内容。部署备份及测试对象账本仍留本机，未提交凭据。

**本轮结论：只读 HTTP 错误恢复 PASS；正式业务批次部分完成，任务创建阶段停止，完整业务/发布验收尚未通过。** 新增局部补修已有自动化与安装后真实 UI 证据；任务完成/撤销、快速记录、相应关联和持久化仍未验收。后续先处理新日记 SQL 可见性与模板准备的明确边界，不凭本轮结果继续重构索引，不重试或自动删除已创建对象。


## 新建日记 SQL 就绪确认与既有测试对象保护（2026-10-20）

本轮基线 `07787dd8e28c3060ba22470f90a8b03cecbb8a3b`。首先读取规则并由 CodeGraph 核对创建、元数据校验、基础索引及工作区提交链路。没有新增正式项目、任务、快速记录或日记，没有重复上轮创建，也没有清理对象、补模板、修改配置、部署或重载插件。

### 已创建对象的当前真实状态（只读）

复用上轮本机临时归属账本中的真实日记、根项目和子项目 ID，不按标题猜对象。首次 10 个、补充恢复查询后 11 个有界只读请求均 HTTP 200：配置、getPathByID、单 ID SQL、Markdown 导出、getChildBlocks、getBlockAttrs、基础索引、项目索引及任务索引。基础索引通过打包的生产 `getEnhancedDiaryIndexEntriesStrict` 读取校验；没有调用维护/写入入口。

末轮请求耗时：日记 getPathByID **13.68ms**、单 ID SQL **16.03ms**、Markdown 导出 **14.49ms**、日记子块 **7.09ms**、块属性 **7.82ms**、严格基础索引读取 **15.95ms**；新增受限官方日期属性恢复查询 **18.35ms**。这些是本机只读单次 API 测量，不是新文档就绪耗时或 UI 点击耗时。

- 上轮日记现已可读，type=d，所属笔记本、官方 `custom-dailynote-YYYYMMDD` 属性和业务日期均正确。
- 子块仍只有 1 个非标题块，**0 个标题、0 个任务列表**；没有本次测试任务，任务索引也没有该任务。没有为了通过测试追加模板。
- 严格基础索引 complete=true、version=4、28 日，**仍缺该日日记条目**。只记录待受控补登记状态，本轮没有修改正式索引。
- 上轮新根项目和子项目仍存在，真实子块 ID 与账本一致、父子索引关系正确；项目索引仍 **3 根/17 节点**。任务索引 **55 条、52,717 字节，哈希与上轮相同**。没有发现已知条目丢失。
- 按指定笔记本、type=d、官方属性名及日期值的元数据查询实际返回账本中的同一日记，LIMIT 2，用于检测歧义而非随意挑选。

### 根因与本轮修复

原链路为 `getOrCreateTodayDiaryDocument → createTodayDailyNoteForWidget → readDiaryMarkdownResult → addNewTaskToDiary → validateEnhancedDiaryWriteTarget`。原创建包装器异步启动 `indexCreatedEnhancedDiaryDocument`，后者只有 0/150/450ms 三次尝试；调用方仅确认 Markdown 可导出便继续，未等 SQL 元数据可用。上轮约 191ms 写前校验以及约 1121ms 内的查询均为空，但稍后真实读取可见的事实保留，不能解释为文档创建失败。

官方依据：核对 [v3.8.6 model/file.go](https://github.com/siyuan-note/siyuan/blob/v3.8.6/kernel/model/file.go)、[v3.8.7 model/file.go](https://github.com/siyuan-note/siyuan/blob/v3.8.7/kernel/model/file.go) 和 [v3.8.7 API filetree.go](https://github.com/siyuan-note/siyuan/blob/v3.8.7/kernel/api/filetree.go)。创建成功表示已有文档树可载入并返回其 ID，不保证随后普通 SQL 已处理完索引队列；没有配置原生日记模板时，创建末尾不强制 SQL FlushQueue。这与本机“导出成功、SQL 暂不可见”一致。未通过再次创建来验证延迟，也不把 fixture 延迟当作 Kernel 实测。

1. `enhancedDiaryDoc.ts` 新增只针对真实返回 ID 的有限就绪确认。只读该 ID，检查响应结构、同一 ID、type=d、box 和官方日期；明确 out_of_scope/date_mismatch 立即失败。只有 missing/unknown 进入退避，最终仍为 unknown，不将超时转换为不存在。
2. 间隔 **0、150、300、600、1000、1500ms**，通常累计等待 **3550ms**、最多 6 次；整个元数据确认阶段设 **4000ms deadline**，单次 SQL 挂起也由剩余预算结束等待，清理计时器。迟到 SQL 仅为只读结果，不会发布就绪或启动写入。不承诺包含创建和索引 I/O 的整次操作 4 秒完成，也不宣称所有真实 SQL 延迟均在预算内。正常已存在并验证的日记没有新增退避等待，正式任务写前校验继续执行。
3. `enhancedDiaryActions.ts` 对同笔记本/本地业务日的并发准备复用同一个 flight。取得 ID 后按顺序等待就绪、定向索引登记及回读、Markdown 读取；任一阶段失败保留真实 docId/created/reason，不把日记成功当作任务成功。
4. 任务准备入口改为严格读取现有基础索引，不再因索引损坏、版本/笔记本不符或不完整而自动完整重建。`indexCreatedEnhancedDiaryDocument` 在原维护队列内重新读磁盘，只合并已验证的这一篇，保留其他日期、schema/version/notebookId/complete；同日另一 ID 冲突安全失败。写后回读并比较全部条目，失败返回 false，不用空索引覆盖未知文件，也不因写后错误重复写三次。
5. 失败分类保留 `metadata_pending`、`out_of_scope`、`date_mismatch`、`index_not_ready`、`read_failed`、`existing_doc_unreadable`、`creation_unknown`。工作区明确提示“今日日记已创建，但尚未确认可以写入任务。任务未写入，请勿重复创建日记。”，并补充具体失败阶段。创建状态不明时单独提示，保持表单与输入。任务真实写入成功/写后部分成功的既有规则不变。
6. 文档就绪不代表标题模板完整。真实 `addNewTaskToDiary` 仍通过正式标题定位器检查；缺少标题时不插入任务，并引导现有“补充今日模板”入口。本轮没有自动调用该入口，也没有修改正式模板结构。

### 防重复与恢复边界

同一运行时按笔记本及本地日期记住已返回 ID；未知创建响应也留保护标记，不能再次提交 createDailyNote。失败重试优先复核同一 ID，不会因为基础索引缺条目而重新创建。对于页面重挂载或重启，先以受限 SQL 查询官方日期元数据：唯一候选交给同一就绪校验，多个候选或查询错误均停止，不扫描正文，不执行全库重建。

如没有候选，仍只调用现有官方原生日记入口。官方 3.8.6/3.8.7 的创建锁和当前日记路径复用已由实现核对，不假设其在任意命名模板/路径变化下都绝对幂等；本轮没有修改这些配置。已有日记在本机只读恢复查询中已被找到，所以不会需要再调用创建入口。跨窗口/进程的最终路径复用依赖 Kernel 的该实现，本轮不新增持久化创建日志或分布式锁。

### 生产函数回归与构建

新增 focused verifier `scripts/verify-enhanced-diary-creation-readiness.mjs`，由原 workspace-actions verifier 一并执行，打包真实 getOrCreateTodayDiaryDocument、validateEnhancedDiaryWriteTarget、indexCreatedEnhancedDiaryDocument、addNewTaskToDiary 和标题定位器，仅控制 Kernel I/O。覆盖立即可见、前 3 次为空、超过 1 秒恢复、始终为空、SQL 网络/错误结构/永久挂起、错误笔记本/日期、导出失败、索引写入/回读失败、跨实例未索引日记恢复、未知创建响应禁止重复、缺模板零任务写入、完整模板一次插入和正式写前复验，以及严格索引损坏/版本/笔记本/完整性/读取失败与队列内读取最新状态保留其他日期。该 verifier 的任务同步 I/O 是边界 stub，不宣称其替代真实任务索引维护验收；后者运行既有独立 verifier。

工作区原真实 handler、dialog host 和任务表单还验证：各类已创建但未就绪结果均不写任务、不关闭表单，原输入保留，未知创建也明确提示勿重复创建。没有用源码字符串存在性替代这些业务断言。

验证实际结果：

- `pnpm verify:enhanced-diary-workspace-actions`：**39 组，exit 0**，其中新增生产就绪 verifier **14 组**，以及已创建未就绪的表单保留测试；原 Tooltip/日期详情/刷新协调测试继续通过。
- `pnpm verify:enhanced-diary-project-index`：聚合 PASS，exit 0。
- `pnpm verify:siyuan-api-compat`：A–K，exit 0。
- `pnpm verify:task-index-sync-performance`：**28 个生产场景，exit 0**，继续覆盖确认任务的正式索引维护。
- `pnpm typecheck`、`npx tsc --noEmit`：均 exit 0。首次 lint 发现新 verifier 有 1 个未使用 import，移除后 `pnpm lint` exit 0，没有放宽规则。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均 exit 0，`SIYUAN_SKIP_DEV_DEPLOY=1`。app 单项 24.90s 是构建时间，非 Kernel 性能数据。只更新构建产物及既有本地 dev 镜像，不自动部署运行中的实例。
- 正式安装 index.js 仍为 `5fbdcc3453b82ab31ac3a85942805a908b305ac96a4d6f9e610033b985ba52b4`，只读哈希核对未变。`git diff --check` 通过。

没有部署本轮新前端或重载，当前安装仍是上轮已实测 HTTP 恢复的 5fbd 构建。因此新就绪等待、准确提示及模板缺失后的 UI 行为尚需另获部署许可后复验；本轮没有真实写入新任务，不宣称已完成业务验收。上轮已创建对象继续按本机账本保留，补登记正式索引和清理均未执行。版本 5.1.10、索引 schema、Tooltip 修复及共享 recent-doc 架构不变。


## 日记就绪补修部署与原日记定向恢复（2026-10-20）

本轮基线为 `da84a8245d6f6dab9ecf292b47db7fc049ba6f15`。CodeGraph 核对 `appendTodayTemplate → ensureTodayDiaryAndAppendTemplate → getOrCreateTodayDiaryDocument`；现有测试对象从本机归属账本恢复，没有按相似名称接管对象。用户要求使用已打开的思源桌面客户端后，停止 Edge 路径，没有再启动浏览器或要求用户完成浏览器认证。

### 已完成的部署及真实生产服务验证

- 用户明确批准后，仅备份、原子替换 `/data/plugins/siyuan-homepage/index.js` 并调用一次官方插件启用/重载接口。安装文件与 Kernel getFile 回读均匹配 dist：**7,530,972 字节**，SHA-256 **`4d069e451e386483a1cdf60626c7f1baec6ea6c506c65d8026cd5dcc242d7267`**。备份哈希已验证，官方接口返回的前端 JS 同样匹配，Kernel 状态 running。CSS、kernel.js、manifest、配置均未部署；无本仓库 Vite watch 进程覆盖目标。**这证明安装及 Kernel 运行状态，不证明桌面 renderer 已执行新构建。**
- 部署观察窗口内配置、任务索引、项目索引及项目记录索引哈希未变，recent-doc 快照变化。不能把哈希变化解释成写入次数，也不能排除其他正常前台活动；没有覆盖文件来恢复旧哈希。
- 原测试根项目和子项目仍存在，父子关系正确；当时项目索引为 **3 根/17 节点**，任务索引 **55 条、52,717 字节**，与上轮哈希一致且没有待验收任务。这是本轮写入前的有界快照，不表示后续持续监控。
- 原测试日记仍为同一 ID、同一配置笔记本及业务日期，实际块只有一个空段落，没有标题或任务列表。Markdown 导出中的 YAML 元数据、生成的文档标题及不可见空白已分别识别，没有将导出元数据误认为后来用户正文。模板补全已单独获得明确批准，**尚未执行**。
- 使用当前 HEAD 打包的真实 `getOrCreateTodayDiaryDocument`、基础索引服务及 checked API/runtime port，连接本机 Kernel 恢复已知日记。受控传输拒绝文档创建/修改、其他文件写入及非目标 SQL；唯一允许的索引写入为生产服务生成并校验的基础日记索引 Blob，另允许其正式目录创建请求。未手工构造或覆盖索引 JSON，也未完整重建。
- 恢复结果为 **PASS**：返回原账本日记 ID；`createDailyNote` 调用 **0**、文档写入 **0**、拒绝的越界调用 **0**。基础日记索引 **28 → 29**，原 28 条逐项保留，schema/version、笔记本及 complete 保持不变，生产写后回读及额外只读确认均通过。
- 此次基础索引文件写入 **1 次**，目录请求 **1 次**；索引 putFile **25.12ms**、生产写后 getFile **21.83ms**。生产服务调用至额外最终只读确认结束合计 **146.39ms**，包含额外验证，不是 UI 点击耗时，也不是单独 Kernel 执行耗时。含配置和基线检查在内共 **12 个 HTTP 200 请求**；没有新建另一篇日记。

### 桌面 UI 阻塞与未完成边界

桌面工具能找到现有思源窗口，但无障碍树仅暴露空白容器，无法取得模板按钮、工作区入口或可编辑控件；窗口截图通道在选窗恢复后仍出现 `FrameArrived timed out: timed out waiting on channel` / `window capture timed out: timed out waiting on channel`。用户要求继续由 Agent 操作后，重新读取当前无障碍树并做一次有界截图检查，仍为同类超时；按本机思源已存在的快捷键尝试打开自身开发者工具后，仍没有取得可操作控件或 Console。没有盲点坐标、输入诊断脚本、绕过 UI 调用块写入、重启桌面客户端或修改其调试/安全配置。

因此，桌面实际执行构建的指纹尚未确认，模板补全、任务创建、完成、撤销、关联快速记录和这些对象的关闭重开持久化验收均**未执行**；没有这些动作的 T0–T4、UI API 次数或刷新计数可报告。没有把已获批准等同于已执行，也没有要求再次批准同一批操作。用于用户可选诊断的临时代码未确认运行，不能宣称 taskIndexDiagnostics 已开启或取得桌面计数。

只复用既有根项目、子项目及日记，未新增笔记本、项目、任务或记录，未修改用户已有正文。业务对象及归属账本继续保留，不自动删除。没有清理或绕过策略删除遗留临时 Edge profile；本轮曾打开后已关闭的独立 profile 为 `homepage-workflow-edge-BH98m4`，认证内容不进入报告或 Git。

本轮只更新此验收记录，无生产代码、版本、依赖或 schema 修改；按 AGENTS.md 执行文档范围 `git diff --check`，不重复全套构建或 fixture 性能基准。上节自动化结果属于修复提交时的执行记录，并非本轮重新运行。

**结论：单文件部署及真实生产服务定向恢复 PASS；桌面 UI/完整业务验收 BLOCKED，不能宣布发布验收通过。阻塞为当前桌面控制工具无法观察可操作界面，未取得新业务故障证据，不据此修改索引或认定插件性能回归。**

# 主页插件性能优化发布前验收

审查基线：`be26b2181d20ca86744081b92c208c55bc77b8cd`。版本保持 5.1.10，最低思源 3.8.6，SDK 1.2.9。

> 前半部分保留 2026-10-19 历史记录；2026-10-20 本地只读实测的基线与结果在文末单列。历史隔离环境限制不适用于用户新授权的本地只读验证。

**2026-10-19 历史结论：BLOCKED，核心 A～M 尚未实测。2026-10-20 已补齐本机只读 Kernel API 验收，结论为 API PASS，见文末；完整 UI 与业务写入验收仍未完成，不得据 API PASS 宣布可以发布。**

本轮只增加本报告，不改生产逻辑、测试期望、版本、索引格式或共享快照架构。不创建 tag、Release 或发布分支，不部署在线插件。

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

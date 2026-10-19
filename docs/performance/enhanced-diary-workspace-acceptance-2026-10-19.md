# 强化日记工作区性能与一致性验收

日期：2026-10-19。审查基线：`7eda5b648a29cd2fa575a628e122a0932a6929f6`。

本轮结论：生产函数的合成验收通过，发现并修复了一处子项目创建前的磁盘索引保护缺口。**尚未完成实机端到端验收，不能确认用户最初报告的真实操作卡顿已经改善。**

## 环境、范围和证据

- Windows / PowerShell 7.6.5；开始时 main 与指定基线一致，工作区无未提交修改。先读取 AGENTS、performance、data-and-indexing、DESIGN，并用 CodeGraph 检查真实调用链。
- 仅对 `127.0.0.1:6806/api/system/version` 进行了无业务参数、只读版本探测，成功返回 `3.8.7`。未读取用户任务、日记、项目正文或工作空间路径。
- 可用控制界面清单没有原生客户端，也没有浏览器页面；没有已确认隔离的测试工作区、容器或专用测试笔记本。因此没有启动真实写入测试、切换工作空间、创建笔记本、删除文档或重建用户索引。
- 项目 fixture 通过运行时端口模拟官方 API；真实项目创建服务、生命周期校验、索引构建/序列化/读取函数均参与执行。只将 recent-doc 准备结果替换为受控变更集合，未模拟完整同步服务。
- 工作区 verifier 提取并执行实际 Svelte 脚本函数、弹窗宿主和生命周期回调，业务服务与浏览器调度为 fixture；另外执行真实 Svelte 编译。它不是完整挂载的客户端 DOM/渲染性能测试。
- 不修改版本、任务/项目/记录 schema 或依赖。构建设置 `SIYUAN_SKIP_DEV_DEPLOY=1`，未部署到运行中的思源。

## 项目创建调用链与数据保护

审查路径：`enhancedDiaryWorkspaceProjectService.ts` 的根/子项目创建 → `refreshEnhancedDiaryProjectIndexAfterCreation()` → 严格目录/属性/标题读取 → `buildNodes()` → `writeIndex(next, true)` → `getFileChecked()` 实际磁盘回读 → 比较语义内容与写入时间 → 发布缓存。

- 新根项目只维护新根；一级/多级子项目只重新读取其根文档的标题及节点属性，并重新计算该根的父子、祖先和顺序，保留其他根的节点。
- 创建调用保留同一容器的 `maintenanceTails`；并发根/子项目 fixture 均保留两个创建结果。写前重复检查目录及磁盘快照，已观测到的外部变化会阻止覆盖。
- 根项目状态、归档祖先和 H6 限制均经过真实生命周期函数测试。标题、层级、父子关系、属性确认后才报告完整创建成功。
- 创建后索引写入/校验失败返回带真实创建 ID、阶段及“勿重复创建”的部分成功错误；界面先保留创建结果，再独立刷新详情，详情失败不会变成“创建失败”。
- `rebuildEnhancedDiaryProjectIndex()`、`rebuildEnhancedDiaryProjectIndexAfterChange()` 和正式增量维护入口仍存在。定向入口遇到明确缺失或合法不完整索引、其他根变化时，按已有受保护的完整重建回退处理。
- 正式项目索引仍为 version 1。新定向维护写入确有 checked 磁盘回读，测试包括丢写、写错内容、回读失败；不能将最后一次公共缓存读取冒充磁盘验证。

### 本轮实际复现和最小修复

原调用链：子项目创建 → `validateEnhancedDiaryProjectWriteTarget()` → `readStrictLifecycleProjectIndex()` → `refreshEnhancedDiaryProjectIndex()` → `refreshInternal()`。最后一步读取公共展示缓存；缓存仍有效但磁盘文件已经损坏时，会把旧缓存重新写回文件，再继续插入子项目。

新增真实服务用例 `real child creation prechecks reject corrupt or unreadable disk indexes before any write` 在修复前失败，实际输出：

```text
FAIL real child creation prechecks reject corrupt or unreadable disk indexes before any write: Missing expected rejection.
ELIFECYCLE Command failed with exit code 1.
```

当时 verifier 仅打印错误 message，没有打印异常栈；这里不补造堆栈。失败断言位于 `scripts/verify-enhanced-diary-project-create-performance.mjs` 的上述测试，根因位于 `enhancedDiaryProjectIndex.ts` 的 `refreshInternal()`。

修复仅将该入口的起始读取换成已有 `readCreationIndex(signature, true)`。有效文件严格检查格式、版本、容器和父子关系；只有官方明确 404 才沿用未建立索引的处理。损坏、错误版本、403 和网络错误四个用例现在均拒绝创建，`indexWrites=0`、`insertCount=0`，原文件不变。此校验会为每次正式增量刷新增加一次磁盘读取，已包含在以下完整服务测量中。

## 项目创建合成测量

`verify-enhanced-diary-project-create-performance.mjs` 使用 5、50、200 个根项目，每个根含 1～5 个 H1/H2/H3 等项目节点。初始化由正式完整重建完成，初始化成本不计入测量；每行一次执行，无统计置信区间。

比较对象是**同一版本真实的原完整重建入口**与创建后的定向维护入口，不是复制算法。前者使用预热缓存，所以磁盘读取为 0，且保留其原有未启用严格回读的行为；定向路径额外做两次快照读取和一次写后回读。这不是等价持久化保证的速度比较。

计数只包含项目索引文件；目录创建请求不计为索引写入。`回读`统计写入后紧接的磁盘读取，不将经过其他业务 API 后的下一次前置读取算作写后验证。列出的 `read` 总数已包含 `回读`，两者不能相加。`batch` 是批次请求次数，不是属性条目数；目录与完整文件序列化成本仍随总项目数增长。

前三类维护对比给模拟 post 请求和 getFile 读取加入**请求 1ms 的人工延迟**，putFile 没有人工延迟；Windows 定时器分辨率和调度使实际等待不同。连续创建及完整服务测量**不加入人工延迟**。所有毫秒数都是本机 Node/mock 单次观测，期间其他验证/构建也在运行，不是隔离基准，不能换算为思源真实提速比例；无延迟时定向路径也可能因为额外保护开销比完整重建更慢。

### 创建后维护：原完整重建与定向更新

| 根数 | 操作 | 路径 | list | child | batch | read | write | 回读 | 合成 ms |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | root | full | 1 | 11 | 11 | 0 | 1 | 0 | 344.5 |
| 5 | root | targeted | 2 | 1 | 1 | 3 | 1 | 1 | 107.9 |
| 5 | node | full | 1 | 10 | 11 | 0 | 1 | 0 | 325.4 |
| 5 | node | targeted | 2 | 1 | 2 | 3 | 1 | 1 | 121.7 |
| 5 | nested | full | 1 | 10 | 11 | 0 | 1 | 0 | 346.2 |
| 5 | nested | targeted | 2 | 1 | 2 | 3 | 1 | 1 | 108.9 |
| 50 | root | full | 1 | 101 | 101 | 0 | 1 | 0 | 3087.9 |
| 50 | root | targeted | 2 | 1 | 1 | 3 | 1 | 1 | 107.1 |
| 50 | node | full | 1 | 100 | 101 | 0 | 1 | 0 | 3073 |
| 50 | node | targeted | 2 | 1 | 2 | 3 | 1 | 1 | 122.3 |
| 50 | nested | full | 1 | 100 | 101 | 0 | 1 | 0 | 3072.1 |
| 50 | nested | targeted | 2 | 1 | 2 | 3 | 1 | 1 | 124 |
| 200 | root | full | 1 | 401 | 401 | 0 | 1 | 0 | 12096.8 |
| 200 | root | targeted | 2 | 1 | 1 | 3 | 1 | 1 | 90 |
| 200 | node | full | 1 | 400 | 401 | 0 | 1 | 0 | 12120.9 |
| 200 | node | targeted | 2 | 1 | 2 | 3 | 1 | 1 | 95.5 |
| 200 | nested | full | 1 | 400 | 401 | 0 | 1 | 0 | 11976.2 |
| 200 | nested | targeted | 2 | 1 | 2 | 3 | 1 | 1 | 110.6 |
| 5 | consecutive | full | 3 | 36 | 33 | 0 | 3 | 0 | 6.3 |
| 5 | consecutive | targeted | 6 | 3 | 3 | 9 | 3 | 3 | 19.1 |
| 50 | consecutive | full | 3 | 306 | 303 | 0 | 3 | 0 | 16.5 |
| 50 | consecutive | targeted | 6 | 3 | 3 | 9 | 3 | 3 | 24.1 |
| 200 | consecutive | full | 3 | 1206 | 1203 | 0 | 3 | 0 | 153.7 |
| 200 | consecutive | targeted | 6 | 3 | 3 | 9 | 3 | 3 | 161.1 |

### 完整创建服务与创建后的项目列表读取

| 根数 | 操作 | list | child | batch | read | write | 回读 | 合成 ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | root | 3 | 1 | 1 | 3 | 1 | 1 | 4.9 |
| 5 | node | 4 | 3 | 4 | 5 | 3 | 1 | 16.4 |
| 5 | nested | 4 | 3 | 4 | 5 | 3 | 1 | 8 |
| 5 | duplicate-root | 1 | 0 | 0 | 0 | 0 | 0 | 0.4 |
| 5 | duplicate-node | 1 | 1 | 1 | 1 | 1 | 0 | 2.5 |
| 5 | workspace-read | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 5 | consecutive | 9 | 3 | 3 | 9 | 3 | 3 | 18.5 |
| 50 | root | 3 | 1 | 1 | 3 | 1 | 1 | 57 |
| 50 | node | 4 | 3 | 4 | 5 | 3 | 1 | 26.6 |
| 50 | nested | 4 | 3 | 4 | 5 | 3 | 1 | 21.5 |
| 50 | duplicate-root | 1 | 0 | 0 | 0 | 0 | 0 | 0.5 |
| 50 | duplicate-node | 1 | 1 | 1 | 1 | 1 | 0 | 10.8 |
| 50 | workspace-read | 0 | 0 | 0 | 0 | 0 | 0 | 0.1 |
| 50 | consecutive | 9 | 3 | 3 | 9 | 3 | 3 | 24.6 |
| 200 | root | 3 | 1 | 1 | 3 | 1 | 1 | 39.4 |
| 200 | node | 4 | 3 | 4 | 5 | 3 | 1 | 86.9 |
| 200 | nested | 4 | 3 | 4 | 5 | 3 | 1 | 90.7 |
| 200 | duplicate-root | 1 | 0 | 0 | 0 | 0 | 0 | 1.1 |
| 200 | duplicate-node | 1 | 1 | 1 | 1 | 1 | 0 | 19.7 |
| 200 | workspace-read | 0 | 0 | 0 | 0 | 0 | 0 | 0.1 |
| 200 | consecutive | 9 | 3 | 3 | 9 | 3 | 3 | 93.2 |

完整服务表包含清理标题、重名检查、创建/定位、属性确认、前置生命周期刷新及最终索引维护。`workspace-read` 是成功创建后真实 `loadEnhancedDiaryProjectIndexForWorkspace()` 的项目列表读取，**不包含项目详情、记录索引、DOM 展示时间**；连续创建是顺序创建三个不同根项目。重名用例未插入任何文档或标题。

重名检查和缓存读取沿用原路径，没有独立的“定向重建替代重名检查”算法，不虚构旧服务全链路耗时。它们不应与上表的单独维护耗时相减作为性能收益。

## 任务索引读取、写入和诊断

真实 `getTaskIndexResult()` → `readTaskIndexSnapshot()` 只读取、解析、过滤和排序，不再将普通展示排进逐块验证/清理队列。4500 条旧任务、3,927,458 字节 fixture 的单次读取：1 次文件读取、0 次写入、0 次逐块 API，耗时 25.3ms（合成）。十次重复列表读取及 provider/工作区实际任务读取也通过，项目关联、日期、标签和完成状态保留。

相同 fixture 的实际维护观测：

- targeted no-op：1 read / 0 write / 0 bytes，62.2ms。
- broad no-op：1 read / 0 write / 0 bytes，49.9ms。
- targeted+broad 有语义变化：2 reads（包含写后验证）/ 1 write / 4,111,967 bytes，104.2ms。
- 单次完成、编辑、改项目：各 1 commit / 1 targeted / 0 broad / 2 reads / 1 write / 1 event。
- 连续十次完成合并为一个 burst：10 commits / 1 targeted / 2 reads / 1 write / 1 event。十次分开完成：10 commits / 10 targeted / 20 reads / 10 writes / 10 events；这属于十次真实变更，不能承诺只写一次。
- 普通文档变化及只有记录变化：各 1 commit / 1 targeted / 1 read / 0 write / 0 event。启动或插件同步通知：0 reads / 0 writes。

显式删除维护仍验证目标；只有确认不存在才清除，权限/网络/畸形返回不构成删除证据。正式业务写入仍有写后验证，语义 no-op 不改时间来制造写入。

`task-data-runtime.ts` 的 commit 集合去重、120ms debounce、1000ms 最长延迟、处理中尾批次及 runtimeGeneration/unload 保护通过现有 verifier。真实插件实例无法访问，**未在用户实例开启诊断，也没有真实操作前后的计数差**。

fixture 调用真实 `taskIndexDiagnostics`，验证默认关闭、开启/快照/复位/关闭及只包含数字和布尔值。组合 targeted+broad 观测 1 write / 2 reads / 1 targeted / 1 broad / 1 event；20 次前台事件只执行一次刷新，`workspaceRefreshes=1`。`noopWritesSkipped` 的无写入路径亦有断言，不以源码字符串代替行为验证。

## 工作区响应与刷新协调

- `refresh()` 等待正式核心状态，检查存活、权限、lifetime、refreshVersion 后发布 state，再独立启动 `loadCalendar()`、`loadSelectedDayDetail()`。日历/详情报错或请求一直不返回，不反转核心成功、不阻塞提交反馈。
- 任务/记录弹窗等待业务写入确认，失败保留输入，重复提交被阻止；完成/撤销完成状态来自确认后的核心重读，不凭空修改旧任务对象。
- `refreshFlight`、`refreshMutationTail`、版本计数及 pending 意图保持；失败保留旧 state/pending，不无限自动重试。新事件可要求尾刷新，过期请求不能覆盖新状态。
- 旧月份、日期、核心交错请求、权限撤销、卸载、重新挂载和可见历史请求均有生产函数 fixture。timer/listener 清理和卸载后不更新均通过。

本轮新增单操作计数（排除首次进入；写入中注入 task/diary/task 三次索引事件；等待尾刷新及所有 fixture timers 后断言）：

| 操作 | 核心刷新 | 日历 | 日期详情 | 业务提交 |
| --- | ---: | ---: | ---: | ---: |
| 创建任务 | 1 | 1 | 1 | 1 |
| 完成任务 | 1 | 1 | 1 | 1 |
| 撤销完成 | 1 | 1 | 1 | 1 |
| 添加记录 | 1 | 1 | 1 | 1 |

真实项目提交处理函数的 root/child fixture 各调用 1 次项目面板刷新，服务确认前无成功提示，详情失败保留创建结果。这项计数没有挂载真实 Svelte 父子 effect，也没有 Kernel 延迟事件，**不代表真实客户端永远只刷新一次**。

未发现无条件固定 400ms 二次整页刷新或刷新无限循环；有更新发生在一次读取中时，允许必要的第二次核心读取。尚无真实客户端首次进入、弹窗关闭、项目显示、渲染和同步耗时。

## 剩余开销和一致性边界

1. **子项目创建前两次生命周期校验仍各刷新一次项目索引。** 无变更也会写一次项目索引，完整子项目创建因此有 3 次索引写入，重名子项目被拒绝前仍有 1 次写入。这里只有最终创建维护启用紧接磁盘回读；不能声称 3 次写入都经过相同的严格回读比较。本轮保留原校验语义，不顺带重构生命周期刷新或弱化安全判断。若实机仍慢，应优先量这两个阶段，再决定是否复用严格快照或做语义 no-op。
2. 定向维护减少标题/属性请求，但仍列举目录、解析和序列化完整项目索引；无延迟完整服务耗时仍受总根数和本机调度影响，单次值不保证单调，也不是纯 CPU 时间。不能据 mock 判断真实主瓶颈在文档写入、定位重试、属性确认、Kernel、同步还是渲染。
3. 单次真实任务变更仍可能写完整约 4.1MB 的 fixture 任务索引。没有同步流量/真实写入延迟证据，**目前不足以支持拆分 task-index.json**；不在本轮改存储架构。
4. `maintenanceTails` 只约束当前 JS 实例。写前快照检查和写后回读不构成跨设备原子 CAS；检查与写入之间仍有外部写入窗口。没有进行跨端同步冲突验收，不能承诺完全消除一致性风险。
5. 旧公共展示读取 `readEnhancedDiaryProjectIndex()` 仍可使用缓存，冷读取无效文件仍返回不完整空态；本轮严格保护创建维护/正式增量的写前路径，**未把全部项目读取入口升级成严格读取**。展示缓存及时性、其他旧入口需要另行按实际问题审查，不能把本轮结论扩大到所有生命周期写入路径。

本轮不需要继续改定向项目节点算法；下一轮优先完成隔离实机验收。若仍有显著延迟，应按上述真实阶段定位后再考虑局部 no-op 改进。多设备原子一致性或存储拆分涉及更大设计，应单独评审。

## 实机验收待办（全部未执行）

先由维护者确认并记录独立测试工作区/容器/专用测试笔记本及测试配置，确认不会触碰正式数据。未确认前不要运行以下写入动作，也不要为测试擅自切换工作空间。

1. A/B：启动客户端、打开主页、进入工作区；分别记录首次核心显示和可选面板显示时间，检查控制台与请求。
2. C/D：各创建一个根项目、一级子项目、多级子项目，记录点击至反馈、文档/块创建、属性确认、项目索引维护/回读、项目列表实际显示的时间。Network 保留时间，分享时删除正文、标题、路径、ID、token。
3. E～H：创建任务、完成、撤销完成、添加快速记录；核对日记、任务/记录索引和 UI 一致，确认弹窗及时关闭且没有重复业务写入。
4. I/J：切换项目/任务/记录/日历及月份日期，关闭后重开；在开发工具中仅阻断测试日历/日期详情读取，验证核心仍可用。不要通过删除索引或改日记来模拟错误。
5. K/L：重启客户端验证同一批已存在测试数据；有第二个隔离端才进行同步，记录真实冲突与回读结果。没有第二端则标记未验收。
6. 在调试器中选中**已确认的主页插件实例**，使用其 `taskIndexDiagnostics.enable(true)`、`reset()` 和 `snapshot()`，单次明确操作前后取差；记录 databaseCommits、targetedRefreshes、broadCleanups、indexReads、indexWrites、writeBytes、noopWritesSkipped、dataUpdatedEvents、workspaceRefreshes。完成或异常后都执行 `enable(false)`。不假设某个全局变量名，也不导出业务数据。

## 验证命令结果

| 命令 | 最终结果 |
| --- | --- |
| `pnpm verify:enhanced-diary-project-create-performance` | exit 0；15 组，24 条维护测量 + 21 条完整服务/列表读取测量 |
| `pnpm verify:enhanced-diary-project-index` | exit 0；1 个聚合 PASS，脚本不输出内部场景数量；涵盖普通/任务日记、关系历史、诊断、150 日期和索引管理协调 |
| `pnpm verify:enhanced-diary-workspace-actions` | exit 0；29 组，附 6 条操作刷新计数 |
| `pnpm verify:task-index-sync-performance` | exit 0；28 场景，附多 MB 测量及 9 类操作计数 |
| `pnpm verify:siyuan-api-compat` | exit 0；A–H 共 8 类 |
| `pnpm verify:shared-runtime-refresh` | exit 0；A–S 共 19 类 |
| `pnpm typecheck` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm build:app` | exit 0；含 TypeScript、Svelte、SCSS 编译 |
| `pnpm build:kernel` | exit 0 |
| `pnpm build` | exit 0；完整生产打包及仓库内 ignored dev 镜像，未部署客户端 |
| `git diff --check` | exit 0 |

检查末尾的 status/diff/stat，改动限定于本报告、两个相关 verifier 及项目索引的严格读取补丁。`package.json`、`plugin.json` 及 lockfile 未改；版本保持 5.1.10、最低思源 3.8.6、SDK 1.2.9。

所有最终运行均使用上述修复后的代码；最初红用例如实记录在前文。没有未解决的自动化测试失败。没有修改用户业务文档、真实索引或通知历史。

## 官方接口核对

目录接口仍使用 notebook/path，严格模式明确传 maxListCount=5001，并在达到 5000 上限或响应结构不完整时失败；没有扫描其他笔记本。v3.8.6 的响应包含 box/path/files，默认列表数量来自内核配置。[官方 listDocsByPath 实现](https://github.com/siyuan-note/siyuan/blob/v3.8.6/kernel/api/filetree.go#L1045)。

已探测本机版本 3.8.7；对应官方 getFile 返回二进制内容，缺失为 404；putFile 接收表单并返回标准响应，modTime 为毫秒。现有 checked 封装和 transport fixture 与此契约一致，实际写入客户端兼容性仍未实测。[官方 v3.8.7 文件 API](https://github.com/siyuan-note/siyuan/blob/v3.8.7/kernel/api/file.go#L399)。官方按次文件读写并未提供此索引更新所需的跨请求原子比较交换。

# 主页组件本地索引架构

## 第一原则

主页组件在展示时**默认读取本地索引**，不自动对全库执行 SQL 扫描。

全库 SQL 只允许用于以下三类索引建设场景：

1. **本地索引文件不存在时，用户打开对应索引型功能的前台首次自动初始化**；
2. **用户在设置面板中手动点击“重建索引”或“迁移旧数据”**；
3. **旧数据手动迁移到本地索引**。

除此之外，正常显示、组件刷新、增量更新都必须读本地索引 + 最近文档增量刷新 + `root_id`/`id` 精确查询。

本地索引只影响插件自身的展示和统计，不会修改用户文档内容；旧属性迁移成功后才会清理旧属性。

## 本地索引目录

所有索引文件统一存放在思源插件存储目录下：

```
/data/storage/petal/siyuan-homepage
```

## 各索引文件

| 文件 | 用途 |
|---|---|
| `favorites-index.json` | 收藏文档索引 |
| `review-index.json` | 复习计划索引 |
| `task-index.json` | 任务索引 |
| `recent-doc-snapshot.json` | 最近文档快照，用于增量刷新 |
| `heatmap-daily-index.json` | 热力图每日计数索引 |
| `statistical-index.json` | 统计卡片全局计数索引 |
| `enhanced-diary-index.json` | 绑定 `dailyNotebookId` 的强化日记日期到文档 ID 索引 |

## 组件索引策略

### 收藏

- 新增/取消收藏直接读写 `favorites-index.json`。
- 旧版使用 `custom-homepage-favorites` 属性的文档，通过“手动迁移旧数据”按钮扫描 `ial LIKE '%custom-homepage-favorites%'` 迁移到本地索引；迁移成功后清理该旧属性。
- 旧属性迁移采用 `LIMIT/OFFSET` 分页（每页 500 条，上限 50000 条），避免单次 `LIMIT` 后假装迁移完成。
- 展示时只读本地索引，并做存在性校验。

### 复习

- 新增/完成/推迟/编辑复习计划只读写 `review-index.json`。
- 旧版使用 `custom-homepage-review-next-date` 等属性的文档，通过“手动迁移旧数据”按钮扫描迁移到本地索引；迁移成功后清理旧属性。
- 旧属性迁移采用 `LIMIT/OFFSET` 分页（每页 500 条，上限 50000 条），避免单次 `LIMIT` 后假装迁移完成。
- 展示时只读本地索引，并做存在性校验。

### 任务

- 插件对任务块的操作同步更新 `task-index.json`。
- 如果 `task-index.json` 不存在，打开任务组件/任务 Plus/强化日记工作台时前台自动全量初建一次任务索引（只查 `subtype='t' AND type='i'` 的任务块，分页）。
- 索引存在后，加载和刷新只做最近文档增量刷新 + 未完成任务存在性校验；增量刷新成功后才会更新内存 TTL，失败时不记录本次成功时间，避免误跳过。
- 增量刷新按 `root_id` 精确查询任务块，并分页读取（每页 2000 行，单文档上限 50000 行），避免大文档漏统计。
- 提供“手动重建任务索引”按钮，扫描任务块重建完整索引。
- 未完成(task pending)任务会定期做存在性校验，缺失块会被清理。

### 热力图

- 保存每日 `totals` 和每个文档的 `doc contribution` 到 `heatmap-daily-index.json`。
- 如果 `heatmap-daily-index.json` 不存在，打开热力图时按当前显示范围前台自动初建一次。
- 索引存在后，加载和刷新只做最近文档增量刷新；增量刷新成功后才会更新内存 TTL，失败时不记录本次成功时间。
- 增量刷新时按 `root_id`/`id` 精确查询，并分页读取（每页 2000 行，单文档上限 50000 行），先减去旧贡献、再加新贡献；不会全局重扫。
- 提供“手动重建热力图索引”按钮，按当前日期范围重建索引。

### 统计卡片

- 保存全局 `totals` 和每个文档的 `doc contribution` 到 `statistical-index.json`。
- **文档级 contribution**：`statistical-index.json` 只按文档记录统计数字，不保存任何块内容、块 ID 列表或块级明细。
- 每个 `doc contribution` 包含文档 `id`、`box`、`path`、`hpath`、`updated` 以及该文档的 `totals`；`totals` 由该文档下所有块的类型、子类型、字数、引用标记等聚合而成。
- 严格区分“索引文件存在”和“索引有数据”：
  - `fileExists`：必须来自真实 `getFile` 成功读回，且内容为合法结构（`version` + `updatedAt`），允许空 `docs` 和全 0 的 `totals`。文件不存在、`getFile` 报错、返回错误对象、空字符串/空 Blob/空 ArrayBuffer 都必须判定为 `fileExists=false`，**不能由 `emptyStatIndex()` fallback 推断**。
  - `hasData`：`docs` 有 key，或任意 `totals` 统计值大于 0。
  - 写入/重建后只校验 `fileExists`，不因为“合法空索引”而报错；组件展示时只有 `hasData === false` 才显示“统计索引为空”，`fileExists=false` 时提示“统计索引不存在，正在或需要初始化/重建”。
- **合法空索引**：新库、统计范围为空、或最后一个文档被删除后，`statistical-index.json` 仍应能保存为 `{ version, updatedAt, totals: { ...0 }, docs: {} }`。该文件存在即可避免每次加载都反复前台初建。
- 如果 `statistical-index.json` 不存在，打开统计卡片时前台自动初建一次统计索引；初建完成后读回校验文件结构，允许为空。
- 索引存在后，加载和刷新只做最近文档增量刷新；增量刷新成功后才会更新内存 TTL，失败时不记录本次成功时间。
- 增量刷新时只对变动文档按 `root_id`/`id` 精确查询块并重新计算该文档 contribution，并分页读取（每页 2000 行，单文档上限 50000 行），避免大文档漏统计。
- 增量刷新时，先减去旧贡献、再加新贡献；如果文档已不存在或查询为空，则减去旧贡献并从 `docs` 中删除；删除后若 totals 归零，仍应成功保存合法空索引。
- 提供“手动重建统计索引”按钮，扫描 `blocks` 必要字段重建索引；若全库确实没有可统计块，也成功写入合法空索引并提示“没有可统计数据”。
- `notebooksCount`、`tagsCount` 使用思源官方 API；`tasksCount`/`doneTasksCount`/`undoneTasksCount` 读任务索引；其余内置统计项读统计索引。
- `customSQLCount` 属于用户自定义 SQL，保留配置入口并提示风险，不纳入内置索引体系。

## 手动迁移/重建 SQL 的边界

- 必须经由 `runHomepageManualIndexSqlQuery`，该函数会调用 `validateSafeSelectSql` 进行安全校验。
- 只允许 `SELECT`。
- 默认只允许 `blocks` 表。
- 禁止 `content`/`markdown`/`fcontent` 的 `LIKE` 全库扫描。
- 禁止无范围的 `blocks_fts MATCH`。
- 当前入口包括：
  - **前台首次自动初始化**：本地索引文件不存在时，用户打开对应组件触发一次，显示 loading，不是后台任务。
  - **手动重建索引**：用户在主页设置 → 检索管理中点击“重建任务/热力图/统计索引”或“一键重建所有检索”。
  - **旧数据迁移**：用户在主页设置 → 检索管理中点击“迁移旧收藏属性/迁移旧复习属性”。
- 旧属性迁移（收藏、复习）必须按 `LIMIT/OFFSET` 分页（每页 500 条，上限 50000 条），不得单次 `LIMIT` 后假装完整；达到安全上限时须明确提示可能仍有未迁移数据。
- 索引文件已存在但为空时，不会自动全量重建；应显示空态并提示用户手动重建。

## 索引文件存在性判断

实现上必须严格区分“**索引文件不存在**”与“**索引文件存在但数据为空**”：

- **文件不存在**：`getFile` 返回 `{ code: 404, msg: "file does not exist" }` 等错误对象，或 `null`/`undefined`/`""`/空 `Blob`/空 `ArrayBuffer`。此时 `doesIndexFileExist` 返回 `false`，允许组件在前台自动执行一次索引初建（任务/热力图/统计）或写入空索引文件（收藏/复习）。
- **文件存在但为空**：`getFile` 返回合法 JSON 对象，如 `{ version, updatedAt, items: [] }`、`{ version, updatedAt, totals: {}, docs: {} }`。此时 `doesIndexFileExist` 返回 `true`，组件只显示空态，**不会反复触发全量重建**。

读取 JSON 索引时，不能对 `getFile` 返回的普通对象直接 `Boolean(raw)`，必须先判断：

1. `code` 字段存在且 `code !== 0` 时视为思源错误对象，按不存在处理；
2. `code` 字段存在且 `code === 0` 时，必须继续解包 `data` 字段，不能把 `{ code: 0, data: ... }` 当成索引 payload 本体；
3. 兼容 `string`、`Blob`/`text()`、`ArrayBuffer`/`ArrayBufferView` 等返回形态；
4. 最终只对合法 JSON 对象/数组做索引解析。

`readJsonIndex`、`readJsonIndexPayload`、`doesIndexFileExist`、`readStatIndexWithMeta` 均复用同一 `fileContentToObject` 解析逻辑，避免各函数对 `getFile` 返回值理解不一致导致误判。

## 最近文档快照提交时机

`recent-doc-snapshot.json` 用于记录各索引消费者（task/heatmap/statistical/enhanced-diary）已经处理过的最近文档 `updated` 时间戳，是增量刷新的依据。

为避免“快照已提交但后续索引写入失败”导致变动丢失，增量刷新拆为两个阶段：

1. **prepare**：`prepareChangedRecentDocsForIndex(consumer)` 读取最近文档和旧 snapshot，返回 `changedDocs` 与一个 `commit` 函数。
2. **commit**：只有在对应索引的精确查询、聚合计算、索引文件写入全部成功后，才调用 `commit()` 写入新的 `recent-doc-snapshot.json` 并记录内存 TTL。

因此：

- 中间任何步骤失败都不会提交 snapshot，也不会记录 TTL，下次刷新仍会重新处理这批变动。
- `changedDocs.length === 0` 时也会提交 snapshot 并记录 TTL，因为这表示对比过程成功，只是没有需要处理的文档。
- 任务、热力图、统计三个消费者各自维护 snapshot 中的 `consumers[consumer]` 子树，互不影响。

## 主页设置 > 检索管理

### 强化日记索引

强化日记普通展示、日期详情、日历、历史记录和回顾均读取
`/data/storage/petal/siyuan-homepage/enhanced-diary-index.json`。索引只保存
`YYYYMMDD -> 日记文档 ID` 的轻量元数据，并绑定当前 `dailyNotebookId`；正文始终通过
文档 ID 调用 `exportMdContent` 精确导出。

- 首次前台初始化或用户手动重建时，只递归枚举当前配置日记笔记本的官方文件树；再对已取得的文档 ID 批量执行 `id IN (...)` 精确元数据查询，优先识别 `custom-dailynote-YYYYMMDD` 属性。
- 索引已存在时仅消费最近文档快照做增量刷新；不重新遍历笔记本。
- 不存在配置的日记笔记本时返回明确状态，不回退到全库查询。
- 禁止为日记展示、刷新或重建使用全库 blocks 扫描、无范围 `content/markdown/fcontent LIKE` 或无范围全文检索。

从 v2.x 起，所有索引维护入口已从各组件设置页抽离，统一集中在 **主页设置 → 检索管理** 页面。

该页面提供两类顶层操作：

### 一键重建所有检索

强化日记也包含在一键重建中；它只枚举当前配置日记笔记本的文件树，并对取得的文档 ID 做精确识别。

依次对收藏（旧属性迁移）、复习（旧属性迁移）、任务、热力图、统计卡片执行全量索引重建。每个子任务独立执行，一个失败不会阻塞后续任务。重建会执行用户可感知的索引建设 SQL，**仅在用户点击时执行**，用于首次建立本地索引或手动重建索引。

### 一键刷新所有检索

强化日记也包含在一键刷新中；刷新只消费 `enhanced-diary` 独立最近文档消费者的增量，不遍历日记笔记本。

依次对收藏、复习（仅验证索引项块是否存在）、任务、热力图、统计卡片执行增量刷新。刷新只做本地索引校验和最近文档增量更新，**不做全库扫描**，不使用全库 SQL。所有查询均为 `root_id`/`id` 精确查询或最近文档快照增量。

### 各组件独立操作

检索管理页面同样为每个组件提供独立的操作入口：

| 组件 | 支持操作 |
|---|---|
| 收藏文档 | 迁移旧收藏属性到索引 |
| 复习文档 | 迁移旧复习属性到索引 |
| 任务 | 重建任务索引、刷新任务增量索引 |
| 热力图 | 重建热力图索引（可配置月份范围）、刷新热力图增量索引 |
| 统计卡片 | 重建统计索引、刷新统计增量索引 |
| 强化日记 | 重建强化日记索引、刷新强化日记增量索引 |

### 组件设置页变更

各组件设置页（收藏文档、复习文档、任务管理、任务管理Plus、热力图、统计卡片）**不再包含**索引维护入口，只保留组件自身的标题、样式、展示范围、筛选条件等展示配置。组件内原有的 `TaskIndexMaintenanceSection` 等维护子组件已移除。

**主页设置 → 检索管理现在是唯一索引维护入口**。组件空态、初始化失败提示、旧属性迁移提示等文案均引导用户到该页面操作，不再分散到各组件设置页。

## 新组件接入规范

新增主页组件时，数据层应优先遵循以下顺序：

1. **本地索引**：组件展示时直接读取插件本地 JSON 索引。
2. **索引缺失时前台自动初建**：本地索引文件不存在时，在用户打开组件的前台流程中自动初始化一次（可写空索引或经 `runHomepageManualIndexSqlQuery` 安全重建），显示 loading。
3. **最近文档增量**：索引存在后，通过 `getRecentUpdatedBlocks` / `recent-doc-snapshot.json` 获取最近变动，按 `root_id`/`id` 精确更新索引。
4. **手动重建兜底**：提供显式按钮，仅在用户点击时执行安全 SQL，重建本地索引。
5. **官方 API**：优先使用思源官方 API（如笔记本列表、标签列表等）。

禁止在组件展示、刷新、增量更新时自动执行全库 `SELECT * FROM blocks`、无范围 `content/markdown/fcontent LIKE`、无范围 `blocks_fts MATCH` 等扫描。

### 用户主动搜索与用户自定义 SQL 的边界

以下能力由用户主动触发或显式配置，不属于内置组件的“普通显示/刷新自动全库扫描”，因此保留：

- **SQL 组件**（`widget/sql/sql.svelte`）：用户在组件中输入并执行的 SQL。
- **可视化图表**（`widget/visualChart/visualChart.svelte`）：用户配置的 progress/target SQL。
- **统计卡片自定义 SQL**（`customSQLCount`）：用户配置的自定义统计 SQL，组件展示时提示“用户自定义 SQL 可能触发全库扫描”。
- **条件文档**（`widget/conditionDocs/conditionDocs.ts`）：用户配置的按关键词或标签搜索文档，使用思源官方 `fullTextSearchBlock`（`method=0`）全文搜索 API，不是无范围的 `content LIKE` 或 `blocks_fts MATCH`。

这些能力仍应遵守“不破坏用户环境”的第一原则，但不在“内置组件自动全库 SQL 扫描”的治理范围内。

## 新增统计类型的规范

为统计卡片新增内置统计类型时，必须保持“文档级 contribution”结构：

1. 在 `StatDocContribution.totals` 对应的类型中新增字段；
2. 在 `applyRowToTotals` 中按块 `type`/`subtype` 或 content/markdown 特征累加该字段，**只累加数字，不保存块内容**；
3. 在 `applyContribution` 中通过 `STAT_KEYS` 自动汇总到全局 `totals`；
4. 组件展示时直接读取 `statistical-index.json` 中的 `totals[新字段]`，禁止为了统计新类型再去扫描全库 blocks。

## 归档前检查

本节记录当前索引化阶段归档前的最终检查结果。

### 归档标准

| 标准 | 状态 |
|---|---|
| 主页设置 → 检索管理是唯一索引维护入口 | ✅ |
| 组件设置页不再包含索引维护入口 | ✅ |
| 普通显示/刷新/增量更新不自动执行全库 SQL | ✅ |
| 索引缺失前台初建走 `runHomepageManualIndexSqlQuery` | ✅ |
| 用户手动重建/旧迁移走 `runHomepageManualIndexSqlQuery` | ✅ |
| 增量刷新仅做 `root_id`/`id` 精确查询或最近文档增量 | ✅ |
| 统计索引严格区分 `fileExists` 和 `hasData`（通过 `isStatIndexPayloadLike` 结构校验） | ✅ |
| 统计索引 `fileContentToObject` 正确处理 `{ code, data }` 包装对象 | ✅ |
| 无 `content/markdown/fcontent LIKE` 全库扫描 | ✅ |
| 无 `blocks_fts MATCH` 无范围查询 | ✅ |
| `fullTextSearchBlock` 禁止 `method=2`（已主动抛错拦截） | ✅ |
| 无后台自动全库扫描任务 | ✅ |
| Agent 工具、AI 知识库、通知规则未改动 | ✅ |
| `pnpm exec tsc --noEmit` 通过 | ✅ |
| `pnpm build` 通过 | ✅ |
| `noUnusedLocals` 风险已清除（`totalRows` 已删除） | ✅ |

### 边界说明

以下 SQL 调用不属于"内置组件自动全库扫描"，因此保留：

- **用户自定义 SQL**：SQL 组件、visualChart、统计卡片 `customSQLCount`。由用户显式输入/配置触发，组件展示时保留风险提示。
- **用户主动搜索**：`conditionDocs` 使用 `fullTextSearchBlock`（`method=0` FTS 模式），由用户配置关键词/标签触发。
- **强化日记工作台**：`enhancedDiaryDoc.ts` 和 `enhancedDiaryWorkspaceTaskService.ts` 使用 `root_id =` / `id IN` 精确查询，不扫描全表。
- **复习目标验证**：`reviewDocs.ts` 使用 `id =` LIMIT 1 精确查询单个块。

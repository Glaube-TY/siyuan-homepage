# Notebrain 内置思源 API 工具与 Skill 补齐开发方案

## 0. 开发前必须遵守的第一原则

本方案用于一次性补齐 Notebrain Agent 对思源笔记常用内置 API 的工具能力。开发前必须先阅读并遵守：

* `docs/00-global-first-principles.md`
* `docs/notebrain/00-first-principles.md`

必须坚持以下原则：

1. 不破坏用户原有环境。
2. 不污染思源全局样式。
3. 不改无关功能。
4. 不破坏旧用户本地数据。
5. 所有写入操作必须可确认、可解释、可回退或至少可关闭。
6. 不能为了补工具而大范围重构 Agent 主流程。
7. 不能把思源内部 API 做成一个无限制通用 `/api/*` 执行器暴露给 AI。
8. 不能做 MCP Server，不暴露插件内部思源工具给外部 Agent。
9. 不能改变现有 MCP Client、本机命令执行、HTTP API 工具、外部 Skill 安装机制的已稳定主线。
10. 新增工具必须遵守 Notebrain 原则：工具是独立能力；Skill 只是说明和注册控制；模型使用 provider 原生 tool-call；没有 JSON Planner、final_answer 工具或自定义控制流。

本次开发目标不是“把每一个思源 API 都做成一个工具”，而是基于官方 API 能力补足 AI 管理笔记所需的必要能力。工具必须按语义聚合，同一类操作通过 `action` 或 `operation` 参数控制，避免工具数量膨胀。

---

## 1. 当前项目现状

当前项目已有 4 个内置 Skill：

1. `builtin_knowledge_base_qa`：知识库检索与阅读。
2. `builtin_schedule_task_diary`：强化日记助手。
3. `builtin_database_assistant`：数据库助手。
4. `builtin_doc_content_editing`：文档内容编辑。

当前项目已有大量思源工具，集中在：

```text
src/features/kb/services/agent-workbench/tools/siyuan/
```

当前工具注册入口是：

```text
src/features/kb/services/agent-workbench/composition/register-siyuan-tools.ts
```

当前内置 Skill 注册入口是：

```text
src/features/kb/services/agent-workbench/composition/register-builtin-skills.ts
```

当前内置 Skill 元数据入口是：

```text
src/features/kb/services/agent-workbench/skills/builtin/skill-catalog.ts
```

当前默认设置入口是：

```text
src/features/kb/constants/default-settings.ts
```

当前设置归一化入口是：

```text
src/features/kb/services/settings/kb-settings-service.ts
```

当前所有直接思源 kernel API wrapper 原则上应该放在：

```text
src/api.ts
```

现有文档编辑 Skill 已经包含：

* `read_doc_blocks`
* `create_doc`
* `update_block`
* `insert_block`
* `delete_blocks`
* `move_block`
* `rename_doc`
* `delete_doc`
* `replace_doc_content`

其中 `create_doc` 已经封装了 `createDocWithMd` 能力。不要重复新增另一个“创建文档工具”。

现有数据库 Skill 已经包含：

* `list_attribute_views`
* `read_attribute_view`
* `find_attribute_view_rows`
* `update_attribute_view_cell`
* `add_attribute_view_rows`
* `add_attribute_view_key`
* `remove_attribute_view_key`
* `remove_attribute_view_rows`
* `clear_attribute_view_cell`

其中 `update_attribute_view_cell` 已经支持单个和批量更新。不要再新增 `batch_update_attribute_view_cell` 这类重复工具。

---

## 2. 本次开发总目标

补齐当前没有覆盖但对 AI 管理思源笔记有意义的 API 能力，形成以下 Skill / Tool 结构：

### 2.1 保留并扩展现有 Skill

| Skill    | 处理方式                          |
| -------- | ----------------------------- |
| 知识库检索与阅读 | 保留，补充引用、搜索扩展、大纲、只读 SQL        |
| 文档内容编辑   | 保留，补充块读取、块属性、块引用、块状态、文档结构转换   |
| 数据库助手    | 保留，补充少量缺失只读和视图能力，不新开数据库 Skill |
| 强化日记助手   | 不动                            |

### 2.2 新增内置 Skill

| 新 Skill   | 默认状态 | 说明                        |
| --------- | ---: | ------------------------- |
| 笔记本与文档树管理 | 默认关闭 | 只管理笔记本和文档树组织，不处理具体正文内容    |
| 标签、书签与大纲  | 默认关闭 | 管理 tag/bookmark，并共享大纲读取能力 |
| 资产管理      | 默认关闭 | 管理思源 assets 和受限工作区文件      |
| 闪卡复习      | 默认关闭 | 管理 riff deck 和 riff card  |

### 2.3 明确暂不做的能力

本次不要实现：

1. 模板、导入、导出 Skill。
2. 历史、快照、同步 Skill。
3. 系统信息与前端辅助 Skill。
4. Bazaar 插件/主题/图标安装卸载。
5. 账号、登录、API Token、访问授权码、安全配置、S3/WebDAV 密钥等能力。
6. resetRepo、purgeRepo、purgeCloudRepo、checkout、rollback 等高风险仓库操作。
7. 通用任意 `/api/*` 请求工具。
8. 任意工作区文件系统写入工具。

---

## 3. 工具设计总原则

### 3.1 工具数量控制

不能一个 API 一个工具。必须按语义域聚合。

例如：

* 标签的列表、重命名、删除合并为 `siyuan_tag_manage`。
* 笔记本的列表、创建、打开、关闭、重命名、设置图标、设置配置合并为 `siyuan_notebook_manage`。
* 块属性的读取、批量读取、设置、批量设置合并为 `siyuan_block_attr`。
* 闪卡的查看、复习、跳过、添加、删除、重置、设置到期时间合并为 `siyuan_riff_card`。

### 3.2 读写分层

如果同一语义域里读写风险差异很大，应拆成读工具和写工具。

例如：

* `siyuan_asset_read` 是只读。
* `siyuan_asset_manage` 是写入。
* `siyuan_database_extra_read` 是只读。
* `siyuan_database_view` 是写入或结构调整，需要确认。

### 3.3 不重复封装已有工具

不得重复封装以下已有能力：

* 已有 `create_doc`，不要新增 `siyuan_create_doc`。
* 已有 `rename_doc`，不要新增同语义 `siyuan_rename_doc`。
* 已有 `delete_doc`，不要新增同语义 `siyuan_remove_doc`。
* 已有 `update_attribute_view_cell`，不要新增批量单元格更新工具。
* 已有 `read_docs`、`get_doc_info`，不要做同义工具。

如果某个新工具的能力能完全由已有工具无损组合实现，就不要新增该工具。只在 Skill 说明中指导 AI 组合使用。

### 3.4 写入确认

所有 `readOnly=false` 的工具必须：

1. `safety.canWrite = true`
2. 默认 `requiresConfirmation = true`
3. 进入现有 permission gate
4. 生成可理解的 preview
5. 用户取消或拒绝时不能继续绕过
6. 工具失败时不能声称成功

高风险写入工具必须提供更详细的 preview，例如：

* 删除标签、书签、闪卡、deck、资源、文档树移动等。
* 块引用迁移、块状态修改、文档结构转换。
* 数据库视图结构修改。

### 3.5 工具参数必须影响执行

不得给工具加 `reason`、`comment`、`note` 这类只给模型解释但不参与执行的参数。使用建议写在 `description`、`inputHint`、Skill 说明里。

### 3.6 统一返回结构

所有新增工具必须返回：

```ts
ToolResult<StructuredData>
```

成功：

```ts
{
  ok: true,
  data: {
    action,
    ...
  }
}
```

失败：

```ts
{
  ok: false,
  data: null,
  error: {
    code,
    message,
    recoverable,
    hint,
    details
  }
}
```

不允许只返回纯文本。

### 3.7 输出截断

所有可能返回大量内容的工具必须支持：

* `maxItems`
* `maxChars`
* `truncated`
* `nextCursor` 或 `hasMore`，如果 API 支持或可模拟

默认输出不能过大，避免污染 Agent 上下文。

建议默认：

```ts
maxItems: 50
maxChars: 12000
```

如果返回 block DOM、Kramdown、资源内容、SQL 查询结果，必须截断并标记。

### 3.8 Debug

新增工具要把关键事件写入：

```ts
window.__kbAgentDebug()
```

可以通过现有 `pushAgentDebugEvent` 或等价入口写入。不要新增散落 `console.log`。

调试事件建议命名：

* `SIYUAN_TOOL_EXECUTED`
* `SIYUAN_TOOL_FAILED`
* `SIYUAN_API_WRAPPER_FAILED`
* `SIYUAN_TOOL_RESULT_TRUNCATED`
* `SIYUAN_WORKSPACE_FILE_BLOCKED`
* `SIYUAN_RIFF_ACTION_EXECUTED`

调试 payload 不得包含正文全文、API Key、Cookie、Authorization、密钥、token 等敏感内容。

---

## 4. Skill 注册与设置要求

### 4.1 新增内置 Skill 名称

新增以下常量：

```ts
export const BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME = "builtin_notebook_doc_tree";
export const BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME = "builtin_tag_bookmark_outline";
export const BUILTIN_ASSET_MANAGEMENT_SKILL_NAME = "builtin_asset_management";
export const BUILTIN_RIFF_REVIEW_SKILL_NAME = "builtin_riff_review";
```

新增文件：

```text
src/features/kb/services/agent-workbench/skills/builtin/notebook-doc-tree.skill.ts
src/features/kb/services/agent-workbench/skills/builtin/tag-bookmark-outline.skill.ts
src/features/kb/services/agent-workbench/skills/builtin/asset-management.skill.ts
src/features/kb/services/agent-workbench/skills/builtin/riff-review.skill.ts
```

更新：

```text
src/features/kb/services/agent-workbench/skills/builtin/index.ts
src/features/kb/services/agent-workbench/skills/builtin/skill-catalog.ts
src/features/kb/services/agent-workbench/composition/register-builtin-skills.ts
src/features/kb/services/agent-workbench/runtime/run-agent-turn.ts
src/features/kb/services/agent-workbench/runtime/create-agent-workbench.ts
src/features/kb/services/agent-workbench/composition/register-siyuan-tools.ts
```

### 4.2 新增 BuiltinCapabilityAccess 字段

扩展：

```ts
export interface BuiltinCapabilityAccess {
  knowledgeBase: boolean;
  scheduleTaskDiary: boolean;
  databaseAssistant: boolean;
  docContentEditing: boolean;
  notebookDocTree: boolean;
  tagBookmarkOutline: boolean;
  assetManagement: boolean;
  riffReview: boolean;
}
```

在 `run-agent-turn.ts` 中根据 `disabledBuiltinSkillNames` 生成：

```ts
const builtinCapabilityAccess = {
  knowledgeBase: !disabledBuiltinSkills.has(BUILTIN_KB_SKILL_NAME),
  scheduleTaskDiary: !disabledBuiltinSkills.has(BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME),
  databaseAssistant: !disabledBuiltinSkills.has(BUILTIN_DATABASE_ASSISTANT_SKILL_NAME),
  docContentEditing: !disabledBuiltinSkills.has(BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME),
  notebookDocTree: !disabledBuiltinSkills.has(BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME),
  tagBookmarkOutline: !disabledBuiltinSkills.has(BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME),
  assetManagement: !disabledBuiltinSkills.has(BUILTIN_ASSET_MANAGEMENT_SKILL_NAME),
  riffReview: !disabledBuiltinSkills.has(BUILTIN_RIFF_REVIEW_SKILL_NAME),
};
```

### 4.3 默认关闭新 Skill

更新 `DEFAULT_SKILL_SETTINGS`：

```ts
disabledBuiltinSkillNames: [
  "builtin_doc_content_editing",
  "builtin_notebook_doc_tree",
  "builtin_tag_bookmark_outline",
  "builtin_asset_management",
  "builtin_riff_review",
],
initializedDefaultDisabledBuiltinSkillNames: [
  "builtin_doc_content_editing",
  "builtin_notebook_doc_tree",
  "builtin_tag_bookmark_outline",
  "builtin_asset_management",
  "builtin_riff_review",
],
```

更新 `normalizeSkillSettings`，把当前只处理 `builtin_doc_content_editing` 的逻辑改成可扩展数组：

```ts
const DEFAULT_DISABLED_BUILTIN_SKILL_NAMES = [
  "builtin_doc_content_editing",
  "builtin_notebook_doc_tree",
  "builtin_tag_bookmark_outline",
  "builtin_asset_management",
  "builtin_riff_review",
];
```

旧用户如果之前没有初始化这些新增默认关闭项，则自动加入 disabled，并标记 initialized。用户手动开启后，后续不能被归一化再次关闭。

---

## 5. 新增 / 扩展工具总表

最终新增或扩展工具如下：

### 5.1 并入知识库检索 Skill

| 工具名                   | 类型 | 注册条件                             |   |                     |
| --------------------- | -- | -------------------------------- | - | ------------------- |
| `siyuan_outline`      | 只读 | `knowledgeBase                   |   | tagBookmarkOutline` |
| `siyuan_ref`          | 只读 | `knowledgeBase`                  |   |                     |
| `siyuan_search_extra` | 只读 | `knowledgeBase`                  |   |                     |
| `siyuan_sql_select`   | 只读 | `knowledgeBase`，可默认注册，但严格 SELECT |   |                     |

### 5.2 并入文档内容编辑 Skill

| 工具名                    | 类型 | 注册条件                |
| ---------------------- | -- | ------------------- |
| `siyuan_block_read`    | 只读 | `docContentEditing` |
| `siyuan_block_attr`    | 读写 | `docContentEditing` |
| `siyuan_block_ref`     | 读写 | `docContentEditing` |
| `siyuan_block_state`   | 写入 | `docContentEditing` |
| `siyuan_doc_transform` | 写入 | `docContentEditing` |

### 5.3 并入数据库助手 Skill

| 工具名                          | 类型 | 注册条件                |
| ---------------------------- | -- | ------------------- |
| `siyuan_database_extra_read` | 只读 | `databaseAssistant` |
| `siyuan_database_view`       | 写入 | `databaseAssistant` |

### 5.4 新增笔记本与文档树管理 Skill

| 工具名                      | 类型 | 注册条件              |
| ------------------------ | -- | ----------------- |
| `siyuan_notebook_manage` | 读写 | `notebookDocTree` |
| `siyuan_doc_tree`        | 读写 | `notebookDocTree` |
| `siyuan_doc_path`        | 只读 | `notebookDocTree` |

### 5.5 新增标签、书签与大纲 Skill

| 工具名                      | 类型 | 注册条件                 |
| ------------------------ | -- | -------------------- |
| `siyuan_tag_manage`      | 读写 | `tagBookmarkOutline` |
| `siyuan_bookmark_manage` | 读写 | `tagBookmarkOutline` |
| `siyuan_outline`         | 只读 | 与知识库检索共享，不重复实现       |

### 5.6 新增资产管理 Skill

| 工具名                     | 类型     | 注册条件              |
| ----------------------- | ------ | ----------------- |
| `siyuan_asset_read`     | 只读     | `assetManagement` |
| `siyuan_asset_manage`   | 写入     | `assetManagement` |
| `siyuan_workspace_file` | 读写，高风险 | `assetManagement` |

### 5.7 新增闪卡复习 Skill

| 工具名                | 类型 | 注册条件         |
| ------------------ | -- | ------------ |
| `siyuan_riff_deck` | 读写 | `riffReview` |
| `siyuan_riff_card` | 读写 | `riffReview` |

---

## 6. API wrapper 实现要求

### 6.1 只能在 `src/api.ts` 新增直接 `/api/...` 调用

新增 API wrapper 时，工具实现文件不得直接写：

```ts
fetchSyncPost("/api/xxx", ...)
```

必须在 `src/api.ts` 中新增具名 wrapper。工具 impl 只能 import wrapper。

### 6.2 新 wrapper 命名建议

在 `src/api.ts` 新增以下 wrapper。已经存在的不要重复新增，只补缺失项。

#### Outline

```ts
getDocOutline(id: string): Promise<any>
```

调用：

```text
/api/outline/getDocOutline
```

#### Search / Ref

```ts
searchTemplate(k: string): Promise<any>
searchWidget(k: string): Promise<any>
searchRefBlock(params): Promise<any>
searchEmbedBlock(params): Promise<any>
getEmbedBlock(params): Promise<any>
searchAsset(k: string): Promise<any>
fullTextSearchAssetContent(params): Promise<any>
getAssetContent(path: string): Promise<any>
listInvalidBlockRefs(): Promise<any>
getBacklinkDoc(params): Promise<any>
getBackmentionDoc(params): Promise<any>
refreshBacklink(): Promise<any>
```

已有 `fullTextSearchBlock`、`getBacklink`、`searchTag` 可复用。

#### Block read / ref / attrs

```ts
getBlockInfo(id: string): Promise<any>
getBlockDOM(id: string): Promise<any>
getBlockDOMs(ids: string[]): Promise<any>
getBlockDOMWithEmbed(id: string): Promise<any>
getBlockKramdowns(ids: string[]): Promise<any>
getTailChildBlocks(id: string): Promise<any>
getBlockBreadcrumb(id: string): Promise<any>
getBlockIndex(id: string): Promise<any>
getBlocksIndexes(ids: string[]): Promise<any>
getRefIDs(id: string): Promise<any>
getBlockDefIDsByRefText(refText: string): Promise<any>
getRefText(id: string): Promise<any>
getDOMText(id: string): Promise<any>
getTreeStat(id: string): Promise<any>
getBlocksWordCount(ids: string[]): Promise<any>
getContentWordCount(content: string): Promise<any>
getRecentUpdatedBlocks(params): Promise<any>
checkBlockExist(id: string): Promise<any>
getBlockSiblingID(id: string): Promise<any>
getBlockRelevantIDs(id: string): Promise<any>
getBlockTreeInfos(ids: string[]): Promise<any>
checkBlockRef(id: string): Promise<any>
swapBlockRef(params): Promise<any>
transferBlockRef(params): Promise<any>
batchGetBlockAttrs(ids: string[]): Promise<any>
batchSetBlockAttrs(items): Promise<any>
setBlockReminder(params): Promise<any>
updateTaskListItemMarker(id, marker): Promise<any>
batchUpdateTaskListItemMarker(ids, marker): Promise<any>
```

已有 `getBlockKramdown`、`getChildBlocks`、`getBlockAttrs`、`setBlockAttrs`、`foldBlock`、`unfoldBlock`、`transferBlockRef`、`updateTaskListItemMarker`、`batchUpdateTaskListItemMarker` 可复用或补 raw checked 版本。

#### Filetree / notebook

已有：

* `lsNotebooks`
* `openNotebook`
* `closeNotebook`
* `renameNotebook`
* `createNotebook`
* `removeNotebook`
* `getNotebookConf`
* `setNotebookConf`
* `listDocsByPath`
* `moveDocs`
* `getHPathByPath`
* `getHPathByID`
* `getIDsByHPath`

新增：

```ts
setNotebookIcon(notebook: string, icon: string): Promise<any>
getPathByID(id: string): Promise<any>
getFullHPathByID(id: string): Promise<any>
getHPathsByPaths(paths): Promise<any>
duplicateDoc(params): Promise<any>
listDocTree(params): Promise<any>
moveDocsByID(params): Promise<any>
doc2Heading(params): Promise<any>
heading2Doc(params): Promise<any>
li2Doc(params): Promise<any>
```

注意：`createDocWithMd`、`renameDoc`、`removeDoc` 已有，不要为新增 Skill 再重复封装为新工具。

#### Tag / Bookmark

已有：

* `getTag`
* `searchTag`

新增：

```ts
renameTag(oldLabel: string, newLabel: string): Promise<any>
removeTag(label: string): Promise<any>
getBookmark(): Promise<any>
renameBookmark(oldLabel: string, newLabel: string): Promise<any>
removeBookmark(label: string): Promise<any>
```

#### Asset / workspace file

已有：

* `upload`
* `getFile`
* `putFile`
* `removeFile`
* `readDir`

新增：

```ts
resolveAssetPath(path: string): Promise<any>
getFileAnnotation(path: string): Promise<any>
setFileAnnotation(path: string, annotation: string): Promise<any>
getUnusedAssets(): Promise<any>
getMissingAssets(): Promise<any>
removeUnusedAsset(path: string): Promise<any>
getDocImageAssets(id: string): Promise<any>
getDocAssets(id: string): Promise<any>
renameAsset(oldPath: string, newName: string): Promise<any>
getImageOCRText(path: string): Promise<any>
setImageOCRText(path: string, text: string): Promise<any>
ocrAsset(path: string): Promise<any>
fullReindexAssetContent(): Promise<any>
statAsset(path: string): Promise<any>
copyFile(params): Promise<any>
renameFile(path: string, newPath: string): Promise<any>
getUniqueFilename(path: string): Promise<any>
```

禁止封装：

* `globalCopyFiles`
* `workspaceCopyFiles`

除非以后单独做严格确认和白名单。

#### AV extra

已有大量 AV wrapper。补缺：

```ts
getAttributeViewFilterSort(params): Promise<any>
getAttributeViewPrimaryKeyValues(params): Promise<any>
getMirrorDatabaseBlocks(params): Promise<any>
getCurrentAttrViewImages(params): Promise<any>
getUnusedAttributeViews(): Promise<any>
setDatabaseBlockView(params): Promise<any>
changeAttrViewLayout(params): Promise<any>
setAttrViewGroup(params): Promise<any>
```

不做：

* `removeUnusedAttributeViews`
* `removeUnusedAttributeView`
* `batchReplaceAttributeViewBlocks`
* `duplicateAttributeViewBlock`

除非以后确认需要。

#### Riff

新增：

```ts
renameRiffDeck(deckID: string, name: string): Promise<any>
removeRiffDeck(deckID: string): Promise<any>
getRiffDecks(): Promise<any>
addRiffCards(params): Promise<any>
removeRiffCards(params): Promise<any>
getRiffDueCards(params): Promise<any>
getTreeRiffDueCards(params): Promise<any>
getNotebookRiffDueCards(params): Promise<any>
reviewRiffCard(params): Promise<any>
skipReviewRiffCard(params): Promise<any>
getRiffCards(params): Promise<any>
getTreeRiffCards(params): Promise<any>
getNotebookRiffCards(params): Promise<any>
resetRiffCards(params): Promise<any>
batchSetRiffCardsDueTime(params): Promise<any>
getRiffCardsByBlockIDs(blockIDs: string[]): Promise<any>
```

---

## 7. 工具实现文件结构

每个新工具遵循现有结构：

```text
src/features/kb/services/agent-workbench/tools/siyuan/contracts/<tool>.contract.ts
src/features/kb/services/agent-workbench/tools/siyuan/impl/<tool>.impl.ts
src/features/kb/services/agent-workbench/tools/siyuan/<tool>.tool.ts
```

新增文件清单：

```text
contracts/siyuan-outline.contract.ts
impl/siyuan-outline.impl.ts
siyuan-outline.tool.ts

contracts/siyuan-ref.contract.ts
impl/siyuan-ref.impl.ts
siyuan-ref.tool.ts

contracts/siyuan-search-extra.contract.ts
impl/siyuan-search-extra.impl.ts
siyuan-search-extra.tool.ts

contracts/siyuan-sql-select.contract.ts
impl/siyuan-sql-select.impl.ts
siyuan-sql-select.tool.ts

contracts/siyuan-block-read.contract.ts
impl/siyuan-block-read.impl.ts
siyuan-block-read.tool.ts

contracts/siyuan-block-attr.contract.ts
impl/siyuan-block-attr.impl.ts
siyuan-block-attr.tool.ts

contracts/siyuan-block-ref.contract.ts
impl/siyuan-block-ref.impl.ts
siyuan-block-ref.tool.ts

contracts/siyuan-block-state.contract.ts
impl/siyuan-block-state.impl.ts
siyuan-block-state.tool.ts

contracts/siyuan-doc-transform.contract.ts
impl/siyuan-doc-transform.impl.ts
siyuan-doc-transform.tool.ts

contracts/siyuan-database-extra-read.contract.ts
impl/siyuan-database-extra-read.impl.ts
siyuan-database-extra-read.tool.ts

contracts/siyuan-database-view.contract.ts
impl/siyuan-database-view.impl.ts
siyuan-database-view.tool.ts

contracts/siyuan-notebook-manage.contract.ts
impl/siyuan-notebook-manage.impl.ts
siyuan-notebook-manage.tool.ts

contracts/siyuan-doc-tree.contract.ts
impl/siyuan-doc-tree.impl.ts
siyuan-doc-tree.tool.ts

contracts/siyuan-doc-path.contract.ts
impl/siyuan-doc-path.impl.ts
siyuan-doc-path.tool.ts

contracts/siyuan-tag-manage.contract.ts
impl/siyuan-tag-manage.impl.ts
siyuan-tag-manage.tool.ts

contracts/siyuan-bookmark-manage.contract.ts
impl/siyuan-bookmark-manage.impl.ts
siyuan-bookmark-manage.tool.ts

contracts/siyuan-asset-read.contract.ts
impl/siyuan-asset-read.impl.ts
siyuan-asset-read.tool.ts

contracts/siyuan-asset-manage.contract.ts
impl/siyuan-asset-manage.impl.ts
siyuan-asset-manage.tool.ts

contracts/siyuan-workspace-file.contract.ts
impl/siyuan-workspace-file.impl.ts
siyuan-workspace-file.tool.ts

contracts/siyuan-riff-deck.contract.ts
impl/siyuan-riff-deck.impl.ts
siyuan-riff-deck.tool.ts

contracts/siyuan-riff-card.contract.ts
impl/siyuan-riff-card.impl.ts
siyuan-riff-card.tool.ts
```

如果某些 impl 可以共享工具函数，新增：

```text
src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-api-result-utils.ts
src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-id-utils.ts
src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-tool-output-utils.ts
```

工具函数必须纯函数或轻量 helper，不要把所有工具塞进一个巨型文件。

---

## 8. 具体工具设计

### 8.1 `siyuan_outline`

#### 所属 Skill

* 知识库检索与阅读
* 标签、书签与大纲

#### 类型

只读。

#### 注册条件

```ts
knowledgeBase || tagBookmarkOutline
```

#### 参数

```ts
{
  docId: string;
  maxDepth?: number;
  maxItems?: number;
}
```

#### 行为

调用：

```text
/api/outline/getDocOutline
```

返回文档标题结构。输出应尽量简化为：

```ts
{
  docId,
  outline: [
    {
      id,
      name,
      type,
      depth,
      childrenCount,
      children?
    }
  ],
  truncated
}
```

#### 边界

不能读取整篇正文。只返回大纲结构。需要正文证据时仍要使用 `read_docs`。

---

### 8.2 `siyuan_ref`

#### 所属 Skill

知识库检索与阅读。

#### 类型

只读。

#### 参数

```ts
{
  action: "backlink" | "backlink_doc" | "backmention_doc" | "search_ref_block" | "refresh_backlink";
  id?: string;
  docId?: string;
  keyword?: string;
  beforeLen?: number;
  containChildren?: boolean;
  maxItems?: number;
}
```

#### API 映射

| action             | API                          |
| ------------------ | ---------------------------- |
| `backlink`         | `/api/ref/getBacklink`       |
| `backlink_doc`     | `/api/ref/getBacklinkDoc`    |
| `backmention_doc`  | `/api/ref/getBackmentionDoc` |
| `search_ref_block` | `/api/search/searchRefBlock` |
| `refresh_backlink` | `/api/ref/refreshBacklink`   |

#### 边界

* `refresh_backlink` 虽然会刷新索引，但对用户文档无直接写入，仍可视为只读维护操作。
* 不做引用迁移。引用迁移属于文档编辑 Skill 的 `siyuan_block_ref`。

---

### 8.3 `siyuan_search_extra`

#### 所属 Skill

知识库检索与阅读。

#### 类型

只读。

#### 参数

```ts
{
  action:
    | "search_tag"
    | "search_template"
    | "search_widget"
    | "search_embed_block"
    | "get_embed_block"
    | "search_asset"
    | "asset_content"
    | "invalid_block_refs";
  keyword?: string;
  id?: string;
  path?: string;
  page?: number;
  maxItems?: number;
  maxChars?: number;
}
```

#### API 映射

| action               | API                                                                      |
| -------------------- | ------------------------------------------------------------------------ |
| `search_tag`         | `/api/search/searchTag`                                                  |
| `search_template`    | `/api/search/searchTemplate`                                             |
| `search_widget`      | `/api/search/searchWidget`                                               |
| `search_embed_block` | `/api/search/searchEmbedBlock`                                           |
| `get_embed_block`    | `/api/search/getEmbedBlock`                                              |
| `search_asset`       | `/api/search/searchAsset`                                                |
| `asset_content`      | `/api/search/getAssetContent` 或 `/api/search/fullTextSearchAssetContent` |
| `invalid_block_refs` | `/api/search/listInvalidBlockRefs`                                       |

#### 明确不做

* `findReplace` 不放这里，因为它是写入操作。
* `updateEmbedBlock` 不放这里，因为它是写入操作。

---

### 8.4 `siyuan_sql_select`

#### 所属 Skill

知识库检索与阅读。

#### 类型

只读。

#### 参数

```ts
{
  stmt: string;
  maxRows?: number;
  maxChars?: number;
}
```

#### 安全规则

必须严格校验：

1. 去掉前后空白后，必须以 `select` 或 `with` 开头。
2. 禁止出现以下关键字：

   * `insert`
   * `update`
   * `delete`
   * `drop`
   * `alter`
   * `create`
   * `replace`
   * `vacuum`
   * `attach`
   * `detach`
   * `pragma`
   * `reindex`
3. 禁止多语句；不能包含第二个分号。
4. 默认自动追加或包裹 limit，最多返回 `maxRows <= 100`。
5. 输出必须截断。

#### 失败提示

如果用户需要写 SQL 修改数据库，明确拒绝，说明本工具只支持只读查询。

---

### 8.5 `siyuan_block_read`

#### 所属 Skill

文档内容编辑。

#### 类型

只读。

#### 参数

```ts
{
  action:
    | "info"
    | "dom"
    | "doms"
    | "dom_with_embed"
    | "kramdown"
    | "kramdowns"
    | "children"
    | "tail_children"
    | "breadcrumb"
    | "index"
    | "sibling"
    | "relevant_ids"
    | "tree_infos"
    | "word_count"
    | "check_exist"
    | "recent_updated";
  id?: string;
  ids?: string[];
  maxItems?: number;
  maxChars?: number;
}
```

#### API 映射

使用 block 相关只读 API：

* `getBlockInfo`
* `getBlockDOM`
* `getBlockDOMs`
* `getBlockDOMWithEmbed`
* `getBlockKramdown`
* `getBlockKramdowns`
* `getChildBlocks`
* `getTailChildBlocks`
* `getBlockBreadcrumb`
* `getBlockIndex`
* `getBlockSiblingID`
* `getBlockRelevantIDs`
* `getBlockTreeInfos`
* `getBlocksWordCount`
* `checkBlockExist`
* `getRecentUpdatedBlocks`

#### 边界

这是文档编辑 Skill 的读取辅助工具。它不替代 `read_doc_blocks`，但用于更细粒度块定位。

---

### 8.6 `siyuan_block_attr`

#### 所属 Skill

文档内容编辑。

#### 类型

读写。

#### 参数

```ts
{
  action: "get" | "batch_get" | "set" | "batch_set";
  id?: string;
  ids?: string[];
  attrs?: Record<string, string>;
  items?: Array<{
    id: string;
    attrs: Record<string, string>;
  }>;
}
```

#### API 映射

| action      | API                            |
| ----------- | ------------------------------ |
| `get`       | `/api/attr/getBlockAttrs`      |
| `batch_get` | `/api/attr/batchGetBlockAttrs` |
| `set`       | `/api/attr/setBlockAttrs`      |
| `batch_set` | `/api/attr/batchSetBlockAttrs` |

#### 安全规则

* `get` / `batch_get` 只读。
* `set` / `batch_set` 是写入，必须确认。
* 批量最多 20 个 block。
* 禁止设置空 id。
* 对 `custom-*` 属性优先支持；对系统属性必须谨慎。
* preview 显示 blockId、属性 key、旧值是否未知、新值预览。

---

### 8.7 `siyuan_block_ref`

#### 所属 Skill

文档内容编辑。

#### 类型

读写。

#### 参数

```ts
{
  action:
    | "get_ref_ids"
    | "get_ref_text"
    | "get_def_ids_by_ref_text"
    | "check_ref"
    | "swap_ref"
    | "transfer_ref";
  id?: string;
  refText?: string;
  fromID?: string;
  toID?: string;
  refIDs?: string[];
}
```

#### API 映射

| action                    | API                                  |
| ------------------------- | ------------------------------------ |
| `get_ref_ids`             | `/api/block/getRefIDs`               |
| `get_ref_text`            | `/api/block/getRefText`              |
| `get_def_ids_by_ref_text` | `/api/block/getBlockDefIDsByRefText` |
| `check_ref`               | `/api/block/checkBlockRef`           |
| `swap_ref`                | `/api/block/swapBlockRef`            |
| `transfer_ref`            | `/api/block/transferBlockRef`        |

#### 安全规则

* 前四个 action 只读。
* `swap_ref`、`transfer_ref` 是高风险写入，必须确认。
* `transfer_ref` 必须要求 `fromID`、`toID`、`refIDs[]` 都来自工具返回或当前上下文，不得编造。
* preview 必须显示 fromID、toID、refIDs 数量。

---

### 8.8 `siyuan_block_state`

#### 所属 Skill

文档内容编辑。

#### 类型

写入。

#### 参数

```ts
{
  action: "fold" | "unfold" | "set_reminder" | "update_task_marker" | "batch_update_task_marker";
  id?: string;
  ids?: string[];
  marker?: " " | "x";
  reminder?: string;
}
```

#### API 映射

| action                     | API                                        |
| -------------------------- | ------------------------------------------ |
| `fold`                     | `/api/block/foldBlock`                     |
| `unfold`                   | `/api/block/unfoldBlock`                   |
| `set_reminder`             | `/api/block/setBlockReminder`              |
| `update_task_marker`       | `/api/block/updateTaskListItemMarker`      |
| `batch_update_task_marker` | `/api/block/batchUpdateTaskListItemMarker` |

#### 安全规则

全部写入确认。批量最多 50 个任务项。必须显示目标 blockId 数量和目标状态。

---

### 8.9 `siyuan_doc_transform`

#### 所属 Skill

文档内容编辑。

#### 类型

写入，高风险。

#### 参数

```ts
{
  action: "doc_to_heading" | "heading_to_doc" | "list_item_to_doc";
  id?: string;
  notebook?: string;
  path?: string;
  targetPath?: string;
}
```

#### API 映射

| action             | API                         |
| ------------------ | --------------------------- |
| `doc_to_heading`   | `/api/filetree/doc2Heading` |
| `heading_to_doc`   | `/api/filetree/heading2Doc` |
| `list_item_to_doc` | `/api/filetree/li2Doc`      |

#### 安全规则

* 默认需要确认。
* preview 必须显示转换类型、目标 id/path、可能影响文档结构。
* 不与 `create_doc` 重复。它只做结构转换。

---

### 8.10 `siyuan_database_extra_read`

#### 所属 Skill

数据库助手。

#### 类型

只读。

#### 参数

```ts
{
  action:
    | "filter_sort"
    | "primary_key_values"
    | "mirror_blocks"
    | "keys_by_av_id"
    | "keys_by_block_id"
    | "bound_ids_by_item_ids"
    | "item_ids_by_bound_ids"
    | "current_images"
    | "unused_attribute_views";
  avID?: string;
  blockID?: string;
  viewID?: string;
  itemIDs?: string[];
  boundIDs?: string[];
  maxItems?: number;
}
```

#### 边界

只补现有数据库工具缺少的只读辅助能力，不替代 `read_attribute_view`。

---

### 8.11 `siyuan_database_view`

#### 所属 Skill

数据库助手。

#### 类型

写入。

#### 参数

```ts
{
  action:
    | "set_database_block_view"
    | "sort_key"
    | "sort_view_key"
    | "change_layout"
    | "set_group";
  avID?: string;
  blockID?: string;
  viewID?: string;
  keyID?: string;
  previousKeyID?: string;
  layout?: string;
  group?: unknown;
}
```

#### 边界

* 不支持删除数据库。
* 不支持清理 unused AV。
* 不支持 batchReplace。
* 不支持 duplicateAttributeViewBlock。
* 所有 action 必须确认。
* 修改视图前建议先调用只读工具读取 schema 和 view。

---

### 8.12 `siyuan_notebook_manage`

#### 所属 Skill

笔记本与文档树管理。

#### 类型

读写。

#### 参数

```ts
{
  action:
    | "list"
    | "create"
    | "open"
    | "close"
    | "rename"
    | "get_conf"
    | "set_conf"
    | "set_icon"
    | "remove";
  notebook?: string;
  name?: string;
  icon?: string;
  conf?: unknown;
}
```

#### API 映射

使用 notebook API。

#### 安全规则

* `list`、`get_conf` 只读。
* `create`、`open`、`close`、`rename`、`set_conf`、`set_icon` 写入确认。
* `remove` 高风险，默认确认，并且 preview 必须提示会删除笔记本。
* `remove` 可以实现，但 Skill 文案中要求 AI 不主动使用，除非用户明确要求。

---

### 8.13 `siyuan_doc_tree`

#### 所属 Skill

笔记本与文档树管理。

#### 类型

读写。

#### 参数

```ts
{
  action:
    | "list_children"
    | "list_tree"
    | "move"
    | "move_by_id"
    | "duplicate"
    | "sort";
  notebook?: string;
  path?: string;
  fromPaths?: string[];
  toNotebook?: string;
  toPath?: string;
  ids?: string[];
  targetID?: string;
}
```

#### 边界

* 不负责创建文档。创建文档已有 `create_doc`。
* 不负责重命名和删除文档。当前已有 `rename_doc`、`delete_doc`。
* 只处理文档树组织，例如列出、移动、复制、排序。
* 所有写入确认。

---

### 8.14 `siyuan_doc_path`

#### 所属 Skill

笔记本与文档树管理。

#### 类型

只读。

#### 参数

```ts
{
  action:
    | "hpath_by_path"
    | "hpaths_by_paths"
    | "hpath_by_id"
    | "path_by_id"
    | "full_hpath_by_id"
    | "ids_by_hpath";
  notebook?: string;
  path?: string;
  paths?: string[];
  id?: string;
  hpath?: string;
}
```

#### 边界

只做路径 / ID 解析，不写入。

---

### 8.15 `siyuan_tag_manage`

#### 所属 Skill

标签、书签与大纲。

#### 类型

读写。

#### 参数

```ts
{
  action: "list" | "search" | "rename" | "remove";
  keyword?: string;
  oldLabel?: string;
  newLabel?: string;
  label?: string;
  sort?: number;
  ignoreMaxListHint?: boolean;
}
```

#### API 映射

* `getTag`
* `searchTag`
* `renameTag`
* `removeTag`

#### 安全规则

* `list`、`search` 只读。
* `rename`、`remove` 写入确认。
* 删除标签 preview 必须显示 label。

---

### 8.16 `siyuan_bookmark_manage`

#### 所属 Skill

标签、书签与大纲。

#### 类型

读写。

#### 参数

```ts
{
  action: "list" | "rename" | "remove";
  oldLabel?: string;
  newLabel?: string;
  label?: string;
}
```

#### API 映射

* `getBookmark`
* `renameBookmark`
* `removeBookmark`

#### 安全规则

* `list` 只读。
* `rename`、`remove` 写入确认。

---

### 8.17 `siyuan_asset_read`

#### 所属 Skill

资产管理。

#### 类型

只读。

#### 参数

```ts
{
  action:
    | "resolve_path"
    | "doc_assets"
    | "doc_image_assets"
    | "unused_assets"
    | "missing_assets"
    | "file_annotation"
    | "image_ocr"
    | "stat"
    | "asset_content";
  path?: string;
  docId?: string;
  maxItems?: number;
  maxChars?: number;
}
```

#### API 映射

使用 asset / search asset API。

#### 输出限制

* 未使用资源和缺失资源可能很多，必须支持 `maxItems`。
* 资源内容必须支持 `maxChars`。
* 不返回二进制内容。

---

### 8.18 `siyuan_asset_manage`

#### 所属 Skill

资产管理。

#### 类型

写入。

#### 参数

```ts
{
  action:
    | "rename"
    | "set_annotation"
    | "set_image_ocr"
    | "ocr"
    | "remove_unused_one"
    | "remove_unused_batch"
    | "full_reindex_content";
  path?: string;
  paths?: string[];
  newName?: string;
  annotation?: string;
  text?: string;
}
```

#### 安全规则

* 全部写入确认。
* `remove_unused_batch` 高风险，必须展示数量，默认最多 20。
* 不实现任意上传本地文件，除非已有安全 file input 或明确数据来源。
* 不调用 `uploadCloud`。

---

### 8.19 `siyuan_workspace_file`

#### 所属 Skill

资产管理。

#### 类型

读写，高风险，默认随资产管理 Skill 关闭。

#### 参数

```ts
{
  action:
    | "read_dir"
    | "get_file"
    | "put_file"
    | "copy_file"
    | "rename_file"
    | "remove_file"
    | "unique_filename";
  path?: string;
  targetPath?: string;
  isDir?: boolean;
  content?: string;
  encoding?: "text" | "base64";
  maxChars?: number;
}
```

#### 路径白名单

只能允许：

```text
/data/assets
/data/templates
/data/widgets
/data/public
/data/storage/petal/siyuan-homepage
```

禁止：

```text
/
../
/conf
/data/storage/petal/其他插件
/data/.siyuan
任意绝对系统路径
```

如果路径不在白名单，返回：

```ts
error.code = "workspace_file_path_not_allowed"
```

#### 运行环境

如果调用的是思源 kernel `/api/file/*`，理论上不依赖 PC/Electron。
但如果后续涉及本地真实文件路径、上传 File 对象、打开系统文件选择器，则必须 PC/Electron 检测。当前本工具只做 kernel workspace file，不操作系统任意路径。

---

### 8.20 `siyuan_riff_deck`

#### 所属 Skill

闪卡复习。

#### 类型

读写。

#### 参数

```ts
{
  action: "list" | "rename" | "remove";
  deckID?: string;
  name?: string;
}
```

#### API 映射

* `getRiffDecks`
* `renameRiffDeck`
* `removeRiffDeck`

#### 安全规则

* `list` 只读。
* `rename`、`remove` 写入确认。
* `remove` 高风险，必须 preview deckID/name。

#### 注意

如果官方没有 create deck API，就不要编造 create deck。只能做 router 中真实存在的能力。

---

### 8.21 `siyuan_riff_card`

#### 所属 Skill

闪卡复习。

#### 类型

读写。

#### 参数

```ts
{
  action:
    | "due_cards"
    | "tree_due_cards"
    | "notebook_due_cards"
    | "list_cards"
    | "tree_cards"
    | "notebook_cards"
    | "cards_by_block_ids"
    | "add_cards"
    | "remove_cards"
    | "review"
    | "skip"
    | "reset"
    | "set_due_time";
  deckID?: string;
  rootID?: string;
  notebook?: string;
  blockIDs?: string[];
  cardIDs?: string[];
  cardID?: string;
  rating?: string;
  dueTime?: number;
  maxItems?: number;
}
```

#### API 映射

* `getRiffDueCards`
* `getTreeRiffDueCards`
* `getNotebookRiffDueCards`
* `getRiffCards`
* `getTreeRiffCards`
* `getNotebookRiffCards`
* `getRiffCardsByBlockIDs`
* `addRiffCards`
* `removeRiffCards`
* `reviewRiffCard`
* `skipReviewRiffCard`
* `resetRiffCards`
* `batchSetRiffCardsDueTime`

#### 安全规则

* 查询类只读。
* `add_cards`、`remove_cards`、`review`、`skip`、`reset`、`set_due_time` 写入确认。
* `review` 和 `skip` 会改变复习状态，也要确认，除非用户把工具设为 trusted。
* 批量最多 50 张卡。

---

## 9. Skill 文案要求

### 9.1 更新知识库检索 Skill

在 `knowledge-base-qa.skill.ts` 中补充：

* `siyuan_outline` 用于理解文档标题结构，不等于正文证据。
* `siyuan_ref` 用于查找反链、提及、引用块。
* `siyuan_search_extra` 用于特殊检索，如标签、资源、嵌入块、无效引用。
* `siyuan_sql_select` 只允许 SELECT，用于结构化只读查询。
* 详细回答仍必须基于 `read_docs` 或已有 grounded 正文。

### 9.2 更新文档内容编辑 Skill

在 `doc-content-editing.skill.ts` 中补充：

* 块级编辑前优先用 `siyuan_block_read` 定位真实 blockId。
* 块属性修改用 `siyuan_block_attr`。
* 引用迁移用 `siyuan_block_ref`，必须谨慎。
* 折叠、提醒、任务 marker 用 `siyuan_block_state`。
* 文档结构转换用 `siyuan_doc_transform`，高风险，必须确认。
* 不要用整篇替换代替局部编辑。

### 9.3 更新数据库助手 Skill

补充：

* `siyuan_database_extra_read` 用于读取视图、主键、镜像、映射等辅助信息。
* `siyuan_database_view` 修改视图布局、排序、分组，属于结构写入，必须先读取 schema。
* 不支持删除数据库、不支持清理 unused AV、不支持整库替换。

### 9.4 新增笔记本与文档树管理 Skill 文案

边界：

* 只管理笔记本和文档树组织。
* 不负责具体文档正文编辑。
* 不重复使用 `create_doc`、`rename_doc`、`delete_doc` 以外的同义工具。
* 移动、复制、排序、删除笔记本必须确认。

### 9.5 新增标签、书签与大纲 Skill 文案

边界：

* 管理标签和书签。
* 大纲只读，可用于理解文档结构。
* 删除标签/书签会影响组织结构，必须确认。

### 9.6 新增资产管理 Skill 文案

边界：

* 只管理思源资产和受限工作区文件。
* 不访问系统任意路径。
* 删除资源、重命名资源、OCR 写入必须确认。
* workspace file 工具只能访问白名单目录。

### 9.7 新增闪卡复习 Skill 文案

边界：

* 管理思源闪卡 deck/card。
* 复习、跳过、重置、删除都会改变复习状态，必须确认。
* 不编造 deckID/cardID/blockID。
* 复习前应先读取 due cards 或 cards by block ids。

---

## 10. 工具注册要求

在 `register-siyuan-tools.ts` 中：

1. 保持现有工具注册不变。
2. 新增工具 deps。
3. 按 Skill 开关注册新增工具。

伪代码：

```ts
if (options.builtinCapabilityAccess?.knowledgeBase !== false) {
  ensureTool(createSiyuanOutlineTool(...));
  ensureTool(createSiyuanRefTool(...));
  ensureTool(createSiyuanSearchExtraTool(...));
  ensureTool(createSiyuanSqlSelectTool(...));
}

if (options.builtinCapabilityAccess?.tagBookmarkOutline === true) {
  ensureTool(createSiyuanTagManageTool(...));
  ensureTool(createSiyuanBookmarkManageTool(...));
  ensureTool(createSiyuanOutlineTool(...)); // ensureTool 去重
}

if (options.builtinCapabilityAccess?.docContentEditing === true) {
  ensureTool(createReadDocBlocksTool(...));
  ensureTool(createSiyuanBlockReadTool(...));
  ensureTool(createSiyuanBlockAttrTool(...));
  ensureTool(createSiyuanBlockRefTool(...));
  ensureTool(createSiyuanBlockStateTool(...));
  ensureTool(createSiyuanDocTransformTool(...));
  // 保留原有写工具
}

if (options.builtinCapabilityAccess?.databaseAssistant !== false) {
  // 原有数据库工具
  ensureTool(createSiyuanDatabaseExtraReadTool(...));
  ensureTool(createSiyuanDatabaseViewTool(...));
}

if (options.builtinCapabilityAccess?.notebookDocTree === true) {
  ensureTool(createSiyuanNotebookManageTool(...));
  ensureTool(createSiyuanDocTreeTool(...));
  ensureTool(createSiyuanDocPathTool(...));
}

if (options.builtinCapabilityAccess?.assetManagement === true) {
  ensureTool(createSiyuanAssetReadTool(...));
  ensureTool(createSiyuanAssetManageTool(...));
  ensureTool(createSiyuanWorkspaceFileTool(...));
}

if (options.builtinCapabilityAccess?.riffReview === true) {
  ensureTool(createSiyuanRiffDeckTool(...));
  ensureTool(createSiyuanRiffCardTool(...));
}
```

注意：

* `siyuan_outline` 可能被两个 Skill 同时需要，必须用 `ensureTool` 去重。
* 新增工具不加入 `globalToolCatalog`，除非它是不受 Skill 控制的全局工具。本次新增工具都应随 Skill 控制注册。
* 工具设置页应随 Skill 展示对应工具，如果当前系统已有“Skill 工具联动显示”机制，沿用机制，不新写另一套 UI。

---

## 11. 权限与确认预览

需要更新：

```text
src/features/kb/services/agent-core/permissions/write-preview-builder.ts
```

为以下工具增加结构化 preview：

* `siyuan_block_attr`
* `siyuan_block_ref`
* `siyuan_block_state`
* `siyuan_doc_transform`
* `siyuan_database_view`
* `siyuan_notebook_manage`
* `siyuan_doc_tree`
* `siyuan_tag_manage`
* `siyuan_bookmark_manage`
* `siyuan_asset_manage`
* `siyuan_workspace_file`
* `siyuan_riff_deck`
* `siyuan_riff_card`

preview 必须至少包含：

```ts
{
  title,
  summary,
  riskLevel,
  sections: [
    { title: "操作", lines: [...] },
    { title: "目标", lines: [...] },
    { title: "影响", lines: [...] },
  ]
}
```

不要只显示“工具：xxx”。

示例：

```text
工具：标签管理
操作：删除标签
目标：#AI
风险：会移除该标签组织信息，请确认确实要删除。
```

---

## 12. 输出、截断与安全工具函数

新增工具统一使用 helper：

```ts
truncateText(text, maxChars)
truncateArray(items, maxItems)
safeString(value)
safeJsonPreview(value, maxChars)
normalizeSiyuanResponse(value)
```

建议新增：

```text
src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-output-utils.impl.ts
```

必须处理：

1. 空响应。
2. code=0 但 data=null 的成功。
3. API 返回结构变化。
4. 大数组截断。
5. 大文本截断。
6. 错误消息安全化。

---

## 13. SQL 只读校验

`siyuan_sql_select` 必须独立实现 SQL 安全校验，不要只靠模型自觉。

建议新增：

```text
src/features/kb/services/agent-workbench/tools/siyuan/impl/sql-select-guard.impl.ts
```

校验函数：

```ts
validateReadonlySql(stmt: string): { ok: true; normalized: string } | { ok: false; reason: string }
```

规则：

* 允许 `select`
* 允许 `with ... select`
* 禁止多语句
* 禁止写关键字
* 禁止 pragma
* 自动限制 maxRows
* maxRows 最大 100

---

## 14. 资产与 workspace file 白名单

`siyuan_workspace_file` 必须实现路径白名单 guard。

建议新增：

```text
src/features/kb/services/agent-workbench/tools/siyuan/impl/workspace-file-guard.impl.ts
```

规则：

```ts
const ALLOWED_PREFIXES = [
  "/data/assets/",
  "/data/templates/",
  "/data/widgets/",
  "/data/public/",
  "/data/storage/petal/siyuan-homepage/",
];
```

兼容输入可能是：

* `data/assets/...`
* `/data/assets/...`
* `assets/...`

最终统一成标准工作区路径。

拒绝：

* 空路径
* `..`
* 反斜杠穿越
* 绝对系统路径
* 不在白名单的 `/data/storage/petal/<other-plugin>`
* `/conf`
* `/temp`
* 根目录

---

## 15. 不要破坏现有功能

开发过程中必须保持：

1. 现有四个内置 Skill ID 不变。
2. 现有工具名不变。
3. 现有默认关闭 `builtin_doc_content_editing` 不变。
4. 现有数据库工具行为不变。
5. 现有强化日记工具行为不变。
6. 现有 MCP Client 行为不变。
7. 现有 HTTP GET/POST 工具不变。
8. 现有 API Key 加密保护不变。
9. 现有 Skill 设置页能继续显示旧 Skill。
10. 新 Skill 默认关闭，不打扰旧用户。

---

## 16. 开发完成后的最终效果

完成后，用户在内置 Skill 设置中应看到：

1. 知识库检索与阅读：默认开启。
2. 强化日记助手：默认开启。
3. 数据库助手：默认开启。
4. 文档内容编辑：默认关闭。
5. 笔记本与文档树管理：默认关闭。
6. 标签、书签与大纲：默认关闭。
7. 资产管理：默认关闭。
8. 闪卡复习：默认关闭。

当对应 Skill 开启后，Agent 才能看到对应工具。

### 16.1 知识库检索开启后

AI 可以：

* 查知识库结构。
* 搜索普通正文。
* 搜索标签、资源、模板、嵌入块、无效引用。
* 查看反链、提及、引用块。
* 查看文档大纲。
* 执行只读 SQL SELECT。

AI 不能：

* 修改任何内容。
* 替换搜索结果。
* 执行写 SQL。

### 16.2 文档内容编辑开启后

AI 可以：

* 读取块结构。
* 编辑块。
* 设置块属性。
* 折叠/展开块。
* 修改任务 marker。
* 设置块提醒。
* 迁移引用。
* 做标题/文档结构转换。

AI 不能：

* 编造 blockId。
* 用整篇替换绕过局部编辑确认。
* 在用户拒绝后换另一个危险工具继续写。

### 16.3 数据库助手开启后

AI 可以：

* 查询数据库。
* 查视图、主键、镜像、映射。
* 修改视图布局、排序、分组。
* 继续使用现有数据库行、列、单元格工具。

AI 不能：

* 删除数据库。
* 清理 unused AV。
* 整库批量替换。
* 编造 rowId/keyId。

### 16.4 笔记本与文档树管理开启后

AI 可以：

* 列出笔记本。
* 创建、打开、关闭、重命名笔记本。
* 查看笔记本配置。
* 列出文档树。
* 移动、复制、排序文档树节点。
* 解析 docId/path/hpath。

AI 不能：

* 处理具体正文编辑。
* 重复创建文档工具。
* 绕过已有 `create_doc`、`rename_doc`、`delete_doc` 的边界。

### 16.5 标签、书签与大纲开启后

AI 可以：

* 查看标签。
* 搜索标签。
* 重命名和删除标签。
* 查看书签。
* 重命名和删除书签。
* 查看文档大纲。

AI 不能：

* 修改正文。
* 批量删除标签/书签而不确认。

### 16.6 资产管理开启后

AI 可以：

* 查看文档资源。
* 查看未使用和缺失资源。
* 查看资源 OCR/标注。
* 重命名资源。
* 设置 OCR/标注。
* 删除未使用资源。
* 操作白名单下的工作区文件。

AI 不能：

* 任意访问系统路径。
* 操作其他插件 storage。
* 访问敏感配置目录。
* 使用全局文件复制 API。

### 16.7 闪卡复习开启后

AI 可以：

* 查看 deck。
* 重命名/删除 deck。
* 查看待复习卡片。
* 查看树/笔记本下卡片。
* 添加/删除卡片。
* 复习/跳过卡片。
* 重置卡片。
* 设置到期时间。

AI 不能：

* 编造 cardID/deckID。
* 未读取卡片就声称复习完成。
* 用户取消后继续修改复习状态。

---

## 17. 验收标准

开发完成后必须满足以下验收标准：

### 17.1 构建与类型

必须运行：

```bash
pnpm build
pnpm lint
pnpm exec tsc --noEmit
```

如果某条失败，必须说明失败原因和是否与本次修改有关。

### 17.2 Skill 设置

1. 新增 4 个内置 Skill 能在设置页显示。
2. 新 Skill 默认关闭。
3. 开启后对应工具注册。
4. 关闭后对应工具不注册。
5. 旧用户加载设置后，新 Skill 默认关闭，但用户开启后不会被下次加载重新关闭。

### 17.3 工具注册

1. 不重复注册同名工具。
2. `siyuan_outline` 被多个 Skill 需要时只注册一次。
3. 全局工具目录不出现这些 Skill 工具。
4. 关闭 Skill 后，工具设置页不显示该 Skill 工具。

### 17.4 写入确认

以下工具必须触发确认：

* `siyuan_block_attr` 的 set/batch_set
* `siyuan_block_ref` 的 swap/transfer
* `siyuan_block_state`
* `siyuan_doc_transform`
* `siyuan_database_view`
* `siyuan_notebook_manage` 写 action
* `siyuan_doc_tree` 写 action
* `siyuan_tag_manage` rename/remove
* `siyuan_bookmark_manage` rename/remove
* `siyuan_asset_manage`
* `siyuan_workspace_file` 写 action
* `siyuan_riff_deck` rename/remove
* `siyuan_riff_card` 写 action

确认弹窗必须展示具体 action、目标和风险，不得只显示工具名。

### 17.5 只读工具

只读工具不需要确认，但必须返回结构化数据：

* `siyuan_outline`
* `siyuan_ref` 只读 action
* `siyuan_search_extra`
* `siyuan_sql_select`
* `siyuan_block_read`
* `siyuan_database_extra_read`
* `siyuan_doc_path`
* `siyuan_asset_read`
* `siyuan_riff_deck.list`
* `siyuan_riff_card` 查询 action

### 17.6 安全边界

1. `siyuan_sql_select` 不能执行写 SQL。
2. `siyuan_workspace_file` 不能访问白名单之外路径。
3. 资产管理不能操作系统任意路径。
4. 不新增通用 `/api/*` 执行器。
5. 不新增账号、token、同步密钥、repo purge 等高风险 API。
6. 不泄漏 API Key、token、Authorization、Cookie。

### 17.7 输出截断

以下场景必须截断：

* SQL 返回很多行。
* 搜索返回很多结果。
* 资源内容很长。
* DOM/Kramdown 很长。
* 大纲很大。
* 闪卡列表很多。
* 文档树很大。

### 17.8 Debug

`window.__kbAgentDebug("all")` 中可以看到新增工具执行事件和失败事件，但不包含敏感数据。

### 17.9 不回退旧功能

必须确认：

1. 原 `read_docs` 正常。
2. 原 `get_doc_info` 正常。
3. 原知识库检索正常。
4. 原强化日记正常。
5. 原数据库工具正常。
6. 原文档编辑工具正常。
7. MCP Client 正常。
8. HTTP GET/POST 工具正常。
9. API Key 加密保护正常。

---

## 18. Codex 开发输出要求

Codex 完成后必须输出：

1. 修改了哪些文件。
2. 新增了哪些 Skill。
3. 新增了哪些工具。
4. 每个工具属于哪个 Skill。
5. 哪些工具只读，哪些工具写入。
6. 写入确认 preview 是否补充。
7. 哪些 API 明确不做，为什么不做。
8. 是否影响旧用户设置。
9. 是否污染全局样式。
10. `pnpm build`、`pnpm lint`、`pnpm exec tsc --noEmit` 是否通过。

不要输出开发进度表。开发进度表是给用户看的，不是 Codex 输出内容。

---

## 19. 最终边界总结

本次开发只补齐 AI 管理笔记所需的思源 API 能力：

* 检索
* 引用
* 大纲
* 块结构
* 块属性
* 文档树
* 笔记本
* 标签
* 书签
* 资产
* 受限工作区文件
* 数据库辅助读取/视图管理
* 闪卡复习

本次明确不做：

* 模板、导入、导出
* 历史、快照、同步
* 系统设置和前端 UI 辅助
* Bazaar
* 账号和安全配置
* 任意 API 执行器
* 任意系统文件访问
* repo purge/reset/rollback/checkout
* 同步密钥、token、S3/WebDAV 配置

如果某个官方 API 不在本方案白名单中，Codex 不得自行加进去。确实发现必须新增时，只能在最终说明中提出建议，不能擅自实现。

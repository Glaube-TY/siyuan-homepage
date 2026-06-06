# 日程 / 任务 / 日记综合 Skill 实现方案

## 1. 功能定位

本功能是 Agent Workbench 的一个内置综合 Skill，目标是让 AI 能围绕思源主页插件已有的任务、日记、快速记录、复盘和计划承接能力进行问答。

它不是新的任务数据库，也不是新的日记系统。
它应复用当前主页插件已有实现：

* Tasks Plus 任务格式；
* 强化日记工作台；
* 思源原生日记文档；
* 快速记录；
* 日 / 周 / 月 / 年复盘；
* 计划承接；
* 任务迁移提示；
* 项目聚合状态。

第一阶段只做**只读问答**，不做写入、修改、删除、迁移、完成任务等操作。

## 2. 第一铁律边界

继续遵守 Agent Workbench 第一铁律：

* Workbench 只是通用 Agent Harness。
* Planner 才是唯一业务决策者。
* Tool 是全局独立能力，只负责校验参数、执行动作、返回 JSON observation。
* Skill 是中文能力说明包，只说明如何使用能力，不能拥有工具、绑定工具、规定固定流程。
* 不允许 Workbench 写死“用户问今天任务 → 代码自动查任务 → 自动读日记 → 自动回答”的固定流程。
* 工具 observation 只用于本轮，不进入后续历史上下文。
* 历史上下文只保留问答结果、阶段摘要、grounded reference 元信息等。
* 该功能不能把任务、日记、记录正文偷偷塞进 conversationContext。
* 需要正文或详情时，由 Planner 调用工具读取。

## 3. 和现有代码的关系

当前代码里已有可复用能力：

### 3.1 Tasks Plus

相关文件：

```text
src/components/utils/widgetBlock/widget/tasksPlus/tasksPlusParser.ts
src/components/utils/widgetBlock/widget/tasksPlus/tasksPlus.ts
```

已有能力：

* `parseTaskLine`
* `generateTaskLine`
* `isTaskCompleted`
* `extractTaskTags`
* `gettasksList`
* `formatTasksList`
* `customFilterTasks`

Tasks Plus 支持的任务结构包括任务名、优先级、开始日期、截止日期、周期循环、提醒时间、地点和标签等。任务筛选语法也已经支持 done / not done、start、deadline、priority、recurrence、location、tag、reminder、name、notebook、path 等条件。([blog.glaube-ty.top][1])

### 3.2 强化日记工作台

相关文件：

```text
src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc.ts
src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig.ts
src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes.ts
src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryWorkspaceSections.ts
src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceData.ts
src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService.ts
src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService.ts
src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceNotifications.ts
src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceCarryover.ts
src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceReviewHistory.ts
```

已有能力：

* 获取某天日记文档；
* 读取日记 Markdown；
* 加载强化日记配置；
* 构建某天工作台状态；
* 查询工作台任务；
* 查询快速记录；
* 查询历史记录；
* 构建项目健康状态；
* 构建通知；
* 构建复盘卡片；
* 构建计划承接。

强化日记的日模板包括 `任务管理`、`新建任务`、`迁移任务`、`任务动态`、`快速记录`、`今日复盘` 等结构；快速记录下面的分类不是固定模板，而是根据日记文档中实际三级标题读取。([blog.glaube-ty.top][2])

## 4. 第一阶段工具设计

第一阶段建议新增 4 个只读工具。

### 4.1 `get_daily_workspace_overview`

用途：获取某一天的日记工作台概览。

参数建议：

```ts
{
  date?: string; // YYYY-MM-DD，默认 runtimeNow 当天
  include?: Array<"summary" | "tasks" | "records" | "projects" | "notifications" | "reviews" | "carryover">;
}
```

内部复用：

```ts
loadEnhancedDiaryWorkspaceState(plugin, { date })
```

返回内容：

* date；
* todayDiary 是否存在；
* todayDiary docId / title；
* templateValid；
* summary；
* tasks 简要列表；
* records 简要列表；
* projects 简要列表；
* notifications；
* reviewCards；
* carryoverPlans。

边界：

* 只读；
* 不创建今日日记；
* 不写入任务；
* 不迁移任务；
* 不修改记录；
* 不自动补模板；
* 返回内容已做数量和字符预算保护：tasks 最多 20，records 最多 10，projects 最多 10，notifications 最多 20，reviews 最多 10，carryoverPlans 最多 8。超出时 `limits` / `counts`（total / returned / truncated）/ `note` 会提示 Planner 结果已被截断，如需更多细节可继续缩小范围或读取文档。

### 4.2 `query_tasks`

用途：查询 Tasks Plus / 强化日记任务。

参数建议：

```ts
{
  scope?: "all" | "today" | "overdue" | "upcoming" | "completed" | "open";
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: "done" | "not_done" | "any";
  keyword?: string;
  tags?: string[];
  priority?: number[];
  limit?: number;
}
```

内部复用：

* `loadEnhancedDiaryConfig`
* `queryWorkspaceTasks`
* `parseTaskLine`
* 必要时复用 `customFilterTasks`，但不要把自然语言直接拼进自定义筛选语句。

返回内容：

```ts
{
  tasks: [
    {
      taskId,
      blockId,
      taskname,
      completed,
      priority,
      startDate,
      deadline,
      recurrence,
      reminder,
      location,
      tags,
      sourceKind,
      sourceDate,
      sourceDocId,
      sourceDocTitle,
      hpath,
      isTodayTask,
      isOverdue,
      shouldMigrate,
      markdown
    }
  ]
}
```

边界：

* 只读；
* 不修改任务完成状态；
* 不生成新任务；
* 不迁移任务；
* 不自动刷新循环任务；
* 不自动解释为“今天任务”之外的固定流程，由 Planner 根据用户问题选择参数；
* limit 默认 30，最大 50；task markdown 默认截断 500 字，避免单条 observation 撑爆 prompt。

### 4.3 `query_diary_records`

用途：查询日记快速记录。

参数建议：

```ts
{
  date?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  keyword?: string;
  limit?: number;
}
```

内部复用：

* `queryTodayQuickRecords`
* `queryQuickRecordsInDateRange`
* `getDiaryDocumentForDate`

返回内容：

```ts
{
  records: [
    {
      recordId,
      date,
      docId,
      docTitle,
      categoryTitle,
      headingTitle,
      timeText,
      content,
      headingBlockId
    }
  ]
}
```

边界：

* 只读；
* 不新增快速记录；
* 不删除记录；
* 不修改记录；
* 不转任务；
* 默认最多查最近 90 天，沿用现有 `queryQuickRecordsInDateRange` 的限制；
* limit 默认 30，最大 50；record content 默认截断 700 字。

### 4.4 `find_diary_docs`

用途：按日期或周期定位日记 / 周记 / 月记 / 年记文档。

参数建议：

```ts
{
  period?: "day" | "week" | "month" | "year";
  date?: string;
  startDate?: string;
  endDate?: string;
  includeMarkdown?: boolean;
  maxChars?: number;
}
```

第一阶段建议 `includeMarkdown` 默认为 false。
如果需要正文，Planner 可以拿到 docId 后调用已有 `read_docs`。

内部复用：

* `getDiaryDocumentForDate`
* `getPeriodContext`
* `buildWorkspaceReviewHistory`
* `readDiaryMarkdown`

返回内容：

```ts
{
  docs: [
    {
      period,
      date,
      docId,
      title,
      exists,
      range,
      status,
      markdownPreview?
    }
  ]
}
```

边界：

* 只读；
* 不创建日记；
* 不补模板；
* 不标记完成；
* 不跳过复盘；
* `includeMarkdown` 默认为 false；
* 范围查询（startDate/endDate）时即使 `includeMarkdown=true` 也会强制不返回正文预览，并在 warnings/note 中提示 Planner 用 docId 调用 `read_docs` 获取正文；
* 单日/单周期查询允许 `includeMarkdown=true`，但 maxChars 最大 5000，防止批量读取撑爆 prompt；
* 本工具只负责定位，不负责批量返回正文详情。

## 5. 工具 observation 输出预算

为避免单条 observation 撑爆本轮 prompt，所有日程/任务/日记工具已做以下预算保护：

| 工具 | 字段 | 默认上限 | 最大上限 | 截断长度 |
|---|---|---|---|---|
| `get_daily_workspace_overview` | tasks | 20 | 20 | — |
| | records | 10 | 10 | — |
| | projects | 10 | 10 | — |
| | notifications | 20 | 20 | — |
| | reviews | 10 | 10 | — |
| | carryoverPlans | 8 | 8 | content 700 字 |
| `query_tasks` | tasks | 30 | 50 | markdown 500 字 |
| `query_diary_records` | records | 30 | 50 | content 700 字 |
| `find_diary_docs` | docs | — | 100 | 范围查询不返回正文；单日 maxChars 5000 |

各类工具的截断提示方式不同：

* **概览工具** `get_daily_workspace_overview` 返回 `limits`（各类型上限）+ `counts`（各类型 total / returned / truncated）+ `note`；
* **查询类工具** `query_tasks`、`query_diary_records` 返回 `totalMatched / returned / note`；
* **定位工具** `find_diary_docs` 返回 `returned / totalChecked / warnings / note`。

Planner 可根据 `truncated=true` 或 `returned < totalMatched` 决定是否继续调用细分工具或读取单篇正文，但 Workbench 不会自动调用下一步。如需更多细节，Planner 应自主缩小参数范围或调用 `read_docs`。

## 6. 是否需要“日程”工具

第一阶段不建议单独做 `calendar` 工具。
原因是当前插件里的“日程”本质主要来自：

* 任务开始日期 / 截止日期；
* 任务提醒时间；
* 复盘提醒窗口；
* 计划承接；
* 日记工作台日历详情。

所以第一阶段可以把“日程”能力包含在：

```text
get_daily_workspace_overview
query_tasks
find_diary_docs
```

后面如果要做更明确的“日程视图”，再加：

```text
query_schedule_items
```

它可以聚合：

* 今日任务；
* 明日任务；
* 逾期任务；
* 提醒任务；
* 复盘提醒；
* 计划承接；
* 日记是否完成。

但第一阶段先不加，避免工具过多。

## 7. Skill 设计

新增内置 Skill：

```text
builtin_schedule_task_diary
```

标题：

```text
日程、任务与日记助手
```

Skill 不是工具集合，也不绑定工具。
它只告诉 Planner：

* 可以围绕任务、日记、记录、复盘、计划承接回答问题；
* 遇到“今天、昨天、明天、本周、最近”等相对时间，应参考 `conversationContext.currentTurn.runtimeNow`；
* 若用户问任务，可考虑使用任务查询工具；
* 若用户问日记、快速记录、复盘，可考虑使用日记/记录工具；
* 若需要正文详情，可先定位日记文档，再用 `read_docs`；
* 工具返回的 blockId / docId 才是可信来源；
* 不要编造任务或日记；
* 不要自动写入或修改。

Skill 禁止写成固定步骤：

```text
用户问今天任务 → 必须调用 A → 必须调用 B → 必须回答 C
```

只能写成能力使用建议。

## 8. 引用规则

新增 sourceType：

```ts
sourceType: "siyuan_task" | "siyuan_diary_record" | "siyuan_diary_doc"
```

或先复用 `siyuan_doc`，但建议逐步扩展。

任务引用可以显示：

```text
任务：xxx · 来自 2026-06-06 日记
```

快速记录引用可以显示：

```text
快速记录：论文想法 · 2026-06-06
```

日记文档引用可以显示：

```text
今日日记 2026-06-06
```

第一阶段可先让工具返回 `docId` / `blockId`，并纳入 grounding evidence。
底部参考资料仍只显示 Planner 在 final answer.references 中显式列出的 grounded references，不自动追加。

## 9. 上下文关系

这些工具返回的 observation 不进入后续 conversationContext。

conversationContext 只保留：

* 当前运行时间 runtimeNow；
* 最近问答；
* 阶段摘要；
* grounded reference 元信息；
* scope 元信息。

日记任务工具返回的完整结果只在本轮可见。
如果后续还需要，Planner 应重新调用工具。

阶段摘要可以轻量记录：

```text
用户刚才围绕今天任务和某日日记做过讨论。
```

但不要把任务列表、记录正文批量塞进 stageSummary。

## 10. 第一阶段不做的事情

暂不做：

* 创建任务；
* 修改任务；
* 完成任务；
* 迁移任务；
* 删除任务；
* 新增快速记录；
* 修改快速记录；
* 删除快速记录；
* 写今日复盘；
* 创建今日日记；
* 补模板；
* 标记日记完成；
* 跳过复盘；
* 系统级提醒；
* 自动刷新循环任务。

这些都属于写操作或副作用操作。
后续要做时必须加权限确认 / 二次确认 / 操作预览。

## 11. 建议开发步骤

### Step 1：文档方案落地

新增：

```text
docs/notebrain/04-schedule-task-diary-skill-plan.md
```

写入本方案。

### Step 2：只读工具封装

新增目录：

```text
src/features/kb/services/agent-workbench/tools/siyuan-agenda/
```

或放在现有 siyuan tools 下：

```text
src/features/kb/services/agent-workbench/tools/siyuan/
```

建议工具：

```text
get_daily_workspace_overview
query_tasks
query_diary_records
find_diary_docs
```

每个工具仍然按现有结构拆：

```text
contracts/*.contract.ts
impl/*.impl.ts
*.tool.ts
```

### Step 3：注册工具

在 `create-agent-workbench.ts` 中注册新工具。
依赖应通过 deps 注入，避免直接拿全局状态。

### Step 4：新增 Skill

新增：

```text
src/features/kb/services/agent-workbench/skills/builtin/schedule-task-diary.skill.ts
```

并在：

```text
skill-catalog.ts
create-agent-workbench.ts
```

注册。

### Step 5：引用 grounding

让工具输出中的 docId / blockId / taskId / recordId 可以被 `reference-collector` 识别为 grounding evidence。

第一阶段如果引用显示暂时只支持 docId，也可以先保证日记 docId 可引用；task/record blockId 细化到下一步。

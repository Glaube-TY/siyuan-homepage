/**
 * Skill 工具目录（只读 UI 元数据）
 *
 * 仅用于设置页 UI 展示，不参与 ToolRegistry / provider manifest / Runtime 决策。
 * 按内置 Skill 分类展示所有内置工具的中文名称和简介。
 * `name` 字段仅作为内部设置 key 使用，不在 UI 展示。
 */

export type BuiltinSkillToolCategoryId =
  | "knowledge_base"
  | "schedule_task_diary"
  | "database_assistant"
  | "doc_content_editing";

/** 内部工具名（仅作为设置 key，UI 不显示） */
export type SkillToolName =
  | "list_knowledge_map"
  | "search_scope"
  | "list_items_by_time"
  | "get_daily_workspace_overview"
  | "query_tasks"
  | "query_diary_records"
  | "find_diary_docs"
  | "manage_diary_structure"
  | "manage_diary_task"
  | "manage_diary_record"
  | "manage_diary_review"
  | "list_attribute_views"
  | "read_attribute_view"
  | "find_attribute_view_rows"
  | "update_attribute_view_cell"
  | "add_attribute_view_rows"
  | "add_attribute_view_key"
  | "remove_attribute_view_key"
  | "remove_attribute_view_rows"
  | "clear_attribute_view_cell"
  | "read_doc_blocks"
  | "create_doc"
  | "update_block"
  | "insert_block"
  | "delete_blocks"
  | "move_block"
  | "rename_doc"
  | "delete_doc"
  | "replace_doc_content";

export interface SkillToolCatalogItem {
  /** 内部工具名（仅作设置 key，UI 不显示） */
  name: SkillToolName;
  /** 中文名称（UI 显示） */
  title: string;
  /** 中文简介（UI 显示） */
  description: string;
  readOnly: boolean;
  canWrite?: boolean;
  requiresConfirmation?: boolean;
}

export interface SkillToolCatalogCategory {
  id: BuiltinSkillToolCategoryId;
  /** 分类中文名称 */
  title: string;
  /** 分类说明 */
  description: string;
  tools: SkillToolCatalogItem[];
}

export const skillToolCatalog: SkillToolCatalogCategory[] = [
  {
    id: "knowledge_base",
    title: "知识库检索",
    description: "查看知识结构、搜索并定位资料。",
    tools: [
      {
        name: "list_knowledge_map",
        title: "查看知识结构",
        description: "查看笔记本、文档树、子文档和局部结构，帮助定位资料位置。",
        readOnly: true,
      },
      {
        name: "search_scope",
        title: "搜索知识库",
        description: "按关键词查找候选资料，返回标题、路径、预览和真实文档标识。",
        readOnly: true,
      },
      {
        name: "list_items_by_time",
        title: "查看文档与内容块时间列表",
        description: "按创建时间或更新时间列出当前范围内的文档或内容块，支持 blockTypes 过滤，帮助了解最近新增或修改的笔记。",
        readOnly: true,
      },
    ],
  },
  {
    id: "schedule_task_diary",
    title: "强化日记助手",
    description: "围绕任务、日记、快速记录、复盘做查询与受控写入。",
    tools: [
      {
        name: "get_daily_workspace_overview",
        title: "查看日记工作台概览",
        description: "查看某一天的摘要、任务、快速记录、项目、通知、复盘和计划承接信息。",
        readOnly: true,
      },
      {
        name: "query_tasks",
        title: "查询任务",
        description: "按日期、状态、关键词、标签或优先级查询任务信息。",
        readOnly: true,
      },
      {
        name: "query_diary_records",
        title: "查询快速记录",
        description: "查询某天或日期范围内的日记快速记录。",
        readOnly: true,
      },
      {
        name: "find_diary_docs",
        title: "定位日记文档",
        description: "按日、周、月、年定位对应的日记、周记、月记或年记文档。",
        readOnly: true,
      },
      {
        name: "manage_diary_structure",
        title: "管理日记结构",
        description: "统一管理日记结构：确保今日日记存在、补充日/周/月/年模板。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "manage_diary_task",
        title: "管理日记任务",
        description: "统一管理日记任务：新增、迁移、修改状态、更新字段、推迟、删除。blockId/taskId 必须来自 query_tasks 返回。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "manage_diary_record",
        title: "管理快速记录",
        description: "统一管理快速记录：新增、修改、删除。recordId/headingBlockId 必须来自 query_diary_records 返回。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "manage_diary_review",
        title: "管理复盘内容",
        description: "统一管理复盘：保存复盘字段、标记完成/未完成、跳过/恢复。docId 必须来自 find_diary_docs 返回。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
    ],
  },
  {
    id: "database_assistant",
    title: "数据库助手",
    description: "查询和操作思源数据库/属性视图，并执行受控写入。",
    tools: [
      {
        name: "list_attribute_views",
        title: "查找数据库",
        description: "搜索和列出数据库候选，帮助获取真实 databaseId。",
        readOnly: true,
      },
      {
        name: "read_attribute_view",
        title: "读取数据库",
        description: "读取数据库字段、视图和有限条目摘要，区分 databaseId、viewId、keyId 和 rowId。",
        readOnly: true,
      },
      {
        name: "find_attribute_view_rows",
        title: "查找数据库条目",
        description: "按关键词或字段条件查找条目，返回真实 rowId 和字段摘要。",
        readOnly: true,
      },
      {
        name: "update_attribute_view_cell",
        title: "更新数据库单元格",
        description: "在确认后用真实 databaseId、rowId 和 keyId 更新单元格。支持单个或批量更新（最多 20 项）。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "add_attribute_view_rows",
        title: "添加条目到数据库",
        description: "在确认后将已有块加入数据库，或添加少量脱离块条目。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "add_attribute_view_key",
        title: "新增数据库字段",
        description: "在确认后新增一个数据库字段，字段名重复时拒绝。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "remove_attribute_view_key",
        title: "删除数据库字段",
        description: "在确认后删除一个数据库字段及其所有值。主字段不允许删除。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "remove_attribute_view_rows",
        title: "删除数据库条目",
        description: "在确认后删除一个或多个数据库条目。一次最多删除 20 行。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "clear_attribute_view_cell",
        title: "清空数据库单元格",
        description: "在确认后清空指定单元格的值。block 主字段不允许清空。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
    ],
  },
  {
    id: "doc_content_editing",
    title: "文档编辑",
    description: "根据真实标识进行文档级和块级内容编辑。",
    tools: [
      {
        name: "read_doc_blocks",
        title: "读取文档块",
        description: "按块查看文档内容、子块、同级邻近块或文档顶层块。",
        readOnly: true,
      },
      {
        name: "create_doc",
        title: "创建文档",
        description: "在指定笔记本路径下创建新文档。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "update_block",
        title: "更新块内容",
        description: "替换指定内容块的 Markdown 内容。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "insert_block",
        title: "插入内容块",
        description: "在指定块前后或作为子块插入 Markdown 内容。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "delete_blocks",
        title: "删除内容块",
        description: "删除一个或多个内容块。单块删除传入单元素数组，多块删除传入多个 blockId。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "move_block",
        title: "移动内容块",
        description: "将指定内容块移动到新的相邻或父级位置。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "rename_doc",
        title: "重命名文档",
        description: "修改指定文档标题。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "delete_doc",
        title: "删除文档",
        description: "删除指定文档。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
      {
        name: "replace_doc_content",
        title: "替换文档正文",
        description: "整体替换指定文档正文内容。",
        readOnly: false,
        canWrite: true,
        requiresConfirmation: true,
      },
    ],
  },
];

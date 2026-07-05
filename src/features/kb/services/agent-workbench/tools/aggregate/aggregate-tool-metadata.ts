export type AggregateToolName =
  | "siyuan_kb"
  | "diary_task"
  | "siyuan_database"
  | "siyuan_doc_edit"
  | "siyuan_tree"
  | "siyuan_meta"
  | "siyuan_asset"
  | "siyuan_riff"
  | "skill_manage"
  | "mcp_manage"
  | "notebrain_file"
  | "web_fetch"
  | "edit_global_memory"
  | "agent_tool_help";

export interface AggregateActionMeta {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  required?: string[];
  boundary?: string;
  /** 帮助信息：该 action 的 args JSON Schema，仅用于 agent_tool_help.describe_action。 */
  argsSchema?: unknown;
  /** 帮助信息：该 action 的调用示例，仅用于 agent_tool_help.describe_action。 */
  examples?: unknown[];
  /** 帮助信息：额外使用限制说明，仅用于 agent_tool_help.describe_action。 */
  notes?: string[];
}

export interface AggregateToolMeta {
  name: AggregateToolName;
  title: string;
  description: string;
  readOnly: boolean;
  requiresConfirmation?: boolean;
  boundary: string;
  actions: AggregateActionMeta[];
  /** 帮助信息：顶层工具的 args JSON Schema，仅用于 agent_tool_help.describe_tool。 */
  argsSchema?: unknown;
  /** 帮助信息：顶层工具的调用示例，仅用于 agent_tool_help.describe_tool。 */
  examples?: unknown[];
  /** 帮助信息：额外使用限制说明，仅用于 agent_tool_help.describe_tool。 */
  notes?: string[];
  /** 帮助信息：顶层工具的输入提示，仅用于 agent_tool_help.describe_tool。 */
  inputHint?: string;
}

const DATABASE_ID_NOTES = [
  "databaseId、rowId、keyId、viewID 必须来自 list/read/find_rows/extra_read 的真实结果。",
  "不要用字段名、行号、标题或自然语言描述代替 keyId/rowId。",
  "写操作前先调用 read 或 find_rows 获取真实 ID，再提交写入。",
];

export const AGGREGATE_TOOL_CATALOG: AggregateToolMeta[] = [
  {
    name: "siyuan_kb",
    title: "思源知识库",
    description: "搜索、读取和分析思源知识库资料。",
    readOnly: true,
    boundary: "只读工具。搜索结果只是候选证据，回答前应读取正文或明确说明限制；不得使用公开 SQL 查询正文全文。",
    actions: [
      {
        name: "search",
        title: "搜索知识库",
        description: "按关键词查找候选资料，返回标题、路径、预览和真实文档标识。",
        readOnly: true,
        required: ["query"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", description: "搜索关键词。" },
            limit: { type: "integer", minimum: 1, maximum: 50, description: "返回数量上限，默认 20。" },
          },
          required: ["query"],
        },
        examples: [
          { action: "search", args: { query: "机器学习", limit: 10 } },
        ],
      },
      {
        name: "read_docs",
        title: "读取文档正文",
        description: "读取指定文档或内容块正文，作为回答证据。",
        readOnly: true,
        required: ["docIds 或 blockIds"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            docIds: { type: "array", items: { type: "string" }, description: "文档 ID 数组，与 blockIds 至少选其一。" },
            blockIds: { type: "array", items: { type: "string" }, description: "块 ID 数组，与 docIds 至少选其一。" },
            chunkIndex: { type: "integer", minimum: 1, description: "长文分块序号，默认 1。" },
            chunkChars: { type: "integer", minimum: 1000, description: "每块最大字符数，默认 12000。" },
            chunkCount: { type: "integer", minimum: 1, maximum: 10, description: "一次返回块数，默认 1。" },
          },
          required: [],
        },
        examples: [
          { action: "read_docs", args: { docIds: ["真实文档ID"], chunkIndex: 1 } },
          { action: "read_docs", args: { blockIds: ["真实块ID"], chunkChars: 8000 } },
        ],
        notes: ["docIds 和 blockIds 至少提供一个；ID 必须来自 search/get_doc_info/list_map 等结果，不能编造。"],
      },
      {
        name: "get_doc_info",
        title: "查看文档信息",
        description: "查看文档标题、路径、笔记本、时间和标签等元信息。",
        readOnly: true,
        required: ["docId"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            docId: { type: "string", description: "文档 ID。" },
          },
          required: ["docId"],
        },
        examples: [
          { action: "get_doc_info", args: { docId: "真实文档ID" } },
        ],
      },
      {
        name: "list_map",
        title: "查看知识结构",
        description: "查看笔记本、文档树、子文档和局部结构。",
        readOnly: true,
        examples: [
          { action: "list_map", args: { view: "notebooks" } },
          { action: "list_map", args: { view: "notebook_roots", notebookId: "真实notebookId", limit: 50 } },
          { action: "list_map", args: { view: "children", rootDocId: "真实docId", limit: 50 } },
          { action: "list_map", args: { view: "subtree", rootDocId: "真实docId", maxDepth: 2, limit: 100 } },
          { action: "list_map", args: { view: "neighborhood", centerDocId: "真实docId", limit: 50 } },
        ],
        notes: [
          "view 可选值：notebooks / notebook_roots / children / subtree / neighborhood / list。",
          "children/subtree 需要 rootDocId。",
          "neighborhood 需要 centerDocId。",
          "notebook_roots 可选 notebookId；不传时按当前作用域列出根文档。",
          "cursor 只能使用上一次结果返回的 nextCursor，不要编造。",
          "结构结果只表示位置，不是正文证据；需要正文时继续用 read_docs。",
        ],
      },
      {
        name: "list_by_time",
        title: "按时间列出资料",
        description: "按创建或更新时间列出范围内文档或内容块。",
        readOnly: true,
        required: ["itemType"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            itemType: { type: "string", enum: ["doc", "block"], description: "列出对象类型：doc（文档）或 block（内容块）。" },
            sortBy: { type: "string", enum: ["updated", "created"], description: "排序字段，默认 updated。" },
            order: { type: "string", enum: ["desc", "asc"], description: "排序方向，默认 desc。" },
            limit: { type: "integer", minimum: 1, maximum: 100, description: "返回数量上限，默认 20。" },
            startTime: { type: "string", description: "起始时间，可用 YYYY-MM-DD 或 YYYYMMDDHHmmss。" },
            endTime: { type: "string", description: "截止时间，可用 YYYY-MM-DD 或 YYYYMMDDHHmmss。" },
            blockTypes: { type: "array", items: { type: "string" }, description: "仅 itemType='block' 时可用，如 [\"p\",\"h\"]。" },
          },
          required: ["itemType"],
        },
        examples: [
          { action: "list_by_time", args: { itemType: "doc", sortBy: "updated", order: "desc", limit: 20 } },
          { action: "list_by_time", args: { itemType: "block", sortBy: "created", order: "desc", limit: 20, blockTypes: ["p", "h"] } },
        ],
        notes: [
          "不支持 notebookId 参数，范围由当前聊天作用域控制。",
          "itemType='doc' 时不要传 blockTypes。",
        ],
      },
      {
        name: "outline",
        title: "查看文档大纲",
        description: "读取文档标题结构，不等同于正文证据。",
        readOnly: true,
        required: ["docId"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            docId: { type: "string", description: "文档 ID。" },
            depth: { type: "integer", minimum: 1, maximum: 6, description: "大纲深度，默认 3。" },
          },
          required: ["docId"],
        },
        examples: [
          { action: "outline", args: { docId: "真实文档ID", depth: 3 } },
        ],
      },
      {
        name: "refs",
        title: "查找引用与反链",
        description: "查找反链、提及、引用块或刷新反链索引。",
        readOnly: true,
        required: ["action"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["backlink", "backlink_doc", "backmention_doc", "search_ref_block", "refresh_backlink"], description: "引用操作类型。" },
            id: { type: "string", description: "块 ID 或文档 ID，部分操作需要。" },
            docId: { type: "string", description: "文档 ID，部分操作需要。" },
            keyword: { type: "string", description: "search_ref_block 时使用的关键词。" },
            beforeLen: { type: "integer", minimum: 0, maximum: 2000, description: "反链上下文长度，可选。" },
            containChildren: { type: "boolean", description: "是否包含子文档/子块，可选。" },
            maxItems: { type: "integer", minimum: 1, maximum: 500, description: "返回数量上限，可选。" },
          },
          required: ["action"],
        },
        examples: [
          { action: "refs", args: { action: "backlink_doc", docId: "真实文档ID", maxItems: 20 } },
          { action: "refs", args: { action: "backmention_doc", docId: "真实文档ID", maxItems: 20 } },
          { action: "refs", args: { action: "backlink", id: "真实块ID或文档ID", maxItems: 20 } },
          { action: "refs", args: { action: "search_ref_block", keyword: "关键词", id: "真实限定范围ID", maxItems: 20 } },
          { action: "refs", args: { action: "refresh_backlink" } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 refs，内层 args.action 才是 backlink/backlink_doc/backmention_doc/search_ref_block/refresh_backlink。",
          "backlink_doc / backmention_doc 优先使用 docId。",
          "backlink 使用 id，id 可以是真实 blockId 或 docId。",
          "search_ref_block 使用 keyword，id 可作为限定范围。",
          "refresh_backlink 不需要参数，返回 null 或空结果也不代表失败。",
          "不支持 direction/type/blockId/maxResults 参数。",
          "docId/id 应来自搜索、读取或文档信息结果，不能编造。",
        ],
      },
      {
        name: "extra_search",
        title: "特殊检索",
        description: "检索标签、模板、挂件、嵌入块、资源内容和无效引用。",
        readOnly: true,
        required: ["action"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["search_tag", "search_template", "search_widget", "search_embed_block", "get_embed_block", "search_asset", "asset_content", "invalid_block_refs"], description: "特殊检索类型。" },
            keyword: { type: "string", description: "检索关键词，部分类型需要。" },
            id: { type: "string", description: "块/资源 ID，部分类型需要。" },
            path: { type: "string", description: "资源路径，部分类型需要。" },
            page: { type: "integer", minimum: 0, maximum: 1000, description: "分页页码，可选。" },
            maxItems: { type: "integer", minimum: 1, maximum: 500, description: "返回数量上限，可选。" },
            maxChars: { type: "integer", minimum: 100, maximum: 100000, description: "内容最大字符数，可选。" },
          },
          required: ["action"],
        },
        examples: [
          { action: "extra_search", args: { action: "search_tag", keyword: "AI", maxItems: 20 } },
          { action: "extra_search", args: { action: "search_asset", keyword: "png", maxItems: 20 } },
          { action: "extra_search", args: { action: "asset_content", path: "真实资源path", maxChars: 2000 } },
          { action: "extra_search", args: { action: "asset_content", keyword: "关键词", maxChars: 2000 } },
          { action: "extra_search", args: { action: "get_embed_block", id: "真实嵌入块ID" } },
          { action: "extra_search", args: { action: "invalid_block_refs", maxItems: 20 } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 extra_search，内层 args.action 才是特殊检索类型。",
          "search_asset 只搜索资源文件路径/名称，不读取资源内容。",
          "asset_content 才读取资源内容；优先传 path，path 应来自 search_asset 结果；也可传 keyword 做资源内容全文检索。",
          "get_embed_block 必须传真实 id。",
          "invalid_block_refs 不需要 keyword/path/id。",
          "空数组/无命中不等于工具失败，应在报告里标记为“通过但无命中”。",
          "不支持 query/method/type/scope/sql 参数。",
          "不能把它当 SQL 工具使用。",
        ],
      },
    ],
  },
  {
    name: "diary_task",
    title: "日记任务",
    description: "查询和管理强化日记、任务、快速记录与复盘。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "写入任务、记录、复盘或日记结构前必须确认；修改已有对象前应先用查询 action 获取真实 ID，不能编造 taskId、recordId、docId 或 blockId。测试时不得用当天真实日记作为 disposable 清理目标，ensure_today 创建的真实日记文档只能用manage_task/manage_record/delete_blocks 清理其中的块/任务/记录，不能整篇删除。",
    actions: [
      { name: "overview", title: "日记概览", description: "查看某天摘要、任务、记录、项目、复盘和计划承接。", readOnly: true },
      { name: "query_tasks", title: "查询任务", description: "按日期、状态、关键词、标签或优先级查询任务。", readOnly: true },
      { name: "query_records", title: "查询快速记录", description: "查询某天或日期范围内的日记快速记录。", readOnly: true },
      { name: "find_docs", title: "定位日记文档", description: "定位日记、周记、月记或年记文档。", readOnly: true },
      {
        name: "ensure_structure",
        title: "确保日记结构",
        description: "确保今日日记存在（ensure_today）或补充日/周/月/年模板（append_template）。",
        readOnly: false,
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            operation: { type: "string", enum: ["ensure_today", "append_template"], description: "操作类型。" },
            period: { type: "string", enum: ["day", "week", "month", "year"], description: "append_template 必填，模板周期。" },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "append_template 可选，目标日期，默认今天。" },
            docId: { type: "string", description: "append_template 可选，目标日记文档 ID；如提供会校验其是否属于强化日记体系。" },
          },
          required: ["operation"],
          oneOf: [
            { properties: { operation: { const: "ensure_today" } } },
            { properties: { operation: { const: "append_template" } }, required: ["period"] },
          ],
        },
        examples: [
          { action: "ensure_structure", args: { operation: "ensure_today" } },
          { action: "ensure_structure", args: { operation: "append_template", period: "day", date: "2026-07-05" } },
        ],
        notes: [
          "ensure_today：只需 operation，不接受 period/date/docId。",
          "append_template：必须有 period；date/docId 可选，docId 会校验是否为强化日记文档。",
          "append_template 的 docId 必须来自 find_docs 或 ensure_today 的真实结果，不能编造。",
          "模板必须来自强化日记设置，不接受 AI 传入的模板正文。",
        ],
      },
      {
        name: "manage_task",
        title: "管理任务",
        description: "新增、迁移、改状态、更新字段、推迟或删除任务。",
        readOnly: false,
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            operation: {
              type: "string",
              enum: ["create", "migrate", "set_status", "update", "postpone", "delete"],
              description: "操作类型。",
            },
            target: {
              type: "object",
              additionalProperties: false,
              properties: {
                blockId: { type: "string", description: "任务块 ID，与 taskId 至少填其一。" },
                taskId: { type: "string", description: "任务 ID，与 blockId 至少填其一。" },
              },
            },
            task: {
              type: "object",
              additionalProperties: false,
              properties: {
                taskname: { type: "string", description: "任务名称。" },
                priority: { type: "integer", enum: [1, 2, 3, 4], description: "优先级 1-4。" },
                startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "开始日期。" },
                deadline: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "截止日期。" },
                recurrence: { type: "string", description: "重复规则。" },
                reminder: { type: "string", description: "提醒。" },
                location: { type: "string", description: "地点。" },
                tags: { type: "array", items: { type: "string" }, description: "标签列表。" },
              },
            },
            clearFields: { type: "array", items: { type: "string" }, description: "update 时要清空的字段名列表。" },
            completed: { type: "boolean", description: "set_status 必填。" },
            postponeTo: { type: "string", enum: ["tomorrow", "next_week"], description: "postpone 必填。" },
            deleteMode: { type: "string", enum: ["log", "delete"], description: "delete 可选，默认 log。" },
          },
          required: ["operation"],
        },
        examples: [
          { action: "manage_task", args: { operation: "create", task: { taskname: "测试任务" } } },
          { action: "manage_task", args: { operation: "set_status", target: { blockId: "真实blockId" }, completed: true } },
          { action: "manage_task", args: { operation: "delete", target: { taskId: "真实taskId" }, deleteMode: "log" } },
        ],
        notes: [
          "create：必须提供 task.taskname。",
          "migrate / set_status / update / postpone / delete：必须提供 target.blockId 或 target.taskId。",
          "delete 会先通过 query_tasks 范围查找任务，可操作任意查询到的任务；默认 deleteMode=log（记录日志后删除），deleteMode=delete 会直接删除且属高风险。",
          "删除前建议先用 query_tasks 获取真实 ID，并优先使用 deleteMode=log。",
        ],
      },
      { name: "manage_record", title: "管理快速记录", description: "新增、修改或删除快速记录。", readOnly: false },
      {
        name: "manage_review",
        title: "管理复盘",
        description: "保存复盘字段（save_content）或标记复盘状态（set_status）。",
        readOnly: false,
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            operation: { type: "string", enum: ["save_content", "set_status"], description: "操作类型。" },
            docId: { type: "string", description: "目标日记文档 ID。" },
            period: { type: "string", enum: ["day", "week", "month", "year"], description: "复盘周期。" },
            fields: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 100, description: "字段标签。" },
                  content: { type: "string", maxLength: 10000, description: "字段内容。" },
                },
                required: ["label", "content"],
              },
              minItems: 1,
              maxItems: 10,
              description: "save_content 必填，1-10 个字段。",
            },
            status: { type: "string", enum: ["completed", "pending", "skipped"], description: "set_status 必填。" },
          },
          required: ["operation", "docId", "period"],
        },
        examples: [
          { action: "manage_review", args: { operation: "save_content", docId: "真实docId", period: "day", fields: [{ label: "今日成就", content: "..." }] } },
          { action: "manage_review", args: { operation: "set_status", docId: "真实docId", period: "day", status: "completed" } },
        ],
        notes: [
          "只支持 save_content 和 set_status。",
          "save_content 必须提供 fields；set_status 必须提供 status。",
          "docId 必须来自 find_docs 或 ensure_today 的真实结果。",
          "保存复盘前应先确保对应周期模板已存在，必要时用 ensure_structure.append_template 补模板。",
        ],
      },
    ],
  },
  {
    name: "siyuan_database",
    title: "思源数据库",
    description: "查询和操作思源数据库/属性视图。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "写入数据库前必须确认；databaseId、viewId、keyId、rowId 应来自读取或查找结果，不能编造。批量操作应控制数量。",
    actions: [
      { name: "list", title: "列出数据库", description: "搜索和列出数据库候选，获取真实 databaseId。", readOnly: true },
      { name: "read", title: "读取数据库", description: "读取字段、视图和有限条目摘要。", readOnly: true },
      { name: "find_rows", title: "查找条目", description: "按关键词或字段条件查找条目。", readOnly: true },
      {
        name: "update_cell",
        title: "更新单元格",
        description: "更新单个或批量数据库单元格。",
        readOnly: false,
        required: ["databaseId", "rowId/keyId/valueText 或 updates"],
        examples: [
          { action: "update_cell", args: { databaseId: "真实databaseId", rowId: "真实rowId", keyId: "真实keyId", valueText: "新值", expectedFieldName: "字段名" } },
          { action: "update_cell", args: { databaseId: "真实databaseId", updates: [{ rowId: "真实rowId", keyId: "真实keyId", valueText: "新值" }] } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "updates[] 中每一项也必须使用真实 rowId 和 keyId。",
          "expectedFieldName 只能作为防误写校验，不能代替 keyId。",
        ],
      },
      {
        name: "add_rows",
        title: "添加条目",
        description: "将已有块加入数据库，或添加少量脱离块条目。",
        readOnly: false,
        required: ["databaseId", "blockIds 或 detachedRows"],
        examples: [
          { action: "add_rows", args: { databaseId: "真实databaseId", blockIds: ["真实块ID"], defaultValues: { "真实keyId": "默认值" } } },
          { action: "add_rows", args: { databaseId: "真实databaseId", detachedRows: [{ title: "新条目", values: { "真实keyId": "字段值" } }] } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "blockIds 必须是要加入数据库的真实块 ID。",
          "defaultValues 和 detachedRows.values 的键应使用真实 keyId，不要使用字段名。",
          "viewID、groupID、previousID 如需指定，也必须来自 read/extra_read 的真实结果。",
        ],
      },
      {
        name: "add_key",
        title: "新增字段",
        description: "新增数据库字段，字段名重复时拒绝。",
        readOnly: false,
        required: ["databaseId", "keyName", "keyType"],
        examples: [
          { action: "add_key", args: { databaseId: "真实databaseId", keyName: "新字段", keyType: "text" } },
          { action: "add_key", args: { databaseId: "真实databaseId", keyName: "新字段", keyType: "select", previousKeyId: "真实keyId" } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "keyName 是新字段名；previousKeyId 如需指定，必须是 read/extra_read 返回的真实 keyId。",
          "不要把已有字段名当 previousKeyId。",
        ],
      },
      {
        name: "remove_key",
        title: "删除字段",
        description: "删除数据库字段及其所有值；主字段不允许删除。",
        readOnly: false,
        required: ["databaseId", "keyId"],
        examples: [
          { action: "remove_key", args: { databaseId: "真实databaseId", keyId: "真实keyId", expectedKeyName: "字段名" } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "删除字段会移除该字段及其所有值；主字段不允许删除。",
          "expectedKeyName 只能作为防误删校验，不能代替 keyId。",
        ],
      },
      {
        name: "remove_rows",
        title: "删除条目",
        description: "删除一个或多个数据库条目。",
        readOnly: false,
        required: ["databaseId", "rowIds"],
        examples: [
          { action: "remove_rows", args: { databaseId: "真实databaseId", rowIds: ["真实rowId"], expectedTitles: ["条目标题"] } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "rowIds 必须是 read/find_rows 返回的真实 rowId/itemID。",
          "expectedTitles 只能作为防误删校验，不能代替 rowIds。",
        ],
      },
      {
        name: "clear_cell",
        title: "清空单元格",
        description: "清空指定单元格；block 主字段不允许清空。",
        readOnly: false,
        required: ["databaseId", "rowId", "keyId"],
        examples: [
          { action: "clear_cell", args: { databaseId: "真实databaseId", rowId: "真实rowId", keyId: "真实keyId", expectedFieldName: "字段名" } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "rowId 必须是真实 rowId/itemID，keyId 必须是真实字段 ID。",
          "expectedFieldName 只能作为防误清校验，不能代替 keyId。",
        ],
      },
      {
        name: "extra_read",
        title: "读取辅助信息",
        description: "读取视图筛选排序、主键、镜像块、映射和 unused AV。",
        readOnly: true,
        required: ["action"],
        examples: [
          { action: "extra_read", args: { action: "keys_by_av_id", avID: "真实databaseId", maxItems: 50 } },
          { action: "extra_read", args: { action: "filter_sort", avID: "真实databaseId", viewID: "真实viewID" } },
          { action: "extra_read", args: { action: "bound_ids_by_item_ids", avID: "真实databaseId", itemIDs: ["真实rowId"] } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "这里有两层 action：外层 action 固定为 extra_read，内层 args.action 才是辅助读取类型。",
          "avID 等同于真实 databaseId；blockID 必须是真实数据库块 ID。",
          "itemIDs 使用 read/find_rows 返回的真实 rowId/itemID；boundIDs 使用真实绑定块 ID。",
        ],
      },
      {
        name: "view",
        title: "修改数据库视图",
        description: "修改当前视图、字段排序、布局或分组。",
        readOnly: false,
        required: ["action"],
        examples: [
          { action: "view", args: { action: "set_database_block_view", blockID: "真实数据库块ID", viewID: "真实viewID" } },
          { action: "view", args: { action: "sort_key", avID: "真实databaseId", keyID: "真实keyId", previousKeyID: "真实keyId" } },
          { action: "view", args: { action: "change_layout", avID: "真实databaseId", viewID: "真实viewID", layout: "table" } },
        ],
        notes: [
          ...DATABASE_ID_NOTES,
          "这里有两层 action：外层 action 固定为 view，内层 args.action 才是视图修改类型。",
          "avID 等同于真实 databaseId；blockID 必须是真实数据库块 ID。",
          "keyID/previousKeyID 必须是真实 keyId，不要使用字段名。",
          "修改视图前先 read 或 extra_read 获取真实 viewID、keyID 和当前视图结构。",
        ],
      },
    ],
  },
  {
    name: "siyuan_doc_edit",
    title: "思源文档编辑",
    description: "读取块信息，并对文档和内容块执行受控编辑。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "写操作必须确认；编辑前应先读取定位真实 docId/blockId。用户拒绝或工具失败时不得声称已写入。",
    actions: [
      {
        name: "read_blocks",
        title: "读取文档块",
        description: "按块查看文档内容、子块、邻近块或顶层块。",
        readOnly: true,
        required: ["targetId", "scope"],
        examples: [
          { action: "read_blocks", args: { targetId: "真实docId或blockId", scope: "document_top", maxBlocks: 20 } },
        ],
        notes: [
          "targetId 必须是真实 docId 或 blockId，来源应为 search/read_docs/doc_path/get_doc_info 等真实结果。",
          "正确参数是 targetId + scope，不是 id，也不是 blockIds。",
          "scope 只能是 self / children / siblings_window / document_top。",
          "targetId 可以是真实 docId 或 blockId；不要把自然语言标题当作 targetId。",
        ],
      },
      {
        name: "block_read",
        title: "读取块辅助信息",
        description: "读取块 DOM、Kramdown、子块、面包屑、索引和相关 ID。",
        readOnly: true,
        required: ["action"],
        examples: [
          { action: "block_read", args: { action: "info", id: "真实blockId" } },
          { action: "block_read", args: { action: "kramdown", id: "真实blockId" } },
          { action: "block_read", args: { action: "kramdowns", ids: ["真实blockId"] } },
          { action: "block_read", args: { action: "breadcrumb", id: "真实blockId" } },
          { action: "block_read", args: { action: "word_count", id: "真实blockId" } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 block_read，内层 args.action 才是块读取操作类型。",
          "内层 action 可选值：info/dom/doms/dom_with_embed/kramdown/kramdowns/children/tail_children/breadcrumb/index/sibling/relevant_ids/tree_infos/word_count/check_exist/recent_updated。",
          "info/dom/dom_with_embed/kramdown/children/tail_children/breadcrumb/index/sibling/relevant_ids/check_exist 需要 id。",
          "doms/kramdowns/tree_infos 需要 ids。",
          "word_count 可用 id 或 ids。",
          "recent_updated 可不传 id。",
          "读取 id/ids 必须来自 read_blocks、block_read、read_docs 或其他真实工具结果，不要编造。",
        ],
      },
      {
        name: "block_attr",
        title: "管理块属性",
        description: "读取或设置块属性；set/batch_set 为写入。",
        readOnly: false,
        required: ["action"],
        examples: [
          { action: "block_attr", args: { action: "get", id: "真实blockId" } },
          { action: "block_attr", args: { action: "batch_get", ids: ["真实blockId"] } },
          { action: "block_attr", args: { action: "set", id: "真实blockId", attrs: { custom: "value" } } },
          { action: "block_attr", args: { action: "batch_set", items: [{ id: "真实blockId", attrs: { custom: "value" } }] } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 block_attr，内层 args.action 才是块属性操作。",
          "get 需要 id。",
          "batch_get 需要 ids。",
          "set 需要 id + attrs。",
          "batch_set 需要 items。",
          "set/batch_set 是写入，get/batch_get 是只读。",
          "attrs 只能是块属性对象，不要传自然语言说明。",
        ],
      },
      {
        name: "block_ref",
        title: "管理块引用",
        description: "读取块引用信息，或执行引用迁移。",
        readOnly: false,
        required: ["action"],
        examples: [
          { action: "block_ref", args: { action: "get_ref_ids", id: "真实blockId" } },
          { action: "block_ref", args: { action: "get_ref_text", id: "真实blockId" } },
          { action: "block_ref", args: { action: "check_ref", id: "真实blockId" } },
          { action: "block_ref", args: { action: "get_def_ids_by_ref_text", refText: "真实引用锚文本" } },
          { action: "block_ref", args: { action: "swap_ref", id: "真实blockId", refText: "可选新锚文本" } },
          { action: "block_ref", args: { action: "transfer_ref", fromID: "真实来源blockId", toID: "真实目标blockId", refIDs: ["真实引用blockId"] } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 block_ref，内层 args.action 才是引用操作。",
          "get_ref_ids/get_ref_text/check_ref 需要 id。",
          "get_def_ids_by_ref_text 需要 refText。",
          "swap_ref 需要 id，可选 refText。",
          "transfer_ref 需要 fromID + toID + refIDs。",
          "不支持 get 这个内层 action。",
        ],
      },
      {
        name: "block_state",
        title: "修改块状态",
        description: "折叠/展开块、设置提醒、更新任务 marker。",
        readOnly: false,
        required: ["action"],
        examples: [
          { action: "block_state", args: { action: "fold", id: "真实blockId" } },
          { action: "block_state", args: { action: "unfold", id: "真实blockId" } },
          { action: "block_state", args: { action: "set_reminder", id: "真实blockId", reminder: "20260101120000" } },
          { action: "block_state", args: { action: "update_task_marker", id: "真实任务列表项blockId", marker: "x" } },
          { action: "block_state", args: { action: "batch_update_task_marker", ids: ["真实任务列表项blockId"], marker: "x" } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 block_state，内层 args.action 才是块状态操作类型。",
          "不支持 check/toggle。",
          "fold/unfold/set_reminder/update_task_marker 需要 id。",
          "set_reminder 还需要 reminder。",
          "batch_update_task_marker 需要 ids 或 items。",
          "update_task_marker / batch_update_task_marker 只适用于思源内核认可的真实任务列表项块。",
          "update_task_marker 的 id 必须是真实任务列表项块 ID，不是普通段落块；普通块返回 block is not a list item 属于正常失败。",
          "Markdown 插入的 \"- [ ]\" 可能显示为列表样式，但 task marker API 仍可能返回 block is not a list item。",
          "batch_update_task_marker 支持 ids + marker；运行时会转换为当前思源 API 需要的 items 结构。",
          "marker 为 \"x\" 表示完成，\" \" 表示未完成。",
          "若无法获得真实任务列表项，或 API 返回 block is not a list item，应标记为条件未满足/未验证或失败，不得写成通过。",
          "不要为了测试修改用户真实任务；只允许 disposable 测试文档中的任务块。",
        ],
      },
      {
        name: "doc_transform",
        title: "转换文档结构",
        description: "执行文档转标题、标题转文档、列表项转文档等结构转换。",
        readOnly: false,
        required: ["action"],
        examples: [
          { action: "doc_transform", args: { action: "doc_to_heading", path: "真实path", targetPath: "目标path" } },
          { action: "doc_transform", args: { action: "heading_to_doc", id: "真实标题块ID", targetPath: "目标path" } },
          { action: "doc_transform", args: { action: "list_item_to_doc", id: "真实列表项块ID", targetPath: "目标path" } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 doc_transform，内层 args.action 才是转换类型。",
          "只支持 doc_to_heading / heading_to_doc / list_item_to_doc。",
          "不支持 heading_level/get_outline。",
          "doc_to_heading 必须提供 path。",
          "heading_to_doc/list_item_to_doc 需要 id。",
          "转换会改变文档结构，测试时只允许使用 disposable 测试文档。",
          "doc_to_heading 成功后需要重新 read_blocks 或 doc_tree 验证结构变化；不得只凭 API ok:true 声称实际生效。",
          "doc_to_heading 成功后原文档 path 可能失效，验证时必须重新定位结构，不要继续用旧 path 判定失败。",
          "可从根目录 list_children、搜索结果、返回数据或 read_blocks 重新确认转换后的结构。",
        ],
      },
      {
        name: "create_doc",
        title: "创建文档",
        description: "在指定笔记本路径下创建新文档。",
        readOnly: false,
        required: ["notebookId", "path"],
        examples: [
          { action: "create_doc", args: { notebookId: "真实notebookId", path: "/Notebrain-Agent-Test/测试文档", markdown: "# 测试文档\n" } },
        ],
        notes: [
          "create_doc 使用 notebookId，不是 notebook。",
          "notebookId 必须来自 siyuan_tree.notebook 的 list 真实结果。",
          "如果同一轮已经成功拿到 notebookId，后续测试应复用同一个有效 notebookId，不要从失败的路径/旧结果里猜新的 notebookId。",
          "path 必须以 / 开头，表示目标文档路径。",
          "测试只允许创建 disposable 文档，例如 /Notebrain-Agent-Test/ 下的临时测试文档。",
        ],
      },
      {
        name: "update_block",
        title: "更新块内容",
        description: "替换指定内容块的 Markdown 内容。",
        readOnly: false,
        required: ["blockId", "markdown"],
        examples: [
          { action: "update_block", args: { blockId: "真实blockId", markdown: "更新后的测试内容" } },
        ],
        notes: [
          "blockId 必须来自 read_blocks、block_read 或 read_docs 的真实返回。",
          "测试时只能更新 disposable 测试文档中的块，不要修改用户真实资料。",
        ],
      },
      {
        name: "insert_block",
        title: "插入内容块",
        description: "在指定块前后或作为子块插入 Markdown 内容。",
        readOnly: false,
        required: ["referenceBlockId", "position", "markdown"],
        examples: [
          { action: "insert_block", args: { referenceBlockId: "真实blockId", position: "after", markdown: "插入的测试块" } },
          { action: "insert_block", args: { referenceBlockId: "真实blockId", position: "child", markdown: "- 子级测试块" } },
        ],
        notes: [
          "position 只能是 before、after 或 child。",
          "position 只支持 before/after/child。",
          "不支持 first/last/prepend/append/next/previous。",
          "child 只有目标块可容纳子块时才可能成功；leaf block 失败时应改用 before/after，而不是判定工具整体失败。",
          "referenceBlockId 必须来自 read_blocks、block_read 或 read_docs 的真实返回。",
          "测试时只能在 disposable 测试文档中插入块。",
        ],
      },
      {
        name: "delete_blocks",
        title: "删除内容块",
        description: "删除一个或多个内容块。",
        readOnly: false,
        required: ["blockIds"],
        examples: [
          { action: "delete_blocks", args: { blockIds: ["真实测试blockId"] } },
        ],
        notes: [
          "blockIds 必须来自 read_blocks、block_read、read_docs 或写入结果中的真实块 ID。",
          "只允许删除测试中创建的 disposable 块；不要删除用户真实资料。",
        ],
      },
      {
        name: "move_block",
        title: "移动内容块",
        description: "将内容块移动到新的相邻或父级位置。",
        readOnly: false,
        required: ["blockId", "previousID 或 parentID"],
        examples: [
          { action: "move_block", args: { blockId: "真实blockId", previousID: "真实previousID" } },
          { action: "move_block", args: { blockId: "真实blockId", parentID: "真实parentID" } },
        ],
        notes: [
          "没有 position/fromId/toId/action。",
          "只用 blockId + previousID 或 parentID。",
          "previousID 表示移动到该块后面；parentID 表示移动到该块下面。",
          "previousID/parentID 必须来自 read_blocks 的 sibling/parent 真实结果，不能等于 blockId。",
          "heading 块是 leaf block，不能作为 parentID；移动到标题后面应使用 previousID。",
          "不要移动已经删除的块；move 前后都要重新 read_blocks 获取真实 ID。",
          "测试时只允许移动 disposable 测试文档中的测试块。",
        ],
      },
      {
        name: "rename_doc",
        title: "重命名文档",
        description: "修改指定文档标题。",
        readOnly: false,
        required: ["docId", "title"],
        examples: [
          { action: "rename_doc", args: { docId: "真实测试docId", title: "测试文档-重命名" } },
        ],
        notes: [
          "rename_doc 使用 title，不是 name。",
          "docId 必须来自 create_doc、search、doc_path、read_docs 或 get_doc_info 的真实结果。",
          "只允许重命名 disposable 测试文档，不要重命名用户真实资料。",
        ],
      },
      {
        name: "delete_doc",
        title: "删除文档",
        description: "删除指定文档。",
        readOnly: false,
        required: ["docId"],
        examples: [
          { action: "delete_doc", args: { docId: "真实测试docId" } },
        ],
        notes: [
          "高风险操作；docId 必须来自真实工具结果。",
          "只允许删除 disposable 测试文档，不要删除用户真实资料。",
        ],
      },
      {
        name: "replace_doc_content",
        title: "替换文档正文",
        description: "整体替换指定文档正文内容。",
        readOnly: false,
        required: ["docId", "markdown"],
        examples: [
          { action: "replace_doc_content", args: { docId: "真实测试docId", markdown: "# 替换后的测试文档\n" } },
        ],
        notes: [
          "高风险操作；docId 必须来自真实工具结果。",
          "只允许用于 disposable 测试文档；普通局部编辑应使用 update_block、insert_block、delete_blocks 或 move_block。",
        ],
      },
    ],
  },
  {
    name: "siyuan_tree",
    title: "思源树与笔记本",
    description: "管理笔记本、文档树和路径解析。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "移动、复制、排序、删除或修改笔记本/文档树前必须确认；路径和 ID 应来自读取结果或用户明确输入。",
    actions: [
      {
        name: "notebook",
        title: "管理笔记本",
        description: "列出、创建、打开、关闭、重命名、配置、设置图标或删除笔记本。",
        readOnly: false,
        notes: [
          "create/open/close/rename/set_conf/set_icon/remove 必须只用于临时测试笔记本。",
          "remove 只能删除本轮创建的临时空笔记本，不得删除用户真实笔记本。",
        ],
      },
      {
        name: "doc_tree",
        title: "管理文档树",
        description: "列出文档树，移动、复制或排序文档树节点。",
        readOnly: false,
        required: ["action"],
        examples: [
          { action: "doc_tree", args: { action: "list_children", notebook: "真实notebook", path: "真实path" } },
          { action: "doc_tree", args: { action: "list_tree", notebook: "真实notebook" } },
          { action: "doc_tree", args: { action: "move", fromPaths: ["真实path"], toNotebook: "真实notebook", toPath: "真实目标path" } },
          { action: "doc_tree", args: { action: "move_by_id", ids: ["真实docId"], targetID: "目标父文档ID或notebookID" } },
          { action: "doc_tree", args: { action: "duplicate", notebook: "真实notebook", path: "真实文档path", id: "真实docId" } },
          { action: "doc_tree", args: { action: "sort", notebook: "真实notebook", ids: ["真实id"], targetID: "真实targetID" } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 doc_tree，内层 args.action 才是文档树操作类型。",
          "list_children 需要 notebook，可选 path；不传 path 时读取根路径。",
          "list_tree 需要 notebook，可选 path；不传 path 时读取根路径。",
          "move 使用 fromPaths + toNotebook + toPath；fromPaths 必须是真实文档 path。",
          "move_by_id 使用 ids + targetID；ids 是要移动的文档 ID 数组，targetID 是目标父文档 ID 或目标 notebook ID。",
          "duplicate 使用 id + notebook + path；为兼容旧调用也允许 ids，但只取 ids[0]。",
          "duplicate 只复制单个文档，批量复制暂不保证。",
          "duplicate 的 path 是文档 path，不是 hpath；优先从 doc_path.path_by_id 或 list_tree/list_children 结果获取。",
          "sort 使用 notebook + ids 或 fromPaths + targetID；只允许 disposable 文档。",
          "不要把 docId 当 path；需要路径时先用 doc_path 解析。",
          "写入 doc_tree 前先清理或确认上轮遗留测试文档 /Notebrain-Agent-Test/siyuan_tree_test_A/B/C。",
        ],
      },
      { name: "doc_path", title: "解析文档路径", description: "解析 path、hpath、full hpath 和 docId。", readOnly: true },
    ],
  },
  {
    name: "siyuan_meta",
    title: "思源标签书签",
    description: "管理标签和书签。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "重命名或删除标签/书签前必须确认；删除可能影响资料组织。",
    actions: [
      {
        name: "tag",
        title: "管理标签",
        description: "列出、搜索、重命名或删除标签。",
        readOnly: false,
        required: ["action"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["list", "search", "rename", "remove"], description: "标签操作类型。" },
            keyword: { type: "string", description: "search 的关键词。" },
            oldLabel: { type: "string", description: "rename 的旧标签名。" },
            newLabel: { type: "string", description: "rename 的新标签名。" },
            label: { type: "string", description: "remove 的标签名。" },
            sort: { type: "integer", minimum: 0, maximum: 10, description: "list 的排序参数，可选。" },
            ignoreMaxListHint: { type: "boolean", description: "list 是否忽略最大列表提示，可选。" },
          },
          required: ["action"],
        },
        examples: [
          { action: "tag", args: { action: "list" } },
          { action: "tag", args: { action: "search", keyword: "临时标签" } },
          { action: "tag", args: { action: "rename", oldLabel: "nbAgentTempTag202607031700", newLabel: "nbAgentTempTag202607031701" } },
          { action: "tag", args: { action: "remove", label: "nbAgentTempTag202607031701" } },
        ],
        notes: [
          "tag.rename/remove 是写入操作，必须确认。",
          "测试标签只允许使用本轮创建的临时标签，不要 rename/remove 用户真实标签。",
          "tag.rename 的新标签名不要包含 Markdown 语法标记字符；测试标签请使用纯字母数字，例如 nbAgentTempTag202607031700，不要用下划线。",
          "Markdown 中创建标签时可出现某些字符，但 renameTag 内核 API 可能拒绝这些字符，工具应按 API 结果为准。",
        ],
      },
      {
        name: "bookmark",
        title: "管理书签",
        description: "列出书签、列出书签块、重命名或删除书签。rename/remove 必须提供 blockIds 并通过 setBlockAttrs 按块操作；Agent 默认路径不调用全局 bookmark rename/remove API。",
        readOnly: false,
        required: ["action", "blockIds（rename/remove 必填）"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["list", "list_blocks", "rename", "remove"], description: "书签操作类型。" },
            keyword: { type: "string", description: "list_blocks 的书签关键词，可选。" },
            maxItems: { type: "integer", minimum: 1, maximum: 200, description: "list_blocks 返回数量上限，可选。" },
            maxChars: { type: "integer", minimum: 200, maximum: 50000, description: "contentPreview 最大字符数，可选。" },
            oldBookmark: { type: "string", description: "rename 的旧书签名，优先使用。" },
            newBookmark: { type: "string", description: "rename 的新书签名，优先使用。" },
            bookmark: { type: "string", description: "remove 的书签名，优先使用。" },
            oldLabel: { type: "string", description: "rename 的旧字段兼容别名；新调用优先使用 oldBookmark。" },
            newLabel: { type: "string", description: "rename 的旧字段兼容别名；新调用优先使用 newBookmark。" },
            label: { type: "string", description: "remove 的旧字段兼容别名；新调用优先使用 bookmark。" },
            blockIds: { type: "array", items: { type: "string", minLength: 1, maxLength: 256 }, minItems: 1, maxItems: 50, description: "rename/remove 必须提供的 block ID 列表；通过 setBlockAttrs 按块操作，不调用全局 renameBookmark/removeBookmark。" },
          },
          required: ["action"],
        },
        examples: [
          { action: "bookmark", args: { action: "list" } },
          { action: "bookmark", args: { action: "list_blocks", keyword: "临时书签名", maxItems: 20 } },
          { action: "bookmark", args: { action: "rename", oldBookmark: "本轮临时书签", newBookmark: "本轮临时书签Renamed", blockIds: ["20240101000000-abc123"] } },
          { action: "bookmark", args: { action: "remove", bookmark: "本轮临时书签Renamed", blockIds: ["20240101000000-abc123"] } },
        ],
        notes: [
          "bookmark.rename/remove 是写入操作，必须确认。",
          "rename/remove 必须先通过 list_blocks 定位真实 blockIds；没有 blockIds 时应先 list_blocks，定位不到则标记条件不满足，不执行写入。",
          "rename/remove 通过 blockIds + setBlockAttrs 按块修改/清空 bookmark 属性；Agent 不直接调用 /api/bookmark/renameBookmark/removeBookmark。",
          "直接全局 rename/remove 可能触发思源前端重载，不作为 Agent 默认行为。",
          "只能操作本轮 disposable 测试文档或明确临时书签块；不要 rename/remove 用户真实书签。",
          "oldLabel/newLabel/label 仅为兼容旧字段，新调用优先使用 oldBookmark/newBookmark/bookmark。",
          "list_blocks 输出包含 id、bookmark、contentPreview、created/updated；bookmark 字段应反映真实书签名。",
          "list_blocks 的 keyword 匹配 bookmark 元数据；正文辅助匹配只能使用 FTS，不得使用 blocks.content/markdown/fcontent LIKE。",
        ],
      },
    ],
  },
  {
        name: "siyuan_asset",
        title: "思源资源",
        description: "读取和管理 assets 以及受限工作区文件。",
        readOnly: false,
        requiresConfirmation: true,
        boundary: "资源写入、删除、重命名或工作区文件操作前必须确认；路径守卫会限制敏感目录。",
        actions: [
          {
            name: "read",
            title: "读取资源信息",
            description: "查看资源、未使用/缺失资源、标注、OCR、统计和资源文本。",
            readOnly: true,
            required: ["action"],
            examples: [
              { action: "read", args: { action: "unused_assets", maxItems: 20 } },
              { action: "read", args: { action: "missing_assets", maxItems: 20 } },
              { action: "read", args: { action: "doc_assets", docId: "真实docId" } },
              { action: "read", args: { action: "resolve_path", path: "真实资源path" } },
              { action: "read", args: { action: "asset_content", path: "真实资源path", maxChars: 2000 } },
            ],
            notes: [
              "这里有两层 action：外层 action 固定为 read，内层 args.action 必填，才是资源读取类型。",
              "unused_assets/missing_assets 可只传 action/maxItems。",
              "doc_assets/doc_image_assets 需要 docId。",
              "resolve_path/file_annotation/image_ocr/asset_content 需要 path。",
              "当前实现中 stat 需要 path，不需要 docId。",
              "image_ocr 读取的是已缓存/写入的 OCR 文本；真实 OCR 识别需要本机 Tesseract OCR 环境，未配置时应标记为环境限制。",
            ],
          },
          {
            name: "manage",
            title: "管理资源",
            description: "重命名资源、设置标注/OCR、执行 OCR、删除未使用资源或重建索引。",
            readOnly: false,
            required: ["action"],
            examples: [
              { action: "manage", args: { action: "rename", path: "assets/nb_agent_temp_old.png", newName: "nb_agent_temp_renamed.png" } },
              { action: "manage", args: { action: "ocr", path: "assets/nb_agent_temp.png" } },
              { action: "manage", args: { action: "remove_unused_one", path: "assets/nb_agent_temp_unused.png" } },
              { action: "manage", args: { action: "remove_unused_batch", paths: ["assets/nb_agent_temp_a.png", "assets/nb_agent_temp_b.png"] } },
              { action: "manage", args: { action: "full_reindex_content", confirmGlobal: true } },
            ],
            notes: [
              "这里有两层 action：外层 action 固定为 manage，内层 args.action 必填。",
              "rename/set_annotation/set_image_ocr/ocr 需要 path。",
              "remove_unused_one 和 remove_unused_batch 只能删除本轮 disposable 测试资源；路径必须位于 assets/... 或 /data/assets/...，且路径/文件名需包含 nb_agent / notebrain_agent / notebrain_test / notebrain-agent-test 之一。",
              "不要删除 unused_assets 返回的普通用户资源，即使它们显示为未使用。",
              "full_reindex_content 是全局资源内容索引重建，普通测试默认跳过；只有用户明确要求并传 confirmGlobal:true 时才执行。",
              "ocr 需要本机 Tesseract OCR 已安装/配置；未配置时返回环境限制，应在测试报告中标记为条件不满足，不是代码失败。",
              "set_image_ocr 只是写入/覆盖 OCR 文本，不等于真实 OCR 识别成功；测试报告需区分。",
            ],
          },
          {
            name: "workspace_file",
            title: "受限工作区文件",
            description: "在白名单目录下读取、写入、复制、重命名或删除文件。",
            readOnly: false,
            required: ["action"],
            examples: [
              { action: "workspace_file", args: { action: "read_dir", path: "/data/storage/petal/siyuan-homepage/notebrain-agent-test" } },
              { action: "workspace_file", args: { action: "get_file", path: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/a.txt" } },
              { action: "workspace_file", args: { action: "put_file", path: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/a.txt", content: "测试内容" } },
              { action: "workspace_file", args: { action: "copy_file", path: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/a.txt", targetPath: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/b.txt" } },
              { action: "workspace_file", args: { action: "rename_file", path: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/a.txt", targetPath: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/c.txt" } },
              { action: "workspace_file", args: { action: "remove_file", path: "/data/storage/petal/siyuan-homepage/notebrain-agent-test/b.txt" } },
            ],
            notes: [
              "这里有两层 action：外层 action 固定为 workspace_file，内层 args.action 必填。",
              "read_dir/get_file/remove_file/unique_filename 需要 path；copy_file/rename_file 需要 path + targetPath。",
              "path/targetPath 必须在白名单目录内（assets/templates/widgets/public/siyuan-homepage storage 等），不得包含 .. 或使用系统绝对路径。",
              "copy_file 通过 getFile+putFile 安全复制，不直接调用底层 /api/file/copyFile。",
            ],
          },
        ],
      },
  {
    name: "siyuan_riff",
    title: "思源闪卡",
    description: "查询和管理 Riff deck/card。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "卡包和卡片写操作必须确认；复习、跳过、重置、移动和到期时间修改应以工具结果为准。",
    actions: [
      {
        name: "deck",
        title: "管理卡包",
        description: "列出、创建、重命名或删除 Riff deck。",
        readOnly: false,
        required: ["action"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["create", "list", "rename", "remove"], description: "卡包操作类型。" },
            deckID: { type: "string", description: "rename/remove 必填，create/list 不需要。" },
            name: { type: "string", description: "create/rename 必填的新卡包名。" },
          },
          required: ["action"],
        },
        examples: [
          { action: "deck", args: { action: "list" } },
          { action: "deck", args: { action: "create", name: "notebrain_test_deck" } },
          { action: "deck", args: { action: "rename", deckID: "真实deckID", name: "notebrain_test_deck_renamed" } },
          { action: "deck", args: { action: "remove", deckID: "真实deckID" } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 deck，内层 args.action 必填。",
          "list 只读不需要确认；create/rename/remove 写入确认。",
          "create 需要 name；rename 需要 deckID + name；remove 需要 deckID。",
          "deck 为空不代表没有闪卡——查看全部卡片用 siyuan_riff_card list_cards(deckID='')。",
        ],
      },
      {
        name: "card",
        title: "管理闪卡",
        description: "查询、添加、删除、移动、复习、跳过、重置或设置到期时间。",
        readOnly: false,
        required: ["action"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: {
              type: "string",
              enum: [
                "due_cards", "tree_due_cards", "notebook_due_cards",
                "list_cards", "tree_cards", "notebook_cards",
                "cards_by_block_ids", "add_cards", "remove_cards",
                "get_card_info", "move_cards", "review", "skip", "reset", "set_due_time",
              ],
              description: "闪卡操作类型。",
            },
            deckID: { type: "string", description: "add_cards/review/skip 必填；list_cards/due_cards 可空（查全部）。" },
            fromDeckID: { type: "string", description: "move_cards 必填，源卡包 ID。" },
            toDeckID: { type: "string", description: "move_cards 必填，目标卡包 ID。" },
            rootID: { type: "string", description: "tree_due_cards/tree_cards 必填。" },
            notebook: { type: "string", description: "notebook_due_cards/notebook_cards 必填。" },
            blockIDs: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50, description: "cards_by_block_ids/add_cards/remove_cards/move_cards 必填。" },
            cardID: { type: "string", description: "get_card_info/review/skip 必填。" },
            rating: { type: "integer", minimum: 1, maximum: 4, description: "review 必填评分。" },
            id: { type: "string", description: "reset 必填目标 ID。" },
            resetType: { type: "string", enum: ["notebook", "tree", "deck"], description: "reset 必填类型。" },
            cardDues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  due: { type: "string" },
                },
                required: ["id", "due"],
              },
              minItems: 1,
              maxItems: 50,
              description: "set_due_time 必填数组。",
            },
            page: { type: "integer", minimum: 1, description: "分页页码，可选。" },
            pageSize: { type: "integer", minimum: 1, maximum: 100, description: "分页大小，可选。" },
            maxItems: { type: "integer", minimum: 1, maximum: 200, description: "返回数量上限，可选。" },
          },
          required: ["action"],
        },
        examples: [
          { action: "card", args: { action: "due_cards" } },
          { action: "card", args: { action: "list_cards", deckID: "", pageSize: 20 } },
          { action: "card", args: { action: "cards_by_block_ids", blockIDs: ["真实blockID"] } },
          { action: "card", args: { action: "add_cards", deckID: "真实deckID", blockIDs: ["真实blockID"] } },
          { action: "card", args: { action: "get_card_info", cardID: "真实riffCardID", deckID: "" } },
          { action: "card", args: { action: "review", deckID: "真实deckID", cardID: "真实riffCardID", rating: 3 } },
          { action: "card", args: { action: "skip", deckID: "真实deckID", cardID: "真实riffCardID" } },
          { action: "card", args: { action: "reset", resetType: "deck", id: "真实deckID", deckID: "真实deckID" } },
          { action: "card", args: { action: "set_due_time", cardDues: [{ id: "真实riffCardID", due: "20260710080000" }] } },
          { action: "card", args: { action: "move_cards", fromDeckID: "源deckID", toDeckID: "目标deckID", blockIDs: ["真实blockID"] } },
          { action: "card", args: { action: "remove_cards", deckID: "真实deckID", blockIDs: ["真实blockID"] } },
        ],
        notes: [
          "这里有两层 action：外层 action 固定为 card，内层 args.action 必填。",
          "ID 语义必须区分：cardID/riffCardID 是闪卡记录 ID；blockID 是思源文档块 ID；deckID 是卡包 ID。",
          "due_cards/tree_due_cards/notebook_due_cards/list_cards/tree_cards/notebook_cards/cards_by_block_ids/get_card_info 只读。",
          "list_cards 不传 deckID 或 deckID='' 可查全部卡片。",
          "add_cards/remove_cards/cards_by_block_ids 使用 blockIDs（思源块 ID），不是 cardIDs。",
          "move_cards 使用 fromDeckID/toDeckID + blockIDs。",
          "review/skip/get_card_info/set_due_time 使用 cardID/riffCardID（闪卡记录 ID），不是 blockID。",
          "get_card_info 使用 riffCardID 查询（deckID 为空则查全部），会递归匹配 list_cards 返回里的 riffCardID/cardID/id/riffCard.id/card.id 等字段；只有 blockID 时应先用 cards_by_block_ids 或 list_cards 找到 riffCardID。",
          "move_cards 是 wrapper：先 addRiffCards 到目标 toDeckID，再从源 fromDeckID removeRiffCards；只允许作用于本轮 disposable 测试卡片，不要移动用户真实卡片。",
          "cards_by_block_ids 可能只反查思源制卡标记，不一定等价于 list_cards 中的 riff 数据库记录；验证 add_cards 应优先用 list_cards。",
          "set_due_time 的 cardDues[].id 必须是完整 riffCardID（例如 20260703221339-at4oz7a），不是短后缀，也不是 blockID；内核字段为 cardDues[].due，due 会规范化为 YYYYMMDDHHmmss，支持 YYYYMMDD、YYYYMMDDHHmmss 或 ISO 时间。",
          "set_due_time 不硬编码任何 deckID；它是对思源 riff 内核 API 的包装，当前 API 可能对部分卡包或部分卡片静默跳过，因此是否生效必须以 verification / list_cards / get_card_info 回读为准，不能只看 code=0。",
          "set_due_time 输出包含 kernelPayloadShape='cardDues[].due'、normalizedCardDues（保留完整 id）、kernelResult、needsVerification、verification（applied / partiallyApplied / appliedCount / details）与 warning；若 appliedCount < 总数会提示内核返回 ok 但 due 未全部生效，测试报告必须再用 list_cards/get_card_info 验证 due 变化后才能标通过。",
          "测试 set_due_time 的正确流程：创建 disposable 测试文档 → add_cards 加入可修改 deck → list_cards 拿到完整 riffCardID → set_due_time → get_card_info/list_cards 验证 due → remove_cards → delete_doc。不要在自建 deck 后强行断言 set_due_time 必须支持。",
          "表格展示时可以缩短显示，但再次调用 set_due_time/review/skip/get_card_info 必须复制完整 riffCardID；add_cards/remove_cards/move_cards 也必须复制完整 blockID；deck 操作必须复制完整 deckID。",
        ],
      },
    ],
  },
  {
    name: "skill_manage",
    title: "Skill 说明包管理",
    description: "列出、读取、安装、停用和重建外部/自定义 Skill 说明包索引。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "只处理外部/自定义 Skill；内置能力不作为 Skill 管理项。安装、停用和重建索引需要确认。",
    actions: [
      { name: "list", title: "列出 Skill", description: "列出外部/用户 Skill 简短索引。", readOnly: true },
      { name: "read", title: "读取 Skill", description: "读取指定 Skill 入口说明。", readOnly: true },
      { name: "read_file", title: "读取 Skill 子文件", description: "读取 Skill 允许目录下的相对文件。", readOnly: true },
      { name: "install", title: "安装 Skill", description: "从 GitHub URL、owner/repo 或 zip URL 安装外部 Skill。", readOnly: false },
      { name: "uninstall", title: "停用 Skill", description: "停用指定外部 Skill。", readOnly: false },
      { name: "reindex", title: "重建索引", description: "扫描 installed 目录并重建 Skill 索引。", readOnly: false },
    ],
  },
  {
    name: "mcp_manage",
    title: "MCP 管理",
    description: "管理 MCP Server 配置、工具索引和预设。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "保存 Server、同步工具和清理索引需要确认；不读取敏感配置明文。",
    actions: [
      { name: "list_servers", title: "列出 Server", description: "列出已配置 MCP Server。", readOnly: true },
      {
        name: "save_server",
        title: "保存 Server",
        description: "新增或更新 MCP Server 配置。stdio Server 的 command/args 会经过安全策略校验，高危命令将被拒绝且不会保存。",
        readOnly: false,
        required: ["server"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            server: {
              type: "object",
              description: "MCP Server 配置对象。",
              properties: {
                id: { type: "string", description: "Server ID，可选，不传会根据 title/command/url 生成。" },
                title: { type: "string", description: "Server 标题，可选。" },
                enabled: { type: "boolean", description: "是否启用，默认 true。" },
                transport: { type: "string", enum: ["stdio", "http", "sse"], description: "传输方式。" },
                command: { type: "string", description: "stdio 命令。" },
                args: { type: "array", items: { type: "string" }, description: "stdio 参数数组。" },
                env: { type: "object", description: "环境变量。" },
                url: { type: "string", description: "http/sse URL。" },
                timeoutMs: { type: "number", description: "超时毫秒。" },
                trusted: { type: "boolean", description: "是否信任该 Server 的工具注解。" },
              },
              required: ["transport"],
            },
          },
          required: ["server"],
        },
        examples: [
          { action: "save_server", args: { server: { id: "nb-agent-temp-mcp-filesystem", title: "filesystem", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] } } },
        ],
        notes: [
          "stdio Server 的 command 不能是 cmd、powershell、bash、sh 等 shell/脚本引擎；args 不能包含 /c、-c、rm、del 等高风险参数。",
          "高危命令会在确认前被安全策略拒绝，返回 high_risk_command_blocked，不会保存配置。",
          "测试时建议先调用 list_presets 选择已知安全预设。",
        ],
      },
      {
        name: "delete_server",
        title: "删除 Server",
        description: "删除指定 MCP Server 配置。",
        readOnly: false,
        required: ["serverId"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            serverId: { type: "string", description: "要删除的 MCP Server ID。" },
          },
          required: ["serverId"],
        },
        examples: [
          { action: "delete_server", args: { serverId: "nb-agent-temp-mcp-123" } },
        ],
        notes: [
          "只能删除已存在的 MCP Server；不存在的 serverId 返回 mcp_server_not_found。",
          "测试时只允许删除本轮创建的 disposable Server（ID 以 nb-agent-temp-mcp- 开头）。",
          "删除后如需清理残留工具索引，再调用 cleanup_stale_tools。",
        ],
      },
      { name: "sync_tools", title: "同步工具", description: "连接 Server 并同步工具索引。", readOnly: false },
      { name: "list_tools", title: "列出工具", description: "列出已索引 MCP 工具。", readOnly: true },
      { name: "read_tool", title: "读取工具说明", description: "读取指定 MCP 工具详情。", readOnly: true },
      { name: "call_tool", title: "调用工具", description: "调用已同步索引中的 MCP 工具，参数包含 serverId、toolName 和 args。非只读工具需要确认。", readOnly: false, required: ["serverId", "toolName", "args"] },
      { name: "list_presets", title: "列出预设", description: "列出 MCP Server 预设。", readOnly: true },
      {
        name: "cleanup_stale_tools",
        title: "清理过期工具",
        description: "清理已不存在 Server 对应的 MCP 工具索引。",
        readOnly: false,
        notes: [
          "cleanup_stale_tools 只清理工具索引（tool-index.json），不会删除 MCP Server 配置。",
          "如需删除 Server 配置，必须使用 delete_server。",
          "不要误以为 cleanup_stale_tools 能清理 disposable Server。",
        ],
      },
    ],
  },
  {
    name: "notebrain_file",
    title: "Notebrain 文件",
    description: "读写 Notebrain 工作区内的受限文本文件。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "只允许访问 Notebrain 工作区相对路径；写入和删除前必须确认。",
    actions: [
      {
        name: "list_dir",
        title: "列目录",
        description: "列出 Notebrain 工作区目录。",
        readOnly: true,
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", description: "notebrain 内相对目录，默认根目录。" },
          },
          required: [],
        },
        examples: [
          { action: "list_dir", args: {} },
          { action: "list_dir", args: { path: "projects/default" } },
        ],
        notes: [
          "path 可选，必须位于 Notebrain 安全工作区内，不得使用 .. 或系统绝对路径。",
          "只列出 Notebrain 工作区目录，不读取思源笔记、系统路径或其他插件目录。",
        ],
      },
      {
        name: "read_file",
        title: "读文件",
        description: "读取 Notebrain 工作区内的 UTF-8 文本文件，自动截断。",
        readOnly: true,
        required: ["path"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", description: "notebrain 内相对文件路径，必填。" },
            maxChars: { type: "integer", minimum: 1, description: "最大读取字符数，可选。" },
          },
          required: ["path"],
        },
        examples: [
          { action: "read_file", args: { path: "projects/default/README.md" } },
          { action: "read_file", args: { path: "tmp/session.log", maxChars: 5000 } },
        ],
        notes: [
          "path 必填，必须位于 Notebrain 安全工作区内。",
          "不要读取思源笔记数据库、用户文档、密钥文件、系统配置或其他插件目录。",
        ],
      },
      {
        name: "write_file",
        title: "写文件",
        description: "写入 Notebrain 工作区内的 UTF-8 文本文件。",
        readOnly: false,
        required: ["path", "content"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", description: "notebrain 内相对文件路径，必填。" },
            content: { type: "string", description: "要写入的 UTF-8 文本内容，必填。" },
          },
          required: ["path", "content"],
        },
        examples: [
          { action: "write_file", args: { path: "tmp/test.txt", content: "测试内容" } },
        ],
        notes: [
          "path + content 必填，写入前会弹出确认。",
          "只能写入 Notebrain 工作区允许目录；不要覆盖思源笔记、用户资料或其他插件文件。",
        ],
      },
      {
        name: "delete_path",
        title: "删路径",
        description: "删除 Notebrain 工作区内的路径。",
        readOnly: false,
        required: ["path"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", description: "notebrain 内相对路径，必填。" },
          },
          required: ["path"],
        },
        examples: [
          { action: "delete_path", args: { path: "tmp/old-test.txt" } },
        ],
        notes: [
          "path 必填，删除前会弹出确认。",
          "只能删除允许目录和本轮临时文件；不得删除用户真实资料、思源笔记或其他插件文件。",
        ],
      },
      {
        name: "run_command",
        title: "执行本地命令",
        description: "在 PC/Electron 端 notebrain/projects/default 工作区内执行非交互式命令（非系统级沙箱，仅限制 cwd）。主要用于安装/构建/调试外部 Skill。",
        readOnly: false,
        required: ["command"],
        argsSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            command: { type: "string", description: "要在 notebrain/projects/default 内执行的命令，必填。" },
            cwd: { type: "string", description: "相对 notebrain/projects/default 的子目录，默认 ." },
            timeoutMs: { type: "integer", minimum: 1, description: "超时时间毫秒，不超过设置上限。" },
            maxOutputChars: { type: "integer", minimum: 1, description: "stdout/stderr 预览最大字符数，不超过设置上限。" },
          },
          required: ["command"],
        },
        examples: [
          { action: "run_command", args: { command: "ls -la" } },
          { action: "run_command", args: { command: "git status", cwd: "." } },
        ],
        notes: [
          "仅支持 PC/Electron 环境；非 PC 环境该 action 不可用。",
          "严格工作区模式下会拦截 cmd /c、powershell、cmd.exe /c、sh -c、bash -c、rm、del、git reset、git clean、git checkout --、git restore --source、联网下载执行、管道/重定向等高风险命令，返回 safety_blocked 且不弹确认。",
          "command 必填；cwd 必须是 Notebrain 工作区内的相对路径，不得包含 .. 或使用绝对路径。",
          "不要主动读取系统配置、网络、用户名、环境变量、注册表或用户目录。",
          "不是系统级沙箱，仅限制 cwd；写操作类命令仍需要确认。",
        ],
      },
    ],
  },
  {
    name: "web_fetch",
    title: "网页与 HTTP",
    description: "读取公开网页或调用公开 HTTP API。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "只访问公开 http/https URL；拒绝本机、内网和云元数据地址。POST 会发送数据，需要确认。",
    actions: [
      { name: "read_page", title: "读取网页", description: "读取公开网页正文并转换为 Markdown。", readOnly: true },
      { name: "http_get", title: "HTTP GET", description: "发送 HTTP GET 请求。", readOnly: true },
      { name: "http_post", title: "HTTP POST", description: "发送 HTTP POST 请求，可能产生副作用。", readOnly: false },
    ],
  },
  {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description: "用 memory 提供的完整文本全量替换当前全局记忆；memory 不是增量补丁，不允许空字符串或纯空白清空。",
    readOnly: false,
    requiresConfirmation: true,
    boundary: "会完全覆盖当前所有全局记忆；不接受 docId/item_id/operation；只能替换配置好的全局记忆文档；未读取到完整当前记忆时不要调用；不允许清空。",
    argsSchema: {
      type: "object",
      properties: {
        memory: {
          type: "string",
          minLength: 1,
          description: "修改后的完整全局记忆全文。每行/段代表一条记忆，不是增量补丁；不允许空字符串或纯空白。",
        },
      },
      additionalProperties: false,
      required: ["memory"],
    },
    inputHint: "必须传入完整全局记忆全文。不要只传新增条目、摘要、测试内容或空字符串。",
    examples: [
      { args: { memory: "- 用户偏好深色主题\n- 项目目标：历史地图沙盘可视化" } },
    ],
    notes: [
      "memory 是完整替换，不是追加/补丁。",
      "空字符串和纯空白会被拒绝，返回 memory_empty_not_allowed。",
      "超过设置中 maxMemoryChars 上限会被拒绝，返回 memory_too_long。",
      "测试时不要在同一轮内反复覆盖后再恢复原文，避免 duplicate_write_call_blocked 导致无法恢复。",
    ],
    actions: [],
  },
  {
    name: "agent_tool_help",
    title: "Agent 工具帮助",
    description: "列出工具、查看工具和 action 的参数、边界与风险。",
    readOnly: true,
    boundary: "只返回工具说明；不执行业务，不写思源，不读取敏感配置。",
    actions: [
      { name: "list_tools", title: "列工具", description: "列出当前内置聚合工具。", readOnly: true },
      { name: "describe_tool", title: "说明工具", description: "查看某个聚合工具支持的 action、参数和风险。", readOnly: true },
      { name: "list_actions", title: "列 action", description: "列出指定工具 action。", readOnly: true },
      { name: "describe_action", title: "说明 action", description: "查看指定 action 的详细说明。", readOnly: true },
      { name: "list_custom_skills", title: "列自定义 Skill", description: "列出外部/用户自定义 Skill，不包含内置 Skill。", readOnly: true },
      { name: "describe_custom_skill", title: "说明自定义 Skill", description: "读取外部/用户自定义 Skill 的说明摘要。", readOnly: true },
    ],
  },
];

export const AGGREGATE_TOOL_NAMES = AGGREGATE_TOOL_CATALOG.map((tool) => tool.name);

export function findAggregateToolMeta(name: string): AggregateToolMeta | undefined {
  return AGGREGATE_TOOL_CATALOG.find((tool) => tool.name === name);
}

export function findAggregateActionMeta(toolName: string, actionName: string): AggregateActionMeta | undefined {
  return findAggregateToolMeta(toolName)?.actions.find((action) => action.name === actionName);
}

import { z } from "zod";
import { ENHANCED_DIARY_COMPLETED_SUFFIX } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTemplateFieldMapping";

export const HOMEPAGE_MCP_FAVORITES_WRITES = {
  "homepage_favorites.add": { name: "新增收藏", consequence: "新增或更新收藏，不修改思源文档。" },
  "homepage_favorites.remove": { name: "取消收藏", consequence: "只取消收藏，不删除思源文档。" },
  "homepage_favorites.move_to_group": { name: "移动收藏分组", consequence: "仅移动收藏分组，不修改思源文档。" },
  "homepage_favorites.create_group": { name: "创建收藏分组", consequence: "创建新分组，不修改或覆盖已有分组。" },
  "homepage_favorites.rename_group": { name: "重命名收藏分组", consequence: "仅修改分组名称，保留成员收藏。" },
  "homepage_favorites.delete_group": { name: "删除收藏分组", consequence: "删除分组，成员收藏移至未分组；不会删除收藏或思源原始文档。" },
  "homepage_favorites.reorder": { name: "收藏排序", consequence: "仅调整选中收藏的排列顺序，不会增删收藏。" },
} as const;

export type HomepageMcpFavoriteWriteAction = keyof typeof HOMEPAGE_MCP_FAVORITES_WRITES;

export const HOMEPAGE_MCP_ANNIVERSARY_WRITES = {
  "homepage_anniversary.add": { name: "新增纪念日", consequence: "创建新事件，不修改已有事件及分类。" },
  "homepage_anniversary.update": { name: "修改纪念日", consequence: "仅修改指定事件的请求字段，保留其他事件及分类。" },
  "homepage_anniversary.archive": { name: "归档纪念日", consequence: "事件归档，不永久删除。" },
  "homepage_anniversary.restore": { name: "恢复纪念日", consequence: "恢复事件展示，不修改其他事件及分类。" },
  "homepage_anniversary.delete_permanently": { name: "永久删除纪念日", consequence: "高风险：永久删除插件纪念日记录，无法恢复；不会删除关联的思源文档。" },
  "homepage_anniversary.create_category": { name: "创建纪念日分类", consequence: "创建新分类，不修改已有分类及事件。" },
  "homepage_anniversary.update_category": { name: "修改纪念日分类", consequence: "仅修改指定分类的请求字段，不修改成员事件及其他分类。" },
  "homepage_anniversary.archive_category": { name: "归档纪念日分类", consequence: "分类从活动分类中隐藏，成员事件及关联关系保留；不永久删除分类或事件。" },
  "homepage_anniversary.delete_category": { name: "删除纪念日分类", consequence: "高风险：删除分类本身不可恢复；成员事件按预览转移或变为未分类，不删除事件或思源文档。" },
} as const;

export const HOMEPAGE_MCP_WRITES = { ...HOMEPAGE_MCP_FAVORITES_WRITES, ...HOMEPAGE_MCP_ANNIVERSARY_WRITES } as const;
export const HOMEPAGE_MCP_DATABASE_WRITES = {
  remove_key: { name: "删除数据库文本字段", consequence: "永久删除指定数据库中的一个普通文本字段及该字段的全部单元格值。不会删除数据库本身、其他字段、数据库条目或关联的思源文档。" },
  add_key: { name: "新增数据库文本字段", consequence: "向指定思源数据库新增一个普通文本字段，不删除已有字段或条目。" },
  update_cell: { name: "修改数据库单元格", consequence: "仅修改指定数据库条目的一个普通文本字段。" },
  clear_cell: { name: "清空数据库单元格", consequence: "清空指定数据库条目的一个普通文本字段，原字段值将被移除；不会删除数据库、字段、条目或关联的思源文档。" },
  add_rows: { name: "新增数据库条目", consequence: "向指定数据库新增一条脱离块记录，只填写标题；不会创建独立思源文档，也不会修改已有数据库条目。" },
  remove_rows: { name: "移除数据库条目", consequence: "本操作只移除数据库中的指定记录。脱离块记录会被移除；绑定块记录只解除数据库关联，不会删除原始思源块或文档。" },
} as const;
export const HOMEPAGE_MCP_DIARY_TASK_WRITES = {
  manage_task: { name: "新建日记任务", consequence: "仅在现有今日日记中新增一条普通任务。" },
  manage_review: { name: "修改日记复盘状态", consequence: "仅在已存在的今日日记中修改 day 根标题的复盘完成后缀，不修改复盘字段、任务或其他日记正文。" },
  manage_record: { name: "新增日记快速记录", consequence: "在已有今日日记的指定已有分类中新增一条普通文本快速记录，不创建日记、分类或项目关联。" },
} as const;
export const homepageMcpDiaryReviewStatusSchema = z.object({
  operation: z.literal("set_status"), docId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/),
  period: z.literal("day"), status: z.enum(["completed", "pending"]),
}).strict();
export const HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES = {
  completed: "标记今日日记复盘完成", pending: "恢复今日日记复盘为未完成",
} as const;
export const HOMEPAGE_MCP_DIARY_REVIEW_LABELS = ["日记标题", "日记 docId", "本地日期", "day 根标题 blockId", "当前根标题", "当前复盘状态", "目标复盘状态", "预计根标题", "影响块数量"];
export const HOMEPAGE_MCP_RECORD_TEXT_UNSAFE = /^\s|\s$|[\\`*_~\[\]<>#{}|$📁]|^([-+]|\d+[.)])\s|^[-=+]{2,}$|\(\(|\)\)/u;
export const homepageMcpDiaryRecordAddSchema = z.object({
  operation: z.literal("add"), categoryTitle: z.enum(["未分类", "想法", "问题", "决策", "日志"]),
  content: z.string().min(1).max(1000).refine((value) => !HOMEPAGE_MCP_RECORD_TEXT_UNSAFE.test(value) && Array.from(value).every((char) => {
    const code = char.codePointAt(0)!;
    return code >= 32 && (code < 127 || code > 159) && code !== 0x2028 && code !== 0x2029;
  })),
}).strict();
export const homepageMcpDiaryRecordUpdateSchema = z.object({
  operation: z.literal("update"), target: z.object({ headingBlockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/) }).strict(),
  content: homepageMcpDiaryRecordAddSchema.shape.content,
}).strict();
export const homepageMcpDiaryRecordDeleteSchema = z.object({
  operation: z.literal("delete"), target: homepageMcpDiaryRecordUpdateSchema.shape.target,
}).strict();
export const homepageMcpDiaryRecordWriteSchema = z.discriminatedUnion("operation", [homepageMcpDiaryRecordAddSchema, homepageMcpDiaryRecordUpdateSchema, homepageMcpDiaryRecordDeleteSchema]);
export const HOMEPAGE_MCP_DIARY_RECORD_DELETE = {
  name: "删除日记快速记录",
  consequence: "永久删除指定快速记录的标题及唯一正文段落，不删除分类、其他记录或日记文档；本操作无法通过主页插件撤销。",
} as const;
export const HOMEPAGE_MCP_DIARY_RECORD_UPDATE = {
  name: "修改日记快速记录正文",
  consequence: "只替换该记录正文，标题、时间、分类、标签、项目关系和其他日记内容保留。",
} as const;
export const homepageMcpDiaryTaskCreateSchema = z.object({
  operation: z.literal("create"),
  task: z.object({ taskname: z.string().min(1).max(200).refine((value) => value === value.trim() && Array.from(value).every((char) => {
    const code = char.codePointAt(0)!;
    return code >= 32 && (code < 127 || code > 159) && code !== 0x2028 && code !== 0x2029;
  })).refine((value) => !/[📅⌛❗🔁⏰📍📁#]/u.test(value) && !/\{:.*?\}\s*$/.test(value)) }).strict(),
}).strict();
export const HOMEPAGE_MCP_DIARY_TASK_MUTATIONS = {
  set_status: { name: "更改日记任务状态", consequence: "仅改变指定普通任务的完成状态，保留任务名称、其他字段和日记内容。" },
  update: { name: "重命名日记任务", consequence: "仅修改指定普通任务的名称，保留完成状态、其他字段和日记内容。" },
  postpone: { name: "推迟日记任务", consequence: "仅为指定的未完成普通任务新增截止日期，保留任务块、任务名称、完成状态、原有日记及其他内容；不会将任务移动到其他日期的日记文档。" },
  delete: { name: "删除日记任务", consequence: "仅删除指定的强化日记任务块及其直属内容，不删除整篇日记或其他任务；本次不会生成删除日志。" },
} as const;
export const HOMEPAGE_MCP_DIARY_TASK_DELETE_WARNING = "删除任务块及其直属内容，无法通过本插件撤销；请核对真实任务 ID。";
export const HOMEPAGE_MCP_DIARY_TASK_LOG_DELETE = {
  name: "记录日志后删除日记任务",
  consequence: "先向现有今日日记的任务日志区域写入删除记录，再删除指定任务；如果日志写入成功而任务删除失败，日志可能保留，不能自动重试。",
} as const;
export const HOMEPAGE_MCP_DIARY_TASK_MIGRATION = {
  name: "迁移历史日记任务",
  consequence: "迁移会将同一个任务块移动到今日日记，并写入来源说明、任务日志、刷新任务索引；如果中途发生错误，可能已经完成部分步骤，不能自动重试。",
} as const;
export const homepageMcpDiaryTaskMigrationSchema = z.object({
  operation: z.literal("migrate"), target: z.object({ blockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/) }).strict(),
}).strict();
export const homepageMcpDiaryTaskWriteSchema = z.discriminatedUnion("operation", [
  homepageMcpDiaryTaskCreateSchema,
  homepageMcpDiaryTaskMigrationSchema,
  z.object({ operation: z.literal("set_status"), target: z.object({ blockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/) }).strict(), completed: z.boolean() }).strict(),
  z.object({ operation: z.literal("update"), target: z.object({ blockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/) }).strict(),
    task: z.object({ taskname: homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname.refine((value) => !/[\\`*_\[\]<>~{}]/.test(value)) }).strict() }).strict(),
  z.object({ operation: z.literal("delete"), target: z.object({ blockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/) }).strict(), deleteMode: z.enum(["delete", "log"]) }).strict(),
  z.object({ operation: z.literal("postpone"), target: z.object({ blockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/) }).strict(), postponeTo: z.enum(["tomorrow", "next_week"]) }).strict(),
]);
export const HOMEPAGE_MCP_WRITES_BY_TOOL: Record<string, Record<string, { name: string; consequence: string }>> = {
  homepage_components: HOMEPAGE_MCP_WRITES,
  siyuan_database: HOMEPAGE_MCP_DATABASE_WRITES,
  diary_task: HOMEPAGE_MCP_DIARY_TASK_WRITES,
};
export const HOMEPAGE_MCP_DATABASE_BOUND_ADD = {
  name: "关联思源块到数据库",
  consequence: "本次会将已有思源块加入指定数据库，生成新的数据库条目；不会创建新的独立文档，也不会删除原始块。",
} as const;
export function getHomepageMcpWriteOperation(toolName: string, action: string) {
  const actions = Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_WRITES_BY_TOOL, toolName) ? HOMEPAGE_MCP_WRITES_BY_TOOL[toolName] : undefined;
  return actions && Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : undefined;
}

const id = z.string().regex(/^\d{14}-[a-z0-9]{7}$/);
export const homepageMcpDatabaseUpdateSchema = z.object({
  databaseId: id, rowId: id, keyId: id,
  valueText: z.string().min(1).max(1000).refine((value) => value.trim().length > 0),
  expectedFieldName: z.string().min(1).max(50).refine((value) => value.trim().length > 0 && value === value.trim()),
}).strict();
export type HomepageMcpDatabaseUpdate = z.infer<typeof homepageMcpDatabaseUpdateSchema>;
export const homepageMcpDatabaseClearSchema = homepageMcpDatabaseUpdateSchema.omit({ valueText: true }).strict();
export type HomepageMcpDatabaseClear = z.infer<typeof homepageMcpDatabaseClearSchema>;
export const homepageMcpDatabaseDetachedAddSchema = z.object({
  databaseId: id,
  detachedRows: z.array(z.object({
    title: z.string().min(1).max(200).refine((value) => value === value.trim() && Array.from(value).every((char) =>
      char.charCodeAt(0) >= 32 && (char.charCodeAt(0) < 127 || char.charCodeAt(0) > 159))),
  }).strict()).length(1),
}).strict();
export const homepageMcpDatabaseBoundAddSchema = z.object({ databaseId: id, blockIds: z.array(id).length(1) }).strict();
export const homepageMcpDatabaseAddSchema = z.union([homepageMcpDatabaseDetachedAddSchema, homepageMcpDatabaseBoundAddSchema]);
export const homepageMcpDatabaseRemoveSchema = z.object({
  databaseId: id, rowIds: z.array(id).length(1),
  expectedTitles: z.array(z.string().min(1).max(200).refine((value) => value.trim().length > 0)).length(1),
}).strict();
export const homepageMcpDatabaseAddKeySchema = z.object({
  databaseId: id,
  keyName: z.string().min(1).max(50).refine((value) => value === value.trim() && Array.from(value).every((char) =>
    char.charCodeAt(0) >= 32 && (char.charCodeAt(0) < 127 || char.charCodeAt(0) > 159))),
  keyType: z.literal("text"),
}).strict();
export const homepageMcpDatabaseRemoveKeySchema = z.object({
  databaseId: id, keyId: id, expectedKeyName: homepageMcpDatabaseAddKeySchema.shape.keyName,
}).strict();
export const HOMEPAGE_MCP_DATABASE_REMOVE_KEY_WARNING = "删除后，该字段及其所有值均会从数据库中移除，无法通过本插件撤销。数据库、其他字段和原始思源文档不会被删除。";
export type HomepageMcpDatabaseWriteAction = keyof typeof HOMEPAGE_MCP_DATABASE_WRITES;
export type HomepageMcpAnniversaryWriteAction = keyof typeof HOMEPAGE_MCP_ANNIVERSARY_WRITES;
export type HomepageMcpWriteAction = keyof typeof HOMEPAGE_MCP_WRITES | keyof typeof HOMEPAGE_MCP_DATABASE_WRITES | keyof typeof HOMEPAGE_MCP_DIARY_TASK_WRITES;

export function isHomepageMcpFavoriteWriteAction(action: string): action is HomepageMcpFavoriteWriteAction {
  return Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_FAVORITES_WRITES, action);
}
export function isHomepageMcpAnniversaryWriteAction(action: string): action is HomepageMcpAnniversaryWriteAction {
  return Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_ANNIVERSARY_WRITES, action);
}

const text = z.string().min(1).max(1024).refine((value) => value.trim().length > 0 &&
  Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));

export const homepageMcpWritePreviewSchema = z.object({
  action: z.enum([...Object.keys(HOMEPAGE_MCP_WRITES), ...Object.keys(HOMEPAGE_MCP_DATABASE_WRITES), ...Object.keys(HOMEPAGE_MCP_DIARY_TASK_WRITES)] as [HomepageMcpWriteAction, ...HomepageMcpWriteAction[]]),
  operationName: text.max(60),
  targetName: text,
  targetId: text.max(128).nullable(),
  consequence: text,
  affectedCount: z.number().int().min(0).max(1_000_000),
  details: z.array(z.object({ label: text.max(60), value: text }).strict()).max(16),
}).strict().refine((value) => {
  if (value.action === "manage_review") {
    const completed = value.operationName === HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES.completed;
    return (completed || value.operationName === HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES.pending) &&
      value.consequence === HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_review.consequence && value.affectedCount === 1 &&
      value.details.length === HOMEPAGE_MCP_DIARY_REVIEW_LABELS.length && HOMEPAGE_MCP_DIARY_REVIEW_LABELS.every((label, i) => value.details[i].label === label) &&
      value.details[0].value === value.targetName && id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) &&
      id.safeParse(value.targetId).success && value.targetId !== value.details[1].value && value.details[3].value === value.targetId &&
      value.details[5].value === (completed ? "未完成" : "已完成") && value.details[6].value === (completed ? "已完成" : "未完成") && value.details[8].value === "1" &&
      (completed ? value.details[7].value === value.details[4].value + ENHANCED_DIARY_COMPLETED_SUFFIX : value.details[4].value === value.details[7].value + ENHANCED_DIARY_COMPLETED_SUFFIX);
  }
  if (value.action === "manage_record") {
    if (value.operationName === HOMEPAGE_MCP_DIARY_RECORD_DELETE.name) {
      const labels = ["日记标题", "日记 docId", "本地日期", "分类名称", "分类 headingId", "记录标题 headingBlockId", "原正文段落 ID", "原记录标题", "记录时间", "原正文", "记录数量", "块数量", "永久删除警告"];
      const time = /^(\d{2}):(\d{2}) 记录$/.exec(value.details[7]?.value ?? "");
      return value.consequence === HOMEPAGE_MCP_DIARY_RECORD_DELETE.consequence && value.affectedCount === 1 &&
        value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
        value.details[0].value === value.targetName && id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) &&
        homepageMcpDiaryRecordAddSchema.shape.categoryTitle.safeParse(value.details[3].value).success && id.safeParse(value.details[4].value).success &&
        id.safeParse(value.targetId).success && value.details[5].value === value.targetId && id.safeParse(value.details[6].value).success &&
        new Set([value.details[1].value, value.details[4].value, value.targetId, value.details[6].value]).size === 4 &&
        !!time && +time[1] < 24 && +time[2] < 60 && value.details[8].value === time[0].slice(0, 5) &&
        homepageMcpDiaryRecordAddSchema.shape.content.safeParse(value.details[9].value).success &&
        value.details[10].value === "1" && value.details[11].value === "2" && value.details[12].value === HOMEPAGE_MCP_DIARY_RECORD_DELETE.consequence;
    }
    if (value.operationName === HOMEPAGE_MCP_DIARY_RECORD_UPDATE.name) {
      const labels = ["日记标题", "日记 docId", "本地日期", "分类名称", "分类 headingId", "记录标题 headingBlockId", "原正文段落 ID", "原记录标题", "记录时间", "原正文", "新正文", "记录数量"];
      const time = /^(\d{2}):(\d{2}) 记录$/.exec(value.details[7]?.value ?? "");
      return value.consequence === HOMEPAGE_MCP_DIARY_RECORD_UPDATE.consequence && value.affectedCount === 1 &&
        value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
        value.details[0].value === value.targetName && id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) &&
        homepageMcpDiaryRecordAddSchema.shape.categoryTitle.safeParse(value.details[3].value).success && id.safeParse(value.details[4].value).success &&
        id.safeParse(value.targetId).success && value.details[5].value === value.targetId && id.safeParse(value.details[6].value).success &&
        value.details[6].value !== value.targetId && !!time && +time[1] < 24 && +time[2] < 60 && value.details[8].value === time[0].slice(0, 5) &&
        [9, 10].every((i) => homepageMcpDiaryRecordAddSchema.shape.content.safeParse(value.details[i].value).success) &&
        value.details[9].value !== value.details[10].value && value.details[11].value === "1";
    }
    const labels = ["日记标题", "日记 docId", "本地日期", "分类名称", "分类 headingId", "目标身份", "快速记录内容", "记录数量", "内容类型"];
    const operation = HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_record;
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
      value.details[0].value === value.targetName && id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) &&
      homepageMcpDiaryRecordAddSchema.shape.categoryTitle.safeParse(value.details[3].value).success && id.safeParse(value.targetId).success &&
      value.details[4].value === value.targetId && value.details[5].value === "已有分类标题，并非新记录 ID" &&
      homepageMcpDiaryRecordAddSchema.shape.content.safeParse(value.details[6].value).success && value.details[7].value === "1" && value.details[8].value === "普通文本";
  }
  if (value.action === "manage_task") {
    if (value.operationName === HOMEPAGE_MCP_DIARY_TASK_MIGRATION.name) {
      const labels = ["来源日记标题", "来源 docId", "来源日期", "任务 blockId", "任务完整名称", "当前状态", "来源列表 ID",
        "目标日记标题", "目标 docId", "目标日期", "迁移区域 headingId", "目标列表 ID", "插入位置", "将追加的来源信息", "将新增的任务日志", "执行风险"];
      return value.consequence === HOMEPAGE_MCP_DIARY_TASK_MIGRATION.consequence && value.affectedCount === 1 &&
        value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
        [1, 3, 6, 8, 10, 11].every((i) => id.safeParse(value.details[i].value).success) &&
        value.targetId === value.details[3].value && value.targetName === value.details[4].value &&
        homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname.safeParse(value.targetName).success &&
        [2, 9].every((i) => /^\d{8}$/.test(value.details[i].value)) && value.details[2].value < value.details[9].value &&
        value.details[1].value !== value.details[8].value && value.details[5].value === "未完成" &&
        /^现有末尾任务 \d{14}-[a-z0-9]{7} 之后$/.test(value.details[12].value) &&
        value.details[13].value.startsWith("- 迁移来源：((" + value.details[1].value + ' "') &&
        value.details[13].value.endsWith("迁移时间：实际执行时生成") &&
        value.details[14].value === "- 迁移任务：" + value.targetName + "，从 " + value.details[2].value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") + " 迁移到今天" &&
        value.details[15].value === value.consequence;
    }
    if (value.operationName === HOMEPAGE_MCP_DIARY_TASK_MUTATIONS.postpone.name) {
      const labels = ["日记文档标题", "日记文档 ID", "本地日期", "任务 blockId", "任务名称", "当前状态", "当前日期安排", "推迟方式", "新截止日期", "影响任务数量"];
      return value.consequence === HOMEPAGE_MCP_DIARY_TASK_MUTATIONS.postpone.consequence && value.affectedCount === 1 &&
        value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) && id.safeParse(value.targetId).success &&
        id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) && value.details[3].value === value.targetId &&
        homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname.safeParse(value.details[4].value).success && value.details[4].value === value.targetName &&
        value.details[5].value === "未完成" && value.details[6].value === "无" && ["明天", "7 天后"].includes(value.details[7].value) &&
        /^\d{4}-\d{2}-\d{2}$/.test(value.details[8].value) && value.details[9].value === "1";
    }
    if (value.operationName === HOMEPAGE_MCP_DIARY_TASK_LOG_DELETE.name) {
      const labels = ["日记文档标题", "日记文档 ID", "本地日期", "任务 blockId", "任务名称", "当前状态", "所属区域", "日志目标区域", "日志标题 ID", "预期日志正文", "操作步骤", "影响范围", "删除风险"];
      const log = /^- 删除任务：(.+)（来源：\(\((\d{14}-[a-z0-9]{7}) "(\d{8})"\)\)）$/.exec(value.details[9]?.value ?? "");
      return value.consequence === HOMEPAGE_MCP_DIARY_TASK_LOG_DELETE.consequence && value.affectedCount === 2 &&
        id.safeParse(value.targetId).success && value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
        id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) && value.details[3].value === value.targetId &&
        value.details[4].value === value.targetName && homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname.safeParse(value.targetName).success &&
        ["完成", "未完成"].includes(value.details[5].value) && value.details[6].value === "新任务" && value.details[7].value === "任务日志" &&
        id.safeParse(value.details[8].value).success && log?.[1] === value.targetName && log[2] === value.details[1].value && log[3] === value.details[2].value &&
        value.details[10].value === "写入一条日志 → 核对日志及原任务 → 删除原任务 → 回读" &&
        value.details[11].value === "新增 1 条日志，删除 1 条任务" && value.details[12].value === HOMEPAGE_MCP_DIARY_TASK_DELETE_WARNING;
    }
    if (value.operationName === HOMEPAGE_MCP_DIARY_TASK_MUTATIONS.delete.name) {
      const labels = ["日记文档标题", "日记文档 ID", "本地日期", "任务 blockId", "任务名称", "当前状态", "所属区域", "预计删除的任务数量", "删除模式", "删除风险"];
      return value.consequence === HOMEPAGE_MCP_DIARY_TASK_MUTATIONS.delete.consequence && value.affectedCount === 1 &&
        id.safeParse(value.targetId).success && value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
        id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) && value.details[3].value === value.targetId &&
        value.details[4].value === value.targetName && homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname.safeParse(value.targetName).success &&
        ["完成", "未完成"].includes(value.details[5].value) && value.details[6].value === "新任务" && value.details[7].value === "1" &&
        value.details[8].value === "直接删除，不写日志" && value.details[9].value === HOMEPAGE_MCP_DIARY_TASK_DELETE_WARNING;
    }
    const mutation = Object.values(HOMEPAGE_MCP_DIARY_TASK_MUTATIONS).find((entry) => entry.name === value.operationName);
    if (mutation) {
      const status = value.operationName === HOMEPAGE_MCP_DIARY_TASK_MUTATIONS.set_status.name;
      const labels = ["日记文档标题", "日记文档 ID", "本地日期", "任务 blockId", ...(status ? ["任务名称", "当前状态", "目标状态"] : ["原任务名称", "新任务名称"])];
      const name = homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname;
      return value.consequence === mutation.consequence && value.affectedCount === 1 && id.safeParse(value.targetId).success &&
        value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
        id.safeParse(value.details[1].value).success && /^\d{8}$/.test(value.details[2].value) && value.details[3].value === value.targetId &&
        name.safeParse(value.details[4].value).success && value.targetName === value.details[4].value &&
        (status ? ["完成", "未完成"].includes(value.details[5].value) && ["完成", "未完成"].includes(value.details[6].value) && value.details[5].value !== value.details[6].value
          : name.safeParse(value.details[5].value).success && value.details[4].value !== value.details[5].value);
    }
    const operation = HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_task;
    const labels = ["日记文档标题", "日记文档 ID", "本地日期", "任务名称", "插入区域", "当前区域任务数量"];
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      id.safeParse(value.targetId).success && value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
      value.details[0].value === value.targetName && value.details[1].value === value.targetId && /^\d{8}$/.test(value.details[2].value) &&
      homepageMcpDiaryTaskCreateSchema.shape.task.shape.taskname.safeParse(value.details[3].value).success && value.details[4].value === "新任务" &&
      /^(0|[1-9]\d{0,2})$/.test(value.details[5].value);
  }
  if (value.action === "remove_key") {
    const operation = HOMEPAGE_MCP_DATABASE_WRITES.remove_key;
    const labels = ["数据库名称", "数据库 ID", "字段名称", "字段 ID", "字段类型", "当前数据库条目数量", "非空文本值数量", "已有单元格记录数量", "已有空文本单元格数量", "无单元格记录的条目数量", "永久删除警告"];
    if (value.details.length !== labels.length || !labels.every((label, i) => value.details[i].label === label)) return false;
    const counts = value.details.slice(5, 10).map((item) => item.value);
    const [total, nonempty, records, empty, missing] = counts.map(Number);
    return value.operationName === operation.name && value.consequence === operation.consequence &&
      id.safeParse(value.targetId).success && id.safeParse(value.details[1].value).success &&
      value.details[2].value === value.targetName && value.details[3].value === value.targetId && value.details[4].value === "普通文本" &&
      counts.every((count) => /^(?:0|[1-9]\d{0,2})$/.test(count) && Number(count) <= 500) &&
      records === nonempty + empty && total === records + missing && value.affectedCount === nonempty + 1 &&
      value.details[10].value === HOMEPAGE_MCP_DATABASE_REMOVE_KEY_WARNING;
  }
  if (value.action === "add_key") {
    const operation = HOMEPAGE_MCP_DATABASE_WRITES.add_key;
    const labels = ["数据库名称", "数据库 ID", "准备新增的字段名称", "字段类型", "当前字段数量", "新增后预计字段数量", "插入位置"];
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      value.targetId === null && value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
      id.safeParse(value.details[1].value).success && value.details[2].value === value.targetName && value.details[3].value === "普通文本" &&
      /^(?:[1-9]|[12]\d)$/.test(value.details[4].value) && /^(?:[2-9]|[12]\d|30)$/.test(value.details[5].value) &&
      Number(value.details[5].value) === Number(value.details[4].value) + 1 && value.details[6].value === "默认追加到现有字段末尾";
  }
  if (value.action === "remove_rows") {
    const operation = HOMEPAGE_MCP_DATABASE_WRITES.remove_rows;
    const labels = ["数据库名称", "数据库 ID", "条目标题", "真实 rowId/itemID", "记录类型", "当前数据库记录数量", "移除后果"];
    const bound = value.details[4]?.value === "绑定块";
    if (bound) labels.push("原始 blockId", "所属文档", "所属文档 ID");
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      id.safeParse(value.targetId).success && value.details.length === labels.length && labels.every((label, i) => value.details[i].label === label) &&
      id.safeParse(value.details[1].value).success && value.details[2].value === value.targetName && value.details[3].value === value.targetId &&
      /^(?:[1-9]\d{0,2})$/.test(value.details[5].value) && Number(value.details[5].value) <= 500 &&
      (bound ? id.safeParse(value.details[7].value).success && value.details[7].value !== value.targetId && id.safeParse(value.details[9].value).success &&
        value.details[6].value === "只解除数据库关联，原始思源块和文档会保留。"
        : value.details[4].value === "脱离块" && value.details[6].value === "数据库内的独立记录及该记录的字段值将被移除。");
  }
  if (value.action === "add_rows") {
    if (value.targetId !== null) {
      const operation = HOMEPAGE_MCP_DATABASE_BOUND_ADD;
      const labels = ["数据库名称", "数据库 ID", "原始块摘要", "原始 blockId", "原始块类型", "所属文档", "所属文档 ID", "操作方式", "新增数量", "当前数据库记录数量", "新增 itemID"];
      return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
        id.safeParse(value.targetId).success && value.details.length === labels.length && labels.every((label, index) => value.details[index].label === label) &&
        value.details[2].value === value.targetName && value.details[3].value === value.targetId && value.details[4].value === "p（普通段落）" &&
        id.safeParse(value.details[1].value).success && id.safeParse(value.details[6].value).success && value.details[7].value === "绑定已有块" &&
        value.details[8].value === "1" && /^(0|[1-9]\d{0,2})$/.test(value.details[9].value) && Number(value.details[9].value) <= 500 &&
        value.details[10].value === "执行后由思源内核生成，原始 blockId 不是新 itemID";
    }
    const operation = HOMEPAGE_MCP_DATABASE_WRITES.add_rows;
    const labels = ["数据库名称", "数据库 ID", "新条目标题", "类型", "新增数量", "当前数据库记录数量"];
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      value.targetId === null && value.details.length === labels.length && labels.every((label, index) => value.details[index].label === label) &&
      id.safeParse(value.details[1].value).success && value.details[2].value === value.targetName &&
      value.details[3].value === "脱离块记录" && value.details[4].value === "1" && /^(0|[1-9]\d{0,2})$/.test(value.details[5].value) &&
      Number(value.details[5].value) <= 500;
  }
  if (value.action === "update_cell" || value.action === "clear_cell") {
    const operation = HOMEPAGE_MCP_DATABASE_WRITES[value.action];
    const labels = ["数据库名称", "数据库 ID", "条目标题", "条目 ID", "字段名称", "字段 ID", "原始文本值", value.action === "clear_cell" ? "清空后的目标状态" : "准备写入的新文本值"];
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      value.targetId !== null && id.safeParse(value.targetId).success && value.details.length === labels.length &&
      labels.every((label, index) => value.details[index].label === label) &&
      value.details[2].value === value.targetName && value.details[3].value === value.targetId &&
      id.safeParse(value.details[1].value).success && id.safeParse(value.details[5].value).success &&
      (value.action !== "clear_cell" || value.details[7].value === "（空文本）");
  }
  const operation = HOMEPAGE_MCP_WRITES[value.action];
  if (Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_ANNIVERSARY_WRITES, value.action)) {
    const memberCount = value.details.find((detail) => detail.label === "关联事件数量（含已归档）")?.value;
    const expectedCount = value.action === "homepage_anniversary.delete_category" && memberCount !== undefined && /^\d+$/.test(memberCount)
      ? Number(memberCount) + 1 : 1;
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === expectedCount &&
      (value.action !== "homepage_anniversary.delete_category" || memberCount !== undefined && /^\d+$/.test(memberCount)) &&
      (["homepage_anniversary.add", "homepage_anniversary.create_category"].includes(value.action) ? value.targetId === null : value.targetId !== null);
  }
  const documentAction = ["homepage_favorites.add", "homepage_favorites.remove", "homepage_favorites.move_to_group"].includes(value.action);
  const noId = value.action === "homepage_favorites.create_group" || value.action === "homepage_favorites.reorder";
  return value.operationName === operation.name && value.consequence === operation.consequence &&
    (documentAction ? value.targetId !== null && /^\d{14}-[a-z0-9]{7}$/i.test(value.targetId) && value.affectedCount === 1
      : noId ? value.targetId === null : value.targetId !== null);
});

export type HomepageMcpWritePreview = z.infer<typeof homepageMcpWritePreviewSchema>;

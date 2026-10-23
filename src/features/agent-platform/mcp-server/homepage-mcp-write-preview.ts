import { z } from "zod";

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
  add_key: { name: "新增数据库文本字段", consequence: "向指定思源数据库新增一个普通文本字段，不删除已有字段或条目。" },
  update_cell: { name: "修改数据库单元格", consequence: "仅修改指定数据库条目的一个普通文本字段。" },
  clear_cell: { name: "清空数据库单元格", consequence: "清空指定数据库条目的一个普通文本字段，原字段值将被移除；不会删除数据库、字段、条目或关联的思源文档。" },
  add_rows: { name: "新增数据库条目", consequence: "向指定数据库新增一条脱离块记录，只填写标题；不会创建独立思源文档，也不会修改已有数据库条目。" },
  remove_rows: { name: "移除数据库条目", consequence: "本操作只移除数据库中的指定记录。脱离块记录会被移除；绑定块记录只解除数据库关联，不会删除原始思源块或文档。" },
} as const;
export const HOMEPAGE_MCP_WRITES_BY_TOOL: Record<string, Record<string, { name: string; consequence: string }>> = {
  homepage_components: HOMEPAGE_MCP_WRITES,
  siyuan_database: HOMEPAGE_MCP_DATABASE_WRITES,
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
export type HomepageMcpDatabaseWriteAction = keyof typeof HOMEPAGE_MCP_DATABASE_WRITES;
export type HomepageMcpAnniversaryWriteAction = keyof typeof HOMEPAGE_MCP_ANNIVERSARY_WRITES;
export type HomepageMcpWriteAction = keyof typeof HOMEPAGE_MCP_WRITES | keyof typeof HOMEPAGE_MCP_DATABASE_WRITES;

export function isHomepageMcpFavoriteWriteAction(action: string): action is HomepageMcpFavoriteWriteAction {
  return Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_FAVORITES_WRITES, action);
}
export function isHomepageMcpAnniversaryWriteAction(action: string): action is HomepageMcpAnniversaryWriteAction {
  return Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_ANNIVERSARY_WRITES, action);
}

const text = z.string().min(1).max(1024).refine((value) => value.trim().length > 0 &&
  Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));

export const homepageMcpWritePreviewSchema = z.object({
  action: z.enum([...Object.keys(HOMEPAGE_MCP_WRITES), ...Object.keys(HOMEPAGE_MCP_DATABASE_WRITES)] as [HomepageMcpWriteAction, ...HomepageMcpWriteAction[]]),
  operationName: text.max(60),
  targetName: text,
  targetId: text.max(128).nullable(),
  consequence: text,
  affectedCount: z.number().int().min(0).max(1_000_000),
  details: z.array(z.object({ label: text.max(60), value: text }).strict()).max(16),
}).strict().refine((value) => {
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

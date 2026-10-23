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
} as const;

export const HOMEPAGE_MCP_WRITES = { ...HOMEPAGE_MCP_FAVORITES_WRITES, ...HOMEPAGE_MCP_ANNIVERSARY_WRITES } as const;
export type HomepageMcpAnniversaryWriteAction = keyof typeof HOMEPAGE_MCP_ANNIVERSARY_WRITES;
export type HomepageMcpWriteAction = keyof typeof HOMEPAGE_MCP_WRITES;

export function isHomepageMcpFavoriteWriteAction(action: string): action is HomepageMcpFavoriteWriteAction {
  return Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_FAVORITES_WRITES, action);
}

const text = z.string().min(1).max(1024).refine((value) => value.trim().length > 0 &&
  Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));

export const homepageMcpWritePreviewSchema = z.object({
  action: z.enum(Object.keys(HOMEPAGE_MCP_WRITES) as [HomepageMcpWriteAction, ...HomepageMcpWriteAction[]]),
  operationName: text.max(60),
  targetName: text,
  targetId: text.max(128).nullable(),
  consequence: text,
  affectedCount: z.number().int().min(0).max(1_000_000),
  details: z.array(z.object({ label: text.max(60), value: text }).strict()).max(16),
}).strict().refine((value) => {
  const operation = HOMEPAGE_MCP_WRITES[value.action];
  if (Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_ANNIVERSARY_WRITES, value.action)) {
    return value.operationName === operation.name && value.consequence === operation.consequence && value.affectedCount === 1 &&
      (value.action === "homepage_anniversary.add" ? value.targetId === null : value.targetId !== null);
  }
  const documentAction = ["homepage_favorites.add", "homepage_favorites.remove", "homepage_favorites.move_to_group"].includes(value.action);
  const noId = value.action === "homepage_favorites.create_group" || value.action === "homepage_favorites.reorder";
  return value.operationName === operation.name && value.consequence === operation.consequence &&
    (documentAction ? value.targetId !== null && /^\d{14}-[a-z0-9]{7}$/i.test(value.targetId) && value.affectedCount === 1
      : noId ? value.targetId === null : value.targetId !== null);
});

export type HomepageMcpWritePreview = z.infer<typeof homepageMcpWritePreviewSchema>;

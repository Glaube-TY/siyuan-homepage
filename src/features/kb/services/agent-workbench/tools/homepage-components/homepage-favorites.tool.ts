import { z } from "zod";
import type { ToolContract } from "../../contracts/tool-contract";
import { updateFavoriteIndex } from "@/components/tools/siyuanComponentDataApi";
import {
  createGroup,
  deleteGroup,
  loadFavoritesForUI,
  removeFavoriteItem,
  renameGroup,
  reorderFavoriteItems,
  setItemGroup,
} from "@/features/favorites-manager/favorites-store";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const docIdSchema = z.string().regex(/^\d{14}-[a-z0-9]{7}$/i);
const listSchema = z.object({ groupId: z.string().trim().optional(), notebook: z.string().trim().optional(), keyword: z.string().trim().optional(), limit: z.number().int().min(1).max(200).default(50) }).strict();
const docSchema = z.object({ docId: docIdSchema }).strict();
const removeSchema = docSchema.extend({ expectedUpdatedAt: z.string().min(1) }).strict();
const addSchema = docSchema.extend({ groupId: z.string().trim().min(1).nullable().optional() }).strict();
const moveSchema = z.object({ docId: docIdSchema, groupId: z.string().trim().min(1).nullable(), expectedUpdatedAt: z.string().min(1) }).strict();
const groupSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
const renameSchema = z.object({ groupId: z.string().trim().min(1), name: z.string().trim().min(1).max(60), expectedUpdatedAt: z.string().min(1), expectedGroupUpdatedAt: z.string().min(1) }).strict();
const deleteGroupSchema = z.object({ groupId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1), expectedGroupUpdatedAt: z.string().min(1), expectedItemCount: z.number().int().nonnegative() }).strict();
const reorderSchema = z.object({ docIds: z.array(docIdSchema).min(1).max(200), expectedUpdatedAt: z.string().min(1) }).strict();

function actionTool<T>(name: string, schema: z.ZodType<T>, readOnly: boolean, execute: (input: T) => Promise<unknown>, high = false): ToolContract {
  return { name: `homepage_favorites_${name}`, title: name, description: `homepage_favorites.${name}`, inputSchema: schema, readOnly, safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: high ? "high" : "medium" }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw) { try { return { ok: true, data: await execute(schema.parse(raw)) }; } catch (error) { return homepageComponentFailure(error, `favorites_${name}_failed`, `收藏操作 ${name} 失败。`); } }, summarizeResult: (result) => result.ok ? `收藏 ${name} 完成。` : result.error?.message ?? "收藏操作失败。" };
}

export function createHomepageFavoritesActionTools(): Array<{ action: string; tool: ToolContract }> {
  return [
    { action: "list", tool: actionTool("list", listSchema, true, async (input) => {
      const payload = await loadFavoritesForUI();
      const groups = new Map(payload.groups.map((group) => [group.id, group]));
      const keyword = input.keyword?.toLowerCase();
      return { updatedAt: payload.updatedAt, favorites: payload.items.filter((item) => (!input.groupId || item.favoriteGroupId === input.groupId) && (!input.notebook || item.box === input.notebook) && (!keyword || [item.content, item.hpath, item.path].some((value) => String(value ?? "").toLowerCase().includes(keyword)))).sort((a, b) => Number(a.favoriteOrder ?? 0) - Number(b.favoriteOrder ?? 0)).slice(0, input.limit).map((item) => ({ docId: item.id, title: item.content ?? item.id, path: item.hpath || item.path || "", notebook: item.box ?? "", groupId: item.favoriteGroupId ?? null, group: item.favoriteGroupId ? groups.get(item.favoriteGroupId)?.name ?? null : null, favoritedAt: item.favoritedAt ?? "" })) };
    }) },
    { action: "add", tool: actionTool("add", addSchema, false, async ({ docId, groupId }) => {
      await updateFavoriteIndex(docId, true, { groupId });
      const after = await loadFavoritesForUI();
      const item = after.items.find((row) => row.id === docId);
      if (!item || (groupId && item.favoriteGroupId !== groupId)) throw new Error("收藏写后验证失败。");
      return { docId, title: item.content ?? docId, groupId: item.favoriteGroupId ?? null, favoritedAt: item.favoritedAt ?? "" };
    }) },
    { action: "remove", tool: actionTool("remove", removeSchema, false, async ({ docId, expectedUpdatedAt }) => { await removeFavoriteItem(docId, { expectedUpdatedAt }); const payload = await loadFavoritesForUI(); if (payload.items.some((item) => item.id === docId)) throw new Error("取消收藏写后验证失败。"); return { docId, favorited: false, updatedAt: payload.updatedAt }; }) },
    { action: "move_to_group", tool: actionTool("move_to_group", moveSchema, false, async ({ docId, groupId, expectedUpdatedAt }) => { const before = await loadFavoritesForUI(); if (!before.items.some((item) => item.id === docId)) throw new Error("收藏文档不存在。"); if (groupId && !before.groups.some((group) => group.id === groupId)) throw new Error("收藏分组不存在。"); await setItemGroup(docId, groupId, { expectedUpdatedAt }); const after = await loadFavoritesForUI(); if ((after.items.find((item) => item.id === docId)?.favoriteGroupId ?? null) !== groupId) throw new Error("收藏分组写后验证失败。"); return { docId, groupId, updatedAt: after.updatedAt }; }) },
    { action: "list_groups", tool: actionTool("list_groups", z.object({}).strict(), true, async () => { const payload = await loadFavoritesForUI(); return { updatedAt: payload.updatedAt, groups: payload.groups.sort((a, b) => a.order - b.order).map((group) => ({ groupId: group.id, name: group.name, order: group.order, updatedAt: group.updatedAt, itemCount: payload.items.filter((item) => item.favoriteGroupId === group.id).length })), ungroupedCount: payload.items.filter((item) => !item.favoriteGroupId).length }; }) },
    { action: "create_group", tool: actionTool("create_group", groupSchema, false, async ({ name }) => { const group = await createGroup(name); return { groupId: group.id, name: group.name, order: group.order, updatedAt: group.updatedAt }; }) },
    { action: "rename_group", tool: actionTool("rename_group", renameSchema, false, async ({ groupId, name, expectedUpdatedAt, expectedGroupUpdatedAt }) => { await renameGroup(groupId, name, { expectedUpdatedAt, expectedGroupUpdatedAt }); const payload = await loadFavoritesForUI(); const group = payload.groups.find((item) => item.id === groupId); if (group?.name !== name) throw new Error("收藏分组重命名后验证失败。"); return { groupId, name, groupUpdatedAt: group.updatedAt, updatedAt: payload.updatedAt }; }) },
    { action: "delete_group", tool: actionTool("delete_group", deleteGroupSchema, false, async ({ groupId, expectedUpdatedAt, expectedGroupUpdatedAt, expectedItemCount }) => { await deleteGroup(groupId, { expectedUpdatedAt, expectedGroupUpdatedAt, expectedItemCount }); const after = await loadFavoritesForUI(); if (after.groups.some((group) => group.id === groupId) || after.items.some((item) => item.favoriteGroupId === groupId)) throw new Error("删除收藏分组后验证失败。"); return { groupId, deleted: true, movedToUngrouped: expectedItemCount, updatedAt: after.updatedAt }; }, true) },
    { action: "reorder", tool: actionTool("reorder", reorderSchema, false, async ({ docIds, expectedUpdatedAt }) => { if (new Set(docIds).size !== docIds.length) throw new Error("收藏顺序中不能包含重复 ID。"); const before = await loadFavoritesForUI(); if (docIds.some((id) => !before.items.some((item) => item.id === id))) throw new Error("收藏顺序包含不存在的文档。"); await reorderFavoriteItems(docIds, { expectedUpdatedAt }); const after = await loadFavoritesForUI(); const actual = after.items.slice().sort((a, b) => Number(a.favoriteOrder ?? 0) - Number(b.favoriteOrder ?? 0)).filter((item) => docIds.includes(item.id)).map((item) => item.id); if (actual.join("|") !== docIds.join("|")) throw new Error("收藏重排序后验证失败。"); return { docIds: actual, updatedAt: after.updatedAt }; }) },
  ];
}

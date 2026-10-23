import SHA256 from "crypto-js/sha256";
import { getBlockInfo } from "../../api";
import { loadFavoritesForUI, readFavoritesIndexStrict, verifyFavoritesReorder } from "../../features/favorites-manager/favorites-store";
import type { FavoritesIndexPayloadV2 } from "../../features/favorites-manager/types";
import {
  HOMEPAGE_MCP_FAVORITES_WRITES, homepageMcpWritePreviewSchema,
  type HomepageMcpFavoriteWriteAction, type HomepageMcpWritePreview,
} from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";

export class HomepageMcpFavoritesConflict extends Error {}

export interface PreparedFavoriteWrite {
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  before: FavoritesIndexPayloadV2;
}

function safeText(value: unknown, max = 1024): string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error("收藏目标信息无效。");
  }
  return value;
}

async function documentTitle(docId: string): Promise<string> {
  const info = await getBlockInfo(docId);
  if (!info || info.rootID !== docId || info.rootTitleEmpty === true) throw new Error("无法确认目标文档。");
  return safeText(info.rootTitle);
}

export async function prepareHomepageMcpFavoriteWrite(action: HomepageMcpFavoriteWriteAction, args: Record<string, unknown>): Promise<PreparedFavoriteWrite> {
  const read = await readFavoritesIndexStrict();
  if (read.kind === "corrupt") throw new Error("无法读取收藏状态。");
  // 缺失是已知空状态；不将 loadFavoritesForUI 的临时时间戳作为版本。
  const before: FavoritesIndexPayloadV2 = read.kind === "missing"
    ? { version: 2, updatedAt: "", items: [], groups: [] } : read.payload;
  if (before.items.length > 10_000 || before.groups.length > 10_000) throw new Error("收藏状态超出审批边界。");
  const group = (id: string) => {
    const found = before.groups.find((row) => row.id === id);
    if (!found) throw new Error("收藏分组不存在。");
    safeText(found.id, 128);
    safeText(found.name, 60);
    return found;
  };
  const groupLabel = (id: string | null | undefined) => id == null ? "未分组" : group(id).name;
  if (args.expectedUpdatedAt !== undefined && args.expectedUpdatedAt !== before.updatedAt) throw new HomepageMcpFavoritesConflict();
  const operation = HOMEPAGE_MCP_FAVORITES_WRITES[action];
  const preview: HomepageMcpWritePreview = {
    action, operationName: operation.name, consequence: operation.consequence,
    targetName: operation.name, targetId: null, affectedCount: 0, details: [],
  };
  const detail = (label: string, value: string) => preview.details.push({ label, value });
  if (action === "homepage_favorites.add" || action === "homepage_favorites.remove" || action === "homepage_favorites.move_to_group") {
    const docId = args.docId as string;
    const item = before.items.find((row) => row.id === docId);
    if (action !== "homepage_favorites.add" && !item) throw new Error("目标不在收藏中。");
    preview.targetName = await documentTitle(docId);
    preview.targetId = docId;
    preview.affectedCount = 1;
    const current = groupLabel(item?.favoriteGroupId);
    if (action === "homepage_favorites.add") {
      detail("目标分组", args.groupId === undefined
        ? `保留已有收藏分组（当前：${current}；新收藏不分组）`
        : args.groupId === null ? "未分组（明确指定）" : groupLabel((args.groupId as string).trim()));
    } else {
      detail("当前分组", current);
      if (action === "homepage_favorites.move_to_group") detail("目标分组", args.groupId === null ? "未分组（明确指定）" : groupLabel((args.groupId as string).trim()));
    }
  } else if (action === "homepage_favorites.create_group") {
    preview.targetName = safeText((args.name as string).trim(), 60);
    if (before.groups.some((row) => row.name === preview.targetName)) throw new Error("分组名称已存在。");
  } else if (action === "homepage_favorites.rename_group" || action === "homepage_favorites.delete_group") {
    const target = group((args.groupId as string).trim());
    if (args.expectedGroupUpdatedAt !== target.updatedAt) throw new HomepageMcpFavoritesConflict();
    preview.targetName = target.name;
    preview.targetId = target.id;
    preview.affectedCount = before.items.filter((row) => row.favoriteGroupId === target.id).length;
    if (action === "homepage_favorites.rename_group") {
      const name = safeText((args.name as string).trim(), 60);
      if (before.groups.some((row) => row.id !== target.id && row.name === name)) throw new Error("分组名称已存在。");
      detail("新名称", name);
    } else {
      if (args.expectedItemCount !== preview.affectedCount) throw new HomepageMcpFavoritesConflict();
      detail("成员收藏去向", "全部移至未分组，保留收藏及思源原始文档");
    }
  } else {
    const ids = args.docIds as string[];
    if (new Set(ids).size !== ids.length) throw new Error("排序 ID 重复。");
    const items = ids.map((id) => {
      const item = before.items.find((row) => row.id === id);
      if (!item) throw new Error("排序目标不存在。");
      safeText(item.content);
      return item;
    });
    preview.affectedCount = ids.length;
    for (const [index, item] of items.slice(0, 5).entries()) detail(`顺序 ${index + 1}`, `${safeText(item.content).slice(0, 120)}（${item.id}）`);
    if (ids.length > 5) detail("其余目标", `另有 ${ids.length - 5} 项；完整 ID 顺序参与确认校验`);
  }
  const safePreview = homepageMcpWritePreviewSchema.parse(preview);
  // 仅保存摘要；不把索引、文档内容或路径放入待审批记录。
  const state = JSON.stringify([
    read.kind, before.updatedAt,
    before.items.map((row) => [row.id, row.favoriteGroupId ?? null, row.favoriteOrder ?? null]),
    before.groups.map((row) => [row.id, row.name, row.order, row.updatedAt]), safePreview,
  ]);
  if (state.length > 1_000_000) throw new Error("收藏状态超出审批边界。");
  return { preview: safePreview, stateFingerprint: SHA256(state).toString(), before };
}

export async function verifyHomepageMcpFavoriteWrite(action: HomepageMcpFavoriteWriteAction, args: Record<string, unknown>, prepared: PreparedFavoriteWrite, data: unknown): Promise<boolean> {
  if (!data || typeof data !== "object") return false;
  const envelope = data as { action?: unknown; result?: Record<string, unknown> };
  if (envelope.action !== action || !envelope.result || typeof envelope.result !== "object") return false;
  const result = envelope.result;
  const after = await loadFavoritesForUI();
  const before = prepared.before;
  const sameMembers = after.items.length === before.items.length && before.items.every((row) => after.items.some((item) => item.id === row.id));
  const item = after.items.find((row) => row.id === args.docId);
  switch (action) {
    case "homepage_favorites.add": {
      const expectedGroup = args.groupId === undefined
        ? before.items.find((row) => row.id === args.docId)?.favoriteGroupId ?? null
        : typeof args.groupId === "string" ? args.groupId.trim() : null;
      return !!item && result.docId === args.docId && (item.favoriteGroupId ?? null) === expectedGroup;
    }
    case "homepage_favorites.remove":
      return !item && result.docId === args.docId && result.favorited === false;
    case "homepage_favorites.move_to_group":
      return sameMembers && !!item && result.docId === args.docId && (item.favoriteGroupId ?? null) === (typeof args.groupId === "string" ? args.groupId.trim() : null);
    case "homepage_favorites.create_group":
      return sameMembers && typeof result.groupId === "string" && !before.groups.some((row) => row.id === result.groupId) &&
        after.groups.some((row) => row.id === result.groupId && row.name === (args.name as string).trim());
    case "homepage_favorites.rename_group":
      return sameMembers && result.groupId === (args.groupId as string).trim() && after.groups.some((row) => row.id === result.groupId && row.name === (args.name as string).trim());
    case "homepage_favorites.delete_group": {
      const id = (args.groupId as string).trim();
      if (!sameMembers || result.groupId !== id || result.deleted !== true || after.groups.some((row) => row.id === id)) return false;
      for (const member of before.items.filter((row) => row.favoriteGroupId === id)) {
        if (after.items.find((row) => row.id === member.id)?.favoriteGroupId != null) return false;
        await documentTitle(member.id);
      }
      return !after.items.some((row) => row.favoriteGroupId === id);
    }
    case "homepage_favorites.reorder": {
      const ids = args.docIds as string[];
      return JSON.stringify(result.docIds) === JSON.stringify(ids) && verifyFavoritesReorder(before, after, ids);
    }
  }
}

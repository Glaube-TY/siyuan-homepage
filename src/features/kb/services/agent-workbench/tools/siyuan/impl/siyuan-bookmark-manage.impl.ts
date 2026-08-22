import { getBookmark, setBlockAttrsChecked } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanBookmarkManageInput } from "../contracts/siyuan-bookmark-manage.contract";
import { SiyuanToolInvalidArgsError } from "../siyuan-generic-tool-factory";
import { outputForAction } from "./siyuan-tool-impl-utils.impl";

interface BookmarkBlockItem {
  id: string;
  bookmark: string;
  contentPreview: string;
  created?: string;
  updated?: string;
}

const STRUCTURAL_BOOKMARK_KEYS = new Set([
  "data",
  "items",
  "children",
  "blocks",
  "bookmarks",
  "bookmarkList",
  "list",
  "rows",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringField(value: unknown, keys: string[]): string {
  if (!isRecord(value)) {
    return "";
  }
  for (const key of keys) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string") {
      return fieldValue.trim();
    }
    if (typeof fieldValue === "number" || typeof fieldValue === "boolean") {
      return String(fieldValue);
    }
  }
  return "";
}

function previewText(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

function safeErrorSummary(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 160 ? `${message.slice(0, 160)}...` : message;
}

function bookmarkMatchesKeyword(bookmark: string, keyword?: string): boolean {
  if (!keyword) {
    return true;
  }
  return bookmark.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

function collectBookmarkApiItems(
  value: unknown,
  currentBookmark: string,
  keyword: string | undefined,
  maxItems: number,
  maxChars: number,
  items: BookmarkBlockItem[],
  seen: Set<string>,
): void {
  if (items.length >= maxItems) {
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      collectBookmarkApiItems(child, currentBookmark, keyword, maxItems, maxChars, items, seen);
      if (items.length >= maxItems) {
        return;
      }
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const explicitBookmark = readStringField(value, ["bookmark", "Bookmark", "BOOKMARK"]);
  const itemBookmark = explicitBookmark || currentBookmark;
  const id = readStringField(value, ["id", "ID"]);
  if (id && itemBookmark && bookmarkMatchesKeyword(itemBookmark, keyword)) {
    const dedupeKey = `${id}\u0000${itemBookmark}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      const content = readStringField(value, ["content", "Content", "markdown", "Markdown", "fcontent", "FContent", "title", "Title", "name", "Name"]);
      items.push({
        id,
        bookmark: itemBookmark,
        contentPreview: previewText(content, maxChars),
        created: readStringField(value, ["created", "Created"]),
        updated: readStringField(value, ["updated", "Updated"]),
      });
    }
  }

  const containerBookmark = itemBookmark || readStringField(value, ["label", "Label", "name", "Name"]);
  for (const [key, child] of Object.entries(value)) {
    if (items.length >= maxItems) {
      return;
    }
    const childBookmark = containerBookmark || (STRUCTURAL_BOOKMARK_KEYS.has(key) ? "" : key);
    collectBookmarkApiItems(child, childBookmark, keyword, maxItems, maxChars, items, seen);
  }
}

async function listBookmarkBlocksFromApi(keyword: string | undefined, maxItems: number, maxChars: number): Promise<BookmarkBlockItem[]> {
  const data = await getBookmark();
  const items: BookmarkBlockItem[] = [];
  collectBookmarkApiItems(data, "", keyword, maxItems, maxChars, items, new Set<string>());
  return items;
}

export async function executeSiyuanBookmarkManage(args: SiyuanBookmarkManageInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "list":
      data = await getBookmark();
      break;
    case "list_blocks": {
      const maxItems = args.maxItems ?? 50;
      const keyword = args.keyword?.trim();
      const maxChars = args.maxChars ?? 2000;
      const apiItems = await listBookmarkBlocksFromApi(keyword, maxItems, maxChars);
      data = {
        total: apiItems.length,
        source: "getBookmark",
        items: apiItems,
      };
      break;
    }
    case "rename": {
      const oldBookmark = args.oldBookmark;
      const newBookmark = args.newBookmark;
      const blockIds = args.blockIds;
      if (!blockIds || blockIds.length === 0) {
        throw new SiyuanToolInvalidArgsError("bookmark.rename 必须提供 blockIds；请先调用 list_blocks 定位真实块 ID。");
      }
      const results: Array<{ blockId: string; ok: boolean; reason?: string }> = [];
      for (const blockId of blockIds) {
        try {
          await setBlockAttrsChecked(blockId, { bookmark: newBookmark });
          results.push({ blockId, ok: true });
        } catch (err) {
          results.push({ blockId, ok: false, reason: safeErrorSummary(err) });
        }
      }
      const successCount = results.filter((r) => r.ok).length;
      if (successCount === 0) {
        const reasons = results.map((r) => `${r.blockId}: ${r.reason ?? "失败"}`).join("; ");
        throw new Error(`bookmark.rename 对 ${results.length} 个块执行 setBlockAttrs 全部失败。失败摘要：${reasons.slice(0, 400)}`);
      }
      data = { method: "setBlockAttrs", oldBookmark, newBookmark, affectedBlocks: successCount, totalBlocks: results.length, results };
      break;
    }
    case "remove": {
      const bookmark = args.bookmark;
      const blockIds = args.blockIds;
      if (!blockIds || blockIds.length === 0) {
        throw new SiyuanToolInvalidArgsError("bookmark.remove 必须提供 blockIds；请先调用 list_blocks 定位真实块 ID。");
      }
      const results: Array<{ blockId: string; ok: boolean; reason?: string }> = [];
      for (const blockId of blockIds) {
        try {
          await setBlockAttrsChecked(blockId, { bookmark: "" });
          results.push({ blockId, ok: true });
        } catch (err) {
          results.push({ blockId, ok: false, reason: safeErrorSummary(err) });
        }
      }
      const successCount = results.filter((r) => r.ok).length;
      if (successCount === 0) {
        const reasons = results.map((r) => `${r.blockId}: ${r.reason ?? "失败"}`).join("; ");
        throw new Error(`bookmark.remove 对 ${results.length} 个块执行 setBlockAttrs 全部失败。失败摘要：${reasons.slice(0, 400)}`);
      }
      data = { method: "setBlockAttrs", bookmark, affectedBlocks: successCount, totalBlocks: results.length, results };
      break;
    }
  }
  return { output: outputForAction(args.action, data) };
}

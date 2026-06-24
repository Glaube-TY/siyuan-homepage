import { getBookmark, removeBookmark, renameBookmark, sqlChecked } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanBookmarkManageInput } from "../contracts/siyuan-bookmark-manage.contract";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanBookmarkManage(args: SiyuanBookmarkManageInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "list":
      data = await getBookmark();
      break;
    case "list_blocks": {
      const maxItems = args.maxItems ?? 50;
      const keyword = args.keyword?.trim();
      let stmt: string;
      if (keyword) {
        const safeKw = keyword.replace(/'/g, "''");
        stmt = `SELECT id, content, created, updated, bookmark FROM blocks WHERE bookmark IS NOT NULL AND bookmark != '' AND (bookmark LIKE '%${safeKw}%' OR content LIKE '%${safeKw}%') ORDER BY updated DESC LIMIT ${maxItems}`;
      } else {
        stmt = `SELECT id, content, created, updated, bookmark FROM blocks WHERE bookmark IS NOT NULL AND bookmark != '' ORDER BY updated DESC LIMIT ${maxItems}`;
      }
      const rows = await sqlChecked(stmt);
      const maxChars = args.maxChars ?? 2000;
      data = {
        total: rows.length,
        items: rows.map((row: any) => ({
          id: row.id ?? "",
          bookmark: row.bookmark ?? "",
          contentPreview: typeof row.content === "string"
            ? (row.content.length > maxChars ? row.content.slice(0, maxChars) : row.content)
            : String(row.content ?? ""),
          created: row.created ?? "",
          updated: row.updated ?? "",
        })),
      };
      break;
    }
    case "rename":
      data = await renameBookmark(requireString(args.oldLabel, "oldLabel"), requireString(args.newLabel, "newLabel"));
      break;
    case "remove":
      data = await removeBookmark(requireString(args.label, "label"));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

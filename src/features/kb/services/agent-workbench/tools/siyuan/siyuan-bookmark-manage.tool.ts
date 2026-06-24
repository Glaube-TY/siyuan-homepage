import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanBookmarkManageInputSchema, type SiyuanBookmarkManageInput } from "./contracts/siyuan-bookmark-manage.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanBookmarkManageDeps {
  executeSiyuanBookmarkManage(args: SiyuanBookmarkManageInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanBookmarkManageTool(deps: SiyuanBookmarkManageDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_bookmark_manage",
    title: "管理书签",
    description: "列出书签或书签块、重命名或删除书签。list/list_blocks 只读不需要确认；rename/remove 写入确认。不要用 SQL 查书签——用 list_blocks 即可。",
    inputSchema: siyuanBookmarkManageInputSchema,
    readOnly: false,
    inputHint: "action=list/list_blocks/rename/remove；list_blocks 列出带 bookmark 属性的块，可选 keyword/maxItems；rename 需要 oldLabel/newLabel，remove 需要 label。",
    boundary: "list/list_blocks 只读；rename/remove 写入确认。list_blocks 返回 bookmark 非空的块的 id/contentPreview/created/updated/bookmark。",
    deps: { execute: deps.executeSiyuanBookmarkManage },
    inputJsonSchemaOverride: undefined,
  });
}

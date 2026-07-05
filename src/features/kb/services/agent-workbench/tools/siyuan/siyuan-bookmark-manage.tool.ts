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
    description: "列出书签或书签块、重命名或删除书签。list/list_blocks 只读不需要确认；rename/remove 必须提供 blockIds 并写入确认。rename/remove 前先用 list_blocks 定位真实块 ID。",
    inputSchema: siyuanBookmarkManageInputSchema,
    readOnly: false,
    inputHint: "action=list/list_blocks/rename/remove；rename/remove 必须提供 blockIds；rename 优先使用 oldBookmark/newBookmark；remove 优先使用 bookmark；oldLabel/newLabel/label 仅作为兼容旧字段。",
    boundary: "list/list_blocks 只读；rename/remove 写入确认且必须提供 blockIds。list_blocks 返回 bookmark 非空的块的 id/contentPreview/created/updated/bookmark；rename/remove 通过 setBlockAttrs 按块操作，不调用全局 bookmark rename/remove API。",
    deps: { execute: deps.executeSiyuanBookmarkManage },
    inputJsonSchemaOverride: undefined,
  });
}

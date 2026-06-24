import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanTagManageInputSchema, type SiyuanTagManageInput } from "./contracts/siyuan-tag-manage.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanTagManageDeps {
  executeSiyuanTagManage(args: SiyuanTagManageInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanTagManageTool(deps: SiyuanTagManageDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_tag_manage",
    title: "管理标签",
    description: "列出、搜索、重命名或删除标签。",
    inputSchema: siyuanTagManageInputSchema,
    readOnly: false,
    inputHint: "action=list/search/rename/remove；rename 需要 oldLabel/newLabel，remove 需要 label。",
    boundary: "list/search 只读；rename/remove 写入确认。",
    deps: { execute: deps.executeSiyuanTagManage },
    inputJsonSchemaOverride: undefined,
  });
}

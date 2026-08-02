import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanDocTreeInputSchema, type SiyuanDocTreeInput } from "./contracts/siyuan-doc-tree.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanDocTreeDeps {
  executeSiyuanDocTree(args: SiyuanDocTreeInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanDocTreeTool(deps: SiyuanDocTreeDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_doc_tree",
    title: "管理文档树",
    description: "列出文档树子节点/树结构，移动、按 ID 移动、复制或排序文档树节点。",
    inputSchema: siyuanDocTreeInputSchema,
    readOnly: false,
    readOnlyActions: ["list_children", "list_tree"],
    inputHint: "查看树用 notebook（笔记本 ID）。move 用 fromPaths/toPath（存储路径）+ toNotebook；move_by_id 用 ids（文档 ID）+ targetID（父文档或笔记本 ID）；duplicate 只要 id（源文档 ID）；sort 用 notebook + fromPaths（排序后的存储路径数组）。",
    boundary: "不负责创建、重命名、删除文档；写入 action 必须确认。",
    deps: { execute: deps.executeSiyuanDocTree },
    inputJsonSchemaOverride: undefined,
  });
}

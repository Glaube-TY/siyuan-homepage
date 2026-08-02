import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanDocTransformInputSchema, type SiyuanDocTransformInput } from "./contracts/siyuan-doc-transform.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanDocTransformDeps {
  executeSiyuanDocTransform(args: SiyuanDocTransformInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanDocTransformTool(deps: SiyuanDocTransformDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_doc_transform",
    title: "转换文档结构",
    description: "转换文档结构；参数明确区分源文档 ID、目标块 ID、标题块 ID、列表项块 ID和目标笔记本 ID。",
    inputSchema: siyuanDocTransformInputSchema,
    readOnly: false,
    inputHint: "doc_to_heading: sourceDocId + targetBlockId + after；heading_to_doc: sourceHeadingId + targetNotebookId + targetPath；list_item_to_doc: sourceListItemId + targetNotebookId + targetPath。根目录 targetPath 为 /，可选 previousPath/toTop。",
    boundary: "高风险结构写入；不替代 create_doc/rename_doc/delete_doc。",
    deps: { execute: deps.executeSiyuanDocTransform },
    inputJsonSchemaOverride: undefined,
  });
}

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
    description: "执行文档转标题、标题转文档、列表项转文档等结构转换。",
    inputSchema: siyuanDocTransformInputSchema,
    readOnly: false,
    inputHint: "action 指定转换类型；按 action 提供 id/path/targetPath。",
    boundary: "高风险结构写入；不替代 create_doc/rename_doc/delete_doc。",
    deps: { execute: deps.executeSiyuanDocTransform },
    inputJsonSchemaOverride: undefined,
  });
}

import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanDocPathInputSchema, type SiyuanDocPathInput } from "./contracts/siyuan-doc-path.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanDocPathDeps {
  executeSiyuanDocPath(args: SiyuanDocPathInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanDocPathTool(deps: SiyuanDocPathDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_doc_path",
    title: "解析文档路径",
    description: "只读解析 path、hpath、full hpath 和 docId 之间的关系。",
    inputSchema: siyuanDocPathInputSchema,
    readOnly: true,
    inputHint: "action 指定 hpath_by_path/hpaths_by_paths/hpath_by_id/path_by_id/full_hpath_by_id/ids_by_hpath。",
    boundary: "只做路径和 ID 解析，不写入。",
    deps: { execute: deps.executeSiyuanDocPath },
    inputJsonSchemaOverride: undefined,
  });
}

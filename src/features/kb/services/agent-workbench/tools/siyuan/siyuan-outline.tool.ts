import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanOutlineInputSchema, type SiyuanOutlineInput } from "./contracts/siyuan-outline.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanOutlineDeps {
  executeSiyuanOutline(args: SiyuanOutlineInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanOutlineTool(deps: SiyuanOutlineDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_outline",
    title: "查看文档大纲",
    description: "只读查看指定文档的标题结构，用于理解文档层级，不读取整篇正文。",
    inputSchema: siyuanOutlineInputSchema,
    readOnly: true,
    inputHint: "docId 必填；可用 maxDepth/maxItems 控制输出。",
    boundary: "只返回大纲结构；需要正文证据时使用 read_docs。",
    deps: { execute: deps.executeSiyuanOutline },
    inputJsonSchemaOverride: undefined,
  });
}

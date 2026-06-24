import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanAssetReadInputSchema, type SiyuanAssetReadInput } from "./contracts/siyuan-asset-read.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanAssetReadDeps {
  executeSiyuanAssetRead(args: SiyuanAssetReadInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanAssetReadTool(deps: SiyuanAssetReadDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_asset_read",
    title: "读取资源信息",
    description: "只读查看资源路径、文档资源、未使用/缺失资源、标注、OCR、统计和资源文本内容。",
    inputSchema: siyuanAssetReadInputSchema,
    readOnly: true,
    inputHint: "action 指定读取类型；path 或 docId 按 action 提供。",
    boundary: "不返回二进制内容；大量资源和资源内容会截断。",
    deps: { execute: deps.executeSiyuanAssetRead },
    inputJsonSchemaOverride: undefined,
  });
}

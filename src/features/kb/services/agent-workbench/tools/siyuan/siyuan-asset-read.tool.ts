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
    description: "只读查看资源路径、文档资源、未使用/缺失资源、思源 PDF .sya 标注、OCR、统计和资源文本内容；file_annotation 返回结构化标注或历史非法内容诊断；asset_content 优先读取索引，索引没有内容时只对小型安全文本文件回退读取。",
    inputSchema: siyuanAssetReadInputSchema,
    readOnly: true,
    inputHint: "action 指定读取类型；path 或 docId 按 action 提供。file_annotation 的 path 应是 PDF 或 .pdf.sya，返回 exists/valid/annotation（历史非法标注 JSON 返回 rawData）；asset_content 的 path 应来自 search_asset，返回 source=indexed/raw_text/unavailable。",
    boundary: "不返回二进制内容；未索引的二进制、未知大小或超过安全大小的文本资源返回结构化 unavailable；内容仍受 maxChars 限制。",
    deps: { execute: deps.executeSiyuanAssetRead },
    inputJsonSchemaOverride: undefined,
  });
}

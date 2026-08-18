import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanBlockReadInputSchema, type SiyuanBlockReadInput } from "./contracts/siyuan-block-read.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanBlockReadDeps {
  executeSiyuanBlockRead(args: SiyuanBlockReadInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanBlockReadTool(deps: SiyuanBlockReadDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_block_read",
    title: "读取块辅助信息",
    description: "只读获取块 DOM、Kramdown、子块、面包屑、索引、相关 ID、字数和存在性等信息。",
    inputSchema: siyuanBlockReadInputSchema,
    readOnly: true,
    inputHint: "这是 siyuan_doc_edit 的双层 action：外层 action 必须是 block_read；内层 args.action 才指定 info/dom/kramdown 等读取类型，id 或 ids 按内层 action 提供。",
    boundary: "文档编辑前定位真实 blockId 的辅助工具，不替代 read_doc_blocks。",
    deps: { execute: deps.executeSiyuanBlockRead },
    inputJsonSchemaOverride: undefined,
  });
}

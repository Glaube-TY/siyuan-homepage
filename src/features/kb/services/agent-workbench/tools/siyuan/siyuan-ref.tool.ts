import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanRefInputSchema, type SiyuanRefInput } from "./contracts/siyuan-ref.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanRefDeps {
  executeSiyuanRef(args: SiyuanRefInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanRefTool(deps: SiyuanRefDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_ref",
    title: "查找引用与反链",
    description: "只读查找反链、提及、引用块，或刷新反链索引。",
    inputSchema: siyuanRefInputSchema,
    readOnly: true,
    inputHint: "action 指定 backlink/backlink_doc/backmention_doc/search_ref_block/refresh_backlink。",
    boundary: "不做引用迁移；引用迁移使用文档编辑 Skill 的 siyuan_block_ref。",
    deps: { execute: deps.executeSiyuanRef },
    inputJsonSchemaOverride: undefined,
  });
}

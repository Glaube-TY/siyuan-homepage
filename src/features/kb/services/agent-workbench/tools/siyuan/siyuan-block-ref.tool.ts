import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanBlockRefInputSchema, type SiyuanBlockRefInput } from "./contracts/siyuan-block-ref.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanBlockRefDeps {
  executeSiyuanBlockRef(args: SiyuanBlockRefInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanBlockRefTool(deps: SiyuanBlockRefDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_block_ref",
    title: "读取或迁移块引用",
    description: "读取块引用信息，或执行高风险 swap/transfer 引用迁移。",
    inputSchema: siyuanBlockRefInputSchema,
    readOnly: false,
    inputHint: "读取 action 使用 id/refText；transfer_ref 使用 fromID/toID/refIDs。",
    boundary: "swap_ref/transfer_ref 会改变引用关系，必须使用真实 ID 并确认。",
    deps: { execute: deps.executeSiyuanBlockRef },
    inputJsonSchemaOverride: undefined,
  });
}

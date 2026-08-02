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
    readOnlyActions: ["get_ref_ids", "get_ref_text", "get_def_ids_by_ref_text", "check_ref"],
    inputHint: "id 是定义块 ID；anchor 是引用锚文本；ids 是待检查块 ID。swap_ref 使用引用所在块 refID、新定义块 defID 和 includeChildren；transfer_ref 使用原定义块 fromID、新定义块 toID、引用所在块 refIDs。",
    boundary: "refID/refIDs 是引用所在块 ID，defID/fromID/toID 是被引用的定义块 ID；swap_ref/transfer_ref 会改变引用关系，必须先读取真实 ID 并确认。",
    deps: { execute: deps.executeSiyuanBlockRef },
    inputJsonSchemaOverride: undefined,
  });
}

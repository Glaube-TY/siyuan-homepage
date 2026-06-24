import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanBlockAttrInputSchema, type SiyuanBlockAttrInput } from "./contracts/siyuan-block-attr.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanBlockAttrDeps {
  executeSiyuanBlockAttr(args: SiyuanBlockAttrInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanBlockAttrTool(deps: SiyuanBlockAttrDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_block_attr",
    title: "管理块属性",
    description: "读取、批量读取、设置或批量设置块属性。set/batch_set 会写入。",
    inputSchema: siyuanBlockAttrInputSchema,
    readOnly: false,
    inputHint: "action=get/batch_get/set/batch_set；写入时提供 attrs 或 items。",
    boundary: "写入属性必须确认；批量最多 20 个块，优先使用 custom-* 属性。",
    deps: { execute: deps.executeSiyuanBlockAttr },
    inputJsonSchemaOverride: undefined,
  });
}

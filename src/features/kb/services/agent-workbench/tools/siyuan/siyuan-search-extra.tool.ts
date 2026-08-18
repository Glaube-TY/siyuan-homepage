import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanSearchExtraInputSchema, type SiyuanSearchExtraInput } from "./contracts/siyuan-search-extra.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanSearchExtraDeps {
  executeSiyuanSearchExtra(args: SiyuanSearchExtraInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanSearchExtraTool(deps: SiyuanSearchExtraDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_search_extra",
    title: "特殊检索",
    description: "只读检索标签、模板、挂件、嵌入块、资源内容和无效块引用；asset_content 按 path 时优先使用索引，必要时仅回退读取小型安全文本文件。",
    inputSchema: siyuanSearchExtraInputSchema,
    readOnly: true,
    inputHint: "action 指定检索类型；keyword/path/id 按 action 提供。asset_content 传 path 读取单个资源，或传 keyword 做内容全文检索。",
    boundary: "不执行 findReplace 或 updateEmbedBlock 等写入操作。",
    deps: { execute: deps.executeSiyuanSearchExtra },
    inputJsonSchemaOverride: undefined,
  });
}

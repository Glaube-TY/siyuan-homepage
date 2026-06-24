import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanRiffDeckInputSchema, type SiyuanRiffDeckInput } from "./contracts/siyuan-riff-deck.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanRiffDeckDeps {
  executeSiyuanRiffDeck(args: SiyuanRiffDeckInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanRiffDeckTool(deps: SiyuanRiffDeckDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_riff_deck",
    title: "管理闪卡卡包",
    description: "创建、列出、重命名或删除 Riff deck。deck 为空不代表没有闪卡（卡片可以不属于任何自定义 deck）。查看全部闪卡用 siyuan_riff_card list_cards。",
    inputSchema: siyuanRiffDeckInputSchema,
    readOnly: false,
    inputHint: "action=create/list/rename/remove；create 需要 name，rename 需要 deckID/name，remove 需要 deckID。list 只读。",
    boundary: "list 只读；create/rename/remove 写入确认。deck 为空不代表没有闪卡。",
    deps: { execute: deps.executeSiyuanRiffDeck },
    inputJsonSchemaOverride: undefined,
  });
}

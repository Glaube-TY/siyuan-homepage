import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanRiffCardInputSchema, type SiyuanRiffCardInput } from "./contracts/siyuan-riff-card.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanRiffCardDeps {
  executeSiyuanRiffCard(args: SiyuanRiffCardInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanRiffCardTool(deps: SiyuanRiffCardDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_riff_card",
    title: "管理闪卡",
    description: "查询待复习/已有闪卡（due_cards/list_cards/notebook_cards/tree_cards/cards_by_block_ids 只读），添加/删除/复习/跳过/重置/设到期时间（写入需确认）。deck 为空不代表没有闪卡——用 list_cards(deckID='') 查全部卡片。add_cards/review/skip 需要真实 deckID（卡包ID）。",
    inputSchema: siyuanRiffCardInputSchema,
    readOnly: false,
    inputHint: "查询用 due_cards/list_cards/notebook_cards/tree_cards/cards_by_block_ids（只读）。写入用 add_cards/remove_cards/review/skip/reset/set_due_time（需确认）。list_cards 不传 deckID 或传空字符串可查全部卡片。add_cards/review/skip 必须提供真实 deckID（卡包ID），add_cards 缺少 deckID 会返回 invalid_args 错误。remove_cards 用 blockIDs 非 cardIDs。review 需要 deckID+cardID+rating(1-4)。reset 需要 resetType(notebook|tree|deck)+id+deckID。set_due_time 用 cardDues 数组。",
    boundary: "复习/跳过/重置/删除/设到期时间改变复习状态，必须确认。批量最多 50 张。deck 为空不代表没有闪卡。add_cards/review/skip 必须传入真实 deckID，缺少 deckID 时工具会拒绝执行。",
    deps: { execute: deps.executeSiyuanRiffCard },
    inputJsonSchemaOverride: undefined,
  });
}

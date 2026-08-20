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
    description: "查询待复习/已有闪卡，添加/删除/移动/复习/跳过/重置/设到期时间。ID 语义必须区分且必须使用完整 ID：cardID/riffCardID 是完整闪卡记录 ID（例如 20260703221339-at4oz7a，用于 set_due_time/review/skip/get_card_info）；blockID 是完整思源文档块 ID（用于 add_cards/remove_cards/cards_by_block_ids/move_cards）；deckID 是完整卡包 ID（用于 list_cards/review/skip/move_cards/reset/deck 操作）。get_card_info 只读，会匹配 list_cards 返回里的 riffCardID/cardID/id 等字段。reset 当 resetType='deck' 时 id 为目标 deckID，deckID 自动安全派生为 id（若传 deckID 则必须与 id 一致），blockIDs 可选（为空重置全部卡片）。set_due_time 使用完整 riffCardID，due 规范化为 YYYYMMDDHHmmss，内核字段为 cardDues[].due；当前 SiYuan Kernel 的 batchSetRiffCardsDueTime 仅在 builtin deck 中按 riffCardID 修改 Due，对自定义 Deck 中的 cardID 会静默跳过（code=0 但 due 不变），是否生效必须以 verification / list_cards / get_card_info 回读为准。deck 为空不代表没有闪卡——用 list_cards(deckID='') 查全部卡片。",
    inputSchema: siyuanRiffCardInputSchema,
    readOnly: false,
    readOnlyActions: [
      "due_cards", "tree_due_cards", "notebook_due_cards", "list_cards",
      "tree_cards", "notebook_cards", "cards_by_block_ids", "get_card_info",
    ],
    inputHint: "查询用 due_cards/list_cards/notebook_cards/tree_cards/cards_by_block_ids/get_card_info（只读）。写入用 add_cards/remove_cards/move_cards/review/skip/reset/set_due_time（需确认）。list_cards 不传 deckID 或传空字符串可查全部卡片。add_cards/remove_cards/cards_by_block_ids/move_cards 使用完整 blockID。review/skip/get_card_info/set_due_time 使用完整 riffCardID/cardID。move_cards 使用完整 fromDeckID/toDeckID + 完整 blockIDs。reset 的 resetType='deck' 时 id 必填且为 deckID，deckID 可省略或与 id 相同，blockIDs 可选。set_due_time 的 cardDues[].id 必须是完整 riffCardID（形如 20260703221339-at4oz7a），禁止短后缀；如目标卡在自定义 Deck 中，Kernel batchSetRiffCardsDueTime 会静默跳过，回读未变化时不应反复重试。",
    boundary: "复习/跳过/重置/删除/移动/设到期时间改变复习状态，必须确认。批量最多 50 张。deck 为空不代表没有闪卡。add_cards/review/skip 必须传入真实 deckID，缺少 deckID 时工具会拒绝执行。reset 操作的 resetType='deck' 时 id 为卡包 ID，内部自动派生 deckID=id（传 deckID 必须与 id 一致，不一致会拒绝），为空 blockIDs 时重置该 Deck 全部卡片。set_due_time 的 cardDues[].id 必须是完整 riffCardID（形如 20260703221339-at4oz7a），禁止短后缀，不是 blockID；写后工具会尝试轻量回读并返回 verification（applied / partiallyApplied / appliedCount / warning）；当前 SiYuan Kernel 的 batchSetRiffCardsDueTime 仅支持 builtin deck，自定义 Deck 的 cardID 会被 Kernel 静默跳过，因此 code=0 不代表 Due 已修改，必须以 verification/list_cards/get_card_info 回读为准，未生效时严禁反复重试相同调用。move_cards 只允许作用于本轮 disposable 测试卡片。",
    deps: { execute: deps.executeSiyuanRiffCard },
    inputJsonSchemaOverride: undefined,
  });
}

import {
  addRiffCards,
  batchSetRiffCardsDueTime,
  getNotebookRiffCards,
  getNotebookRiffDueCards,
  getRiffCards,
  getRiffCardsByBlockIDs,
  getRiffDueCards,
  getTreeRiffCards,
  getTreeRiffDueCards,
  removeRiffCards,
  resetRiffCards,
  reviewRiffCard,
  skipReviewRiffCard,
} from "../../../../../../../api";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanRiffCardInput } from "../contracts/siyuan-riff-card.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanRiffCard(args: SiyuanRiffCardInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  const reviewedCards = args.reviewedCardIDs?.map((id) => ({ cardID: id }));
  const resolvePageSize = (): number => Math.min(100, Math.max(1, args.pageSize ?? args.maxItems ?? 20));

  switch (args.action) {
    case "due_cards":
      data = await getRiffDueCards({
        deckID: args.deckID ?? "",
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "tree_due_cards":
      data = await getTreeRiffDueCards({
        rootID: requireString(args.rootID, "rootID"),
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "notebook_due_cards":
      data = await getNotebookRiffDueCards({
        notebook: requireString(args.notebook, "notebook"),
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "list_cards":
      data = await getRiffCards({
        id: args.deckID ?? "",
        page: args.page ?? 1,
        pageSize: resolvePageSize(),
      });
      break;
    case "tree_cards":
      data = await getTreeRiffCards({
        id: requireString(args.rootID, "rootID"),
        page: args.page ?? 1,
        pageSize: resolvePageSize(),
      });
      break;
    case "notebook_cards":
      data = await getNotebookRiffCards({
        id: requireString(args.notebook, "notebook"),
        page: args.page ?? 1,
        pageSize: resolvePageSize(),
      });
      break;
    case "cards_by_block_ids":
      data = await getRiffCardsByBlockIDs(requireStringArray(args.blockIDs, "blockIDs", 50));
      break;
    case "add_cards":
      data = await addRiffCards({
        deckID: requireString(args.deckID, "deckID"),
        blockIDs: requireStringArray(args.blockIDs, "blockIDs", 50),
      });
      break;
    case "remove_cards":
      data = await removeRiffCards({
        deckID: args.deckID ?? "",
        blockIDs: requireStringArray(args.blockIDs, "blockIDs", 50),
      });
      break;
    case "review":
      data = await reviewRiffCard({
        deckID: requireString(args.deckID, "deckID"),
        cardID: requireString(args.cardID, "cardID"),
        rating: args.rating ?? 1,
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "skip":
      data = await skipReviewRiffCard({
        deckID: requireString(args.deckID, "deckID"),
        cardID: requireString(args.cardID, "cardID"),
      });
      break;
    case "reset":
      data = await resetRiffCards({
        type: requireString(args.resetType, "resetType"),
        id: requireString(args.id, "id"),
        deckID: args.deckID ?? "",
        ...(args.blockIDs?.length ? { blockIDs: args.blockIDs } : {}),
      });
      break;
    case "set_due_time":
      if (!args.cardDues || args.cardDues.length === 0) {
        throw new Error("[invalid_args] cardDues 不能为空。");
      }
      data = await batchSetRiffCardsDueTime({ cardDues: args.cardDues });
      break;
  }
  pushAgentDebugEvent("SIYUAN_RIFF_ACTION_EXECUTED", { toolName: "siyuan_riff_card", action: args.action }, "info");
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems }) };
}

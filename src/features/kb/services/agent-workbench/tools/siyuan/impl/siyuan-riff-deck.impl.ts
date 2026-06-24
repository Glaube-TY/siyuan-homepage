import { createRiffDeck, getRiffDecks, removeRiffDeck, renameRiffDeck } from "../../../../../../../api";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanRiffDeckInput } from "../contracts/siyuan-riff-deck.contract";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanRiffDeck(args: SiyuanRiffDeckInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "create":
      data = await createRiffDeck(requireString(args.name, "name"));
      break;
    case "list":
      data = await getRiffDecks();
      break;
    case "rename":
      data = await renameRiffDeck(requireString(args.deckID, "deckID"), requireString(args.name, "name"));
      break;
    case "remove":
      data = await removeRiffDeck(requireString(args.deckID, "deckID"));
      break;
  }
  pushAgentDebugEvent("SIYUAN_RIFF_ACTION_EXECUTED", { toolName: "siyuan_riff_deck", action: args.action }, "info");
  return { output: outputForAction(args.action, data) };
}

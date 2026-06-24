import {
  checkBlockExist,
  getBlockBreadcrumb,
  getBlockDOM,
  getBlockDOMWithEmbed,
  getBlockDOMs,
  getBlockInfo,
  getBlockIndex,
  getBlockKramdownChecked,
  getBlockKramdowns,
  getBlockRelevantIDs,
  getBlockSiblingID,
  getBlockTreeInfos,
  getBlocksWordCount,
  getChildBlocksChecked,
  getRecentUpdatedBlocks,
  getTailChildBlocks,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanBlockReadInput } from "../contracts/siyuan-block-read.contract";
import { compactPayload, outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanBlockRead(args: SiyuanBlockReadInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "info":
      data = await getBlockInfo(requireString(args.id, "id"));
      break;
    case "dom":
      data = await getBlockDOM(requireString(args.id, "id"));
      break;
    case "doms":
      data = await getBlockDOMs(requireStringArray(args.ids, "ids", 50));
      break;
    case "dom_with_embed":
      data = await getBlockDOMWithEmbed(requireString(args.id, "id"));
      break;
    case "kramdown":
      data = await getBlockKramdownChecked(requireString(args.id, "id"));
      break;
    case "kramdowns":
      data = await getBlockKramdowns(requireStringArray(args.ids, "ids", 50));
      break;
    case "children":
      data = await getChildBlocksChecked(requireString(args.id, "id"));
      break;
    case "tail_children":
      data = await getTailChildBlocks(requireString(args.id, "id"));
      break;
    case "breadcrumb":
      data = await getBlockBreadcrumb(requireString(args.id, "id"));
      break;
    case "index":
      data = await getBlockIndex(requireString(args.id, "id"));
      break;
    case "sibling":
      data = await getBlockSiblingID(requireString(args.id, "id"));
      break;
    case "relevant_ids":
      data = await getBlockRelevantIDs(requireString(args.id, "id"));
      break;
    case "tree_infos":
      data = await getBlockTreeInfos(requireStringArray(args.ids, "ids", 50));
      break;
    case "word_count":
      data = await getBlocksWordCount(requireStringArray(args.ids ?? (args.id ? [args.id] : undefined), "ids", 50));
      break;
    case "check_exist":
      data = await checkBlockExist(requireString(args.id, "id"));
      break;
    case "recent_updated":
      data = await getRecentUpdatedBlocks(compactPayload({ id: args.id, max: args.maxItems }, ["id", "max"]));
      break;
  }
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems, maxChars: args.maxChars }) };
}

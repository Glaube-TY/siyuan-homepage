import {
  getAttributeViewBoundBlockIDsByItemIDsChecked,
  getAttributeViewFilterSort,
  getAttributeViewItemIDsByBoundIDsChecked,
  getAttributeViewKeys,
  getAttributeViewKeysByAvIDChecked,
  getAttributeViewPrimaryKeyValues,
  getCurrentAttrViewImages,
  getMirrorDatabaseBlocks,
  getUnusedAttributeViews,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanDatabaseExtraReadInput } from "../contracts/siyuan-database-extra-read.contract";
import { compactPayload, outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanDatabaseExtraRead(args: SiyuanDatabaseExtraReadInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "filter_sort":
      data = await getAttributeViewFilterSort(compactPayload({
        id: requireString(args.avID, "avID"),
        blockID: requireString(args.blockID, "blockID"),
      }, ["id", "blockID"]));
      break;
    case "primary_key_values":
      data = await getAttributeViewPrimaryKeyValues(compactPayload({
        id: requireString(args.avID, "avID"),
        keyword: args.keyword,
        page: args.page,
        pageSize: args.pageSize,
      }, ["id", "keyword", "page", "pageSize"]));
      break;
    case "mirror_blocks":
      data = await getMirrorDatabaseBlocks(compactPayload({ avID: requireString(args.avID, "avID") }, ["avID"]));
      break;
    case "keys_by_av_id":
      data = await getAttributeViewKeysByAvIDChecked(requireString(args.avID, "avID"));
      break;
    case "keys_by_block_id":
      data = await getAttributeViewKeys(compactPayload({ id: requireString(args.blockID, "blockID") }, ["id"]));
      break;
    case "bound_ids_by_item_ids":
      data = await getAttributeViewBoundBlockIDsByItemIDsChecked(
        requireString(args.avID, "avID"),
        requireStringArray(args.itemIDs, "itemIDs", 100),
      );
      break;
    case "item_ids_by_bound_ids":
      data = await getAttributeViewItemIDsByBoundIDsChecked(
        requireString(args.avID, "avID"),
        requireStringArray(args.boundIDs, "boundIDs", 100),
      );
      break;
    case "current_images":
      data = await getCurrentAttrViewImages(compactPayload({
        id: requireString(args.avID, "avID"),
        viewID: args.viewID,
        query: args.query,
      }, ["id", "viewID", "query"]));
      break;
    case "unused_attribute_views":
      data = await getUnusedAttributeViews();
      break;
  }
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems }) };
}

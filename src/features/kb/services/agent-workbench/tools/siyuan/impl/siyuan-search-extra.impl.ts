import {
  fullTextSearchAssetContent,
  getAssetContent,
  getEmbedBlock,
  listInvalidBlockRefs,
  searchAsset,
  searchEmbedBlock,
  searchTagChecked,
  searchTemplate,
  searchWidget,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanSearchExtraInput } from "../contracts/siyuan-search-extra.contract";
import { compactPayload, outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanSearchExtra(args: SiyuanSearchExtraInput): Promise<{ output: SiyuanToolOutput }> {
  const keyword = args.keyword ?? "";
  let data: unknown;
  switch (args.action) {
    case "search_tag":
      data = await searchTagChecked(keyword);
      break;
    case "search_template":
      data = await searchTemplate(keyword);
      break;
    case "search_widget":
      data = await searchWidget(keyword);
      break;
    case "search_embed_block":
      data = await searchEmbedBlock(compactPayload({ k: keyword, id: args.id, page: args.page }, ["k", "id", "page"]));
      break;
    case "get_embed_block":
      data = await getEmbedBlock(compactPayload({ id: requireString(args.id, "id") }, ["id"]));
      break;
    case "search_asset":
      data = await searchAsset(keyword);
      break;
    case "asset_content":
      data = args.path
        ? await getAssetContent(args.path)
        : await fullTextSearchAssetContent(compactPayload({ query: keyword, k: keyword, page: args.page }, ["query", "k", "page"]));
      break;
    case "invalid_block_refs":
      data = await listInvalidBlockRefs();
      break;
  }
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems, maxChars: args.maxChars }) };
}

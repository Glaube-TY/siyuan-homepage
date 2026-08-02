import {
  changeAttrViewLayout,
  performTransactionsChecked,
  setAttrViewGroup,
  setDatabaseBlockView,
  sortAttributeViewKey,
  sortAttributeViewViewKey,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanDatabaseViewInput } from "../contracts/siyuan-database-view.contract";
import { compactPayload, outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanDatabaseView(args: SiyuanDatabaseViewInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "set_database_block_view":
      data = await setDatabaseBlockView(compactPayload({
        avID: requireString(args.avID, "avID"),
        id: requireString(args.blockID, "blockID"),
        viewID: requireString(args.viewID, "viewID"),
      }, ["avID", "id", "viewID"]));
      break;
    case "sort_key":
      data = await sortAttributeViewKey(compactPayload({
        avID: requireString(args.avID, "avID"),
        keyID: requireString(args.keyID, "keyID"),
        previousKeyID: args.previousKeyID ?? "",
      }, ["avID", "keyID", "previousKeyID"]));
      break;
    case "sort_view_key":
      data = await sortAttributeViewViewKey(compactPayload({
        avID: requireString(args.avID, "avID"),
        viewID: requireString(args.viewID, "viewID"),
        keyID: requireString(args.keyID, "keyID"),
        previousKeyID: args.previousKeyID ?? "",
      }, ["avID", "viewID", "keyID", "previousKeyID"]));
      break;
    case "change_layout":
      data = await changeAttrViewLayout(compactPayload({
        avID: requireString(args.avID, "avID"),
        blockID: requireString(args.blockID, "blockID"),
        layoutType: requireString(args.layoutType, "layoutType"),
      }, ["avID", "blockID", "layoutType"]));
      break;
    case "set_group":
      if (args.group === null) {
        await performTransactionsChecked([{
          doOperations: [{
            action: "removeAttrViewGroup",
            avID: requireString(args.avID, "avID"),
            blockID: requireString(args.blockID, "blockID"),
          }],
          undoOperations: [],
        }]);
        data = null;
      } else {
        data = await setAttrViewGroup(compactPayload({
          avID: requireString(args.avID, "avID"),
          blockID: requireString(args.blockID, "blockID"),
          group: args.group,
        }, ["avID", "blockID", "group"]));
      }
      break;
  }
  return { output: outputForAction(args.action, data) };
}

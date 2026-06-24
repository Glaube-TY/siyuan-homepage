import {
  changeAttrViewLayout,
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
        avID: args.avID,
        blockID: requireString(args.blockID, "blockID"),
        viewID: requireString(args.viewID, "viewID"),
      }, ["avID", "blockID", "viewID"]));
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
        viewID: requireString(args.viewID, "viewID"),
        layout: requireString(args.layout, "layout"),
      }, ["avID", "viewID", "layout"]));
      break;
    case "set_group":
      data = await setAttrViewGroup(compactPayload({
        avID: requireString(args.avID, "avID"),
        viewID: requireString(args.viewID, "viewID"),
        group: args.group,
      }, ["avID", "viewID", "group"]));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

import { getTagChecked, removeTag, renameTag, searchTagChecked } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanTagManageInput } from "../contracts/siyuan-tag-manage.contract";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanTagManage(args: SiyuanTagManageInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "list":
      data = await getTagChecked({
        sort: args.sort,
        ignoreMaxListHint: args.ignoreMaxListHint ?? true,
      });
      break;
    case "search":
      data = await searchTagChecked(args.keyword ?? "");
      break;
    case "rename":
      data = await renameTag(requireString(args.oldLabel, "oldLabel"), requireString(args.newLabel, "newLabel"));
      break;
    case "remove":
      data = await removeTag(requireString(args.label, "label"));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

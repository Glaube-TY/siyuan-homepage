import {
  checkBlockRef,
  getBlockDefIDsByRefText,
  getRefIDs,
  getRefText,
  swapBlockRef,
  transferBlockRefChecked,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanBlockRefInput } from "../contracts/siyuan-block-ref.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanBlockRef(args: SiyuanBlockRefInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "get_ref_ids":
      data = await getRefIDs(requireString(args.id, "id"));
      break;
    case "get_ref_text":
      data = await getRefText(requireString(args.id, "id"));
      break;
    case "get_def_ids_by_ref_text":
      data = await getBlockDefIDsByRefText(requireString(args.refText, "refText"));
      break;
    case "check_ref":
      data = await checkBlockRef(requireString(args.id, "id"));
      break;
    case "swap_ref":
      data = await swapBlockRef({
        id: requireString(args.id, "id"),
        refText: args.refText,
      });
      break;
    case "transfer_ref":
      await transferBlockRefChecked(
        requireString(args.fromID, "fromID"),
        requireString(args.toID, "toID"),
        requireStringArray(args.refIDs, "refIDs", 50),
      );
      data = null;
      break;
  }
  return { output: outputForAction(args.action, data) };
}

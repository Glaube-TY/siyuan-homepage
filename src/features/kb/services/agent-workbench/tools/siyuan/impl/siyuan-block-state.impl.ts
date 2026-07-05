import {
  batchUpdateTaskListItemMarkerChecked,
  foldBlockChecked,
  setBlockReminder,
  unfoldBlockChecked,
  updateTaskListItemMarkerChecked,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanBlockStateInput, TaskMarkerItemInput } from "../contracts/siyuan-block-state.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

function taskMarkerItemsFromArgs(args: SiyuanBlockStateInput): TaskMarkerItemInput[] {
  if (args.items?.length) {
    return args.items.map((item) => ({ id: item.id, marker: item.marker ?? args.marker ?? "x" }));
  }
  return requireStringArray(args.ids, "ids", 50).map((id) => ({ id, marker: args.marker ?? "x" }));
}

export async function executeSiyuanBlockState(args: SiyuanBlockStateInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "fold":
      await foldBlockChecked(requireString(args.id, "id"));
      data = null;
      break;
    case "unfold":
      await unfoldBlockChecked(requireString(args.id, "id"));
      data = null;
      break;
    case "set_reminder":
      data = await setBlockReminder({ id: requireString(args.id, "id"), reminder: requireString(args.reminder, "reminder") });
      break;
    case "update_task_marker":
      await updateTaskListItemMarkerChecked(requireString(args.id, "id"), args.marker ?? "x");
      data = null;
      break;
    case "batch_update_task_marker":
      await batchUpdateTaskListItemMarkerChecked(taskMarkerItemsFromArgs(args), args.marker ?? "x");
      data = null;
      break;
  }
  return { output: outputForAction(args.action, data) };
}

import {
  closeNotebookChecked,
  createNotebookChecked,
  getNotebookConfChecked,
  lsNotebooksChecked,
  openNotebookChecked,
  removeNotebookChecked,
  renameNotebookChecked,
  setNotebookConfChecked,
  setNotebookIcon,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanNotebookManageInput } from "../contracts/siyuan-notebook-manage.contract";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanNotebookManage(args: SiyuanNotebookManageInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "list":
      data = await lsNotebooksChecked();
      break;
    case "create":
      data = await createNotebookChecked(requireString(args.name, "name"));
      break;
    case "open":
      await openNotebookChecked(requireString(args.notebook, "notebook"));
      data = null;
      break;
    case "close":
      await closeNotebookChecked(requireString(args.notebook, "notebook"));
      data = null;
      break;
    case "rename":
      await renameNotebookChecked(requireString(args.notebook, "notebook"), requireString(args.name, "name"));
      data = null;
      break;
    case "get_conf":
      data = await getNotebookConfChecked(requireString(args.notebook, "notebook"));
      break;
    case "set_conf":
      data = await setNotebookConfChecked(requireString(args.notebook, "notebook"), args.conf as any);
      break;
    case "set_icon":
      data = await setNotebookIcon(requireString(args.notebook, "notebook"), requireString(args.icon, "icon"));
      break;
    case "remove":
      await removeNotebookChecked(requireString(args.notebook, "notebook"));
      data = null;
      break;
  }
  return { output: outputForAction(args.action, data) };
}

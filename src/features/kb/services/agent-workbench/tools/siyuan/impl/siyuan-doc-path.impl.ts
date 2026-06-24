import {
  getFullHPathByID,
  getHPathByIDChecked,
  getHPathByPathChecked,
  getHPathsByPaths,
  getIDsByHPathChecked,
  getPathByID,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanDocPathInput } from "../contracts/siyuan-doc-path.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanDocPath(args: SiyuanDocPathInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "hpath_by_path":
      data = await getHPathByPathChecked(requireString(args.notebook, "notebook"), requireString(args.path, "path"));
      break;
    case "hpaths_by_paths":
      data = await getHPathsByPaths(requireStringArray(args.paths, "paths", 100));
      break;
    case "hpath_by_id":
      data = await getHPathByIDChecked(requireString(args.id, "id"));
      break;
    case "path_by_id":
      data = await getPathByID(requireString(args.id, "id"));
      break;
    case "full_hpath_by_id":
      data = await getFullHPathByID(requireString(args.id, "id"));
      break;
    case "ids_by_hpath":
      data = await getIDsByHPathChecked(requireString(args.notebook, "notebook"), requireString(args.hpath ?? args.path, "hpath"));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

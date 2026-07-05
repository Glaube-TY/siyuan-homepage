import {
  changeSort,
  duplicateDoc,
  listDocTree,
  listDocsByPathChecked,
  moveDocsChecked,
  moveDocsByID,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanDocTreeInput } from "../contracts/siyuan-doc-tree.contract";
import { compactPayload, outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanDocTree(args: SiyuanDocTreeInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "list_children":
      data = await listDocsByPathChecked(requireString(args.notebook, "notebook"), args.path ?? "/");
      break;
    case "list_tree":
      data = await listDocTree(compactPayload({
        notebook: requireString(args.notebook, "notebook"),
        path: args.path ?? "/",
      }, ["notebook", "path"]));
      break;
    case "move":
      await moveDocsChecked(
        requireStringArray(args.fromPaths, "fromPaths", 50),
        requireString(args.toNotebook, "toNotebook"),
        args.toPath ?? "/",
      );
      data = null;
      break;
    case "move_by_id":
      data = await moveDocsByID(compactPayload({
        fromIDs: requireStringArray(args.ids, "ids", 50),
        toID: requireString(args.targetID, "targetID"),
      }, ["fromIDs", "toID"]));
      break;
    case "duplicate": {
      const duplicateId = args.id ?? args.ids?.[0];
      data = await duplicateDoc(compactPayload({
        id: requireString(duplicateId, "id"),
        notebook: requireString(args.notebook, "notebook"),
        path: requireString(args.path, "path"),
      }, ["id", "notebook", "path"]));
      break;
    }
    case "sort":
      data = await changeSort(compactPayload({
        notebook: requireString(args.notebook, "notebook"),
        paths: args.fromPaths,
        ids: args.ids,
        targetID: args.targetID,
      }, ["notebook", "paths", "ids", "targetID"]));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

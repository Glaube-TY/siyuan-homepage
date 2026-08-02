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

async function listNotebookRootTree(notebook: string): Promise<{ tree: unknown[] }> {
  const root = await listDocsByPathChecked(notebook, "/");
  const files = Array.isArray(root?.files)
    ? root.files as Array<DocFile & { subFileCount?: number }>
    : [];
  const tree = await Promise.all(files.map(async (file) => {
    const node: Record<string, unknown> = {
      id: file.id,
      name: file.name,
      path: file.path,
    };
    if ((file.subFileCount ?? 0) > 0 && file.path) {
      const subtree = await listDocTree({ notebook, path: file.path });
      const children = Array.isArray(subtree?.tree) ? subtree.tree : [];
      if (children.length > 0) node.children = children;
    }
    return node;
  }));
  return { tree };
}

export async function executeSiyuanDocTree(args: SiyuanDocTreeInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "list_children":
      data = await listDocsByPathChecked(requireString(args.notebook, "notebook"), args.path ?? "/");
      break;
    case "list_tree":
      if (!args.path || args.path === "/") {
        data = await listNotebookRootTree(requireString(args.notebook, "notebook"));
      } else {
        data = await listDocTree(compactPayload({
          notebook: requireString(args.notebook, "notebook"),
          path: args.path,
        }, ["notebook", "path"]));
      }
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
      data = await duplicateDoc({ id: requireString(duplicateId, "id") });
      break;
    }
    case "sort":
      data = await changeSort(compactPayload({
        notebook: requireString(args.notebook, "notebook"),
        paths: requireStringArray(args.fromPaths, "fromPaths", 50),
      }, ["notebook", "paths"]));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

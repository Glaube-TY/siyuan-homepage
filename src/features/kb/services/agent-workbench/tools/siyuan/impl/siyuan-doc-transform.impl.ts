import { doc2Heading, flushTransaction, heading2Doc, li2Doc, loadDocumentTreeByBlockID } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanDocTransformInput } from "../contracts/siyuan-doc-transform.contract";
import { compactPayload, outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanDocTransform(args: SiyuanDocTransformInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "doc_to_heading":
      await Promise.all([
        loadDocumentTreeByBlockID(requireString(args.sourceDocId, "sourceDocId")),
        loadDocumentTreeByBlockID(requireString(args.targetBlockId, "targetBlockId")),
      ]);
      data = await doc2Heading(compactPayload({
        srcID: requireString(args.sourceDocId, "sourceDocId"),
        targetID: requireString(args.targetBlockId, "targetBlockId"),
        after: args.after,
      }, ["srcID", "targetID", "after"]));
      await flushTransaction();
      break;
    case "heading_to_doc":
      await loadDocumentTreeByBlockID(requireString(args.sourceHeadingId, "sourceHeadingId"));
      data = await heading2Doc(compactPayload({
        srcHeadingID: requireString(args.sourceHeadingId, "sourceHeadingId"),
        targetNoteBook: requireString(args.targetNotebookId, "targetNotebookId"),
        targetPath: args.targetPath,
        previousPath: args.previousPath,
        toTop: args.toTop,
      }, ["srcHeadingID", "targetNoteBook", "targetPath", "previousPath", "toTop"]));
      await flushTransaction();
      break;
    case "list_item_to_doc":
      await loadDocumentTreeByBlockID(requireString(args.sourceListItemId, "sourceListItemId"));
      data = await li2Doc(compactPayload({
        srcListItemID: requireString(args.sourceListItemId, "sourceListItemId"),
        targetNoteBook: requireString(args.targetNotebookId, "targetNotebookId"),
        targetPath: args.targetPath,
        previousPath: args.previousPath,
        toTop: args.toTop,
      }, ["srcListItemID", "targetNoteBook", "targetPath", "previousPath", "toTop"]));
      await flushTransaction();
      break;
  }
  return { output: outputForAction(args.action, data) };
}

import { doc2Heading, heading2Doc, li2Doc } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanDocTransformInput } from "../contracts/siyuan-doc-transform.contract";
import { compactPayload, outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanDocTransform(args: SiyuanDocTransformInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "doc_to_heading":
      data = await doc2Heading(compactPayload({
        id: args.id,
        notebook: args.notebook,
        path: requireString(args.path, "path"),
        targetPath: args.targetPath,
      }, ["id", "notebook", "path", "targetPath"]));
      break;
    case "heading_to_doc":
      data = await heading2Doc(compactPayload({
        id: requireString(args.id, "id"),
        targetPath: args.targetPath,
      }, ["id", "targetPath"]));
      break;
    case "list_item_to_doc":
      data = await li2Doc(compactPayload({
        id: requireString(args.id, "id"),
        targetPath: args.targetPath,
      }, ["id", "targetPath"]));
      break;
  }
  return { output: outputForAction(args.action, data) };
}

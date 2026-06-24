import {
  getBacklinkChecked,
  getBacklinkDoc,
  getBackmentionDoc,
  refreshBacklink,
  searchRefBlock,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanRefInput } from "../contracts/siyuan-ref.contract";
import { compactPayload, outputForAction, optionalString, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanRef(args: SiyuanRefInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "backlink": {
      const id = requireString(args.id ?? args.docId, "id");
      data = await getBacklinkChecked({
        id,
        k: optionalString(args.keyword),
        beforeLen: args.beforeLen,
        containChildren: args.containChildren,
      });
      break;
    }
    case "backlink_doc": {
      const id = requireString(args.docId ?? args.id, "docId");
      data = await getBacklinkDoc(compactPayload({ id, k: args.keyword, beforeLen: args.beforeLen }, ["id", "k", "beforeLen"]));
      break;
    }
    case "backmention_doc": {
      const id = requireString(args.docId ?? args.id, "docId");
      data = await getBackmentionDoc(compactPayload({ id, k: args.keyword, beforeLen: args.beforeLen }, ["id", "k", "beforeLen"]));
      break;
    }
    case "search_ref_block": {
      data = await searchRefBlock(compactPayload({ k: args.keyword, id: args.id, beforeLen: args.beforeLen }, ["k", "id", "beforeLen"]));
      break;
    }
    case "refresh_backlink": {
      data = await refreshBacklink();
      break;
    }
  }
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems }) };
}

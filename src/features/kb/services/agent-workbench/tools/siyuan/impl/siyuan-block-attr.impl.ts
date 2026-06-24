import {
  batchGetBlockAttrs,
  batchSetBlockAttrs,
  getBlockAttrsChecked,
  setBlockAttrsChecked,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanBlockAttrInput } from "../contracts/siyuan-block-attr.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanBlockAttr(args: SiyuanBlockAttrInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "get":
      data = await getBlockAttrsChecked(requireString(args.id, "id"));
      break;
    case "batch_get":
      data = await batchGetBlockAttrs(requireStringArray(args.ids, "ids", 20));
      break;
    case "set": {
      const id = requireString(args.id, "id");
      if (!args.attrs || Object.keys(args.attrs).length === 0) throw new Error("[invalid_args] attrs 不能为空。");
      await setBlockAttrsChecked(id, args.attrs);
      data = null;
      break;
    }
    case "batch_set": {
      if (!args.items || args.items.length === 0) throw new Error("[invalid_args] items 不能为空。");
      data = await batchSetBlockAttrs(args.items);
      break;
    }
  }
  return { output: outputForAction(args.action, data, { meta: { write: args.action === "set" || args.action === "batch_set" } }) };
}

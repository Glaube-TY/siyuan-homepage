import {
  fullReindexAssetContent,
  ocrAsset,
  removeUnusedAsset,
  renameAsset,
  setFileAnnotation,
  setImageOCRText,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanAssetManageInput } from "../contracts/siyuan-asset-manage.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanAssetManage(args: SiyuanAssetManageInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "rename":
      data = await renameAsset(requireString(args.path, "path"), requireString(args.newName, "newName"));
      break;
    case "set_annotation":
      data = await setFileAnnotation(requireString(args.path, "path"), args.annotation ?? "");
      break;
    case "set_image_ocr":
      data = await setImageOCRText(requireString(args.path, "path"), args.text ?? "");
      break;
    case "ocr":
      data = await ocrAsset(requireString(args.path, "path"));
      break;
    case "remove_unused_one":
      data = await removeUnusedAsset(requireString(args.path, "path"));
      break;
    case "remove_unused_batch": {
      const paths = requireStringArray(args.paths, "paths", 20);
      const results = [];
      for (const path of paths) {
        results.push({ path, result: await removeUnusedAsset(path) });
      }
      data = { count: results.length, results };
      break;
    }
    case "full_reindex_content":
      data = await fullReindexAssetContent();
      break;
  }
  return { output: outputForAction(args.action, data) };
}

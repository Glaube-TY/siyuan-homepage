import {
  getDocAssets,
  getDocImageAssets,
  getFileAnnotation,
  getImageOCRText,
  getMissingAssets,
  getUnusedAssets,
  resolveAssetPath,
  statAsset,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanAssetReadInput } from "../contracts/siyuan-asset-read.contract";
import { isPdfAnnotationAssetPath, toSiyuanAssetApiPath } from "../contracts/siyuan-asset-manage.contract";
import { SiyuanToolInvalidArgsError } from "../siyuan-generic-tool-factory";
import { readAssetTextContentByPath } from "./siyuan-asset-content.impl";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanAssetRead(args: SiyuanAssetReadInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "resolve_path":
      data = await resolveAssetPath(toSiyuanAssetApiPath(requireString(args.path, "path")));
      break;
    case "doc_assets":
      data = await getDocAssets(requireString(args.docId, "docId"));
      break;
    case "doc_image_assets":
      data = await getDocImageAssets(requireString(args.docId, "docId"));
      break;
    case "unused_assets":
      data = await getUnusedAssets();
      break;
    case "missing_assets":
      data = await getMissingAssets();
      break;
    case "file_annotation":
      {
        const path = requireString(args.path, "path");
        if (!isPdfAnnotationAssetPath(path)) {
          throw new SiyuanToolInvalidArgsError("file_annotation 只支持 PDF 资源或对应的 .pdf.sya 标注文件。");
        }
        data = await getFileAnnotation(toSiyuanAssetApiPath(path));
      }
      break;
    case "image_ocr":
      data = await getImageOCRText(toSiyuanAssetApiPath(requireString(args.path, "path")));
      break;
    case "stat":
      data = await statAsset(toSiyuanAssetApiPath(requireString(args.path, "path")));
      break;
    case "asset_content":
      data = await readAssetTextContentByPath(requireString(args.path, "path"));
      break;
  }
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems, maxChars: args.maxChars }) };
}

import {
  fullReindexAssetContent,
  ocrAsset,
  removeUnusedAsset,
  renameAsset,
  setFileAnnotation,
  setImageOCRText,
} from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import { getSiyuanAssetRenameNameError, isDisposableAssetPath, isPdfAnnotationAssetPath, toSiyuanAssetApiPath, type SiyuanAssetManageInput } from "../contracts/siyuan-asset-manage.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

function requireDisposablePath(value: unknown, field: string): string {
  const path = requireString(value, field);
  if (!isDisposableAssetPath(path)) {
    throw new Error(`[invalid_args] ${field} 只能指向本轮 disposable 测试资源（路径需包含 nb_agent / notebrain_agent / notebrain_test / notebrain-agent-test）。`);
  }
  return toSiyuanAssetApiPath(path);
}

export async function executeSiyuanAssetManage(args: SiyuanAssetManageInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "rename":
      {
        const path = requireString(args.path, "path");
        const newName = requireString(args.newName, "newName");
        const nameError = getSiyuanAssetRenameNameError(path, newName);
        if (nameError) {
          throw new Error(`[invalid_args] ${nameError}`);
        }
        data = await renameAsset(toSiyuanAssetApiPath(path), newName);
      }
      break;
    case "set_annotation":
      {
        const path = requireString(args.path, "path");
        if (!isPdfAnnotationAssetPath(path)) {
          throw new Error("[invalid_args] set_annotation 只支持 PDF 资源或对应的 .pdf.sya 标注文件。");
        }
        data = await setFileAnnotation(
          toSiyuanAssetApiPath(path),
          args.clear === true ? { clear: true } : { annotation: args.annotation },
        );
      }
      break;
    case "set_image_ocr":
      data = await setImageOCRText(toSiyuanAssetApiPath(requireString(args.path, "path")), args.text ?? "");
      break;
    case "ocr":
      data = await ocrAsset(toSiyuanAssetApiPath(requireString(args.path, "path")));
      break;
    case "remove_unused_one":
      data = await removeUnusedAsset(requireDisposablePath(args.path, "path"));
      break;
    case "remove_unused_batch": {
      const paths = requireStringArray(args.paths, "paths", 20);
      for (const path of paths) {
        if (!isDisposableAssetPath(path)) {
          throw new Error(`[invalid_args] paths 中包含非 disposable 路径：${path}；整批拒绝。`);
        }
      }
      const results = [];
      for (const path of paths) {
        results.push({ path, result: await removeUnusedAsset(toSiyuanAssetApiPath(path)) });
      }
      data = { count: results.length, results };
      break;
    }
    case "full_reindex_content": {
      if (args.confirmGlobal !== true) {
        throw new Error("[invalid_args] full_reindex_content 是全局索引重建，必须传 confirmGlobal:true。");
      }
      data = await fullReindexAssetContent();
      break;
    }
  }
  return { output: outputForAction(args.action, data) };
}

import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanAssetManageInputSchema, type SiyuanAssetManageInput } from "./contracts/siyuan-asset-manage.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanAssetManageDeps {
  executeSiyuanAssetManage(args: SiyuanAssetManageInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanAssetManageTool(deps: SiyuanAssetManageDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_asset_manage",
    title: "管理资源",
    description: "重命名资源、设置标注/OCR、执行 OCR、删除未使用资源或重建资源内容索引。",
    inputSchema: siyuanAssetManageInputSchema,
    readOnly: false,
    inputHint: "action=rename/set_annotation/set_image_ocr/ocr/remove_unused_one/remove_unused_batch/full_reindex_content。",
    boundary: "全部写入确认；批量删除未使用资源最多 20 个；不上传本地任意文件，不调用 uploadCloud。",
    deps: { execute: deps.executeSiyuanAssetManage },
    inputJsonSchemaOverride: undefined,
  });
}

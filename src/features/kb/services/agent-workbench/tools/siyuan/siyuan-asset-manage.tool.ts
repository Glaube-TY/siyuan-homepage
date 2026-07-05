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
    description: "重命名资源、设置标注/OCR、执行 OCR、删除未使用资源或重建资源内容索引。remove_unused_one/batch 只能删除本轮 disposable 测试资源；full_reindex_content 需要 confirmGlobal:true。",
    inputSchema: siyuanAssetManageInputSchema,
    readOnly: false,
    inputHint: "action=rename/set_annotation/set_image_ocr/ocr/remove_unused_one/remove_unused_batch/full_reindex_content；remove_unused 路径必须包含 nb_agent/notebrain_agent/notebrain_test/notebrain-agent-test；full_reindex_content 需传 confirmGlobal:true。",
    boundary: "全部写入确认；批量删除未使用资源最多 20 个，且只能删除本轮 disposable 测试资源；full_reindex_content 是全局索引重建，需额外传 confirmGlobal:true；不上传本地任意文件，不调用 uploadCloud。",
    deps: { execute: deps.executeSiyuanAssetManage },
    inputJsonSchemaOverride: undefined,
  });
}

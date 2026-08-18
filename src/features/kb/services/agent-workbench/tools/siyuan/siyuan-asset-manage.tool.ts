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
    description: "重命名资源显示名称、管理思源 PDF .sya 标注、设置 OCR、执行 OCR、删除未使用资源或重建资源内容索引。rename 的 newName 是不含目录、扩展名和内部唯一后缀的显示名称，扩展名与实际新路径由 Kernel 保留/生成；set_annotation 传结构化 annotation 对象可设置标注，传 clear:true 可清除全部标注；remove_unused_one/batch 只能删除本轮 disposable 测试资源；full_reindex_content 需要 confirmGlobal:true。",
    inputSchema: siyuanAssetManageInputSchema,
    readOnly: false,
    inputHint: "action=rename/set_annotation/set_image_ocr/ocr/remove_unused_one/remove_unused_batch/full_reindex_content；rename 需要真实 Asset Path + newName 显示名称（不含目录、原扩展名或 -YYYYMMDDHHMMSS-xxxxxxx 内部后缀），成功后以后续结果中的 newPath 为准；set_annotation 的 path 必须是 PDF 或 .pdf.sya，使用 annotation 对象设置标注，或使用 clear:true 清除全部标注，不能同时传两者；remove_unused 路径必须包含 nb_agent/notebrain_agent/notebrain_test/notebrain-agent-test；full_reindex_content 需传 confirmGlobal:true。",
    boundary: "全部写入确认；批量删除未使用资源最多 20 个，且只能删除本轮 disposable 测试资源；full_reindex_content 是全局索引重建，需额外传 confirmGlobal:true；不上传本地任意文件，不调用 uploadCloud。",
    deps: { execute: deps.executeSiyuanAssetManage },
    inputJsonSchemaOverride: undefined,
  });
}

import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanWorkspaceFileInputSchema, type SiyuanWorkspaceFileInput } from "./contracts/siyuan-workspace-file.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanWorkspaceFileDeps {
  executeSiyuanWorkspaceFile(args: SiyuanWorkspaceFileInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanWorkspaceFileTool(deps: SiyuanWorkspaceFileDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_workspace_file",
    title: "操作受限工作区文件",
    description: "在白名单目录内读取、写入、复制、重命名、删除文件或获取唯一文件名。copy_file 通过 getFile+putFile 安全复制，不直接调用底层 /api/file/copyFile。",
    inputSchema: siyuanWorkspaceFileInputSchema,
    readOnly: false,
    inputHint: "action=read_dir/get_file/put_file/copy_file/rename_file/remove_file/unique_filename；copy_file/rename_file 需要 path+targetPath。",
    boundary: "只能访问 assets/templates/widgets/public/siyuan-homepage storage，拒绝系统路径和敏感目录；copy_file 使用安全 getFile+putFile 实现。",
    deps: { execute: deps.executeSiyuanWorkspaceFile },
    inputJsonSchemaOverride: undefined,
  });
}

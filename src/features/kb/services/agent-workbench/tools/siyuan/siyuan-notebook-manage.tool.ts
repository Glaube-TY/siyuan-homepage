import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanNotebookManageInputSchema, type SiyuanNotebookManageInput } from "./contracts/siyuan-notebook-manage.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanNotebookManageDeps {
  executeSiyuanNotebookManage(args: SiyuanNotebookManageInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanNotebookManageTool(deps: SiyuanNotebookManageDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_notebook_manage",
    title: "管理笔记本",
    description: "列出、创建、打开、关闭、重命名、读取/设置配置、设置图标或删除笔记本。set_icon 的 icon 为非空字符串时设置图标，传空字符串时清除图标。",
    inputSchema: siyuanNotebookManageInputSchema,
    readOnly: false,
    readOnlyActions: ["list", "get_conf"],
    inputHint: "action=list/create/open/close/rename/get_conf/set_conf/set_icon/remove；set_icon 的 icon 可为非空字符串或空字符串（空字符串清除图标）。",
    boundary: "list/get_conf 只读；其他 action 写入确认；remove 为高风险。",
    deps: { execute: deps.executeSiyuanNotebookManage },
    inputJsonSchemaOverride: undefined,
  });
}

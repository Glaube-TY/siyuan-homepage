import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanBlockStateInputSchema, type SiyuanBlockStateInput } from "./contracts/siyuan-block-state.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanBlockStateDeps {
  executeSiyuanBlockState(args: SiyuanBlockStateInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanBlockStateTool(deps: SiyuanBlockStateDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_block_state",
    title: "修改块状态",
    description: "折叠/展开块、设置提醒、更新任务列表 marker。",
    inputSchema: siyuanBlockStateInputSchema,
    readOnly: false,
    inputHint: "action 指定 fold/unfold/set_reminder/update_task_marker/batch_update_task_marker。",
    boundary: "全部 action 都会写入块状态，执行前必须确认；批量最多 50 项。",
    deps: { execute: deps.executeSiyuanBlockState },
    inputJsonSchemaOverride: undefined,
  });
}

import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanDatabaseViewInputSchema, type SiyuanDatabaseViewInput } from "./contracts/siyuan-database-view.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanDatabaseViewDeps {
  executeSiyuanDatabaseView(args: SiyuanDatabaseViewInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanDatabaseViewTool(deps: SiyuanDatabaseViewDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_database_view",
    title: "修改数据库视图",
    description: "修改数据库块当前视图、字段排序、视图字段排序、布局或分组。",
    inputSchema: siyuanDatabaseViewInputSchema,
    readOnly: false,
    inputHint: "当前视图需 avID+blockID+viewID；布局需 avID+blockID+layoutType；分组需 avID+blockID+完整 group；排序使用真实 keyID。",
    boundary: "结构写入必须确认；不删除数据库、不清理 unused AV、不批量替换整库。",
    deps: { execute: deps.executeSiyuanDatabaseView },
    inputJsonSchemaOverride: undefined,
  });
}

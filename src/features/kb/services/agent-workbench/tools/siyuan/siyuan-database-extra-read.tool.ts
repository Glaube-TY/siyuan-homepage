import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanDatabaseExtraReadInputSchema, type SiyuanDatabaseExtraReadInput } from "./contracts/siyuan-database-extra-read.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanDatabaseExtraReadDeps {
  executeSiyuanDatabaseExtraRead(args: SiyuanDatabaseExtraReadInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanDatabaseExtraReadTool(deps: SiyuanDatabaseExtraReadDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_database_extra_read",
    title: "读取数据库辅助信息",
    description: "只读读取数据库视图筛选排序、主键、镜像块、键映射、当前图片和 unused AV。",
    inputSchema: siyuanDatabaseExtraReadInputSchema,
    readOnly: true,
    inputHint: "action 指定读取类型；avID/blockID/viewID/itemIDs/boundIDs 按需提供。",
    boundary: "只补辅助只读能力，不替代 read_attribute_view，不清理 unused AV。",
    deps: { execute: deps.executeSiyuanDatabaseExtraRead },
    inputJsonSchemaOverride: undefined,
  });
}

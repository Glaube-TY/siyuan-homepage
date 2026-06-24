import { createGenericSiyuanTool } from "./siyuan-generic-tool-factory";
import { siyuanSqlSelectInputSchema, type SiyuanSqlSelectInput } from "./contracts/siyuan-sql-select.contract";
import type { SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface SiyuanSqlSelectDeps {
  executeSiyuanSqlSelect(args: SiyuanSqlSelectInput): Promise<{ output: SiyuanToolOutput }>;
}

export function createSiyuanSqlSelectTool(deps: SiyuanSqlSelectDeps) {
  return createGenericSiyuanTool({
    name: "siyuan_sql_select",
    title: "执行只读 SQL",
    description: "执行严格校验后的 SELECT/WITH 只读 SQL，并自动限制最多 100 行。",
    inputSchema: siyuanSqlSelectInputSchema,
    readOnly: true,
    inputHint: "stmt 必须是单条 SELECT 或 WITH ... SELECT；maxRows 最大 100。",
    boundary: "禁止写 SQL、多语句、PRAGMA、DDL/DML 和仓库维护语句。",
    deps: { execute: deps.executeSiyuanSqlSelect },
    inputJsonSchemaOverride: undefined,
  });
}

import { sqlChecked } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanSqlSelectInput } from "../contracts/siyuan-sql-select.contract";
import { validateReadonlySql } from "./sql-select-guard.impl";
import { outputForAction } from "./siyuan-tool-impl-utils.impl";

export async function executeSiyuanSqlSelect(args: SiyuanSqlSelectInput): Promise<{ output: SiyuanToolOutput }> {
  const validation = validateReadonlySql(args.stmt, args.maxRows);
  if (validation.ok === false) {
    throw new Error(`[invalid_args] ${validation.reason}`);
  }
  const rows = await sqlChecked(validation.normalized);
  return {
    output: outputForAction("select", rows, {
      maxItems: validation.maxRows,
      maxChars: args.maxChars,
      meta: { normalizedStmt: validation.normalized, maxRows: validation.maxRows },
    }),
  };
}

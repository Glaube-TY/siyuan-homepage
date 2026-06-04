/**
 * Planner-visible error sanitizer
 *
 * Planner-visible summary 只返回调用方提供的安全摘要的 scrub + truncate 版本。
 * 不读 err.message，不写流程建议，不替 Planner 选工具。
 */

export const MAX_SUMMARY_LENGTH = 240;

const SIYUAN_BLOCK_ID_PATTERN = /\d{14}-[a-z0-9]{7}/g;
const HEX_32_PATTERN = /\b[0-9a-f]{32}\b/gi;
const PATH_PATTERN = /(?:[A-Za-z0-9_.-]*[/\\][A-Za-z0-9_./\\-]+|\.sy\b)/g;
const RESOURCE_TOKEN_QUOTED_PATTERN = /\b(resource|identifier)\s+["'`]([^"'`]+)["'`]/gi;
const RESOURCE_TOKEN_BARE_PATTERN = /\b(resource|identifier)\s+([A-Za-z0-9_.\-+:]+)/gi;

const KEYED_FIELD_PATTERN =
  /\b(docId|blockId|notebookId|path|realDocId|realBlockId|realPath|sourceDocId|sourceBlockId)\s*[=:]\s*([^\s,;]+)/gi;

const REDACTED = "[redacted]";

/**
 * 把一个事实类型安全文本压成 Planner 可见 summary。
 * - 不抛错。
 * - **不**读取 `err`（保留参数仅为兼容调用方，并避免下游误以为 raw detail 会被写入）。
 * - 对 `safeSummary` 做 scrub + truncate：即使调用方误传了含 docId / blockId / path
 *   / 原始 identifier 的字符串，也会先被兜底替换为 `[redacted]` 再截断。
 * - 不输出"建议下一步 / 改用 X 工具 / 自动回退"等流程规训。
 */
export function sanitizePlannerVisibleError(
  err: unknown,
  safeSummary: string,
): string {
  void err;
  const base = typeof safeSummary === "string" ? safeSummary : "";
  return truncate(scrubString(base));
}

/**
 * 内部 helper：把一段字符串里的内部标识替换为 `[redacted]`。
 * - 思源 block id（YYYYMMDDHHmmss-xxxxxxx）→ `[redacted]`
 * - 32 位 hex → `[redacted]`
 * - 包含 / 或 \ 的路径片段、.sy 片段 → `[redacted]`
 * - `identifier "xxx"` / `identifier xxx` 形式 → `identifier [redacted]`
 * - `docId/blockId/notebookId/path/realDocId/realBlockId/realPath/sourceDocId/sourceBlockId = xxx`
 *   字段值 → `[redacted]`
 *
 * 该 helper **不** 供 sanitizePlannerVisibleError 用来提取 err.message 残片。
 * 仅供 debug / 单测 / 其他非 Planner 可见场景使用。
 */
export function scrubString(input: string): string {
  let out = input;
  out = out.replace(SIYUAN_BLOCK_ID_PATTERN, REDACTED);
  out = out.replace(HEX_32_PATTERN, REDACTED);
  out = out.replace(PATH_PATTERN, REDACTED);
  out = out.replace(RESOURCE_TOKEN_QUOTED_PATTERN, (_match, key: string) => `${key} ${REDACTED}`);
  out = out.replace(RESOURCE_TOKEN_BARE_PATTERN, (_match, key: string) => `${key} ${REDACTED}`);
  out = scrubKeyedValues(out);
  return out;
}

function scrubKeyedValues(input: string): string {
  return input.replace(KEYED_FIELD_PATTERN, (_match, key: string) => {
    return `${key}=${REDACTED}`;
  });
}

function truncate(input: string): string {
  if (input.length <= MAX_SUMMARY_LENGTH) return input;
  return `${input.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
}

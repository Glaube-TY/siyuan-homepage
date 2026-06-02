/**
 * Planner-visible data guard
 *
 * 防止真实思源内部引用（docId / blockId / notebookId / path 等）泄漏到
 * Planner 可见数据中。仅在运行时检查传入对象，**不** 扫描 TypeScript 注释。
 * 该 guard **不** 替 Planner 选工具，不读 / 改业务状态。
 */

const FORBIDDEN_KEYS: readonly string[] = [
  "docId",
  "blockId",
  "notebookId",
  "box",
  "path",
  "realPath",
  "titlePath",
  "internalMapping",
  "realDocId",
  "realBlockId",
  "evidenceDocId",
  "evidenceBlockId",
] as const;

const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_KEYS);

const SIYUAN_BLOCK_ID_PATTERN = /\d{14}-[a-z0-9]{7}/;
const HEX_32_PATTERN = /\b[0-9a-f]{32}\b/i;
const PATH_PATTERN = /(?:[A-Za-z0-9_.-]*[/\\][A-Za-z0-9_./\\-]+|\.sy\b)/;

const SKIP_KEYS = new Set<string>(["inputSchema", "outputSchema"]);

/**
 * 递归检查 value。
 * - 任一禁止 key 出现 → 抛错。
 * - 任一 string 命中 思源 block id / 32 位 hex / 路径 / .sy → 抛错。
 * - 用 WeakSet 防循环。
 */
export function assertNoPlannerVisibleInternalReferences(
  value: unknown,
  path: string,
  visited?: WeakSet<object>,
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    if (typeof value === "string" && containsForbiddenString(value)) {
      throw new Error(
        `[planner-visible-data-guard] ${path} contains a forbidden internal reference value.`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertNoPlannerVisibleInternalReferences(value[i], `${path}[${i}]`, visited);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  if (!visited) visited = new WeakSet<object>();
  if (visited.has(obj)) return;
  visited.add(obj);

  for (const key of Object.keys(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    if (FORBIDDEN_KEY_SET.has(key)) {
      throw new Error(
        `[planner-visible-data-guard] ${path}.${key} is a forbidden internal reference key.`,
      );
    }
    assertNoPlannerVisibleInternalReferences(obj[key], `${path}.${key}`, visited);
  }
}

function containsForbiddenString(input: string): boolean {
  if (SIYUAN_BLOCK_ID_PATTERN.test(input)) return true;
  if (HEX_32_PATTERN.test(input)) return true;
  if (PATH_PATTERN.test(input)) return true;
  return false;
}

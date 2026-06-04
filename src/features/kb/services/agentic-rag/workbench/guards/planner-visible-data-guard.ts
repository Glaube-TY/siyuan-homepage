/**
 * Planner-visible data guard
 *
 * 防止内部实现字段（path / realPath / internalMapping / realDocId / realBlockId）
 * 泄漏到 Planner 可见数据中。
 *
 * docId / blockId / notebookId / url / fileId / resourceId 等公开资源 ID 允许出现。
 * 本 guard 不替 Planner 选工具，不读/改业务状态。
 */

const FORBIDDEN_KEYS: readonly string[] = [
  "path",
  "realPath",
  "titlePath",
  "internalMapping",
  "realDocId",
  "realBlockId",
] as const;

const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_KEYS);

const FORBIDDEN_PATH_PATTERN = /(?:^|[^a-zA-Z0-9])(?:[A-Za-z]:[/\\]|\.sy\b)/;

const SKIP_KEYS = new Set<string>(["inputSchema", "outputSchema"]);

export function assertNoPlannerVisibleInternalReferences(
  value: unknown,
  path: string,
  visited?: WeakSet<object>,
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_PATH_PATTERN.test(value)) {
      throw new Error(
        `[planner-visible-data-guard] ${path} contains a forbidden internal path reference.`,
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

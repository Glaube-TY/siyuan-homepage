/**
 * Flow-control forbidden fields guard.
 */

import { isForbiddenFlowControlField as isForbiddenField } from "../../shared/flow-control";

export { FORBIDDEN_FLOW_CONTROL_FIELDS, isForbiddenFlowControlField } from "../../shared/flow-control";

const SKIP_KEYS = new Set<string>(["inputSchema", "outputSchema"]);

export function assertNoFlowControlFields(
  value: unknown,
  path: string,
  visited?: WeakSet<object>,
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertNoFlowControlFields(value[i], `${path}[${i}]`, visited);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  if (!visited) visited = new WeakSet<object>();
  if (visited.has(obj)) return;
  visited.add(obj);

  for (const key of Object.keys(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    if (isForbiddenField(key)) {
      throw new Error(
        `[flow-control-guard] ${path}.${key} is a forbidden flow-control field.`,
      );
    }
    assertNoFlowControlFields(obj[key], `${path}.${key}`, visited);
  }
}

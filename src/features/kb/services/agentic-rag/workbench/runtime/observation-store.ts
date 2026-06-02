/**
 * ObservationStore
 *
 * Planner loop 中的 observation 累积器。observation 仅含事实。
 * - 不允许在 observation 中携带流程控制字段。
 * - 每轮 Planner 看到的 observations 来自本 store，不来自 input.observations。
 */

import type { SkillObservation } from "../contracts/skill-contract";
import type { ToolObservation, PlannerVisibleObservationContent } from "../contracts/tool-contract";
import { assertNoFlowControlFields } from "../guards/flow-control-guard";
import { assertNoPlannerVisibleInternalReferences } from "../guards/planner-visible-data-guard";

export interface ObservationEntry {
  /** 单步唯一 id，方便 trace。 */
  id: number;
  /** 写入时间（epoch ms）。 */
  timestamp: number;
  /** observation 形态。 */
  kind: SkillObservation["kind"];
  /** 工具名（如果是 tool 触发的）。 */
  toolName?: string;
  /** 事实数据，**不**含建议。 */
  facts: SkillObservation["facts"];
  /** 错误码（如有）。 */
  reasonCode?: string;
  /** 事实摘要。 */
  summary?: string;
  /** Planner 可见安全内容。 */
  content?: PlannerVisibleObservationContent;
}

let globalIdCounter = 0;

export class ObservationStore {
  private readonly entries: ObservationEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  /**
   * 把 SkillObservation / ToolObservation 转成内部 entry 写入。
   * 拒绝任何"建议"字段（key 命中即抛错）和任何思源内部引用（key 或 value 命中即抛错）。
   */
  push(input: SkillObservation | ToolObservation): ObservationEntry {
    assertNoFlowControlFields(input, "observation");
    assertNoPlannerVisibleInternalReferences(input, "observation");
    const toolObs = input as ToolObservation;
    const skillObs = input as SkillObservation;
    const entry: ObservationEntry = {
      id: ++globalIdCounter,
      timestamp: Date.now(),
      kind: pickKind(input),
      toolName: toolObs.toolName ?? skillObs.toolName,
      facts: (toolObs.facts ?? skillObs.facts) as SkillObservation["facts"],
      reasonCode: (input as { reasonCode?: string }).reasonCode,
      summary: (input as { summary?: string }).summary,
      content: (toolObs.content ?? skillObs.content) as PlannerVisibleObservationContent | undefined,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    return entry;
  }

  /** 全部 entries。 */
  all(): readonly ObservationEntry[] {
    return this.entries.slice();
  }

  /** 最近的 N 条。 */
  tail(n: number): readonly ObservationEntry[] {
    if (n <= 0) return [];
    return this.entries.slice(-n);
  }

  /**
   * 把 store 当前所有 entries 转成 PlannerContext.observations 用的 SkillObservation[]。
   * 每轮从 store 读最新，**不**直接用 input.observations。
   */
  getPlannerObservations(): SkillObservation[] {
    return this.entries.map((e) => ({
      kind: e.kind,
      toolName: e.toolName,
      facts: e.facts,
      reasonCode: e.reasonCode,
      summary: e.summary,
      content: e.content,
    }));
  }

  /** 0 命中累计计数（仅事实统计）。 */
  zeroHitCount(): number {
    return this.entries.filter((e) => e.facts?.isZeroHits === true).length;
  }

  /** 失败累计计数（仅事实统计）。 */
  failureCount(): number {
    return this.entries.filter((e) => e.kind === "tool_failed").length;
  }

  /** 工具调用累计计数（按 toolName）。 */
  callCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      if (!e.toolName) continue;
      out[e.toolName] = (out[e.toolName] ?? 0) + 1;
    }
    return out;
  }

  /** 清空所有 observation。 */
  reset(): void {
    this.entries.length = 0;
  }
}

function pickKind(input: SkillObservation | ToolObservation): SkillObservation["kind"] {
  const anyInput = input as unknown as Record<string, unknown>;
  if (typeof anyInput.kind === "string") return anyInput.kind as SkillObservation["kind"];
  if (anyInput.ok === false) return "tool_failed";
  const facts = anyInput.facts as { isZeroHits?: boolean } | undefined;
  if (facts?.isZeroHits === true) return "tool_zero_hits";
  return "tool_observation";
}

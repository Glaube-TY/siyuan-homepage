/**
 * Workbench self-check
 *
 * 纯结构自检，不依赖 Node fs/path。
 */

import { EXECUTION_ONLY_TOOL_NAMES } from "../registries/tool-registry";
import type { ToolContract, ToolManifest } from "../contracts/tool-contract";
import type { SkillContract, SkillRuntimeContext, SkillObservation } from "../contracts/skill-contract";
import type { PlannerDecision } from "../contracts/planner-decision";
import { assertNoFlowControlFields } from "../guards/flow-control-guard";
import { assertNoPlannerVisibleInternalReferences } from "../guards/planner-visible-data-guard";

/**
 * 把 planner 看到的 manifest 喂进这里检查 execution-only helper 不可见。
 */
export function assertNoPlannerVisibleExecutionOnlyTools(
  toolManifest: readonly ToolManifest[],
): void {
  for (const m of toolManifest) {
    if (EXECUTION_ONLY_TOOL_NAMES.has(m.name)) {
      throw new Error(
        `[workbench self-check] execution-only tool "${m.name}" leaked into Planner-visible manifest.`,
      );
    }
  }
}

/**
 * 任何注册进 ToolRegistry 的 Tool **必须**有真实 inputSchema。
 */
export function assertNoUndefinedToolSchemas(
  tools: readonly ToolContract[],
): void {
  for (const tool of tools) {
    const schema = tool.inputSchema as { parse?: unknown } | undefined;
    if (!schema || typeof schema.parse !== "function") {
      throw new Error(
        `[workbench self-check] tool "${tool.name}" has no real inputSchema. ` +
          `Placeholders are not allowed.`,
      );
    }
    const safety = tool.safety as { readOnly?: unknown } | undefined;
    if (!safety || typeof safety.readOnly !== "boolean") {
      throw new Error(
        `[workbench self-check] tool "${tool.name}" must declare safety as a ToolSafetyInfo object ` +
          `with readOnly: boolean.`,
      );
    }
  }
}

export function assertNoFlowControlFieldsInSkill(
  skill: SkillContract,
): void {
  assertNoFlowControlFields(skill, `Skill "${skill.name}"`);
}

export function assertNoFlowControlFieldsInTool(
  tool: ToolContract,
): void {
  assertNoFlowControlFields(tool, `Tool "${tool.name}"`);
}

export function assertNoFlowControlFieldsInDecision(decision: PlannerDecision): void {
  assertNoFlowControlFields(decision, `PlannerDecision type=${String((decision as unknown as Record<string, unknown>).type)}`);
  if (decision.type === "answer") {
    const args = (decision.args ?? {}) as Record<string, unknown>;
    for (const k of [
      "sourceDocIds",
      "sourceBlockIds",
      "realDocId",
      "realBlockId",
    ]) {
      if (k in args) {
        throw new Error(
          `[workbench self-check] answer decision args contains forbidden key "${k}".`,
        );
      }
    }
  }
}

export function assertNoFlowControlFieldsInObservation(obs: SkillObservation): void {
  assertNoFlowControlFields(obs, `Observation kind=${String(obs.kind)}`);
}

export function assertNoPlannerVisibleInternalReferencesInObservation(obs: SkillObservation): void {
  assertNoPlannerVisibleInternalReferences(obs, `Observation kind=${String(obs.kind)}`);
}

/**
 * 校验 PlannerLoop 真的从 ObservationStore 取最新数据。
 *
 * 该函数**不**读源文件（避免 fs/path 依赖），改为检查运行期 `PlannerLoop.run`
 * 调用了 `buildPlannerContext` 且 ObservationStore 的 observations 在循环内增长。
 *
 * 使用方传入：
 * - 真实调用一次 PlannerLoop.run（提供假 decideNextStep），
 *   之后把 store 内的 observations 与至少一次 buildPlannerContext 调用结果传入。
 */
export interface PlannerLoopRuntimeProbe {
  /** PlannerLoop.run 是否返回（throw / 终止 / 自然结束）。 */
  ran: boolean;
  /** 循环结束 / 异常时 store 内的 observations 数量。 */
  finalObservationsCount: number;
  /** 至少一次 buildPlannerContext 被调用（即可）。 */
  buildPlannerContextCalledAtLeastOnce: boolean;
}

export function assertPlannerLoopReturnsObservationToPlanner(
  probe: PlannerLoopRuntimeProbe,
): void {
  if (!probe.ran) {
    throw new Error(
      `[workbench self-check] PlannerLoop.run never completed; cannot verify observation flow.`,
    );
  }
  if (!probe.buildPlannerContextCalledAtLeastOnce) {
    throw new Error(
      `[workbench self-check] PlannerLoop never invoked buildPlannerContext. ` +
        `Each turn must rebuild a fresh PlannerContext.`,
    );
  }
  if (probe.finalObservationsCount <= 0) {
    throw new Error(
      `[workbench self-check] PlannerLoop finished with no observations in store. ` +
        `Observations are required for Planner to reason.`,
    );
  }
}

export function runAllSelfChecks(options: {
  tools: readonly ToolContract[];
  skill: SkillContract;
  toolManifest: readonly ToolManifest[];
  decision?: PlannerDecision;
  observation?: SkillObservation;
  plannerLoopProbe?: PlannerLoopRuntimeProbe;
} = {
  tools: [],
  skill: { name: "", title: "", description: "" } as unknown as SkillContract,
  toolManifest: [],
}): void {
  assertNoPlannerVisibleExecutionOnlyTools(options.toolManifest);
  assertNoUndefinedToolSchemas(options.tools);
  assertNoFlowControlFieldsInSkill(options.skill);
  for (const tool of options.tools) {
    assertNoFlowControlFieldsInTool(tool);
  }
  if (options.decision) {
    assertNoFlowControlFieldsInDecision(options.decision);
  }
  if (options.observation) {
    assertNoFlowControlFieldsInObservation(options.observation);
    assertNoPlannerVisibleInternalReferencesInObservation(options.observation);
  }
  if (options.plannerLoopProbe) {
    assertPlannerLoopReturnsObservationToPlanner(options.plannerLoopProbe);
  }
}

// 引入 SkillRuntimeContext 仅用于让调用方 IDE 看到类型
// （不参与运行时检查）。
export type { SkillRuntimeContext };

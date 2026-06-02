/**
 * System tool: answer。不属于 KB retrieval 私有工具，不生成回答内容。
 */

import { z } from "zod";
import type {
  ToolContract,
  ToolResult,
  ToolObservation,
  ToolRuntimeContext,
  AnswerToolData,
} from "../../../workbench/contracts/tool-contract";
import { assertSafeDisplayedHandle } from "../../../workbench/evidence/evidence-pack";

const ANSWER_INPUT_SCHEMA = z.object({
  body: z.string().min(1, "answer body must be a non-empty string"),
  evidenceMode: z.enum(["with_evidence", "insufficient_evidence", "without_kb_evidence"]),
  displayedReferenceHandles: z.array(z.string()).optional(),
  safeEvidenceHandles: z.array(z.string()).optional(),
  rationale: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  uncertainty: z.string().optional(),
});

const ANSWER_OUTPUT_SCHEMA = z.object({
  body: z.string(),
  evidenceMode: z.enum(["with_evidence", "insufficient_evidence", "without_kb_evidence"]),
  displayedReferenceHandles: z.array(z.string()).optional(),
});

function assertSafeHandles(handles: string[] | undefined): void {
  if (!Array.isArray(handles)) return;
  for (let i = 0; i < handles.length; i += 1) {
    assertSafeDisplayedHandle(handles[i]);
  }
}

export function createSystemAnswerTool(): ToolContract {
  return {
    name: "answer",
    title: "回答",
    description:
      "基于已收集的证据和观察，由 Planner 组织并输出最终回答。" +
      "answer body 和 evidenceMode 必须由 Planner 明确给出。",
    capability: "输出最终回答给用户",
    inputSchema: ANSWER_INPUT_SCHEMA,
    outputSchema: ANSWER_OUTPUT_SCHEMA,
    outputKind: "answer",
    source: "system",
    safety: { readOnly: true },
    boundary:
      "只输出 Planner 给出的回答内容；不自动生成回答；" +
      "不自动改写 evidenceMode；不暴露 docId / blockId / path。",

    availability(_ctx: ToolRuntimeContext) {
      return { available: true };
    },

    async execute(
      args: unknown,
      _ctx: ToolRuntimeContext,
    ): Promise<ToolResult> {
      const parsed = args as {
        body: string;
        evidenceMode: AnswerToolData["evidenceMode"];
        displayedReferenceHandles?: string[];
        safeEvidenceHandles?: string[];
      };

      assertSafeHandles(parsed.displayedReferenceHandles);
      assertSafeHandles(parsed.safeEvidenceHandles);

      const data: AnswerToolData = {
        body: parsed.body,
        evidenceMode: parsed.evidenceMode,
        displayedReferenceHandles: parsed.displayedReferenceHandles,
      };

      return {
        ok: true,
        outputKind: "answer",
        data,
      };
    },

    observationFormatter(
      result: ToolResult,
      _ctx: ToolRuntimeContext,
    ): ToolObservation {
      return {
        toolName: "answer",
        ok: result.ok,
        outputKind: "answer",
        facts: {},
        summary: "Answer drafted.",
      };
    },
  };
}

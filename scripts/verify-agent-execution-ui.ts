import assert from "node:assert/strict";
import { createAgentRunIdentity } from "../src/features/agent-platform/agent-run-protocol";
import type { AgentWorkbenchEvent } from "../src/features/kb/services/agent-workbench";
import type { AgentRunCheckpoint } from "../src/features/kb/services/agent-core/session/agent-run-checkpoint";
import {
  getAgentRecoveryPresentation,
  getWorkbenchRunPresentation,
} from "../src/features/kb/services/agent-workbench/runtime/workbench-terminal-state";
import { buildToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/write-preview-builder";
import type { NativeTool } from "../src/features/kb/services/agent-core/tools/native-tool";

const identity = createAgentRunIdentity({ sessionId: "session-ui", runId: "run-ui", correlationId: "corr-ui", startedAt: 1 });
const base = { at: 1, eventId: "event-1", ...identity };
const event = (value: Record<string, unknown>): AgentWorkbenchEvent => ({ ...base, ...value } as AgentWorkbenchEvent);

assert.deepEqual(getWorkbenchRunPresentation([
  event({ type: "run_started", providerId: "test" }),
  event({ type: "model_started", providerId: "test", modelStepIndex: 1 }),
]), { active: true, label: "等待模型响应", status: "waiting_model" });

assert.equal(getWorkbenchRunPresentation([
  event({ type: "run_started", providerId: "test" }),
  event({ type: "notice", message: "检测到无效草稿，正在自动重试。" }),
]).status, "retrying");

assert.equal(getWorkbenchRunPresentation([
  event({ type: "run_started", providerId: "test" }),
  event({ type: "tool_start", stepIndex: 1, toolCallId: "tool-1", toolName: "siyuan_kb", argsPreview: {}, readOnly: true, startedAt: 1 }),
]).status, "executing_tool");

assert.deepEqual(getWorkbenchRunPresentation([
  event({ type: "done", status: "answer_ready" }),
]), { active: false, label: "执行完成", status: "completed" });

const checkpoint: AgentRunCheckpoint = {
  schemaVersion: 2,
  identity,
  phase: "after_tool",
  stepIndex: 1,
  messages: [{ role: "user", content: "继续任务" }],
  sideEffectState: "committed",
  createdAt: 1,
};
const toolResult = event({
  type: "tool_result",
  stepIndex: 1,
  toolCallId: "tool-1",
  toolName: "siyuan_kb",
  result: { ok: true, summary: "完成" },
  durationMs: 1,
});
assert.equal(getWorkbenchRunPresentation([toolResult]).active, false);
assert.equal(getAgentRecoveryPresentation(checkpoint, [toolResult]).resumable, true);
assert.match(getAgentRecoveryPresentation({ ...checkpoint, sideEffectState: "unknown" }, [toolResult]).summary, /禁止自动继续/);
const exhaustedRecovery = getAgentRecoveryPresentation({ ...checkpoint, recoveryExhausted: true }, [toolResult]);
assert.equal(exhaustedRecovery.resumable, false);
assert.match(exhaustedRecovery.summary, /仍未产生有效输出/);

const diaryTool = { name: "diary_task", title: "日记任务", readOnly: false } as NativeTool;
const diaryPreview = buildToolPermissionPreview(diaryTool, {
  action: "manage_task",
  args: {
    operation: "create",
    task: { taskname: "完成日历验收", startDate: "2026-08-13", deadline: "2026-08-14", priority: 3 },
  },
});
assert.equal(diaryPreview.operationLabel, "创建任务");
assert.equal(diaryPreview.targetSummary, "完成日历验收");
assert.match(diaryPreview.sections?.[0]?.value ?? "", /开始：2026-08-13/);
assert.match(diaryPreview.sections?.[0]?.value ?? "", /截止：2026-08-14/);

console.log("Agent 执行状态与安全恢复 UI 投影校验通过。");

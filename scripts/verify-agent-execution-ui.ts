import assert from "node:assert/strict";
import { createAgentRunIdentity } from "../src/features/agent-platform/agent-run-protocol";
import type { AgentWorkbenchEvent } from "../src/features/kb/services/agent-workbench";
import type { AgentRunCheckpoint } from "../src/features/kb/services/agent-core/session/agent-run-checkpoint";
import {
  getAgentRecoveryPresentation,
  getWorkbenchRunPresentation,
} from "../src/features/kb/services/agent-workbench/runtime/workbench-terminal-state";

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
  schemaVersion: 1,
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

console.log("Agent 执行状态与安全恢复 UI 投影校验通过。");

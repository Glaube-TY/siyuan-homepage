import assert from "node:assert/strict";
import { decideUnattendedWrite } from "../src/features/kb/services/agent-core/permissions/tool-permission-gate";
import type { ToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/tool-preview";
import {
  agentProfileAllowsMemory,
  agentProfileAllowsTool,
  agentProfileAllowsToolAction,
  createBackgroundJobAgentProfile,
  EDITOR_SELECTION_AGENT_PROFILE_ID,
  KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  ROBOT_AGENT_PROFILE_ID,
} from "../src/features/agent-platform/agent-profile";
import {
  AUTOMATION_DEFAULT_BUDGET,
  automationTaskSchema,
} from "../src/features/agent-platform/automation/automation-job-contract";

const preview = (risk: ToolPermissionPreview["risk"]): ToolPermissionPreview => ({
  toolName: "test",
  title: "test",
  readOnly: false,
  risk,
  argsPreview: {},
});

assert.equal(decideUnattendedWrite(preview("low")).type, "allow");
assert.equal(decideUnattendedWrite(preview("medium")).type, "allow");
assert.equal(decideUnattendedWrite(preview("high")).type, "deny");

const emptyRobotTaskProfile = createBackgroundJobAgentProfile({
  profileId: ROBOT_AGENT_PROFILE_ID,
  allowedToolNames: [],
  allowedActionNames: [],
  memoryAccess: "read",
  maxToolCalls: 12,
});
// 空列表必须得到零工具（不再继承来源全部工具）
assert.equal(agentProfileAllowsTool(emptyRobotTaskProfile, "siyuan_kb"), false);
assert.equal(agentProfileAllowsTool(emptyRobotTaskProfile, "diary_task"), false);

const knowledgeReadProfile = createBackgroundJobAgentProfile({
  profileId: KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  allowedToolNames: ["siyuan_kb", "siyuan_database"],
  allowedActionNames: [
    "siyuan_kb:search",
    "siyuan_kb:write_docs",
    "siyuan_database:read",
    "search",
  ],
  memoryAccess: "read",
  maxToolCalls: 2,
});
assert.equal(agentProfileAllowsToolAction(knowledgeReadProfile, "siyuan_kb", "search"), true);
assert.equal(agentProfileAllowsToolAction(knowledgeReadProfile, "siyuan_kb", "write_docs"), false);
assert.equal(agentProfileAllowsTool(knowledgeReadProfile, "siyuan_database"), false);
assert.equal(agentProfileAllowsToolAction(knowledgeReadProfile, "diary_task", "query_tasks"), false);
assert.equal(agentProfileAllowsMemory(knowledgeReadProfile, "read"), true);
assert.equal(agentProfileAllowsMemory(knowledgeReadProfile, "write"), false);
assert.deepEqual(knowledgeReadProfile.permissions.externalSkillIds, []);
assert.deepEqual(knowledgeReadProfile.permissions.mcpServerIds, []);
assert.deepEqual(knowledgeReadProfile.permissions.mcpToolNames, []);

const robotReadProfile = createBackgroundJobAgentProfile({
  profileId: ROBOT_AGENT_PROFILE_ID,
  allowedToolNames: ["diary_task"],
  allowedActionNames: ["diary_task:query_tasks"],
  memoryAccess: "none",
  maxToolCalls: 1,
});
assert.equal(agentProfileAllowsToolAction(robotReadProfile, "diary_task", "query_tasks"), true);
assert.equal(agentProfileAllowsToolAction(robotReadProfile, "diary_task", "manage_task"), false);

const noMemorySourceProfile = createBackgroundJobAgentProfile({
  profileId: EDITOR_SELECTION_AGENT_PROFILE_ID,
  allowedToolNames: [],
  allowedActionNames: [],
  memoryAccess: "read",
  maxToolCalls: 0,
});
assert.equal(agentProfileAllowsMemory(noMemorySourceProfile, "read"), false);

const defaultTask = automationTaskSchema.parse({
  kind: "agent",
  execution: { goal: "输出固定短回答。" },
});
assert.deepEqual(defaultTask.execution, {
  goal: "输出固定短回答。",
  profileId: "background-job",
  allowedToolNames: [],
  allowedActionNames: [],
  memoryAccess: "none",
  unattendedWritePolicy: "deny",
  budget: { ...AUTOMATION_DEFAULT_BUDGET },
});

console.log("automation unattended permission verification passed");

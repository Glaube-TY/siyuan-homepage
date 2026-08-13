import assert from "node:assert/strict";
import { decideUnattendedWrite } from "../src/features/kb/services/agent-core/permissions/tool-permission-gate";
import type { ToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/tool-preview";
import {
  agentProfileAllowsTool,
  createBackgroundJobAgentProfile,
  ROBOT_AGENT_PROFILE_ID,
} from "../src/features/agent-platform/agent-profile";

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

const legacyRobotTaskProfile = createBackgroundJobAgentProfile({
  profileId: ROBOT_AGENT_PROFILE_ID,
  allowedToolNames: [],
  allowedActionNames: [],
  memoryAccess: "read",
  maxToolCalls: 12,
});
assert.equal(agentProfileAllowsTool(legacyRobotTaskProfile, "siyuan_kb"), true);
assert.equal(agentProfileAllowsTool(legacyRobotTaskProfile, "diary_task"), true);

console.log("automation unattended permission verification passed");

import assert from "node:assert/strict";
import {
  AGENT_CAPABILITY_IDS,
  AGENT_PROFILE_SCHEMA_VERSION,
  getAgentProfile,
  KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  registerAgentProfile,
} from "../src/features/agent-platform/agent-profile";

const profile = getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID);

assert.equal(profile.schemaVersion, AGENT_PROFILE_SCHEMA_VERSION);
assert.equal(profile.execution.defaultMaxToolCalls, 20);
assert.deepEqual(profile.capabilities, AGENT_CAPABILITY_IDS);
assert.throws(() => registerAgentProfile(profile), /已注册/);
assert.throws(() => registerAgentProfile({
  ...profile,
  id: "future-profile",
  schemaVersion: 2,
} as unknown as typeof profile), /版本不受支持/);

console.log("Agent Profile 注册与全能力知识库配置校验通过。");

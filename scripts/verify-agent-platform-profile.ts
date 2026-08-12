import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  AGENT_CAPABILITY_IDS,
  AGENT_CONTEXT_SOURCE_IDS,
  AGENT_PROFILE_SCHEMA_VERSION,
  EDITOR_SELECTION_AGENT_PROFILE_ID,
  HOMEPAGE_STATUS_AGENT_PROFILE_ID,
  agentProfileAllowsContext,
  agentProfileHasCapability,
  agentProfileAllowsMemory,
  agentProfileResourceAllowList,
  agentProfileAllowsTool,
  agentProfileAllowsToolAction,
  getAgentProfile,
  KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  ROBOT_AGENT_PROFILE_ID,
  ROBOT_AGENT_TOOL_NAMES,
  registerAgentProfile,
} from "../src/features/agent-platform/agent-profile";
import { ToolRegistry } from "../src/features/kb/services/agent-workbench/registries/tool-registry";
import type { ToolContract } from "../src/features/kb/services/agent-workbench/contracts/tool-contract";
import { buildAgentSystemPrompt } from "../src/features/kb/services/agent-core/prompts/system-prefix";

const profile = getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID);

assert.equal(profile.schemaVersion, AGENT_PROFILE_SCHEMA_VERSION);
assert.equal(profile.execution.defaultMaxToolCalls, 20);
assert.deepEqual(profile.capabilities, AGENT_CAPABILITY_IDS);
assert.deepEqual(profile.permissions.contextSources, AGENT_CONTEXT_SOURCE_IDS);
assert.throws(() => registerAgentProfile(profile), /已注册/);
assert.throws(() => registerAgentProfile({
  ...profile,
  id: "future-profile",
  schemaVersion: 3,
} as unknown as typeof profile), /版本不受支持/);

const restricted = registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: "profile-verifier",
  label: "Profile verifier",
  capabilities: ["conversation", "tools", "external-skills", "mcp"],
  permissions: {
    contextSources: ["conversation"],
    tools: {
      names: ["safe_aggregate"],
      actions: { safe_aggregate: ["read"] },
    },
    memory: { read: false, write: false },
    externalSkillIds: ["safe-skill"],
    mcpServerIds: ["safe-server"],
    mcpToolNames: ["safe-tool"],
  },
  execution: { defaultMaxToolCalls: 3 },
});

assert.equal(agentProfileAllowsContext(restricted, "conversation"), true);
assert.equal(agentProfileAllowsContext(restricted, "global-memory"), false);
assert.equal(agentProfileAllowsMemory(restricted, "read"), false);
assert.deepEqual(agentProfileResourceAllowList(restricted.permissions.externalSkillIds), ["safe-skill"]);
assert.deepEqual(agentProfileResourceAllowList(restricted.permissions.mcpServerIds), ["safe-server"]);
assert.deepEqual(agentProfileResourceAllowList(restricted.permissions.mcpToolNames), ["safe-tool"]);
assert.equal(agentProfileAllowsTool(restricted, "blocked_tool"), false);
assert.equal(agentProfileAllowsToolAction(restricted, "safe_aggregate", "write"), false);

const robot = getAgentProfile(ROBOT_AGENT_PROFILE_ID);
assert.deepEqual(robot.permissions.contextSources, ["conversation", "runtime-tools"]);
assert.deepEqual(robot.permissions.tools.names, ROBOT_AGENT_TOOL_NAMES);
assert.equal(agentProfileAllowsTool(robot, "siyuan_kb"), true);
assert.equal(agentProfileAllowsTool(robot, "homepage_manage"), false);
assert.equal(agentProfileAllowsTool(robot, "homepage_music"), false);
assert.equal(agentProfileAllowsTool(robot, "notebrain_file"), false);
assert.equal(agentProfileAllowsMemory(robot, "read"), false);
assert.equal(agentProfileHasCapability(robot, "mcp"), false);
assert.equal(agentProfileHasCapability(robot, "external-skills"), false);

const homepageStatus = getAgentProfile(HOMEPAGE_STATUS_AGENT_PROFILE_ID);
assert.deepEqual(homepageStatus.permissions.contextSources, ["homepage-statistics"]);
assert.equal(homepageStatus.execution.defaultMaxToolCalls, 0);
assert.equal(agentProfileAllowsTool(homepageStatus, "siyuan_kb"), false);
assert.equal(agentProfileAllowsContext(homepageStatus, "conversation"), false);
assert.equal(agentProfileAllowsMemory(homepageStatus, "write"), false);

const editorSelection = getAgentProfile(EDITOR_SELECTION_AGENT_PROFILE_ID);
assert.deepEqual(editorSelection.permissions.contextSources, ["editor-selection", "editor-document"]);
assert.equal(editorSelection.execution.defaultMaxToolCalls, 0);
assert.equal(agentProfileAllowsContext(editorSelection, "homepage-statistics"), false);
assert.equal(agentProfileHasCapability(editorSelection, "tools"), false);

assert.throws(() => registerAgentProfile({
  ...homepageStatus,
  id: "invalid-zero-tool-loop",
  capabilities: ["tools"],
}), /工具调用次数无效/);

const registry = new ToolRegistry({
  allowsTool: (name) => agentProfileAllowsTool(restricted, name),
  allowsAction: (toolName, action) => agentProfileAllowsToolAction(restricted, toolName, action),
});
const aggregateSchema = z.object({
  action: z.enum(["read", "write"]),
  args: z.record(z.string(), z.unknown()).optional(),
}).strict();
const aggregateTool: ToolContract = {
  name: "safe_aggregate",
  title: "Safe aggregate",
  description: "Verifier aggregate",
  inputSchema: aggregateSchema,
  inputJsonSchemaOverride: {
    type: "object",
    additionalProperties: false,
    properties: { action: { type: "string", enum: ["read", "write"] } },
    required: ["action"],
  },
  aggregateActionHelp: {
    read: { action: "read", readOnly: true },
    write: { action: "write", readOnly: false, requiresConfirmation: true },
  },
  readOnly: false,
  safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
  source: "builtin",
  providerVisible: true,
  availability: () => ({ available: true }),
  async execute(_ctx, args) {
    return { ok: true, data: args };
  },
};
registry.registerTool(aggregateTool);
registry.registerTool({ ...aggregateTool, name: "blocked_tool", aggregateActionHelp: undefined });

assert.equal(registry.getTool("blocked_tool"), undefined);
const manifest = registry.getToolManifest({ question: "", callCounts: {} })[0];
assert.deepEqual(
  ((manifest.inputJsonSchema as Record<string, any>).properties.action.enum),
  ["read"],
);
const restrictedTool = registry.getTool("safe_aggregate");
assert.deepEqual(Object.keys(restrictedTool?.aggregateActionHelp ?? {}), ["read"]);
const denied = await restrictedTool?.execute(
  { question: "", callCounts: {} },
  { action: "write", args: {} },
);
assert.equal(denied?.ok, false);
assert.equal(denied?.error?.code, "permission_denied");
const restrictedPrompt = buildAgentSystemPrompt({
  isToolAvailable: (toolName) => toolName === "safe_aggregate",
  isActionAvailable: (_toolName, action) => action === "read",
});
assert.equal(restrictedPrompt.includes("notebrain_file.run_command"), false);
assert.equal(restrictedPrompt.includes("homepage_manage"), false);

const turnAdapterSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/runtime/run-agent-turn.ts", import.meta.url),
  "utf8",
);
const profileRunnerSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/runtime/run-agent-profile.ts", import.meta.url),
  "utf8",
);
const robotRuntimeSource = readFileSync(
  new URL("../src/features/robot-assistant/agent/kernel-robot-agent-runtime.ts", import.meta.url),
  "utf8",
);
const selectionRunnerSource = readFileSync(
  new URL("../src/features/kb/services/selection-ai/selection-ai-runner.ts", import.meta.url),
  "utf8",
);
const selectionPopupSource = readFileSync(
  new URL("../src/features/kb/components/selection-ai/SelectionAiPopup.svelte", import.meta.url),
  "utf8",
);
const statusGeneratorSource = readFileSync(
  new URL("../src/homepage/header/status-ai-generator.ts", import.meta.url),
  "utf8",
);
const plainTextSource = readFileSync(
  new URL("../src/services/ai/plain-text-generation.ts", import.meta.url),
  "utf8",
);

assert.match(turnAdapterSource, /runAgentProfile/);
for (const platformAssembly of [
  "createProviderAdapterForKbModel",
  "createAgentWorkbenchRuntime",
  "NativeToolAgentLoop",
  "readGlobalMemory",
  "setMcpRuntimeSettings",
]) {
  assert.equal(turnAdapterSource.includes(platformAssembly), false);
  assert.equal(profileRunnerSource.includes(platformAssembly), true);
}
assert.equal(
  existsSync(new URL("../src/features/kb/services/agent-workbench/runtime/native-agent-runner.ts", import.meta.url)),
  false,
);
assert.equal(
  existsSync(new URL("../src/features/kb/services/agent-core/tools/native-tool-registry-builder.ts", import.meta.url)),
  false,
);
assert.match(robotRuntimeSource, /ROBOT_AGENT_PROFILE_ID/);
assert.match(robotRuntimeSource, /agentProfileAllowsTool/);
assert.match(statusGeneratorSource, /HOMEPAGE_STATUS_AGENT_PROFILE_ID/);
assert.match(selectionRunnerSource, /EDITOR_SELECTION_AGENT_PROFILE_ID/);
assert.equal(selectionRunnerSource.includes("streamModelText"), false);
assert.match(plainTextSource, /agentProfileAllowsContext/);
assert.match(plainTextSource, /streamModelText/);
assert.match(selectionPopupSource, /onDestroy\(\(\) => \{[\s\S]*abortController\?\.abort\(\)/);

console.log("Agent Profile、三类受限入口与统一运行边界校验通过。");

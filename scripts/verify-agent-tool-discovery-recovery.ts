import assert from "node:assert/strict";
import { createAgentToolHelpTool } from "../src/features/kb/services/agent-workbench/tools/aggregate/agent-tool-help.tool";
import { DEFAULT_EXTERNAL_SKILL_SETTINGS } from "../src/features/kb/constants/default-settings";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import type { AgentStreamEvent } from "../src/features/kb/services/agent-core/loop/stream-event";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import type { NativeTool } from "../src/features/kb/services/agent-core/tools/native-tool";
import { NativeToolRegistry } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import { compactAgentSessionMessagesForStorage } from "../src/features/kb/services/agent-core/messages/message-compactor";
import { parseToolResultContentEnvelope } from "../src/features/kb/services/agent-core/tools/tool-execution-result";
import { formatToolArgsPreview } from "../src/features/kb/services/agent-workbench/presentation/tool-step-presentation";

async function verifyHelpDiagnostics(): Promise<void> {
  const help = createAgentToolHelpTool({
    externalSkillSettings: DEFAULT_EXTERNAL_SKILL_SETTINGS,
    availableTools: [{ name: "notebrain_file", actions: ["list_dir", "read_file", "write_file", "delete_path", "run_command"] }],
  });

  const missing = await help.execute({} as never, { action: "describe_tool", toolName: "not_registered_x" });
  assert.equal(missing.error?.code, "tool_not_available");
  const missingDetails = missing.error?.details as Record<string, unknown>;
  assert.equal(missingDetails.requestedToolName, "not_registered_x");
  assert.deepEqual(missingDetails.availableToolNames, ["notebrain_file"]);
  assert.match(String(missing.error?.hint), /list_tools/);

  const mixed = await help.execute({} as never, { action: "describe_tool", toolName: "notebrain_file.run_command" });
  const mixedDetails = mixed.error?.details as Record<string, unknown>;
  assert.equal(mixedDetails.suggestedToolName, "notebrain_file");
  assert.equal(mixedDetails.suggestedActionName, "run_command");
  assert.equal(mixed.ok, false, "诊断不得自动执行或改写请求");

  const actionAsTool = await help.execute({} as never, { action: "describe_tool", toolName: "run_command" });
  const actionAsToolDetails = actionAsTool.error?.details as Record<string, unknown>;
  assert.equal(actionAsToolDetails.suggestedToolName, "notebrain_file");
  assert.equal(actionAsToolDetails.suggestedActionName, "run_command");

  const action = await help.execute({} as never, {
    action: "describe_action",
    toolName: "notebrain_file",
    actionName: "execute_command",
  });
  const actionDetails = action.error?.details as Record<string, unknown>;
  assert.equal(action.error?.code, "action_not_found");
  assert.equal(actionDetails.requestedActionName, "execute_command");
  assert.deepEqual(actionDetails.availableActionNames, ["list_dir", "read_file", "write_file", "delete_path", "run_command"]);
  assert.doesNotMatch(JSON.stringify([missing, mixed, actionAsTool, action]), /api[_-]?key|authorization|password|secret/i);

  assert.equal(help.inputSchema.safeParse({ action: "describe_tool" }).success, false, "describe_tool 缺少 toolName 必须在 Contract 层拒绝");
  assert.equal(help.inputSchema.safeParse({ action: "describe_action", toolName: "notebrain_file" }).success, false, "describe_action 缺少 actionName 必须在 Contract 层拒绝");

  const riffHelp = createAgentToolHelpTool({
    externalSkillSettings: DEFAULT_EXTERNAL_SKILL_SETTINGS,
    availableTools: [{
      name: "siyuan_riff",
      actions: ["deck"],
      actionHelp: {
        deck: {
          action: "deck",
          internalToolName: "siyuan_riff_deck",
          argsSchema: {
            type: "object",
            properties: { action: { type: "string", enum: ["create", "list", "rename", "remove"] } },
            required: ["action"],
          },
        },
      },
    }],
  });
  const internalAlias = await riffHelp.execute({} as never, {
    action: "describe_action",
    toolName: "siyuan_riff_deck",
    actionName: "create",
  });
  assert.equal(internalAlias.ok, true, "内部 contract 名必须解析到真实公开聚合 action");
  assert.deepEqual((internalAlias.data as Record<string, unknown>).publicRoute, { toolName: "siyuan_riff", actionName: "deck" });
  assert.equal((internalAlias.data as Record<string, unknown>).requestedActionName, "create");
  assert.match(formatToolArgsPreview({ action: "describe_action", toolName: "siyuan_riff_deck", actionName: "create" }), /siyuan_riff_deck.*create/);
}

function verifyFailedHelpStorageDiagnostics(): void {
  const messages = compactAgentSessionMessagesForStorage([
    { role: "user", content: "test" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{
        id: "help-1",
        name: "agent_tool_help",
        arguments: JSON.stringify({ action: "describe_tool", toolName: "siyuan_riff_deck" }),
      }],
    },
    {
      role: "tool",
      toolCallId: "help-1",
      name: "agent_tool_help",
      content: `[TOOL_FAILED] ${JSON.stringify({
        ok: false,
        toolName: "agent_tool_help",
        code: "tool_not_available",
        message: "指定工具不可用。",
        hint: "使用公开聚合工具。",
        details: {
          requestedToolName: "siyuan_riff_deck",
          suggestedToolName: "siyuan_riff",
          suggestedActionName: "deck",
        },
      })}`,
    },
  ], { resolveCallReadOnly: () => true });
  const stored = messages.find((message) => message.role === "tool");
  assert.ok(stored && stored.role === "tool");
  const diagnostic = parseToolResultContentEnvelope(stored.content) as Record<string, unknown>;
  assert.equal(diagnostic.errorCode, "tool_not_available");
  assert.equal(diagnostic.requestedToolName, "siyuan_riff_deck");
  assert.equal(diagnostic.suggestedToolName, "siyuan_riff");
  assert.equal(diagnostic.suggestedActionName, "deck");
}

function discoveryHelpTool(): NativeTool {
  return {
    name: "agent_tool_help",
    title: "help",
    description: "help",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    readOnly: true,
    parallelSafe: true,
    providerVisible: true,
    source: "system",
    safety: { readOnly: true },
    async execute(args) {
      if (args.action === "list_tools") {
        return { ok: true, summary: "listed", content: JSON.stringify({ ok: true, toolName: "agent_tool_help", data: { tools: [] } }) };
      }
      return {
        ok: false,
        summary: "missing",
        errorCode: "tool_not_available",
        content: `[TOOL_FAILED] ${JSON.stringify({ ok: false, toolName: "agent_tool_help", code: "tool_not_available", message: "missing" })}`,
      };
    },
  };
}

class DiscoveryProvider implements ProviderAdapter {
  readonly id = "verify:tool-discovery";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  constructor(private readonly mode: "reset" | "stop") {}

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    const step = this.requests.length;
    if (step === 1) {
      for (let index = 0; index < 3; index += 1) {
        yield {
          type: "tool_call_done",
          toolCall: {
            id: `missing-${index}`,
            name: "agent_tool_help",
            arguments: JSON.stringify({ action: "describe_tool", toolName: `missing_${index}` }),
            index,
          },
        };
      }
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    if (step === 2) {
      yield {
        type: "tool_call_done",
        toolCall: {
          id: this.mode === "reset" ? "list-tools" : "missing-again",
          name: "agent_tool_help",
          arguments: JSON.stringify(this.mode === "reset"
            ? { action: "list_tools" }
            : { action: "describe_tool", toolName: "still_missing" }),
          index: 0,
        },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: this.mode === "reset" ? "目录已恢复。" : "工具发现失败，相关业务操作未执行。" };
    yield { type: "done", finishReason: "stop" };
  }
}

async function runDiscovery(mode: "reset" | "stop") {
  const registry = new NativeToolRegistry();
  registry.register(discoveryHelpTool());
  const provider = new DiscoveryProvider(mode);
  const events: AgentStreamEvent[] = [];
  const result = await new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    systemPrompt: "test",
    onEvent: (event) => events.push(event),
  }).run("test");
  return { provider, events, result };
}

async function verifyDiscoveryRounds(): Promise<void> {
  const reset = await runDiscovery("reset");
  assert.equal(reset.result.status, "answer_ready");
  assert.equal(reset.provider.requests.length, 3, "同批三个失败只能触发一次恢复，list_tools 成功后应清零");
  assert.equal(reset.events.filter((event) => event.type === "notice").length, 1);

  const stopped = await runDiscovery("stop");
  assert.equal(stopped.provider.requests.length, 3, "第二轮失败后只能再做 tools=[] soft finalization");
  assert.deepEqual(stopped.provider.requests[2].tools, []);
  assert.match(stopped.result.answer, /未执行|失败/);
  assert.doesNotMatch(stopped.result.answer, /run_command.*(?:通过|成功)/i);
}

await verifyHelpDiagnostics();
verifyFailedHelpStorageDiagnostics();
await verifyDiscoveryRounds();
console.log("agent tool discovery recovery verification passed");

import type { RobotAgentRuntime, RobotAgentTurnInput, RobotAgentTurnResult, RobotAgentToolSummary } from "./robot-agent-runtime";
import { NativeToolAgentLoop } from "../../../features/kb/services/agent-core/loop/native-tool-agent-loop";
import { AgentSession } from "../../../features/kb/services/agent-core/session/agent-session";
import type { AgentMessage } from "../../../features/kb/services/agent-core/messages/agent-message";
import { compactAgentSessionMessagesForStorage } from "../../../features/kb/services/agent-core/messages/message-compactor";
import { createProviderAdapterForKbModel } from "../../../features/kb/services/agent-core/providers/agent-provider-factory";
import { NativeToolRegistry, resolveNativeToolReadOnly } from "../../../features/kb/services/agent-core/tools/native-tool-registry";
import type { NativeTool } from "../../../features/kb/services/agent-core/tools/native-tool";
import type { AgentHttpTransport } from "../../../features/kb/services/agent-core/providers/agent-http-transport";
import type { KbChatModelConfig, KbChatProviderConfig, KbChatProviderType } from "../../../features/kb/types/settings";
import type { RobotModelConfigStore } from "../runtime/robot-model-config";
import type { RobotConfirmation } from "../contracts/robot-confirmation";
import { RobotConfirmationBridge } from "./robot-confirmation-bridge";
import type { RobotConfirmationOutcome } from "../core/robot-core";
import {
  agentProfileAllowsTool,
  agentProfileAllowsMemory,
  getAgentProfile,
  ROBOT_AGENT_PROFILE_ID,
  type AgentProfile,
} from "../../../features/agent-platform/agent-profile";
import { buildGlobalMemoryContext } from "../../../features/kb/services/agent-workbench/memory/global-memory-store";
import { bindAutomationRobotResult, encodeAutomationRobotRoute } from "../../../features/agent-platform/automation/automation-robot-route";
import { resolveRobotAllowance } from "../settings/robot-settings-types";
import type { RobotToolPolicy } from "../settings/robot-settings-types";

export interface KernelRobotAgentRuntimeDeps {
  /** Kernel HTTP transport（siyuan.client.fetch → forwardProxy），stream:false。 */
  transport: AgentHttpTransport;
  /** Kernel-safe 工具注册表（buildRobotKernelToolRegistry）。 */
  toolRegistry: NativeToolRegistry;
  modelConfigStore: RobotModelConfigStore;
  /** 从 Robot Secret Vault 读取 API Key；无则返回 null。 */
  getApiKey(): Promise<string | null>;
  requestConfirmation(confirmation: RobotConfirmation, promptText: string): Promise<RobotConfirmationOutcome>;
  /** 调度/取消定时器；不传则用 globalThis.setTimeout。 */
  timeout?(fn: () => void, ms: number): () => void;
  maxToolCalls?: number;
}

/**
 * Kernel 版 Robot Agent runtime。
 * 复用共享 `NativeToolAgentLoop` + KernelAgentHttpTransport（非流式）+ 注入的 Kernel-safe tool registry；
 * 不复制第二套 Agent loop，不依赖 window / Svelte / DOM。
 */
export class KernelRobotAgentRuntime implements RobotAgentRuntime {
  constructor(private readonly deps: KernelRobotAgentRuntimeDeps) {}

  async runTurn(input: RobotAgentTurnInput): Promise<RobotAgentTurnResult> {
    const profile = getAgentProfile(ROBOT_AGENT_PROFILE_ID);
    const snapshot = await this.deps.modelConfigStore.get();
    if (!snapshot) {
      return { ok: false, answer: "机器人模型配置尚未同步，请在设置中选择 AI 知识库当前模型。", errorCode: "model_config_missing", toolSummaries: [], conversationId: input.conversationId };
    }

    const apiKey = await this.deps.getApiKey();
    const provider = this.toProviderConfig(snapshot, apiKey);
    const model: KbChatModelConfig = {
      id: snapshot.modelId,
      name: snapshot.modelId,
      temperature: snapshot.temperature ?? 0.3,
      ...(snapshot.maxTokens !== undefined ? { maxTokens: snapshot.maxTokens } : {}),
    };
    const adapter = createProviderAdapterForKbModel({
      provider,
      model,
      thinkingMode: "off",
      agentThinkingEnabled: false,
      overrides: {
        transport: this.deps.transport,
        stream: false,
        requestTimeoutMs: input.modelTimeoutMs,
      },
    });

    const persistedAgentMessages = Array.isArray(input.session.agentMessages) ? input.session.agentMessages : [];
    const session = new AgentSession(input.conversationId, persistedAgentMessages);

    const bridge = new RobotConfirmationBridge({
      provider: input.provider,
      accountId: input.accountId,
      chatId: input.chatId,
      senderId: input.senderId,
      requestConfirmation: this.deps.requestConfirmation,
      toolPolicy: input.toolPolicy,
    });

    const turnRegistry = this.createTurnRegistry(input, profile);
    const memoryContext = agentProfileAllowsMemory(profile, "read")
      ? await buildGlobalMemoryContext(input.userText, { limit: 8, maxChars: 4000 })
      : undefined;

    const abort = new AbortController();
    let timedOut = false;
    const cancelTimeout = this.scheduleTimeout(() => {
      timedOut = true;
      abort.abort();
    }, input.turnTimeoutMs);

    const loop = new NativeToolAgentLoop({
      provider: adapter,
      toolRegistry: turnRegistry,
      session,
      conversationId: input.conversationId,
      systemPrompt: input.systemPrompt,
      contextInstructions: memoryContext
        ? `# User Long-term Memory\nUse these user facts silently. Current user input wins on conflicts. Never expose memory IDs or storage implementation.\n${memoryContext}`
        : undefined,
      bridge,
      maxToolCalls: this.deps.maxToolCalls ?? profile.execution.defaultMaxToolCalls,
      abortSignal: abort.signal,
    });
    const initialMessageCount = session.messageCount();

    try {
      const result = await loop.run(input.userText);
      const agentMessages = compactAgentSessionMessagesForStorage(result.messages, {
        resolveCallReadOnly: (toolName, args) => resolveNativeToolReadOnly(turnRegistry, toolName, args),
      });
      if (timedOut) {
        return { ok: false, answer: "AI 模型响应超时，请稍后再试。", errorCode: "provider_timeout", toolSummaries: [], conversationId: input.conversationId, agentMessages };
      }
      if (result.status !== "answer_ready") {
        return {
          ok: false,
          answer: result.answer || "AI 服务当前不可用，请稍后重试。",
          errorCode: result.errorCode ?? "agent_failed",
          toolSummaries: extractToolSummaries(result.messages.slice(initialMessageCount)),
          conversationId: input.conversationId,
          agentMessages,
        };
      }
      return {
        ok: true,
        answer: result.answer,
        toolSummaries: extractToolSummaries(result.messages.slice(initialMessageCount)),
        conversationId: input.conversationId,
        agentMessages,
      };
    } catch (error) {
      const providerTimedOut = error && typeof error === "object"
        && (error as { code?: unknown }).code === "provider_timeout";
      const timeout = timedOut || providerTimedOut;
      const runtimeCode = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
        ? String((error as { code: string }).code).slice(0, 80)
        : "agent_failed";
      return {
        ok: false,
        answer: timeout ? "AI 模型响应超时，请稍后再试。" : "AI 服务当前不可用，请稍后重试。",
        errorCode: timeout ? "provider_timeout" : runtimeCode,
        toolSummaries: [],
        conversationId: input.conversationId,
        agentMessages: compactAgentSessionMessagesForStorage(session.snapshot(), {
          resolveCallReadOnly: (toolName, args) => resolveNativeToolReadOnly(turnRegistry, toolName, args),
        }),
      };
    } finally {
      cancelTimeout();
    }
  }

  private createTurnRegistry(input: RobotAgentTurnInput, profile: AgentProfile): NativeToolRegistry {
    const registry = new NativeToolRegistry();
    for (const tool of this.deps.toolRegistry.list()) {
      // 先检查 Agent Profile：Robot 只能使用其 Profile 白名单内的工具。
      if (!agentProfileAllowsTool(profile, tool.name)) continue;
      if (tool.name === "homepage_components") {
        // 聚合工具无条件走子工具策略分支（子工具 → 顶层 → 默认）。
        // 注册判断基于真实 action 与真实 readOnly 元数据；执行层每次按完整 dotted action 再次校验。
        const gate = createComponentSubtoolGate(tool, input.toolPolicy);
        if (!gate.shouldRegister) continue;
        registry.register({
          ...tool,
          parameters: gate.parameters,
          readOnly: gate.readOnly,
          safety: gate.safety,
          aggregateActionHelp: gate.aggregateActionHelp,
          execute: gate.execute,
          preflightValidate: gate.preflightValidate,
        });
        continue;
      }
      const explicit = input.toolPolicy.tools[tool.name];
      const allowed = explicit
        ? explicit.remoteAllowed
        : tool.readOnly && input.toolPolicy.readOnlyDefaultAllowed;
      if (!allowed) continue;
      registry.register(tool.name === "automation_manage" ? this.bindAutomationRoute(tool, input) : tool);
    }
    return registry;
  }

  private bindAutomationRoute(tool: NativeTool, input: RobotAgentTurnInput): NativeTool {
    const routeRef = encodeAutomationRobotRoute(input);
    const bind = (args: Record<string, unknown>) => bindAutomationRobotResult(args, routeRef, input.conversationId);
    return {
      ...tool,
      execute: (args, context) => tool.execute(bind(args), context),
      ...(tool.preflightValidate ? { preflightValidate: (args: Record<string, unknown>) => tool.preflightValidate!(bind(args)) } : {}),
      ...(tool.isReadOnlyCall ? { isReadOnlyCall: (args: Record<string, unknown>) => tool.isReadOnlyCall!(bind(args)) } : {}),
      ...(tool.preview ? { preview: (args: Record<string, unknown>) => tool.preview!(bind(args)) } : {}),
    };
  }

  private scheduleTimeout(fn: () => void, ms: number): () => void {
    if (this.deps.timeout) return this.deps.timeout(fn, ms);
    if (typeof globalThis.setTimeout === "function" && typeof globalThis.clearTimeout === "function") {
      const id = globalThis.setTimeout(fn, ms);
      return () => globalThis.clearTimeout(id);
    }
    return () => {};
  }

  private toProviderConfig(snapshot: { providerId: string; providerType: string; baseUrl?: string; nativeCompatibility?: Record<string, unknown> }, apiKey: string | null): KbChatProviderConfig {
    return {
      id: snapshot.providerId,
      name: snapshot.providerId,
      type: snapshot.providerType as KbChatProviderType,
      baseUrl: snapshot.baseUrl ?? "",
      ...(apiKey ? { apiKey } : {}),
      enabled: true,
      models: [],
      ...(snapshot.nativeCompatibility ? { providerNativeAgentCompatibility: snapshot.nativeCompatibility as KbChatProviderConfig["providerNativeAgentCompatibility"] } : {}),
    };
  }
}

/**
 * homepage_components 的子工具权限门控（零状态纯函数，可在 Node 验证中直接运行）。
 * - shouldRegister：按真实 action 与真实 readOnly 元数据计算，任一 action 被允许即注册。
 * - execute：每次按完整 dotted action 重新校验 remoteAllowed（子工具 → 顶层 → 默认）；
 *   被禁止的 action 直接拒绝，不进入底层业务 execute，不产生业务副作用。
 */
export function createComponentSubtoolGate(
  tool: NativeTool,
  policy: RobotToolPolicy,
): {
  shouldRegister: boolean;
  parameters: NativeTool["parameters"];
  readOnly: boolean;
  safety: NativeTool["safety"];
  aggregateActionHelp: NonNullable<NativeTool["aggregateActionHelp"]>;
  execute: NativeTool["execute"];
  preflightValidate: NonNullable<NativeTool["preflightValidate"]>;
} {
  const help = tool.aggregateActionHelp ?? {};
  const actionEntries = Object.entries(help).map(([action, meta]) => ({ action, readOnly: meta.readOnly === true }));
  const allowedActions = actionEntries.filter((entry) => resolveRobotAllowance(policy, tool.name, entry.action, entry.readOnly).remoteAllowed);
  const allowed = new Set(allowedActions.map((entry) => entry.action));
  const isAllowedCall = (args: Record<string, unknown>): boolean => {
    const action = typeof args.action === "string" ? args.action : "";
    return allowed.has(action);
  };
  const deniedValidation = (action?: string) => ({
    ok: false as const,
    error: {
      code: "robot_subtool_denied",
      message: `远程机器人策略未开放组件子工具 ${action ?? "未知"}。`,
    },
  });
  const filteredActionHelp = Object.fromEntries(
    Object.entries(help).filter(([action]) => allowed.has(action)),
  );
  return {
    shouldRegister: allowedActions.length > 0,
    parameters: filterNativeActionEnum(tool.parameters, allowedActions.map((entry) => entry.action)),
    readOnly: allowedActions.every((entry) => entry.readOnly),
    safety: allowedActions.every((entry) => entry.readOnly) ? { readOnly: true } : tool.safety,
    aggregateActionHelp: filteredActionHelp,
    preflightValidate: async (args) => {
      const action = typeof args.action === "string" ? args.action : undefined;
      if (!isAllowedCall(args)) return deniedValidation(action);
      return tool.preflightValidate ? tool.preflightValidate(args) : { ok: true };
    },
    execute: (args, context) => {
      const raw = args && typeof args === "object" ? args as Record<string, unknown> : {};
      const action = typeof raw.action === "string" ? raw.action : undefined;
      const readOnly = tool.isReadOnlyCall?.(args) === true;
      const resolution = resolveRobotAllowance(policy, tool.name, action, readOnly);
      if (!resolution.remoteAllowed) {
        return Promise.resolve({
          ok: false,
          content: `远程机器人策略未开放组件子工具 ${action ?? "未知"}。`,
          summary: "组件子工具被远程策略拒绝",
          errorCode: "robot_subtool_denied",
          sideEffectState: "not_started",
        });
      }
      return tool.execute(args, context);
    },
  };
}

function filterNativeActionEnum(schema: NativeTool["parameters"], actions: readonly string[]): NativeTool["parameters"] {
  const root = schema && typeof schema === "object" ? schema as Record<string, unknown> : {};
  const properties = root.properties && typeof root.properties === "object" ? root.properties as Record<string, unknown> : {};
  const action = properties.action && typeof properties.action === "object" ? properties.action as Record<string, unknown> : {};
  return {
    ...root,
    properties: {
      ...properties,
      action: { ...action, enum: [...actions] },
    },
  } as NativeTool["parameters"];
}

function extractToolSummaries(messages: readonly AgentMessage[]): RobotAgentToolSummary[] {
  const calls = new Map<string, { toolName: string; action?: string }>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      let action: string | undefined;
      try {
        const args = JSON.parse(call.arguments) as unknown;
        if (args && typeof args === "object" && !Array.isArray(args) && typeof (args as Record<string, unknown>).action === "string") {
          action = String((args as Record<string, unknown>).action).slice(0, 80);
        }
      } catch {
        // 参数损坏时仍记录工具名。
      }
      calls.set(call.id, { toolName: call.name, ...(action ? { action } : {}) });
    }
  }

  const seen = new Set<string>();
  const summaries: RobotAgentToolSummary[] = [];
  for (const message of messages) {
    if (message.role !== "tool" || typeof message.name !== "string" || !message.name) continue;
    const call = calls.get(message.toolCallId);
    const identity = message.toolCallId || `${message.name}:${summaries.length}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    let summary = "工具已执行";
    try {
      const parsed = JSON.parse(message.content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const value = parsed as Record<string, unknown>;
        const ok = value.ok === true;
        const error = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : {};
        const code = typeof value.errorCode === "string"
          ? value.errorCode
          : typeof error.code === "string"
            ? error.code
            : "";
        summary = ok ? "执行成功" : `执行失败${code ? `：${code.slice(0, 80)}` : ""}`;
      }
    } catch {
      // 非 JSON 结果只显示稳定摘要。
    }
    summaries.push({
      toolName: call?.toolName ?? message.name,
      ...(call?.action ? { action: call.action } : {}),
      summary,
    });
  }
  return summaries;
}

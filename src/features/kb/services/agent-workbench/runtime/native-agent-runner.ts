import { NativeToolAgentLoop, type NativeToolAgentLoopResult } from "../../agent-core/loop/native-tool-agent-loop";
import type { AgentSession } from "../../agent-core/session/agent-session";
import type { ProviderAdapter } from "../../agent-core/providers/provider-adapter";
import type { NativeToolRegistry } from "../../agent-core/tools/native-tool-registry";
import type { AgentStreamEvent } from "../../agent-core/loop/stream-event";

export interface RunNativeAgentLoopParams {
  provider: ProviderAdapter;
  toolRegistry: NativeToolRegistry;
  systemPrompt: string;
  contextInstructions: string;
  session?: AgentSession;
  conversationId?: string;
  /** Tool names that skip confirmation dialog (still go through preview & safety guards). */
  autoAllowedToolNames?: string[];
  abortSignal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
  question: string;
  /** Maximum tool calls per turn (defaults to 20; 0 disables this limit). */
  maxToolCalls?: number;
}

export interface RunNativeAgentLoopResult {
  ok: boolean;
  answer: string;
  steps: number;
  status: string;
  messages: NativeToolAgentLoopResult["messages"];
  errorCode?: string;
  errorMessage?: string;
}

export async function runNativeAgentLoop(
  params: RunNativeAgentLoopParams,
): Promise<RunNativeAgentLoopResult> {
  const loop = new NativeToolAgentLoop({
    provider: params.provider,
    toolRegistry: params.toolRegistry,
    session: params.session,
    systemPrompt: params.systemPrompt,
    contextInstructions: params.contextInstructions,
    conversationId: params.conversationId,
    autoAllowedToolNames: params.autoAllowedToolNames,
    abortSignal: params.abortSignal,
    onEvent: params.onEvent,
    maxToolCalls: params.maxToolCalls,
  });

  const raw = await loop.run(params.question);

  return {
    ok: raw.status === "answer_ready",
    answer: raw.answer,
    steps: raw.steps,
    status: raw.status,
    messages: raw.messages,
    errorCode: raw.errorCode,
    errorMessage: raw.errorMessage,
  };
}

import type { AgentMessage, AgentToolCall } from "../messages/agent-message";
import type { ProviderCapabilities } from "./provider-capabilities";
import type { NativeTool } from "../tools/native-tool";
import type { AgentTokenUsage } from "../../../../agent-platform/agent-run-protocol";

export interface AgentChatRequest {
  messages: readonly AgentMessage[];
  tools: readonly NativeTool[];
  /** Recovery turns can require a real native tool call instead of accepting action narration. */
  toolChoice?: "auto" | "required";
  abortSignal?: AbortSignal;
}

export type AgentProviderEvent =
  | { type: "text_delta"; delta: string }
  | { type: "reasoning_delta"; delta: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "tool_call_done"; toolCall: AgentToolCall }
  | { type: "usage"; usage: AgentTokenUsage }
  | { type: "done"; finishReason?: string }
  | { type: "error"; error: Error };

export interface ProviderAdapter {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  readonly requestTimeoutMs?: number;
  streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent>;
}


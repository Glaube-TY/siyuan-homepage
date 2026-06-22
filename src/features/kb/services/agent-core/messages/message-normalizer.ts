import type { AgentAssistantMessage, AgentMessage, AgentToolMessage } from "./agent-message";

function isAssistantWithToolCalls(message: AgentMessage): message is AgentAssistantMessage {
  return message.role === "assistant" && Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
}

function isToolMessage(message: AgentMessage): message is AgentToolMessage {
  return message.role === "tool";
}

/**
 * Filter out historical tool_calls and tool results for tools no longer available.
 *
 * When a session carries messages from a previous turn that include calls to tools
 * that have since been removed (e.g. deprecated database helpers), the provider
 * may re-attempt those calls. This function strips those stale tool_calls and their
 * corresponding tool-result messages so the provider only sees valid tool history.
 *
 * ponytail: simple set-based filter, O(n) over messages.
 */
export function filterStaleToolCalls(
  messages: readonly AgentMessage[],
  availableToolNames: ReadonlySet<string>,
): AgentMessage[] {
  // Collect toolCallIds that reference unavailable tools
  const staleToolCallIds = new Set<string>();
  for (const message of messages) {
    if (isAssistantWithToolCalls(message)) {
      for (const call of message.toolCalls) {
        if (!availableToolNames.has(call.name)) {
          staleToolCallIds.add(call.id);
        }
      }
    }
  }

  if (staleToolCallIds.size === 0) return messages as AgentMessage[];

  const filtered: AgentMessage[] = [];
  for (const message of messages) {
    if (isToolMessage(message)) {
      // Drop tool results for stale calls
      if (staleToolCallIds.has(message.toolCallId)) continue;
      filtered.push(message);
    } else if (isAssistantWithToolCalls(message)) {
      const keptCalls = message.toolCalls.filter((c) => !staleToolCallIds.has(c.id));
      if (keptCalls.length > 0) {
        filtered.push({ ...message, toolCalls: keptCalls });
      } else if (message.content.trim().length > 0) {
        // All tool_calls were stale; keep as text-only assistant message
        filtered.push({ ...message, toolCalls: undefined });
      }
      // else: assistant message with only stale tool_calls and no content → drop
    } else {
      filtered.push(message);
    }
  }
  return filtered;
}

export function normalizeToolCallMessages(messages: readonly AgentMessage[]): AgentMessage[] {
  const toolResultsById = new Map<string, AgentToolMessage>();
  for (const message of messages) {
    if (isToolMessage(message) && !toolResultsById.has(message.toolCallId)) {
      toolResultsById.set(message.toolCallId, message);
    }
  }

  const usedToolResultIds = new Set<string>();
  const normalized: AgentMessage[] = [];

  for (const message of messages) {
    if (isToolMessage(message)) continue;

    if (!isAssistantWithToolCalls(message)) {
      normalized.push(message);
      continue;
    }

    const keptCalls = [];
    const pairedToolMessages: AgentToolMessage[] = [];
    const seenCallIds = new Set<string>();

    for (const call of message.toolCalls) {
      if (!call.id || seenCallIds.has(call.id)) continue;
      const toolMessage = toolResultsById.get(call.id);
      if (!toolMessage || usedToolResultIds.has(call.id)) continue;
      keptCalls.push(call);
      pairedToolMessages.push(toolMessage);
      seenCallIds.add(call.id);
      usedToolResultIds.add(call.id);
    }

    if (keptCalls.length === 0) {
      if (message.content.trim().length > 0) {
        normalized.push({ ...message, toolCalls: undefined });
      }
      continue;
    }

    normalized.push({ ...message, toolCalls: keptCalls });
    normalized.push(...pairedToolMessages);
  }

  return normalized;
}


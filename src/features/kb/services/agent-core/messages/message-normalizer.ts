import type { AgentAssistantMessage, AgentMessage, AgentToolMessage } from "./agent-message";

function isAssistantWithToolCalls(message: AgentMessage): message is AgentAssistantMessage {
  return message.role === "assistant" && Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
}

function isToolMessage(message: AgentMessage): message is AgentToolMessage {
  return message.role === "tool";
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


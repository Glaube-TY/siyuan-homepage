import type {
  AssistantChatMessage,
  ChatMessage,
  UserChatMessage,
} from "../../../types/chat";

export interface CompleteConversationTurn {
  turnIndex: number;
  user: UserChatMessage;
  assistant: AssistantChatMessage;
}

export function isCompletedAssistantMessage(
  message: ChatMessage,
): message is AssistantChatMessage {
  return (
    message.role === "assistant" &&
    message.isComplete !== false &&
    !message.agentStatus &&
    message.content.trim().length > 0
  );
}

export function getCompleteConversationTurns(
  messages: readonly ChatMessage[],
): CompleteConversationTurn[] {
  const turns: CompleteConversationTurn[] = [];
  let pendingUser: UserChatMessage | null = null;
  let turnIndex = 0;

  for (const message of messages) {
    if (message.role === "user") {
      pendingUser = message;
      turnIndex += 1;
      continue;
    }

    if (!isCompletedAssistantMessage(message) || !pendingUser) {
      continue;
    }

    turns.push({
      turnIndex,
      user: pendingUser,
      assistant: message,
    });
    pendingUser = null;
  }

  return turns;
}

export function findCompleteConversationTurn(
  messages: readonly ChatMessage[],
  ids: { userMessageId?: string; assistantMessageId?: string },
): CompleteConversationTurn | undefined {
  return getCompleteConversationTurns(messages).find((turn) => {
    return (
      (!ids.userMessageId || turn.user.id === ids.userMessageId) &&
      (!ids.assistantMessageId || turn.assistant.id === ids.assistantMessageId)
    );
  });
}


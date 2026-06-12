export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: string;
  index?: number;
}

export interface AgentBaseMessage {
  role: AgentMessageRole;
  content: string;
}

export interface AgentSystemMessage extends AgentBaseMessage {
  role: "system";
}

export interface AgentUserMessage extends AgentBaseMessage {
  role: "user";
}

export interface AgentAssistantMessage extends AgentBaseMessage {
  role: "assistant";
  toolCalls?: AgentToolCall[];
  reasoning?: string;
}

export interface AgentToolMessage extends AgentBaseMessage {
  role: "tool";
  toolCallId: string;
  name: string;
}

export type AgentMessage =
  | AgentSystemMessage
  | AgentUserMessage
  | AgentAssistantMessage
  | AgentToolMessage;

export function createSystemMessage(content: string): AgentSystemMessage {
  return { role: "system", content };
}

export function createUserMessage(content: string): AgentUserMessage {
  return { role: "user", content };
}

export function createAssistantMessage(params: {
  content?: string;
  toolCalls?: AgentToolCall[];
  reasoning?: string;
}): AgentAssistantMessage {
  return {
    role: "assistant",
    content: params.content ?? "",
    ...(params.toolCalls && params.toolCalls.length > 0 ? { toolCalls: params.toolCalls } : {}),
    ...(params.reasoning ? { reasoning: params.reasoning } : {}),
  };
}

export function createToolMessage(params: {
  toolCallId: string;
  name: string;
  content: string;
}): AgentToolMessage {
  return {
    role: "tool",
    toolCallId: params.toolCallId,
    name: params.name,
    content: params.content,
  };
}


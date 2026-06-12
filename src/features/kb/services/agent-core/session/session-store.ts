import type { AgentMessage } from "../messages/agent-message";
import { AgentSession } from "./agent-session";

export interface AgentSessionRecord {
  id: string;
  messages: AgentMessage[];
  updatedAt: number;
}

const SENSITIVE_FIELD_KEYS = new Set([
  "beforeSnapshot", "afterSnapshot", "visualCompare", "confirmationId",
  "debug_trace", "api_key", "secret", "encryptedKey", "internalPath",
  "realPath", "snapshots", "toolInput",
]);

/**
 * Sanitize tool result content string by stripping sensitive fields from JSON content.
 * This is a conservative best-effort sanitization.
 */
export function sanitizeMessageForStorage(message: AgentMessage): AgentMessage {
  if (message.role !== "tool") return message;
  if (!message.content || message.content.length <= 4) return message;

  // Try to parse JSON content and strip sensitive keys
  try {
    const parsed = JSON.parse(message.content);
    if (typeof parsed !== "object" || parsed === null) return message;

    // Strip sensitive fields from top level
    for (const key of Object.keys(parsed)) {
      if (SENSITIVE_FIELD_KEYS.has(key)) {
        delete (parsed as Record<string, unknown>)[key];
      }
    }

    // Truncate very large content bodies
    if (typeof parsed.content === "string" && parsed.content.length > 2000) {
      parsed.content = `${parsed.content.slice(0, 2000)}...[truncated]`;
    }
    if (typeof parsed.markdown === "string" && parsed.markdown.length > 2000) {
      parsed.markdown = `${parsed.markdown.slice(0, 2000)}...[truncated]`;
    }
    if (typeof parsed.kramdown === "string" && parsed.kramdown.length > 2000) {
      parsed.kramdown = `${parsed.kramdown.slice(0, 2000)}...[truncated]`;
    }

    return { ...message, content: JSON.stringify(parsed) };
  } catch {
    // Not JSON, just truncate long content
    if (message.content.length > 4000) {
      return { ...message, content: `${message.content.slice(0, 4000)}...[truncated]` };
    }
    return message;
  }
}

export class InMemoryAgentSessionStore {
  private readonly records = new Map<string, AgentSessionRecord>();

  load(id: string): AgentSession | undefined {
    const record = this.records.get(id);
    return record ? new AgentSession(record.id, record.messages) : undefined;
  }

  save(session: AgentSession): void {
    const sanitized = session.snapshot().map(sanitizeMessageForStorage);
    this.records.set(session.id, {
      id: session.id,
      messages: sanitized,
      updatedAt: Date.now(),
    });
  }

  delete(id: string): void {
    this.records.delete(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }
}

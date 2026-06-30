import type { AgentMessage } from "../messages/agent-message";
import { parseToolResultContentEnvelope } from "../tools/tool-execution-result";
import { AgentSession } from "./agent-session";

export interface AgentSessionRecord {
  id: string;
  messages: AgentMessage[];
  updatedAt: number;
}

const SENSITIVE_FIELD_KEYS = new Set([
  "beforeSnapshot", "afterSnapshot", "visualCompare", "confirmationId", "_confirmationId",
  "debug_trace", "api_key", "secret", "encryptedKey", "internalPath",
  "realPath", "path", "snapshots", "toolInput", "markdown", "kramdown", "content", "blocks",
  "textPreview", "stdoutPreview", "stderrPreview", "stdout", "stderr",
  "result", "output", "raw", "rawContent", "responseText",
]);

function deepSanitizeObject(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(deepSanitizeObject);
  }
  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_FIELD_KEYS.has(key)) continue;
      result[key] = deepSanitizeObject(value);
    }
    return result;
  }
  return obj;
}

/**
 * Sanitize a message before persistence.
 * - For assistant messages: strips reasoning (rebuilt each turn by the provider).
 * - For tool messages: recursively strips sensitive fields from JSON content.
 * This is a conservative best-effort sanitization.
 */
export function sanitizeMessageForStorage(message: AgentMessage): AgentMessage {
  if (message.role === "assistant") {
    if (message.reasoning) {
      const { reasoning: _reasoning, ...rest } = message;
      return rest as AgentMessage;
    }
    return message;
  }
  if (message.role !== "tool") return message;
  if (!message.content || message.content.length <= 4) return message;

  try {
    const parsed = JSON.parse(message.content);
    if (typeof parsed !== "object" || parsed === null) return message;
    const sanitized = deepSanitizeObject(parsed);
    return { ...message, content: JSON.stringify(sanitized) };
  } catch {
    // Not direct JSON: try [TOOL_FAILED] envelope, otherwise replace with safe note
    const envelope = parseToolResultContentEnvelope(message.content);
    if (envelope) {
      const sanitized = deepSanitizeObject(envelope);
      return { ...message, content: JSON.stringify(sanitized) };
    }
    return { ...message, content: JSON.stringify({ ok: false, note: "Tool result compacted for storage." }) };
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

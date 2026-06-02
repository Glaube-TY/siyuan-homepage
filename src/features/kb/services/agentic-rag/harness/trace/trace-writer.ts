import type { KbAgentTraceEvent, KbAgentTraceEventType } from "./trace-event";
import { createKbAgentTraceEvent } from "./trace-event";
import { sanitizeTracePayload } from "./trace-sanitizer";

export interface KbAgentTraceWriter {
  events: KbAgentTraceEvent[];
  push(type: KbAgentTraceEventType, payload?: Record<string, unknown>, level?: KbAgentTraceEvent["level"]): void;
}

export function createTraceWriter(): KbAgentTraceWriter {
  const events: KbAgentTraceEvent[] = [];
  return {
    events,
    push(type, payload = {}, level = "info") {
      events.push(createKbAgentTraceEvent(type, sanitizeTracePayload(payload), level));
    },
  };
}

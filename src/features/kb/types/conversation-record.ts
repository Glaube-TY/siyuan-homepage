import type { KbConversationSession } from "./chat";

export const LEGACY_CONVERSATION_READ_ONLY = "LEGACY_CONVERSATION_READ_ONLY" as const;
export const CURRENT_CONVERSATION_SCHEMA_VERSION = 3 as const;

export interface CurrentConversationRecord extends KbConversationSession {
  kind: "current";
  readOnly: false;
  schemaVersion: typeof CURRENT_CONVERSATION_SCHEMA_VERSION;
}

export interface LegacyConversationRecord extends KbConversationSession {
  kind: "legacy";
  readOnly: true;
  legacySchemaVersion?: unknown;
  archiveError?: string;
  corrupted?: boolean;
  recoverable?: boolean;
  ignoredInternalCount?: number;
  unparseableVisibleCount?: number;
}

export type ConversationRecord = CurrentConversationRecord | LegacyConversationRecord;

export function isLegacyConversationRecord(
  conversation: unknown,
): conversation is LegacyConversationRecord {
  return !!conversation
    && typeof conversation === "object"
    && (conversation as { kind?: unknown }).kind === "legacy";
}

export function isCurrentConversationRecord(
  conversation: unknown,
): conversation is CurrentConversationRecord {
  if (!conversation || typeof conversation !== "object") return false;
  const record = conversation as {
    kind?: unknown;
    readOnly?: unknown;
    schemaVersion?: unknown;
  };
  return record.kind === "current"
    && record.readOnly === false
    && record.schemaVersion === CURRENT_CONVERSATION_SCHEMA_VERSION;
}

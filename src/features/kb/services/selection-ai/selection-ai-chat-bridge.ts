import { buildSelectionAskDraft } from "./selection-ai-prompts";
import type { SelectionAiContext, SelectionAiSkill } from "./selection-ai-types";

export type SelectionAskTarget = "dock" | "tab";

export interface SelectionAskPayload {
  selectedText: string;
  originalSelectedText: string;
  truncated: boolean;
  docId?: string;
  blockId?: string;
  docTitle?: string;
  documentText?: string;
  selectionStartInDocument?: number;
  createdAt: number;
  skill?: SelectionAiSkill;
}

type Handler = (payload: SelectionAskPayload) => void | Promise<void>;

const handlers: Partial<Record<SelectionAskTarget, Handler>> = {};
const pendingPayloads: Partial<Record<SelectionAskTarget, SelectionAskPayload>> = {};

export function emitSelectionAskPayload(
  payload: SelectionAskPayload,
  target: SelectionAskTarget = "dock"
): void {
  const h = handlers[target];
  if (h) {
    void h(payload);
    return;
  }
  pendingPayloads[target] = payload;
}

export function setSelectionAskPayloadHandler(
  target: SelectionAskTarget,
  nextHandler: Handler | null
): () => void {
  if (nextHandler) {
    handlers[target] = nextHandler;
    const pending = pendingPayloads[target];
    if (pending) {
      delete pendingPayloads[target];
      void nextHandler(pending);
    }
  } else {
    delete handlers[target];
  }

  return () => {
    if (handlers[target] === nextHandler) {
      delete handlers[target];
    }
  };
}

export function clearSelectionAskPayloadHandler(): void {
  (Object.keys(handlers) as SelectionAskTarget[]).forEach((k) => delete handlers[k]);
  (Object.keys(pendingPayloads) as SelectionAskTarget[]).forEach((k) => delete pendingPayloads[k]);
}

export function buildAskDraftFromPayload(payload: SelectionAskPayload): string {
  const context: SelectionAiContext = {
    selectedText: payload.selectedText,
    originalSelectedText: payload.originalSelectedText,
    truncated: payload.truncated,
    docId: payload.docId,
    blockId: payload.blockId,
    docTitle: payload.docTitle,
    documentText: payload.documentText,
    selectionStartInDocument: payload.selectionStartInDocument,
    source: "protyle-toolbar",
    createdAt: payload.createdAt,
  };
  return buildSelectionAskDraft(context, payload.skill);
}

export { buildSelectionAskDraft };

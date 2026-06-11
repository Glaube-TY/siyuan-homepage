/**
 * 文档内容编辑 pending confirmation store。
 * 只保存执行前待确认的临时 confirmation，不保存执行后状态。
 * 基于思源插件本地数据存储，不写入思源文档。
 */

import { saveData, loadData } from "../agent-workbench/storage/notebrain-plugin-storage";
import type {
  DocContentEditConfirmation,
  DocContentEditConfirmationStoreState,
} from "./doc-content-edit-types";

const STORE_KEY = "notebrain.docContentEdit.pendingConfirmations";

const MAX_CONFIRMATIONS = 100;
const DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 30 分钟

function generateConfirmationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadDocContentEditConfirmationStore(): Promise<DocContentEditConfirmationStoreState> {
  const data = await loadData<DocContentEditConfirmationStoreState>(STORE_KEY);
  if (data && Array.isArray(data.confirmations)) {
    return data;
  }
  return { confirmations: [] };
}

export async function saveDocContentEditConfirmationStore(
  state: DocContentEditConfirmationStoreState,
): Promise<void> {
  await saveData(STORE_KEY, state);
}

export interface CreateDocContentEditConfirmationInput {
  conversationId: string;
  action: DocContentEditConfirmation["action"];
  toolName: string;
  toolInput?: Record<string, unknown>;
  riskLevel: DocContentEditConfirmation["riskLevel"];
  target: DocContentEditConfirmation["target"];
  beforeSnapshot?: string;
  afterSnapshot?: string;
  visualCompare?: DocContentEditConfirmation["visualCompare"];
  warnings?: string[];
  expiresAt?: number;
}

export async function createDocContentEditConfirmation(
  input: CreateDocContentEditConfirmationInput,
): Promise<DocContentEditConfirmation> {
  const now = Date.now();
  const confirmation: DocContentEditConfirmation = {
    id: generateConfirmationId(),
    conversationId: input.conversationId,
    createdAt: now,
    expiresAt: input.expiresAt ?? now + DEFAULT_EXPIRY_MS,
    action: input.action,
    toolName: input.toolName,
    toolInput: input.toolInput ?? {},
    target: input.target,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    visualCompare: input.visualCompare,
    riskLevel: input.riskLevel,
    warnings: input.warnings,
  };

  const state = await loadDocContentEditConfirmationStore();
  state.confirmations.push(confirmation);
  if (state.confirmations.length > MAX_CONFIRMATIONS) {
    state.confirmations = state.confirmations.slice(-MAX_CONFIRMATIONS);
  }
  await saveDocContentEditConfirmationStore(state);
  return confirmation;
}

export async function getDocContentEditConfirmation(
  id: string,
): Promise<DocContentEditConfirmation | null> {
  const state = await loadDocContentEditConfirmationStore();
  return state.confirmations.find((c) => c.id === id) ?? null;
}

export async function removeDocContentEditConfirmation(id: string): Promise<void> {
  const state = await loadDocContentEditConfirmationStore();
  state.confirmations = state.confirmations.filter((c) => c.id !== id);
  await saveDocContentEditConfirmationStore(state);
}

export async function pruneExpiredDocContentEditConfirmations(
  now?: number,
): Promise<void> {
  const state = await loadDocContentEditConfirmationStore();
  const cutoff = now ?? Date.now();
  state.confirmations = state.confirmations.filter((c) => c.expiresAt > cutoff);
  await saveDocContentEditConfirmationStore(state);
}

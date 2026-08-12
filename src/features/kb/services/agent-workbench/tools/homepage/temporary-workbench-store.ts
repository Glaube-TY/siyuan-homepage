import {
  loadDataStrict,
  removeData,
  saveData,
} from "../../storage/notebrain-plugin-storage";
import { isValidStorageId } from "../../storage/notebrain-storage-keys";
import {
  normalizeTemporaryWorkbench,
  type AgentTemporaryWorkbench,
  type AgentTemporaryWorkbenchReference,
  type AgentTemporaryWorkbenchSource,
} from "./temporary-workbench-contract";

const INDEX_KEY = "notebrain/workbenches/index.json";
const toItemKey = (id: string) => `notebrain/workbenches/items/${id}.json`;

export interface TemporaryWorkbenchUsage {
  kind: "chat-message" | "agent-surface";
  id: string;
  label: string;
  conversationId?: string;
  messageId?: string;
}

export interface TemporaryWorkbenchIndexEntry extends AgentTemporaryWorkbenchReference {
  source: AgentTemporaryWorkbenchSource;
  usages: TemporaryWorkbenchUsage[];
  bytes: number;
}

export interface StoredTemporaryWorkbench extends AgentTemporaryWorkbench {
  source: AgentTemporaryWorkbenchSource;
}

interface TemporaryWorkbenchIndex {
  version: 1;
  items: TemporaryWorkbenchIndexEntry[];
}

let mutationTail = Promise.resolve();
const pendingItems = new Map<string, StoredTemporaryWorkbench>();

function normalizeSource(value: unknown): AgentTemporaryWorkbenchSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<AgentTemporaryWorkbenchSource>;
  if (typeof source.profileId !== "string" || !source.profileId.trim()) return undefined;
  if (typeof source.label !== "string" || !source.label.trim()) return undefined;
  return {
    profileId: source.profileId.trim().slice(0, 80),
    label: source.label.trim().slice(0, 80),
    ...(typeof source.conversationId === "string" && source.conversationId ? { conversationId: source.conversationId.slice(0, 100) } : {}),
    ...(typeof source.messageId === "string" && source.messageId ? { messageId: source.messageId.slice(0, 100) } : {}),
  };
}

function normalizeUsage(value: unknown): TemporaryWorkbenchUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Partial<TemporaryWorkbenchUsage>;
  if ((usage.kind !== "chat-message" && usage.kind !== "agent-surface")
    || typeof usage.id !== "string" || !usage.id
    || typeof usage.label !== "string" || !usage.label) return undefined;
  return {
    kind: usage.kind,
    id: usage.id.slice(0, 220),
    label: usage.label.slice(0, 80),
    ...(typeof usage.conversationId === "string" && usage.conversationId ? { conversationId: usage.conversationId.slice(0, 100) } : {}),
    ...(typeof usage.messageId === "string" && usage.messageId ? { messageId: usage.messageId.slice(0, 100) } : {}),
  };
}

function normalizeEntry(value: unknown): TemporaryWorkbenchIndexEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Partial<TemporaryWorkbenchIndexEntry>;
  if (typeof entry.id !== "string" || !isValidStorageId(entry.id)
    || typeof entry.title !== "string" || !entry.title.trim()
    || typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt)
    || typeof entry.bytes !== "number" || !Number.isFinite(entry.bytes)) return undefined;
  const source = normalizeSource(entry.source);
  if (!source) return undefined;
  return {
    id: entry.id,
    title: entry.title.trim().slice(0, 80),
    createdAt: Math.max(0, Math.round(entry.createdAt)),
    source,
    usages: Array.isArray(entry.usages)
      ? entry.usages.map(normalizeUsage).filter((item): item is TemporaryWorkbenchUsage => !!item)
      : [],
    bytes: Math.max(0, Math.round(entry.bytes)),
  };
}

async function readIndex(): Promise<TemporaryWorkbenchIndex> {
  const result = await loadDataStrict<TemporaryWorkbenchIndex>(INDEX_KEY);
  if (result.status === "missing" || (result.status === "ok" && (result.data as unknown) === "")) {
    return { version: 1, items: [] };
  }
  if (result.status === "error") throw new Error(`临时工作台读取失败：${result.error}`);
  if (!result.data || result.data.version !== 1 || !Array.isArray(result.data.items)) {
    throw new Error("临时工作台索引结构无效，已停止覆盖。");
  }
  const items = result.data.items.map(normalizeEntry);
  if (items.some((item) => !item)) throw new Error("临时工作台索引条目无效，已停止覆盖。");
  return { version: 1, items: items as TemporaryWorkbenchIndexEntry[] };
}

async function saveChecked<T>(key: string, value: T): Promise<void> {
  await saveData(key, value);
  const saved = await loadDataStrict<T>(key);
  if (saved.status !== "ok" || JSON.stringify(saved.data) !== JSON.stringify(value)) {
    throw new Error(`临时工作台写入校验失败：${key}`);
  }
}

function mutateIndex(update: (index: TemporaryWorkbenchIndex) => void): Promise<void> {
  const run = mutationTail.then(async () => {
    const index = await readIndex();
    update(index);
    await saveChecked(INDEX_KEY, index);
  });
  mutationTail = run.catch(() => undefined);
  return run;
}

export async function listTemporaryWorkbenches(): Promise<TemporaryWorkbenchIndexEntry[]> {
  await mutationTail;
  return (await readIndex()).items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getTemporaryWorkbench(id: string): Promise<StoredTemporaryWorkbench | undefined> {
  if (!isValidStorageId(id)) return undefined;
  const pending = pendingItems.get(id);
  if (pending) return pending;
  const result = await loadDataStrict<StoredTemporaryWorkbench>(toItemKey(id));
  if (result.status !== "ok" || (result.data as unknown) === "") return undefined;
  const { source: rawSource, ...rawWorkbench } = result.data;
  const workbench = normalizeTemporaryWorkbench(rawWorkbench);
  const source = normalizeSource(rawSource);
  return workbench && source ? { ...workbench, source } : undefined;
}

export async function saveTemporaryWorkbench(
  workbench: AgentTemporaryWorkbench,
  rawSource: AgentTemporaryWorkbenchSource,
): Promise<void> {
  const normalized = normalizeTemporaryWorkbench(workbench);
  const source = normalizeSource(rawSource);
  if (!normalized || !source || !isValidStorageId(normalized.id)) {
    throw new Error("临时工作台或来源信息无效。");
  }
  const stored: StoredTemporaryWorkbench = { ...normalized, source };
  pendingItems.set(normalized.id, stored);
  try {
    await saveChecked(toItemKey(normalized.id), stored);
    await mutateIndex((index) => {
      index.items = index.items.filter((item) => item.id !== normalized.id);
      index.items.push({
        id: normalized.id,
        title: normalized.title,
        createdAt: normalized.createdAt,
        source,
        usages: [],
        bytes: new TextEncoder().encode(JSON.stringify(stored)).length,
      });
    });
  } finally {
    pendingItems.delete(normalized.id);
  }
}

export async function attachTemporaryWorkbenchUsage(
  ids: readonly string[],
  rawUsage: TemporaryWorkbenchUsage,
): Promise<void> {
  const validIds = new Set(ids.filter(isValidStorageId));
  const usage = normalizeUsage(rawUsage);
  if (!usage || validIds.size === 0) return;
  await mutateIndex((index) => {
    for (const item of index.items) {
      if (!validIds.has(item.id) || item.usages.some((entry) => entry.id === usage.id)) continue;
      item.usages.push(usage);
    }
  });
}

export async function deleteTemporaryWorkbench(id: string): Promise<void> {
  if (!isValidStorageId(id)) return;
  pendingItems.delete(id);
  await removeData(toItemKey(id));
  const removed = await loadDataStrict(toItemKey(id));
  if (removed.status === "error" || (removed.status === "ok" && (removed.data as unknown) !== "")) {
    throw new Error(`临时工作台删除校验失败：${id}`);
  }
  await mutateIndex((index) => {
    index.items = index.items.filter((item) => item.id !== id);
  });
}

export async function detachTemporaryWorkbenchUsages(target: {
  conversationId: string;
  messageId?: string;
}): Promise<void> {
  await mutateIndex((index) => {
    for (const item of index.items) {
      item.usages = item.usages.filter((usage) => usage.conversationId !== target.conversationId
        || (target.messageId !== undefined && usage.messageId !== target.messageId));
    }
  });
}

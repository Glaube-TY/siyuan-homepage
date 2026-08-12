import { z } from "zod";
import {
  loadDataStrict,
  removeData,
  saveData,
} from "../storage/notebrain-plugin-storage";
import { isValidStorageId } from "../storage/notebrain-storage-keys";

const PROFILE_KEY = "notebrain/memory/profile.json";
const INDEX_KEY = "notebrain/memory/index.json";
const toItemKey = (id: string) => `notebrain/memory/items/${id}.json`;

export const GLOBAL_MEMORY_TYPES = [
  "identity",
  "preference",
  "goal",
  "constraint",
  "project",
  "relationship",
  "decision",
  "experience",
] as const;

export type GlobalMemoryType = typeof GLOBAL_MEMORY_TYPES[number];

export interface GlobalMemoryProfile {
  schemaVersion: 1;
  enabled: boolean;
  autoLearn: boolean;
  updatedAt: number;
}

export interface GlobalMemorySource {
  profileId: string;
  surface: string;
  conversationId?: string;
  messageId?: string;
  kind: "explicit" | "agent" | "user-edited";
}

export interface GlobalMemoryRecord {
  schemaVersion: 1;
  id: string;
  type: GlobalMemoryType;
  content: string;
  importance: number;
  confidence: number;
  pinned: boolean;
  reinforcementCount: number;
  source: GlobalMemorySource;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalMemoryIndexEntry {
  id: string;
  type: GlobalMemoryType;
  content: string;
  importance: number;
  confidence: number;
  pinned: boolean;
  reinforcementCount: number;
  createdAt: number;
  updatedAt: number;
}

interface StoredGlobalMemoryIndexEntry extends Omit<GlobalMemoryIndexEntry, "content"> {
  fingerprint: string;
}

interface GlobalMemoryIndex {
  schemaVersion: 1;
  items: StoredGlobalMemoryIndexEntry[];
  updatedAt: number;
}

export interface RememberGlobalMemoryInput {
  type: GlobalMemoryType;
  content: string;
  importance?: number;
  confidence?: number;
  pinned?: boolean;
  source: GlobalMemorySource;
}

const profileSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  autoLearn: z.boolean(),
  updatedAt: z.number().finite().nonnegative(),
}).strict();

const sourceSchema = z.object({
  profileId: z.string().trim().min(1).max(80),
  surface: z.string().trim().min(1).max(80),
  conversationId: z.string().max(100).optional(),
  messageId: z.string().max(100).optional(),
  kind: z.enum(["explicit", "agent", "user-edited"]),
}).strict();

const recordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().refine(isValidStorageId),
  type: z.enum(GLOBAL_MEMORY_TYPES),
  content: z.string().trim().min(1).max(1000),
  importance: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  pinned: z.boolean(),
  reinforcementCount: z.number().int().min(1),
  source: sourceSchema,
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
}).strict();

const indexEntrySchema = recordSchema.omit({ schemaVersion: true, source: true, content: true }).extend({
  fingerprint: z.string().regex(/^[a-f0-9]{8}$/),
});
const indexSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(indexEntrySchema),
  updatedAt: z.number().finite().nonnegative(),
}).strict();

const DEFAULT_PROFILE: GlobalMemoryProfile = {
  schemaVersion: 1,
  enabled: true,
  autoLearn: true,
  updatedAt: 0,
};

let mutationTail = Promise.resolve();

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value! : fallback));
}

function normalizeContent(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function contentFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of normalizeContent(value).toLocaleLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toStoredIndexEntry(record: GlobalMemoryRecord): StoredGlobalMemoryIndexEntry {
  const { schemaVersion: _schemaVersion, source: _source, content: _content, ...entry } = record;
  return { ...entry, fingerprint: contentFingerprint(record.content) };
}

function toPublicIndexEntry(record: GlobalMemoryRecord): GlobalMemoryIndexEntry {
  const { schemaVersion: _schemaVersion, source: _source, ...entry } = record;
  return entry;
}

async function saveChecked<T>(key: string, value: T): Promise<void> {
  await saveData(key, value);
  const saved = await loadDataStrict<T>(key);
  if (saved.status !== "ok" || JSON.stringify(saved.data) !== JSON.stringify(value)) {
    throw new Error(`记忆中枢写入校验失败：${key}`);
  }
}

async function readIndex(): Promise<GlobalMemoryIndex> {
  const result = await loadDataStrict<unknown>(INDEX_KEY);
  if (result.status === "missing" || (result.status === "ok" && result.data === "")) {
    return { schemaVersion: 1, items: [], updatedAt: 0 };
  }
  if (result.status === "error") throw new Error(`记忆中枢读取失败：${result.error}`);
  const parsed = indexSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("记忆中枢索引结构无效，已停止覆盖。");
  return parsed.data;
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationTail.then(operation);
  mutationTail = run.then(() => undefined, () => undefined);
  return run;
}

export async function getGlobalMemoryProfile(): Promise<GlobalMemoryProfile> {
  await mutationTail;
  const result = await loadDataStrict<unknown>(PROFILE_KEY);
  if (result.status === "missing" || (result.status === "ok" && result.data === "")) return DEFAULT_PROFILE;
  if (result.status === "error") throw new Error(`记忆中枢设置读取失败：${result.error}`);
  const parsed = profileSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("记忆中枢设置结构无效，已停止覆盖。");
  return parsed.data;
}

export function updateGlobalMemoryProfile(
  patch: Partial<Pick<GlobalMemoryProfile, "enabled" | "autoLearn">>,
): Promise<GlobalMemoryProfile> {
  return mutate(async () => {
    const currentResult = await loadDataStrict<unknown>(PROFILE_KEY);
    const current = currentResult.status === "missing" || (currentResult.status === "ok" && currentResult.data === "")
      ? DEFAULT_PROFILE
      : profileSchema.parse(currentResult.status === "ok" ? currentResult.data : undefined);
    const next: GlobalMemoryProfile = {
      ...current,
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch.autoLearn === "boolean" ? { autoLearn: patch.autoLearn } : {}),
      updatedAt: Date.now(),
    };
    await saveChecked(PROFILE_KEY, next);
    return next;
  });
}

export async function listGlobalMemories(): Promise<GlobalMemoryIndexEntry[]> {
  await mutationTail;
  const index = await readIndex();
  const loaded = await Promise.all(index.items.map(async (entry) => {
    const result = await loadDataStrict<unknown>(toItemKey(entry.id));
    if (result.status === "error") throw new Error(`记忆条目读取失败：${entry.id}；${result.error}`);
    return { entry, result };
  }));
  const missingIds = new Set(loaded.filter(({ result }) => result.status === "missing").map(({ entry }) => entry.id));
  if (missingIds.size > 0) {
    await mutate(async () => {
      const latest = await readIndex();
      const items = latest.items.filter((entry) => !missingIds.has(entry.id));
      if (items.length !== latest.items.length) {
        await saveChecked(INDEX_KEY, { ...latest, items, updatedAt: Date.now() });
      }
    });
  }
  const records = loaded
    .filter(({ result }) => result.status === "ok")
    .map(({ result }) => recordSchema.parse(result.status === "ok" ? result.data : undefined));
  return records
    .map(toPublicIndexEntry)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.importance - a.importance || b.updatedAt - a.updatedAt);
}

export async function getGlobalMemory(id: string): Promise<GlobalMemoryRecord | undefined> {
  if (!isValidStorageId(id)) return undefined;
  await mutationTail;
  const result = await loadDataStrict<unknown>(toItemKey(id));
  if (result.status !== "ok" || result.data === "") return undefined;
  const parsed = recordSchema.safeParse(result.data);
  return parsed.success ? parsed.data : undefined;
}

export function rememberGlobalMemory(input: RememberGlobalMemoryInput): Promise<GlobalMemoryRecord> {
  return mutate(async () => {
    const content = normalizeContent(input.content);
    if (!content) throw new Error("记忆内容不能为空。");
    const index = await readIndex();
    const duplicate = index.items.find((item) => item.fingerprint === contentFingerprint(content));
    if (duplicate) {
      const stored = await loadDataStrict<unknown>(toItemKey(duplicate.id));
      const existing = stored.status === "ok" ? recordSchema.parse(stored.data) : undefined;
      if (!existing) throw new Error("记忆条目缺失，已停止覆盖索引。");
      const reinforced: GlobalMemoryRecord = {
        ...existing,
        importance: Math.max(existing.importance, Math.round(clamp(input.importance, 1, 5, 3))),
        confidence: Math.max(existing.confidence, clamp(input.confidence, 0, 1, 0.9)),
        pinned: existing.pinned || input.pinned === true,
        reinforcementCount: existing.reinforcementCount + 1,
        updatedAt: Date.now(),
      };
      await saveChecked(toItemKey(existing.id), reinforced);
      index.items = index.items.map((item) => item.id === existing.id ? toStoredIndexEntry(reinforced) : item);
      index.updatedAt = reinforced.updatedAt;
      await saveChecked(INDEX_KEY, index);
      return reinforced;
    }

    const now = Date.now();
    const id = `memory-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const record = recordSchema.parse({
      schemaVersion: 1,
      id,
      type: input.type,
      content,
      importance: Math.round(clamp(input.importance, 1, 5, 3)),
      confidence: clamp(input.confidence, 0, 1, 0.9),
      pinned: input.pinned === true,
      reinforcementCount: 1,
      source: input.source,
      createdAt: now,
      updatedAt: now,
    });
    await saveChecked(toItemKey(id), record);
    index.items.push(toStoredIndexEntry(record));
    index.updatedAt = now;
    await saveChecked(INDEX_KEY, index);
    return record;
  });
}

export function updateGlobalMemory(
  id: string,
  patch: Partial<Pick<GlobalMemoryRecord, "type" | "content" | "importance" | "confidence" | "pinned">>,
): Promise<GlobalMemoryRecord> {
  return mutate(async () => {
    if (!isValidStorageId(id)) throw new Error("记忆 ID 无效。");
    const stored = await loadDataStrict<unknown>(toItemKey(id));
    if (stored.status !== "ok") throw new Error("记忆不存在。");
    const current = recordSchema.parse(stored.data);
    const next = recordSchema.parse({
      ...current,
      ...(patch.type ? { type: patch.type } : {}),
      ...(typeof patch.content === "string" ? { content: normalizeContent(patch.content) } : {}),
      ...(typeof patch.importance === "number" ? { importance: Math.round(clamp(patch.importance, 1, 5, current.importance)) } : {}),
      ...(typeof patch.confidence === "number" ? { confidence: clamp(patch.confidence, 0, 1, current.confidence) } : {}),
      ...(typeof patch.pinned === "boolean" ? { pinned: patch.pinned } : {}),
      source: { ...current.source, kind: "user-edited" },
      updatedAt: Date.now(),
    });
    await saveChecked(toItemKey(id), next);
    const index = await readIndex();
    if (!index.items.some((item) => item.id === id)) throw new Error("记忆索引缺少目标条目，已停止覆盖。");
    index.items = index.items.map((item) => item.id === id ? toStoredIndexEntry(next) : item);
    index.updatedAt = next.updatedAt;
    await saveChecked(INDEX_KEY, index);
    return next;
  });
}

export function deleteGlobalMemory(id: string): Promise<void> {
  return mutate(async () => {
    if (!isValidStorageId(id)) return;
    await removeData(toItemKey(id));
    const removed = await loadDataStrict(toItemKey(id));
    if (removed.status !== "missing") {
      throw new Error("记忆删除校验失败。");
    }
    const index = await readIndex();
    index.items = index.items.filter((item) => item.id !== id);
    index.updatedAt = Date.now();
    await saveChecked(INDEX_KEY, index);
  });
}

function queryTerms(query: string): string[] {
  const normalized = query.toLocaleLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const cjk = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  return [...new Set([...words, ...cjk.map((_char, index) => cjk.slice(index, index + 2).join("")).filter((term) => term.length === 2)])];
}

export async function searchGlobalMemories(
  query: string,
  options: { type?: GlobalMemoryType; limit?: number } = {},
): Promise<GlobalMemoryIndexEntry[]> {
  const items = (await listGlobalMemories())
    .filter((item) => !options.type || item.type === options.type);
  const terms = queryTerms(query);
  const limit = Math.round(clamp(options.limit, 1, 50, 10));
  return items
    .map((item) => {
      const content = item.content.toLocaleLowerCase();
      const matches = terms.reduce((count, term) => count + Number(content.includes(term)), 0);
      return {
        item,
        matches,
        score: matches * 10 + item.importance * 2 + Number(item.pinned) * 8 + Math.min(item.reinforcementCount, 5),
      };
    })
    .filter(({ item, matches }) => terms.length === 0 || item.pinned || matches > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
    .slice(0, limit)
    .map(({ item }) => item);
}

export async function buildGlobalMemoryContext(
  query: string,
  options: { limit?: number; maxChars?: number } = {},
): Promise<string | undefined> {
  try {
    const profile = await getGlobalMemoryProfile();
    if (!profile.enabled) return undefined;
    const items = await searchGlobalMemories(query, {
      limit: options.limit ?? 10,
    });
    if (items.length === 0) return undefined;
    const maxChars = Math.round(clamp(options.maxChars, 500, 12000, 5000));
    const lines: string[] = [];
    let chars = 0;
    for (const item of items) {
      const line = `- [${item.id} | ${item.type} | 重要度 ${item.importance}] ${item.content}`;
      if (chars + line.length > maxChars) break;
      lines.push(line);
      chars += line.length;
    }
    return lines.length > 0 ? lines.join("\n") : undefined;
  } catch {
    // 记忆是可选上下文；局部损坏不得中断主 Agent，本体错误仍会在管理页显式呈现。
    return undefined;
  }
}

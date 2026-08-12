/**
 * Notebrain plugin storage adapter: 封装思源插件内置数据 API。
 */

import type { Plugin } from "siyuan";

let pluginInstance: Plugin | null = null;

export function setNotebrainPlugin(plugin: Plugin): void {
  pluginInstance = plugin;
}

export function getNotebrainPlugin(): Plugin {
  if (!pluginInstance) {
    throw new Error("[NotebrainStorage] Plugin instance not set. Call setNotebrainPlugin first.");
  }
  return pluginInstance;
}

export async function saveData<T>(key: string, data: T): Promise<void> {
  const plugin = getNotebrainPlugin();
  await plugin.saveData(key, data);
}

export async function loadData<T>(key: string): Promise<T | null> {
  const plugin = getNotebrainPlugin();
  try {
    const data = await plugin.loadData(key);
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

export type StorageReadResult<T> =
  | { status: "ok"; data: T }
  | { status: "missing" }
  | { status: "error"; error: string };

export function normalizeStorageRead<T>(data: T | null | undefined | ""): StorageReadResult<T> {
  return data === null || data === undefined || data === ""
    ? { status: "missing" }
    : { status: "ok", data: data as T };
}

/**
 * 严格读取：调用方可以区分“文件不存在”和“读取失败”。
 * 会话事务不得把读取失败当成空数据继续覆盖。
 */
export async function loadDataStrict<T>(key: string): Promise<StorageReadResult<T>> {
  const plugin = getNotebrainPlugin();
  try {
    const data = await plugin.loadData(key);
    return normalizeStorageRead(data as T | null | undefined | "");
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function removeData(key: string): Promise<void> {
  const plugin = getNotebrainPlugin();
  await plugin.removeData(key);
}

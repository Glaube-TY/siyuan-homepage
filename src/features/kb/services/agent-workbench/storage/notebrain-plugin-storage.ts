/**
 * Notebrain plugin storage adapter: 封装思源插件内置数据 API。
 */

import type { Plugin } from "siyuan";

let pluginInstance: Plugin | null = null;

export function setNotebrainPlugin(plugin: Plugin): void {
  pluginInstance = plugin;
}

function getPlugin(): Plugin {
  if (!pluginInstance) {
    throw new Error("[NotebrainStorage] Plugin instance not set. Call setNotebrainPlugin first.");
  }
  return pluginInstance;
}

export async function saveData<T>(key: string, data: T): Promise<void> {
  const plugin = getPlugin();
  await plugin.saveData(key, data);
}

export async function loadData<T>(key: string): Promise<T | null> {
  const plugin = getPlugin();
  try {
    const data = await plugin.loadData(key);
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

export async function removeData(key: string): Promise<void> {
  const plugin = getPlugin();
  await plugin.removeData(key);
}

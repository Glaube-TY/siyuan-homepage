import { readHomepageSharedSettingsSnapshot } from "@/homepage/sharedSettings/homepageSharedSettings";
import type { PluginLikeStorage } from "@/features/robot-assistant/agent/kernel-plugin-data-adapter";

/** 仅作为共享设置文件缺失时的旧数据兼容入口，不是当前权威配置源。 */
export const ROBOT_QUICK_NOTE_CONFIG_KEY = "robot-quick-note-config-v1";

export interface QuickNoteRuntimeConfig extends Record<string, unknown> {
  quickNotesPosition: string;
  quickNotesTimestampEnabled: boolean;
  quickNotesAddPosition: "top" | "bottom";
}

function normalizeQuickNoteRuntimeConfig(config: Record<string, unknown>): QuickNoteRuntimeConfig {
  return {
    quickNotesPosition: typeof config.quickNotesPosition === "string" ? config.quickNotesPosition.trim() : "",
    quickNotesTimestampEnabled: typeof config.quickNotesTimestampEnabled === "boolean"
      ? config.quickNotesTimestampEnabled
      : true,
    quickNotesAddPosition: config.quickNotesAddPosition === "top" ? "top" : "bottom",
  };
}

export async function resolveQuickNoteRuntimeConfig(
  storage: PluginLikeStorage,
): Promise<QuickNoteRuntimeConfig> {
  const shared = await readHomepageSharedSettingsSnapshot(storage);
  if (shared !== null) return normalizeQuickNoteRuntimeConfig(shared.config);

  const legacy = await storage.loadData(ROBOT_QUICK_NOTE_CONFIG_KEY);
  if (legacy === null || legacy === undefined) return normalizeQuickNoteRuntimeConfig({});
  if (typeof legacy !== "object" || Array.isArray(legacy)) {
    throw new Error("快速笔记旧配置快照格式无效。");
  }
  return normalizeQuickNoteRuntimeConfig(legacy as Record<string, unknown>);
}

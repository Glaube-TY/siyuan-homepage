import { readHomepageSharedSettingsSnapshot } from "@/homepage/sharedSettings/homepageSharedSettings";
import type { PluginLikeStorage } from "@/features/robot-assistant/agent/kernel-plugin-data-adapter";

/** 仅作为共享设置文件缺失时的旧数据兼容入口，不是当前权威配置源。 */
export const ROBOT_QUICK_NOTE_CONFIG_KEY = "robot-quick-note-config-v1";

export interface QuickNoteRuntimeConfig extends Record<string, unknown> {
  quickNotesPosition: string;
  quickNotesTimestampEnabled: boolean;
  quickNotesAddPosition: "top" | "bottom";
}

const QUICK_NOTE_RUNTIME_CONFIG_KEYS = [
  "quickNotesPosition",
  "quickNotesTimestampEnabled",
  "quickNotesAddPosition",
] as const;

function hasOwnConfigValue(config: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(config, key);
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

function mergeQuickNoteRuntimeConfig(
  sharedConfig: Record<string, unknown>,
  legacyConfig: Record<string, unknown>,
): QuickNoteRuntimeConfig {
  const merged: Record<string, unknown> = {};
  for (const key of QUICK_NOTE_RUNTIME_CONFIG_KEYS) {
    merged[key] = hasOwnConfigValue(sharedConfig, key) ? sharedConfig[key] : legacyConfig[key];
  }
  return normalizeQuickNoteRuntimeConfig(merged);
}

async function loadLegacyQuickNoteConfig(storage: PluginLikeStorage): Promise<Record<string, unknown>> {
  const legacy = await storage.loadData(ROBOT_QUICK_NOTE_CONFIG_KEY);
  if (legacy === null || legacy === undefined) return {};
  if (typeof legacy !== "object" || Array.isArray(legacy)) {
    throw new Error("快速笔记旧配置快照格式无效。");
  }
  return legacy as Record<string, unknown>;
}

export async function resolveQuickNoteRuntimeConfig(
  storage: PluginLikeStorage,
): Promise<QuickNoteRuntimeConfig> {
  const shared = await readHomepageSharedSettingsSnapshot(storage);
  if (shared === null) return normalizeQuickNoteRuntimeConfig(await loadLegacyQuickNoteConfig(storage));

  const hasAllSharedFields = QUICK_NOTE_RUNTIME_CONFIG_KEYS.every((key) => hasOwnConfigValue(shared.config, key));
  if (hasAllSharedFields) return normalizeQuickNoteRuntimeConfig(shared.config);

  return mergeQuickNoteRuntimeConfig(shared.config, await loadLegacyQuickNoteConfig(storage));
}

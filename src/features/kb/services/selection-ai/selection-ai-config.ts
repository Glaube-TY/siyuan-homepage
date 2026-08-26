import {
  DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS,
  normalizeSelectionAiToolbarSettings,
} from "./selection-ai-defaults";
import type { SelectionAiToolbarSettings } from "./selection-ai-types";
import { loadHomepageSharedCapabilityConfig } from "@/homepage/configLoader";

let settingsSnapshot: SelectionAiToolbarSettings = {
  ...DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS,
  skills: DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS.skills.map((s) => ({ ...s })),
};

export function setSelectionAiToolbarSettingsSnapshot(raw: unknown): SelectionAiToolbarSettings {
  settingsSnapshot = normalizeSelectionAiToolbarSettings(raw);
  return getSelectionAiToolbarSettingsSnapshot();
}

export function getSelectionAiToolbarSettingsSnapshot(): SelectionAiToolbarSettings {
  return {
    ...settingsSnapshot,
    skills: settingsSnapshot.skills.map((skill) => ({ ...skill })),
  };
}

export async function loadSelectionAiToolbarSettingsSnapshot(plugin: any): Promise<SelectionAiToolbarSettings> {
  try {
    const config = await loadHomepageSharedCapabilityConfig(plugin);
    const rawSettings = config && typeof config === "object"
      ? (config as { selectionAiToolbar?: unknown }).selectionAiToolbar
      : undefined;
    return setSelectionAiToolbarSettingsSnapshot(rawSettings);
  } catch (error) {
    console.warn("[SelectionAI] 读取工具栏设置失败，本轮保留当前内存配置", error);
    return getSelectionAiToolbarSettingsSnapshot();
  }
}

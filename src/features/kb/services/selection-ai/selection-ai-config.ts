import {
  DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS,
  normalizeSelectionAiToolbarSettings,
} from "./selection-ai-defaults";
import type { SelectionAiToolbarSettings } from "./selection-ai-types";

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

export async function loadSelectionAiToolbarSettingsSnapshot(plugin: {
  loadData?: (name: string) => Promise<unknown>;
}): Promise<SelectionAiToolbarSettings> {
  try {
    const config = await plugin.loadData?.("homepageSettingConfig.json");
    const rawSettings = config && typeof config === "object"
      ? (config as { selectionAiToolbar?: unknown }).selectionAiToolbar
      : undefined;
    return setSelectionAiToolbarSettingsSnapshot(rawSettings);
  } catch {
    return setSelectionAiToolbarSettingsSnapshot(undefined);
  }
}

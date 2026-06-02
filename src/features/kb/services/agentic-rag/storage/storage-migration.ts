/**
 * Storage migration: 旧存储到新 notebrain 结构的兼容迁移。
 */

import { NOTEBRAIN_SETTINGS_KEY } from "./notebrain-storage-keys";
import { saveData, loadData } from "./notebrain-plugin-storage";

export interface MigrationState {
  version: number;
  settingsMigrated: boolean;
  chatSessionsMigrated: boolean;
  lastMigrationAt?: number;
}

interface SettingsWithMigration {
  migration?: MigrationState;
  [key: string]: unknown;
}

export async function loadMigrationState(): Promise<MigrationState | null> {
  const data = await loadData<SettingsWithMigration>(NOTEBRAIN_SETTINGS_KEY);
  if (data && data.migration) {
    return data.migration;
  }
  return null;
}

export async function saveMigrationState(state: MigrationState): Promise<void> {
  const existing = await loadData<SettingsWithMigration>(NOTEBRAIN_SETTINGS_KEY);
  const updated: SettingsWithMigration = {
    ...(existing ?? {}),
    migration: state,
  };
  await saveData(NOTEBRAIN_SETTINGS_KEY, updated);
}

export function needsMigration(state: MigrationState | null): boolean {
  if (!state) return true;
  if (!state.settingsMigrated) return true;
  if (!state.chatSessionsMigrated) return true;
  return false;
}

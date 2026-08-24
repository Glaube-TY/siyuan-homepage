import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_KB_SETTINGS, DEFAULT_WEB_SEARCH_SETTINGS } from "../src/features/kb/constants/default-settings";
import { buildLocalKbSettingsPatch, buildModelSettingsPatch } from "../src/features/kb/services/settings/kb-settings-patch";
import {
  clearExplicitClearedSecrets,
  getKbSettings,
  getKbSettingsForEdit,
  markProviderApiKeyCleared,
  markWebSearchApiKeyCleared,
  saveKbSettings,
  setKbSettingsPlugin,
} from "../src/features/kb/services/settings/kb-settings-service";

const SETTINGS_KEY = "kb-settings";
const INVALID_CIPHER = "enc:v1:invalid";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class FakePlugin {
  data: Record<string, unknown>;
  loadDelayMs = 4;
  saveDelayMs = 1;
  failNextSettingsLoad = false;
  failNextSettingsSave = false;
  settingsSaveCount = 0;
  readonly settingsSaveStarted: Promise<void>;
  private resolveSettingsSaveStarted: (() => void) | null = null;

  constructor(initialSettings: Record<string, unknown>) {
    this.data = { [SETTINGS_KEY]: structuredClone(initialSettings) };
    this.settingsSaveStarted = new Promise((resolve) => {
      this.resolveSettingsSaveStarted = resolve;
    });
  }

  async loadData(key: string): Promise<unknown> {
    await wait(this.loadDelayMs);
    if (key === SETTINGS_KEY && this.failNextSettingsLoad) {
      this.failNextSettingsLoad = false;
      throw new Error("injected settings load failure");
    }
    return structuredClone(this.data[key]);
  }

  async saveData(key: string, value: unknown): Promise<void> {
    if (key === SETTINGS_KEY) {
      this.settingsSaveCount += 1;
      this.resolveSettingsSaveStarted?.();
      this.resolveSettingsSaveStarted = null;
    }
    await wait(this.saveDelayMs);
    if (key === SETTINGS_KEY && this.failNextSettingsSave) {
      this.failNextSettingsSave = false;
      throw new Error("injected settings save failure");
    }
    this.data[key] = structuredClone(value);
  }

  replaceSettings(value: Record<string, unknown>): void {
    this.data[SETTINGS_KEY] = structuredClone(value);
  }

  replaceRawSettings(value: unknown): void {
    this.data[SETTINGS_KEY] = structuredClone(value);
  }

  removeSettings(): void {
    delete this.data[SETTINGS_KEY];
  }

  storedSettings(): Record<string, unknown> {
    return this.data[SETTINGS_KEY] as Record<string, unknown>;
  }

  storedRawSettings(): unknown {
    return this.data[SETTINGS_KEY];
  }
}

function initialSettings(): Record<string, unknown> {
  return {
    chatProviders: [{
      id: "provider-1",
      name: "Test Provider",
      type: "openai-compatible",
      baseUrl: "https://provider.example.invalid/v1",
      apiKey: INVALID_CIPHER,
      enabled: true,
      models: [
        { id: "model-1", name: "M1", temperature: 0.2 },
        { id: "model-2", name: "M2", temperature: 0.2 },
      ],
    }],
    selectedChatProviderId: "provider-1",
    selectedChatModelId: "model-1",
    webSearch: {
      ...structuredClone(DEFAULT_WEB_SEARCH_SETTINGS),
      enabled: true,
      searchEndpoint: "https://search-w1.example.invalid",
      apiKey: INVALID_CIPHER,
    },
  };
}

function sourceText(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const webSearchPanelSource = sourceText("src/homepage/homepageSetting/tabs/WebSearchCenterSettingsPanel.svelte");
const kbSettingsPanelSource = sourceText("src/features/kb/components/panels/kb-settings-panel.svelte");
const settingsServiceSource = sourceText("src/features/kb/services/settings/kb-settings-service.ts");
assert.match(webSearchPanelSource, /getKbSettingsForEdit/);
assert.doesNotMatch(webSearchPanelSource, /getKbSettings\(\)/);
assert.match(kbSettingsPanelSource, /getKbSettingsForEdit/);
assert.doesNotMatch(kbSettingsPanelSource, /getKbSettings\(\)/);
assert.match(kbSettingsPanelSource, /if \(!settingsLoaded\) return;/);
assert.match(settingsServiceSource, /awaitPendingKbSettingsSaves/);
assert.doesNotMatch(settingsServiceSource, /读取失败回退默认值/);

const modelPatch = buildModelSettingsPatch(structuredClone(DEFAULT_KB_SETTINGS));
assert.deepEqual(Object.keys(modelPatch).sort(), [
  "chatProviders",
  "selectedChatModelId",
  "selectedChatProviderId",
].sort());
assert.equal("webSearch" in modelPatch, false);
assert.equal("toolSettings" in modelPatch, false);
assert.equal("mcp" in modelPatch, false);

const localPatch = buildLocalKbSettingsPatch(structuredClone(DEFAULT_KB_SETTINGS));
assert.equal("chatProviders" in localPatch, false);
assert.equal("selectedChatProviderId" in localPatch, false);
assert.equal("selectedChatModelId" in localPatch, false);
assert.equal("webSearch" in localPatch, false);
assert.ok("toolSettings" in localPatch);
assert.ok("mcp" in localPatch);

const concurrentPlugin = new FakePlugin(initialSettings());
setKbSettingsPlugin(concurrentPlugin);
clearExplicitClearedSecrets();
const webSearchPatch = {
  ...structuredClone(DEFAULT_WEB_SEARCH_SETTINGS),
  enabled: true,
  searchEndpoint: "https://search-w2.example.invalid",
};
const [webSearchResult, modelResult] = await Promise.all([
  saveKbSettings({ webSearch: webSearchPatch }),
  saveKbSettings({ selectedChatModelId: "model-2" }),
]);
assert.equal(webSearchResult.webSearch.searchEndpoint, webSearchPatch.searchEndpoint);
assert.equal(modelResult.selectedChatModelId, "model-2");
const concurrentStored = concurrentPlugin.storedSettings();
assert.equal((concurrentStored.webSearch as Record<string, unknown>).searchEndpoint, webSearchPatch.searchEndpoint);
assert.equal(concurrentStored.selectedChatModelId, "model-2");

const readAfterWritePlugin = new FakePlugin(initialSettings());
readAfterWritePlugin.saveDelayMs = 30;
setKbSettingsPlugin(readAfterWritePlugin);
clearExplicitClearedSecrets();
const pendingModelSave = saveKbSettings({ selectedChatModelId: "model-2" });
await readAfterWritePlugin.settingsSaveStarted;
const checkedRead = getKbSettingsForEdit();
const [savedModel, checkedSettings] = await Promise.all([pendingModelSave, checkedRead]);
assert.equal(savedModel.selectedChatModelId, "model-2");
assert.equal(checkedSettings.selectedChatModelId, "model-2");

const runtimeReadAfterWritePlugin = new FakePlugin(initialSettings());
runtimeReadAfterWritePlugin.saveDelayMs = 30;
setKbSettingsPlugin(runtimeReadAfterWritePlugin);
clearExplicitClearedSecrets();
const pendingRuntimeSave = saveKbSettings({ selectedChatModelId: "model-2" });
await runtimeReadAfterWritePlugin.settingsSaveStarted;
const runtimeCheckedRead = getKbSettings();
const [runtimeSavedModel, runtimeCheckedSettings] = await Promise.all([
  pendingRuntimeSave,
  runtimeCheckedRead,
]);
assert.equal(runtimeSavedModel.selectedChatModelId, "model-2");
assert.equal(runtimeCheckedSettings.selectedChatModelId, "model-2");

const failingReadPlugin = new FakePlugin(initialSettings());
failingReadPlugin.failNextSettingsLoad = true;
setKbSettingsPlugin(failingReadPlugin);
clearExplicitClearedSecrets();
await assert.rejects(getKbSettingsForEdit(), /injected settings load failure/);
assert.equal(failingReadPlugin.settingsSaveCount, 0);
failingReadPlugin.failNextSettingsLoad = true;
await assert.rejects(getKbSettings(), /injected settings load failure/);

const missingSettingsPlugin = new FakePlugin(initialSettings());
missingSettingsPlugin.removeSettings();
setKbSettingsPlugin(missingSettingsPlugin);
clearExplicitClearedSecrets();
const missingRuntimeSettings = await getKbSettings();
assert.equal(missingRuntimeSettings.selectedChatModelId, "");
const missingSettings = await getKbSettingsForEdit();
assert.equal(missingSettings.selectedChatModelId, "");
assert.equal(missingSettings.webSearch.enabled, DEFAULT_WEB_SEARCH_SETTINGS.enabled);

for (const invalidRoot of ["broken", []]) {
  const invalidReadPlugin = new FakePlugin(initialSettings());
  invalidReadPlugin.replaceRawSettings(invalidRoot);
  setKbSettingsPlugin(invalidReadPlugin);
  clearExplicitClearedSecrets();
  await assert.rejects(getKbSettings(), /KB settings storage format invalid/);
  await assert.rejects(getKbSettingsForEdit(), /KB settings storage format invalid/);
}

const invalidSavePlugin = new FakePlugin(initialSettings());
invalidSavePlugin.replaceRawSettings("broken");
setKbSettingsPlugin(invalidSavePlugin);
clearExplicitClearedSecrets();
markWebSearchApiKeyCleared();
await assert.rejects(
  saveKbSettings({
    webSearch: { ...structuredClone(DEFAULT_WEB_SEARCH_SETTINGS), apiKey: "" },
  }),
  /KB settings storage format invalid/,
);
assert.equal(invalidSavePlugin.settingsSaveCount, 0);
assert.equal(invalidSavePlugin.storedRawSettings(), "broken");
invalidSavePlugin.replaceSettings(initialSettings());
await saveKbSettings({
  webSearch: { ...structuredClone(DEFAULT_WEB_SEARCH_SETTINGS), apiKey: "" },
});
assert.notEqual((invalidSavePlugin.storedSettings().webSearch as Record<string, unknown>).apiKey, INVALID_CIPHER);

const markerPlugin = new FakePlugin(initialSettings());
setKbSettingsPlugin(markerPlugin);
clearExplicitClearedSecrets();
markWebSearchApiKeyCleared();
await saveKbSettings({ selectedChatModelId: "model-2" });
assert.equal((markerPlugin.storedSettings().webSearch as Record<string, unknown>).apiKey, INVALID_CIPHER);
await saveKbSettings({
  webSearch: { ...structuredClone(DEFAULT_WEB_SEARCH_SETTINGS), apiKey: "" },
});
assert.notEqual((markerPlugin.storedSettings().webSearch as Record<string, unknown>).apiKey, INVALID_CIPHER);

markerPlugin.replaceSettings(initialSettings());
clearExplicitClearedSecrets();
markProviderApiKeyCleared("provider-1");
await saveKbSettings({
  webSearch: { ...structuredClone(DEFAULT_WEB_SEARCH_SETTINGS), searchEndpoint: "https://search-w3.example.invalid" },
});
assert.equal(
  ((markerPlugin.storedSettings().chatProviders as Array<Record<string, unknown>>)[0]).apiKey,
  INVALID_CIPHER,
);
const clearedProviders = structuredClone(initialSettings().chatProviders) as Array<Record<string, unknown>>;
clearedProviders[0].apiKey = "";
await saveKbSettings({ chatProviders: clearedProviders });
assert.notEqual(
  ((markerPlugin.storedSettings().chatProviders as Array<Record<string, unknown>>)[0]).apiKey,
  INVALID_CIPHER,
);

const failurePlugin = new FakePlugin(initialSettings());
failurePlugin.failNextSettingsSave = true;
setKbSettingsPlugin(failurePlugin);
clearExplicitClearedSecrets();
const failedSave = saveKbSettings({ selectedChatModelId: "model-2" });
const followingSave = saveKbSettings({ selectedChatModelId: "model-1" });
await assert.rejects(failedSave, /injected settings save failure/);
await followingSave;
assert.equal(failurePlugin.storedSettings().selectedChatModelId, "model-1");

clearExplicitClearedSecrets();
console.log("KB settings persistence verification passed");

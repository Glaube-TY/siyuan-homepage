import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HomepageAgentService } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-service";
import {
  HomepageSettingsService,
  type HomepageSettingsServiceError,
} from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-settings-service";
import { HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, type HomepageAgentStorageChangedDetail } from "../src/homepage/deviceView/deviceViewEvents";
import type { DeviceViewContext, DeviceViewLayout, DeviceViewSettings, DeviceWidgetDocument } from "../src/homepage/deviceView/deviceViewTypes";
import { resetCurrentDesktopHomepageLayout } from "../src/homepage/deviceView/resetCurrentDesktopHomepageLayout";
import {
  createEmptyLayout,
  validateDeviceViewLayoutForWrite,
} from "../src/homepage/deviceView/deviceViewStorage";
import {
  applyUserLayoutTemplateToCurrentDevice,
} from "../src/homepage/templates/userLayoutTemplates";
import type {
  CoordinatedSnapshot,
  LayoutSnapshot,
  WidgetLayoutData,
} from "../src/components/utils/widgetBlock/utils/layout-shared";
import {
  moveWidgetToComponentSectionForCurrentDevice,
  saveHomepageSettingsCoordinated,
} from "../src/components/utils/widgetBlock/utils/layout-shared";
import {
  assertDesktopHomepageLayoutInvariants,
  deriveDesktopHomepageConfig,
  deriveDesktopHomepageSectionsFromLayout,
  ensureDesktopHomepageSectionsMigrated,
  DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION,
} from "../src/homepage/deviceView/desktopHomepageSectionModel";
import { hasSameJsonSemantic } from "../src/homepage/deviceView/jsonSafe";

async function verifyMigrationMatrix(): Promise<void> {
  console.log("=== Phase A: 4.x -> 5.0 Desktop Section Migration Matrix ===");

  const fakeDesktopContext: DeviceViewContext = {
    plugin: { isMobile: false } as any,
    physicalDeviceId: "device-migration-test",
    scopeId: "device-migration-test",
    surface: "desktop-homepage",
    isMobileShared: false,
  };

  // Helper to create an in-memory mock storage
  function createMockStorage(initLayout: Partial<DeviceViewLayout>, initSettings: Partial<DeviceViewSettings>) {
    const clone = <T>(value: T): T => structuredClone(value);
    let layout: DeviceViewLayout = {
      surface: "desktop-homepage",
      schema: "siyuan-homepage-device-view",
      version: 2,
      updatedAt: "1970-01-01T00:00:01.000Z",
      deviceId: "device-migration-test",
      order: [],
      revision: 1,
      ...initLayout,
    };
    let settings: DeviceViewSettings = {
      schema: "siyuan-homepage-device-view",
      version: 2,
      updatedAt: "1970-01-01T00:00:01.000Z",
      deviceId: "device-migration-test",
      surface: "desktop-homepage",
      config: {},
      revision: 1,
      ...initSettings,
    };
    let layoutWriteCount = 0;
    let settingsWriteCount = 0;

    const storage = {
      getLayout: () => clone(layout),
      getSettings: () => clone(settings),
      getLayoutWriteCount: () => layoutWriteCount,
      getSettingsWriteCount: () => settingsWriteCount,
      readLayout: async (_ctx: DeviceViewContext) => clone(layout),
      readSettings: async (_ctx: DeviceViewContext) => clone(settings),
      replaceLayout: async (_ctx: DeviceViewContext, nextLayout: Omit<DeviceViewLayout, "revision">, options?: { expectedRevision?: number }) => {
        if (options?.expectedRevision !== undefined && options.expectedRevision !== layout.revision) {
          throw new Error(`Layout CAS Conflict: expected ${options.expectedRevision}, actual ${layout.revision}`);
        }
        layout = { ...clone(nextLayout), revision: layout.revision + 1 };
        layoutWriteCount++;
        return layout;
      },
      updateSettings: async (_ctx: DeviceViewContext, mutator: (cfg: Record<string, unknown>) => Record<string, unknown>, options?: { expectedRevision?: number }) => {
        if (options?.expectedRevision !== undefined && options.expectedRevision !== settings.revision) {
          throw new Error(`Settings CAS Conflict: expected ${options.expectedRevision}, actual ${settings.revision}`);
        }
        const nextCfg = mutator(clone(settings.config));
        settings = { config: nextCfg, revision: settings.revision + 1 };
        settingsWriteCount++;
        return settings;
      },
    };
    return storage;
  }

  // ── Scenario A.1: view.json has sections (4.x), layout.json has no sections ──
  {
    const storage = createMockStorage(
      {
        order: [
          { id: "w-1", style: null, index: 0 },
          { id: "w-2", style: null, index: 1 },
        ],
      },
      {
        config: {
          componentSectionsEnabled: true,
          componentSections: [
            { id: "sec-1", name: "Main", createdAt: 1000, updatedAt: 1000 },
            { id: "sec-2", name: "Side", createdAt: 1001, updatedAt: 1001 },
          ],
          componentSectionsNavAlign: "center",
        },
      },
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, true);

    const finalLayout = storage.getLayout();
    assert.equal(finalLayout.componentSectionsModelVersion, DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION);
    assert.equal(finalLayout.componentSectionsModeEnabled, true);
    assert.ok(finalLayout.sections);
    assert.equal(finalLayout.sections["sec-1"]?.name, "Main");
    assert.equal(finalLayout.sections["sec-2"]?.name, "Side");
    // All widgets partitioned (orphans assigned to first section)
    assert.deepEqual(finalLayout.sections["sec-1"]?.widgetIds, ["w-1", "w-2"]);
    assert.deepEqual(finalLayout.sections["sec-2"]?.widgetIds, []);

    const finalSettings = storage.getSettings();
    assert.equal(finalSettings.config.componentSectionsEnabled, undefined);
    assert.equal(finalSettings.config.componentSections, undefined);
    assert.equal(finalSettings.config.componentSectionsNavAlign, "center");
    console.log("Scenario A.1 (4.x view -> 5.0 layout & view cleanup): PASS");
  }

  // ── Scenario A.2: view.json and layout.json both have sections (merge metadata) ──
  {
    const storage = createMockStorage(
      {
        order: [
          { id: "w-1", style: null, index: 0 },
          { id: "w-2", style: null, index: 1 },
        ],
        sections: {
          "sec-1": { widgetIds: ["w-1"] },
          "sec-2": { widgetIds: ["w-2"] },
        },
        activeSectionId: "sec-1",
        componentSectionsModeEnabled: true,
      },
      {
        config: {
          componentSections: [
            { id: "sec-1", name: "Alpha", createdAt: 2000, updatedAt: 2005 },
            { id: "sec-2", name: "Beta", createdAt: 2001, updatedAt: 2006 },
          ],
        },
      },
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, true);

    const finalLayout = storage.getLayout();
    assert.equal(finalLayout.sections?.["sec-1"]?.name, "Alpha");
    assert.equal(finalLayout.sections?.["sec-1"]?.createdAt, 2000);
    assert.deepEqual(finalLayout.sections?.["sec-1"]?.widgetIds, ["w-1"]);
    assert.equal(finalLayout.sections?.["sec-2"]?.name, "Beta");
    assert.deepEqual(finalLayout.sections?.["sec-2"]?.widgetIds, ["w-2"]);
    console.log("Scenario A.2 (Dual-source merge & metadata enrichment): PASS");
  }

  // ── Scenario A.3: Orphan widgets automatically assigned to first section ──
  {
    const storage = createMockStorage(
      {
        order: [
          { id: "w-1", style: null, index: 0 },
          { id: "w-orphan", style: null, index: 1 },
        ],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "Section 1", createdAt: 100, updatedAt: 100 },
        },
        componentSectionsModeEnabled: true,
      },
      {},
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, true);

    const finalLayout = storage.getLayout();
    assert.deepEqual(finalLayout.sections?.["sec-1"]?.widgetIds, ["w-1", "w-orphan"]);
    console.log("Scenario A.3 (Orphan widget assignment): PASS");
  }

  // ── Scenario A.4: Section-only widget IDs are retained and appended ──
  {
    const storage = createMockStorage(
      {
        order: [{ id: "w-real", style: "card", index: 0 }],
        sections: {
          "sec-1": { widgetIds: ["w-real", "w-ghost"], name: "Section 1", createdAt: 100, updatedAt: 100 },
        },
        componentSectionsModeEnabled: true,
      },
      {},
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, true);

    const finalLayout = storage.getLayout();
    assert.deepEqual(finalLayout.sections?.["sec-1"]?.widgetIds, ["w-real", "w-ghost"]);
    assert.deepEqual(finalLayout.order, [
      { id: "w-real", style: "card", index: 0 },
      { id: "w-ghost", style: null, index: 1 },
    ]);
    console.log("Scenario A.4 (Section-only ID retention): PASS");
  }

  // ── Scenario A.5: Interrupted migration recovery (5.0 layout exists, view still has dirty keys) ──
  {
    const storage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "Section 1", createdAt: 100, updatedAt: 100 },
        },
        activeSectionId: "sec-1",
        componentSectionsModeEnabled: true,
        componentSectionsModelVersion: 1,
      },
      {
        config: {
          componentSectionsEnabled: true,
          componentSections: [{ id: "sec-1", name: "Old Section" }],
          componentSectionsNavAlign: "right",
        },
      },
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, true);
    assert.equal(storage.getLayoutWriteCount(), 0, "Layout was already 5.0, must not be rewritten");
    assert.equal(storage.getSettingsWriteCount(), 1, "View dirty fields must be cleaned up");

    const finalSettings = storage.getSettings();
    assert.equal(finalSettings.config.componentSectionsEnabled, undefined);
    assert.equal(finalSettings.config.componentSections, undefined);
    assert.equal(finalSettings.config.componentSectionsNavAlign, "right");
    console.log("Scenario A.5 (Interrupted migration idempotency & view-only cleanup): PASS");
  }

  // ── Scenario A.6: Pure 5.0 clean view -> Zero extra writes ──
  {
    const storage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "Section 1", createdAt: 100, updatedAt: 100 },
        },
        activeSectionId: "sec-1",
        componentSectionsModeEnabled: true,
        componentSectionsModelVersion: 1,
      },
      {
        config: {
          componentSectionsNavAlign: "center",
        },
      },
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, false);
    assert.equal(storage.getLayoutWriteCount(), 0);
    assert.equal(storage.getSettingsWriteCount(), 0);
    console.log("Scenario A.6 (Clean 5.0 zero-write check): PASS");
  }

  // ── Scenario A.7: Corrupted / Invalid data blocks migration safely ──
  {
    // Duplicate section names are rejected case-insensitively.
    const duplicateStorage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "Duplicate", createdAt: 100, updatedAt: 100 },
          "sec-2": { widgetIds: [], name: "duplicate", createdAt: 101, updatedAt: 101 },
        },
        componentSectionsModeEnabled: true,
        componentSectionsModelVersion: 1,
      },
      {},
    );

    let errorThrown = false;
    try {
      assertDesktopHomepageLayoutInvariants(duplicateStorage.getLayout(), fakeDesktopContext);
    } catch (e: any) {
      errorThrown = true;
      assert.ok(e.message.includes("重复"));
    }
    assert.equal(errorThrown, true, "Duplicate section names must be rejected by invariant checks");
    console.log("Scenario A.7 (Corruption / Invariant safety block): PASS");
  }

  // ── Scenario A.8: disabled migration keeps global order and only cleans membership ──
  {
    const storage = createMockStorage(
      {
        order: [
          { id: "w-2", style: "second", index: 0 },
          { id: "w-1", style: "first", index: 1 },
        ],
        sections: {
          "sec-1": { widgetIds: ["w-1", "w-only"], name: "One", createdAt: 100, updatedAt: 100 },
          "sec-2": { widgetIds: ["w-1", "w-2"], name: "Two", createdAt: 101, updatedAt: 101 },
        },
        componentSectionsModeEnabled: false,
      },
      { config: { componentSectionsEnabled: false } },
    );

    const result = await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(result.migrated, true);
    const finalLayout = storage.getLayout();
    assert.deepEqual(finalLayout.order, [
      { id: "w-2", style: "second", index: 0 },
      { id: "w-1", style: "first", index: 1 },
      { id: "w-only", style: null, index: 2 },
    ]);
    assert.equal(finalLayout.activeSectionId, undefined);
    assert.deepEqual(finalLayout.sections?.["sec-1"]?.widgetIds, ["w-1", "w-only"]);
    assert.deepEqual(finalLayout.sections?.["sec-2"]?.widgetIds, ["w-2"]);
    console.log("Scenario A.8 (Disabled migration preserves global order): PASS");
  }

  // ── Scenario A.9: first section wins cross-section duplicates and invalid active falls back ──
  {
    const storage = createMockStorage(
      {
        order: [
          { id: "w-1", style: null, index: 0 },
          { id: "w-2", style: null, index: 1 },
        ],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 },
          "sec-2": { widgetIds: ["w-1", "w-2"], name: "Two", createdAt: 101, updatedAt: 101 },
        },
        activeSectionId: "missing-section",
        componentSectionsModeEnabled: true,
      },
      { config: { componentSectionsEnabled: true } },
    );

    await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    const finalLayout = storage.getLayout();
    assert.deepEqual(finalLayout.sections?.["sec-1"]?.widgetIds, ["w-1"]);
    assert.deepEqual(finalLayout.sections?.["sec-2"]?.widgetIds, ["w-2"]);
    assert.equal(finalLayout.activeSectionId, "sec-1");
    console.log("Scenario A.9 (Duplicate ownership and invalid active migration): PASS");
  }

  // ── Scenario A.10: unknown marker blocks with zero writes ──
  {
    const storage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 },
        },
        componentSectionsModeEnabled: false,
        componentSectionsModelVersion: 2,
      },
      { config: { componentSectionsEnabled: false } },
    );

    let blocked: any;
    try {
      await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    } catch (error) {
      blocked = error;
    }
    assert.ok(blocked);
    assert.equal(storage.getLayoutWriteCount(), 0);
    assert.equal(storage.getSettingsWriteCount(), 0);
    assert.match(blocked.safeMessage, /未知分栏模型版本/);
    assert.doesNotMatch(blocked.safeMessage, /device-migration-test/);
    console.log("Scenario A.10 (Unknown marker zero-write block): PASS");
  }

  // ── Scenario A.11: marker=1 requires complete metadata and rejects invalid active ──
  {
    const incompleteStorage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: { "sec-1": { widgetIds: ["w-1"] } },
        componentSectionsModeEnabled: false,
        componentSectionsModelVersion: 1,
      },
      { config: { componentSectionsEnabled: true, componentSections: [{ id: "sec-1" }] } },
    );
    await assert.rejects(
      ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, incompleteStorage),
      /名称长度无效|createdAt 无效|updatedAt 无效/,
    );
    assert.equal(incompleteStorage.getLayoutWriteCount(), 0);
    assert.equal(incompleteStorage.getSettingsWriteCount(), 0);

    const invalidActive = {
      order: [{ id: "w-1", style: null, index: 0 }],
      sections: { "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 } },
      activeSectionId: "missing-section",
      componentSectionsModeEnabled: true,
      componentSectionsModelVersion: 1,
    } satisfies Partial<DeviceViewLayout>;
    assert.throws(
      () => assertDesktopHomepageLayoutInvariants({
        schema: "siyuan-homepage-device-view",
        version: 2,
        revision: 1,
        updatedAt: "1970-01-01T00:00:01.000Z",
        deviceId: fakeDesktopContext.scopeId,
        surface: "desktop-homepage",
        ...invalidActive,
      }, fakeDesktopContext),
      /活动分栏/,
    );

    const sixtyName = "x".repeat(60);
    assert.doesNotThrow(() => assertDesktopHomepageLayoutInvariants({
      schema: "siyuan-homepage-device-view",
      version: 2,
      revision: 1,
      updatedAt: "1970-01-01T00:00:01.000Z",
      deviceId: fakeDesktopContext.scopeId,
      surface: "desktop-homepage",
      order: [],
      sections: { "sec-1": { widgetIds: [], name: sixtyName, createdAt: 100, updatedAt: 100 } },
      componentSectionsModeEnabled: false,
      componentSectionsModelVersion: 1,
    }, fakeDesktopContext));
    assert.throws(() => assertDesktopHomepageLayoutInvariants({
      schema: "siyuan-homepage-device-view",
      version: 2,
      revision: 1,
      updatedAt: "1970-01-01T00:00:01.000Z",
      deviceId: fakeDesktopContext.scopeId,
      surface: "desktop-homepage",
      order: [],
      sections: { "sec-1": { widgetIds: [], name: `${sixtyName}x`, createdAt: 100, updatedAt: 100 } },
      componentSectionsModeEnabled: false,
      componentSectionsModelVersion: 1,
    }, fakeDesktopContext), /名称长度无效/);
    console.log("Scenario A.11 (Strict metadata, active, and name length guards): PASS");
  }

  // ── Scenario A.12: marker=1 cleanup retries once and layout derives config ──
  {
    const storage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: { "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 } },
        componentSectionsModeEnabled: true,
        activeSectionId: "sec-1",
        componentSectionsModelVersion: 1,
      },
      { config: { componentSectionsEnabled: true, componentSections: [{ id: "sec-1" }], componentSectionsNavAlign: "right" } },
    );
    const originalUpdateSettings = storage.updateSettings;
    let updateAttempts = 0;
    storage.updateSettings = async (...args: Parameters<typeof originalUpdateSettings>) => {
      updateAttempts += 1;
      if (updateAttempts === 1) throw new Error("simulated CAS conflict");
      return originalUpdateSettings(...args);
    };
    await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    assert.equal(updateAttempts, 2);
    assert.equal(storage.getSettingsWriteCount(), 1);
    const derived = deriveDesktopHomepageConfig(storage.getLayout(), storage.getSettings().config, fakeDesktopContext.scopeId);
    assert.equal(derived.componentSectionsEnabled, true);
    assert.equal(derived.componentSectionsNavAlign, "right");
    assert.equal(derived.componentSections?.[0]?.name, "One");
    console.log("Scenario A.12 (Cleanup retry and layout-derived config): PASS");
  }

  // ── Scenario A.13: persistent cleanup failure rejects readiness instead of caching success ──
  {
    const storage = createMockStorage(
      {
        order: [{ id: "w-1", style: null, index: 0 }],
        sections: { "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 } },
        componentSectionsModeEnabled: true,
        activeSectionId: "sec-1",
        componentSectionsModelVersion: 1,
      },
      { config: { componentSectionsEnabled: true, componentSections: [{ id: "sec-1" }] } },
    );
    storage.updateSettings = async () => { throw new Error("persistent cleanup failure"); };
    await assert.rejects(ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage), /清理重试失败|清理失败/);
    assert.equal(storage.getLayoutWriteCount(), 0);
    console.log("Scenario A.13 (Persistent cleanup failure remains blocked): PASS");
  }

  // ── Scenario A.14: all legacy switch combinations have deterministic results ──
  const switchCases: Array<{ label: string; layoutEnabled?: boolean; viewEnabled?: boolean; expected: boolean }> = [
    { label: "false/false", layoutEnabled: false, viewEnabled: false, expected: false },
    { label: "true/true", layoutEnabled: true, viewEnabled: true, expected: true },
    { label: "false/true", layoutEnabled: false, viewEnabled: true, expected: true },
    { label: "true/false", layoutEnabled: true, viewEnabled: false, expected: false },
    { label: "missing/missing", expected: false },
  ];
  for (const testCase of switchCases) {
    const storage = createMockStorage(
      {
        order: [
          { id: "w-2", style: "second", index: 0 },
          { id: "w-1", style: "first", index: 1 },
        ],
        sections: {
          "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 },
          "sec-2": { widgetIds: ["w-2"], name: "Two", createdAt: 101, updatedAt: 101 },
        },
        activeSectionId: "sec-2",
        ...(testCase.layoutEnabled === undefined ? {} : { componentSectionsModeEnabled: testCase.layoutEnabled }),
      },
      {
        config: testCase.viewEnabled === undefined ? {} : { componentSectionsEnabled: testCase.viewEnabled },
      },
    );
    await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    const finalLayout = storage.getLayout();
    assert.equal(finalLayout.componentSectionsModeEnabled, testCase.expected, testCase.label);
    assert.deepEqual(
      finalLayout.order,
      testCase.expected
        ? [
          { id: "w-1", style: "first", index: 0 },
          { id: "w-2", style: "second", index: 1 },
        ]
        : [
          { id: "w-2", style: "second", index: 0 },
          { id: "w-1", style: "first", index: 1 },
        ],
      testCase.label,
    );
    assert.deepEqual(Object.keys(finalLayout.sections ?? {}), ["sec-1", "sec-2"], testCase.label);
    assert.equal(finalLayout.activeSectionId, testCase.expected ? "sec-2" : undefined, testCase.label);
    assert.equal(storage.getLayoutWriteCount(), 1, testCase.label);
    assert.equal(storage.getSettingsWriteCount(), testCase.viewEnabled === undefined ? 0 : 1, testCase.label);
  }
  console.log("Scenario A.14 (All legacy switch combinations): PASS");

  // ── Scenario A.15: unknown legacy fields and invalid metadata block before any write ──
  const invalidViewSections: Array<{ label: string; section: Record<string, unknown> }> = [
    { label: "unknown field", section: { id: "sec-1", extra: true } },
    { label: "invalid id", section: { id: "../sec-1" } },
    { label: "wrong name type", section: { id: "sec-1", name: 42 } },
    { label: "wrong createdAt type", section: { id: "sec-1", createdAt: "100" } },
    { label: "non-finite updatedAt", section: { id: "sec-1", updatedAt: Infinity } },
    { label: "duplicate id", section: { id: "sec-1" } },
  ];
  for (const invalid of invalidViewSections) {
    const sectionList = invalid.label === "duplicate id"
      ? [invalid.section, { id: "sec-1" }]
      : [invalid.section];
    const storage = createMockStorage(
      { order: [{ id: "w-1", style: null, index: 0 }] },
      { config: { componentSectionsEnabled: true, componentSections: sectionList } },
    );
    let blocked: any;
    try {
      await ensureDesktopHomepageSectionsMigrated(fakeDesktopContext, storage);
    } catch (error) {
      blocked = error;
    }
    assert.ok(blocked, invalid.label);
    assert.equal(blocked.code, "desktop_section_migration_blocked", invalid.label);
    assert.equal(storage.getLayoutWriteCount(), 0, invalid.label);
    assert.equal(storage.getSettingsWriteCount(), 0, invalid.label);
  }
  console.log("Scenario A.15 (Strict legacy section input validation): PASS");

  // ── Scenario A.16: normal storage validation and mobile name/marker contracts ──
  const emptyDesktopLayout = createEmptyLayout(fakeDesktopContext);
  assert.equal(emptyDesktopLayout.componentSectionsModelVersion, 1, "new desktop layout must carry marker=1");
  const strictDesktopBase = {
    ...emptyDesktopLayout,
    order: [{ id: "w-1", style: null, index: 0 }],
    sections: {
      "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 },
    },
    componentSectionsModeEnabled: false,
  } satisfies DeviceViewLayout;
  const missingMarker = { ...strictDesktopBase } as any;
  delete missingMarker.componentSectionsModelVersion;
  assert.throws(() => validateDeviceViewLayoutForWrite(missingMarker, fakeDesktopContext), /模型标记/);
  assert.throws(
    () => validateDeviceViewLayoutForWrite({ ...strictDesktopBase, componentSectionsModelVersion: 2 }, fakeDesktopContext),
    /未知|不受支持/,
  );
  const missingMetadata = structuredClone(strictDesktopBase);
  delete (missingMetadata.sections as any)["sec-1"].name;
  assert.throws(() => validateDeviceViewLayoutForWrite(missingMetadata, fakeDesktopContext), /名称长度无效/);
  const duplicateNames = structuredClone(strictDesktopBase);
  duplicateNames.sections!["sec-2"] = { widgetIds: [], name: "one", createdAt: 101, updatedAt: 101 };
  assert.throws(() => validateDeviceViewLayoutForWrite(duplicateNames, fakeDesktopContext), /名称重复/);

  const fakeMobileContext: DeviceViewContext = {
    plugin: { isMobile: true } as any,
    physicalDeviceId: "mobile-device-test",
    scopeId: "mobile-shared",
    surface: "mobile-homepage",
    isMobileShared: true,
  };
  const emptyMobileLayout = createEmptyLayout(fakeMobileContext);
  assert.equal("componentSectionsModelVersion" in emptyMobileLayout, false, "mobile layout must not carry desktop marker");
  const mobileThirty = {
    ...emptyMobileLayout,
    sections: { "mobile-sec": { widgetIds: [], name: "x".repeat(30), createdAt: 100, updatedAt: 100 } },
  } satisfies DeviceViewLayout;
  assert.doesNotThrow(() => validateDeviceViewLayoutForWrite(mobileThirty, fakeMobileContext));
  const mobileThirtyOne = structuredClone(mobileThirty);
  mobileThirtyOne.sections!["mobile-sec"].name = "x".repeat(31);
  assert.throws(() => validateDeviceViewLayoutForWrite(mobileThirtyOne, fakeMobileContext), /name 无效/);
  assert.throws(
    () => validateDeviceViewLayoutForWrite({ ...mobileThirty, componentSectionsModelVersion: 1 }, fakeMobileContext),
    /不允许包含/,
  );
  console.log("Scenario A.16 (Normal storage marker and mobile contracts): PASS");

  // ── Scenario A.17: safe reason categories come from real invariant failures ──
  let duplicateGlobalBlocked: any;
  try {
    assertDesktopHomepageLayoutInvariants({
      ...strictDesktopBase,
      order: [
        { id: "w-1", style: null, index: 0 },
        { id: "w-1", style: null, index: 1 },
      ],
    }, fakeDesktopContext);
  } catch (error) {
    duplicateGlobalBlocked = error;
  }
  assert.match(duplicateGlobalBlocked?.safeMessage ?? "", /重复全局组件 ID/);

  let duplicateMembershipBlocked: any;
  try {
    assertDesktopHomepageLayoutInvariants({
      ...strictDesktopBase,
      sections: {
        "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 },
        "sec-2": { widgetIds: ["w-1"], name: "Two", createdAt: 101, updatedAt: 101 },
      },
    }, fakeDesktopContext);
  } catch (error) {
    duplicateMembershipBlocked = error;
  }
  assert.match(duplicateMembershipBlocked?.safeMessage ?? "", /组件重复归属于多个分栏/);
  console.log("Scenario A.17 (Production safe reason categories): PASS");
}

async function verifyAgentLifecycle(): Promise<void> {
  console.log("=== Phase B: Homepage Agent Service Real Lifecycle with In-Memory Storage ===");

  const ts = Date.now();
  const sectionAId = `nb_agent_sec_a_${ts}`;
  const sectionBId = `nb_agent_sec_b_${ts}`;
  const sectionAName = `NB_SEC_A_${ts}`;
  const sectionBName = `NB_SEC_B_${ts}`;
  const sectionARenamed = `NB_SEC_A_RENAMED_${ts}`;

  const events: Array<{ type: string; detail: HomepageAgentStorageChangedDetail }> = [];
  const prevWindow = (globalThis as any).window;
  const prevCustomEvent = (globalThis as any).CustomEvent;

  (globalThis as any).CustomEvent = class MockCustomEvent {
    public detail: unknown;
    constructor(public type: string, init?: { detail?: unknown }) {
      this.detail = init?.detail;
    }
  };
  (globalThis as any).window = {
    dispatchEvent: (event: { type: string; detail: HomepageAgentStorageChangedDetail }) => {
      events.push({ type: event.type, detail: event.detail });
      return true;
    },
  };

  try {
    const initialSections = {
      "section-user-1": { widgetIds: ["weather-1", "music-1"], name: "主要分栏", createdAt: 1000, updatedAt: 1000 },
      "section-user-2": { widgetIds: ["accounting-1"], name: "次要分栏", createdAt: 1001, updatedAt: 1001 },
    };

    let layoutState: { revision: number; layout: WidgetLayoutData } = {
      revision: 1,
      layout: {
        order: [
          { id: "weather-1", style: "weather-style", index: 0 },
          { id: "music-1", style: "music-style", index: 1 },
          { id: "accounting-1", style: "accounting-style", index: 2 },
        ],
        profiles: {
          "device-comprehensive": {
            order: [
              { id: "weather-1", style: "weather-style", index: 0 },
              { id: "music-1", style: "music-style", index: 1 },
              { id: "accounting-1", style: "accounting-style", index: 2 },
            ],
            sections: JSON.parse(JSON.stringify(initialSections)),
            activeSectionId: "section-user-1",
            componentSectionsModeEnabled: false,
            componentSectionsModelVersion: 1,
            widgetLayoutNumber: 4,
            widgetGap: 8,
          },
        },
        componentSectionsModelVersion: 1,
      },
    };

    let saveCallCount = 0;
    let skipNextLayoutWrite = false;

    let viewState: { revision: 1; config: Record<string, unknown> } = {
      revision: 1,
      config: {
        TitleIconEmoji: "1f3e0",
        pageTitle: "思源主页",
        componentSectionsNavAlign: "center",
        buttonsList: [
          { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
          { id: 2, label: "我的链接", checked: true, order: 1 },
          { id: 3, label: "日记", checked: false, order: 2 },
        ],
      },
    };

    const widgetDocs: Record<string, DeviceWidgetDocument> = {
      "weather-1": { config: { type: "weather", data: { cityName: "上海" } }, revision: 1 } as any,
      "music-1": { config: { type: "musicPlayer", data: {} }, revision: 1 } as any,
      "accounting-1": { config: { type: "accounting", data: {} }, revision: 1 } as any,
    };

    const fakeContext: DeviceViewContext = {
      plugin: { isMobile: false } as any,
      physicalDeviceId: "device-comprehensive",
      scopeId: "device-comprehensive",
      surface: "desktop-homepage",
      isMobileShared: false,
    };

    const realAgentService = new HomepageAgentService({
      getPlugin: () => ({ isMobile: false }) as any,
      deviceView: {
        getContext: () => fakeContext,
        ensureReady: async () => {},
        readSnapshot: async () => ({
          layout: {
            revision: layoutState.revision,
            deviceId: "device-comprehensive",
            surface: "desktop-homepage",
            layout: JSON.parse(JSON.stringify(layoutState.layout)),
          },
          view: {
            revision: viewState.revision,
            config: JSON.parse(JSON.stringify(viewState.config)),
          } as any,
        }),
        readWidgetDocument: async (_ctx, widgetId) => widgetDocs[widgetId] ?? null,
        loadLayoutSettings: async (_plugin, options) => {
          const profile = layoutState.layout.profiles?.["device-comprehensive"];
          if (options.sectionsEnabled && options.sectionId && profile?.sections?.[options.sectionId]) {
            const sec = profile.sections[options.sectionId];
            return {
              widgetLayoutNumber: sec.widgetLayoutNumber ?? profile.widgetLayoutNumber ?? 4,
              widgetGap: sec.widgetGap ?? profile.widgetGap ?? 8,
            };
          }
          return {
            widgetLayoutNumber: profile?.widgetLayoutNumber ?? 4,
            widgetGap: profile?.widgetGap ?? 8,
          };
        },
        saveLayoutData: async (_ctx, nextLayout, options) => {
          saveCallCount += 1;
          if (options?.expectedRevision !== undefined && options.expectedRevision !== layoutState.revision) {
            throw new Error(`CAS Revision Conflict: expected ${options.expectedRevision}, actual ${layoutState.revision}`);
          }
          if (skipNextLayoutWrite) {
            skipNextLayoutWrite = false;
            return;
          }
          if (hasSameJsonSemantic(layoutState.layout, nextLayout)) return;
          layoutState.layout = JSON.parse(JSON.stringify(nextLayout));
          layoutState.revision += 1;
        },
        deleteWidgetFromSurface: async () => ({ status: "success" }) as any,
      },
    });

    console.log("=== Phase B.1: overview & listSections (Layout Single Source) ===");
    const overview = await realAgentService.overview("desktop-homepage");
    assert.equal(overview.status, "ok");
    assert.equal(overview.layoutRevision, 1);
    assert.equal(overview.sections?.length, 2);
    assert.equal(overview.sections?.[0]?.id, "section-user-1");
    assert.equal(overview.sections?.[0]?.widgetCount, 2);

    const secBaseline = await realAgentService.listSections("desktop-homepage");
    assert.equal(secBaseline.layoutRevision, 1);
    assert.equal((secBaseline.sections as any[]).length, 2);
    assert.equal("viewRevision" in secBaseline, false);
    assert.equal("consistent" in secBaseline, false);
    console.log("overview & listSections: PASS");

    console.log("=== Phase B.2: createSection (A & B) with Layout-only CAS ===");
    events.length = 0;
    const createA = await realAgentService.createSection({
      name: sectionAName,
      sectionId: sectionAId,
      expectedLayoutRevision: 1,
    });
    assert.equal(createA.changed, true);
    assert.equal(createA.createdSectionId, sectionAId);
    assert.equal(layoutState.revision, 2);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT);
    assert.equal(events[0]?.detail.reason, "sections-updated");

    let duplicateCreateCaught = false;
    try {
      await realAgentService.createSection({
        name: sectionAName,
        expectedLayoutRevision: 2,
      });
    } catch (error: any) {
      duplicateCreateCaught = true;
      assert.equal(error.code, "section_name_conflict");
    }
    assert.equal(duplicateCreateCaught, true);
    assert.equal(layoutState.revision, 2);

    const createB = await realAgentService.createSection({
      name: sectionBName,
      sectionId: sectionBId,
      expectedLayoutRevision: 2,
    });
    assert.equal(createB.changed, true);
    assert.equal(layoutState.revision, 3);

    const secRead1 = await realAgentService.listSections("desktop-homepage");
    const secList1 = secRead1.sections as any[];
    assert.equal(secList1.length, 4);
    assert.equal(secList1.find((s) => s.id === sectionAId)?.name, sectionAName);
    console.log("createSection: PASS");

    console.log("=== Phase B.3: renameSection (A) ===");
    events.length = 0;
    const renameA = await realAgentService.renameSection({
      sectionId: sectionAId,
      name: sectionARenamed,
      expectedSectionName: sectionAName,
      expectedLayoutRevision: 3,
    });
    assert.equal(renameA.changed, true);
    assert.equal(layoutState.revision, 4);

    const secRead2 = await realAgentService.listSections("desktop-homepage");
    const secList2 = secRead2.sections as any[];
    assert.equal(secList2.find((s) => s.id === sectionAId)?.name, sectionARenamed);
    console.log("renameSection: PASS");

    console.log("=== Phase B.4: reorderSections ===");
    events.length = 0;
    const globalOrderBeforeDisabledReorder = JSON.parse(JSON.stringify(layoutState.layout.profiles?.["device-comprehensive"]?.order));
    const newOrder = ["section-user-1", "section-user-2", sectionBId, sectionAId];
    const reorderRes = await realAgentService.reorderSections({
      orderedSectionIds: newOrder,
      expectedLayoutRevision: 4,
    });
    assert.equal(reorderRes.changed, true);
    assert.equal(layoutState.revision, 5);

    const secRead3 = await realAgentService.listSections("desktop-homepage");
    const secList3 = secRead3.sections as any[];
    assert.deepEqual(secList3.map((s) => s.id), newOrder);
    assert.deepEqual(layoutState.layout.profiles?.["device-comprehensive"]?.order, globalOrderBeforeDisabledReorder);
    assert.deepEqual(
      layoutState.layout.order,
      layoutState.layout.profiles?.["device-comprehensive"]?.order,
      "Top-level and profile order must stay aligned after reorder",
    );
    assert.deepEqual(
      newOrder.map((id, index) => layoutState.layout.profiles?.["device-comprehensive"]?.sections?.[id]?.index === index),
      [true, true, true, true],
      "Section index must express the new insertion order",
    );
    assert.equal(events[0]?.type, HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT);
    console.log("reorderSections: PASS");

    console.log("=== Phase B.5: mixed reorder, no-op, invalid order, and write verification ===");
    events.length = 0;
    const setModeRes = await realAgentService.setSectionMode({
      enabled: true,
      expectedLayoutRevision: 5,
    });
    assert.equal(setModeRes.changed, true);
    assert.equal(layoutState.revision, 6);

    const mixedOrder = ["section-user-2", "section-user-1", sectionBId, sectionAId];
    const mixedReorder = await realAgentService.reorderSections({
      orderedSectionIds: mixedOrder,
      expectedLayoutRevision: 6,
    });
    assert.equal(mixedReorder.changed, true);
    assert.equal(layoutState.revision, 7);
    assert.deepEqual(layoutState.layout.order, [
      { id: "accounting-1", style: "accounting-style", index: 0 },
      { id: "weather-1", style: "weather-style", index: 1 },
      { id: "music-1", style: "music-style", index: 2 },
    ]);
    assert.deepEqual(layoutState.layout.order, layoutState.layout.profiles?.["device-comprehensive"]?.order);
    assert.deepEqual(layoutState.layout.profiles?.["device-comprehensive"]?.sections?.["section-user-2"]?.widgetIds, ["accounting-1"]);
    assert.deepEqual(layoutState.layout.profiles?.["device-comprehensive"]?.sections?.["section-user-1"]?.widgetIds, ["weather-1", "music-1"]);
    assert.deepEqual(
      mixedOrder.map((id, index) => layoutState.layout.profiles?.["device-comprehensive"]?.sections?.[id]?.index === index),
      [true, true, true, true],
    );

    const noOpRevision = layoutState.revision;
    const noOpSaveCalls = saveCallCount;
    events.length = 0;
    const noOpRes = await realAgentService.reorderSections({
      orderedSectionIds: mixedOrder,
      expectedLayoutRevision: noOpRevision,
    });
    assert.equal(noOpRes.status, "ok");
    assert.equal(noOpRes.changed, false);
    assert.equal(layoutState.revision, noOpRevision);
    assert.equal(saveCallCount, noOpSaveCalls, "Same-order reorder must not call storage");
    assert.equal(events.length, 0, "Same-order reorder must not dispatch refresh");

    const invalidOrders = [
      { label: "missing", ids: mixedOrder.slice(0, -1) },
      { label: "extra", ids: [...mixedOrder, "section-extra"] },
      { label: "duplicate", ids: [...mixedOrder.slice(0, -1), mixedOrder[0]] },
      { label: "unknown", ids: [...mixedOrder.slice(0, -1), "section-unknown"] },
    ];
    const invalidSaveCalls = saveCallCount;
    for (const invalid of invalidOrders) {
      let invalidCaught = false;
      try {
        await realAgentService.reorderSections({
          orderedSectionIds: invalid.ids,
          expectedLayoutRevision: noOpRevision,
        });
      } catch (error: any) {
        invalidCaught = true;
        assert.equal(error.code, "invalid_section_order", invalid.label);
      }
      assert.equal(invalidCaught, true, invalid.label);
      assert.equal(saveCallCount, invalidSaveCalls, `${invalid.label} order must not call storage`);
      assert.equal(layoutState.revision, noOpRevision, `${invalid.label} order must not change revision`);
    }

    const beforeStaleOrder = JSON.parse(JSON.stringify(layoutState.layout));
    let staleCaught = false;
    try {
      await realAgentService.reorderSections({
        orderedSectionIds: ["section-user-1", "section-user-2", sectionAId, sectionBId],
        expectedLayoutRevision: 1,
      });
    } catch (error: any) {
      staleCaught = true;
      assert.equal(error.code, "layout_revision_conflict");
    }
    assert.equal(staleCaught, true, "Old revision must be rejected by CAS");
    assert.equal(saveCallCount, invalidSaveCalls);
    assert.equal(layoutState.revision, noOpRevision);
    assert.deepEqual(layoutState.layout, beforeStaleOrder);

    const failedWriteOrder = ["section-user-1", "section-user-2", sectionAId, sectionBId];
    const beforeFailedWrite = JSON.parse(JSON.stringify(layoutState.layout));
    events.length = 0;
    skipNextLayoutWrite = true;
    let writeNotCommittedCaught: any;
    try {
      await realAgentService.reorderSections({
        orderedSectionIds: failedWriteOrder,
        expectedLayoutRevision: noOpRevision,
      });
    } catch (error) {
      writeNotCommittedCaught = error;
    }
    assert.equal(writeNotCommittedCaught?.code, "write_not_committed");
    assert.equal(writeNotCommittedCaught?.recoverable, false);
    assert.equal(layoutState.revision, noOpRevision, "Uncommitted write must not advance revision");
    assert.deepEqual(layoutState.layout, beforeFailedWrite, "Uncommitted write must leave layout unchanged");
    assert.equal(events.length, 0, "Uncommitted write must not dispatch refresh");

    const retryRes = await realAgentService.reorderSections({
      orderedSectionIds: failedWriteOrder,
      expectedLayoutRevision: noOpRevision,
    });
    assert.equal(retryRes.changed, true);
    assert.equal(layoutState.revision, 8);
    const retrySections = await realAgentService.listSections("desktop-homepage");
    assert.deepEqual((retrySections.sections as any[]).map((section) => section.id), failedWriteOrder);

    console.log("reorderSections contracts: PASS");

    console.log("=== Phase B.6: setSectionMode & setActiveSection ===");
    const setActiveRes = await realAgentService.setActiveSection({
      sectionId: sectionBId,
      expectedLayoutRevision: 8,
    });
    assert.equal(setActiveRes.changed, true);
    assert.equal(layoutState.revision, 9);

    const restoreActiveRes = await realAgentService.setActiveSection({
      sectionId: "section-user-1",
      expectedLayoutRevision: 9,
    });
    assert.equal(restoreActiveRes.changed, true);
    assert.equal(layoutState.revision, 10);

    const restoreModeRes = await realAgentService.setSectionMode({
      enabled: false,
      expectedLayoutRevision: 10,
    });
    assert.equal(restoreModeRes.changed, true);
    assert.equal(layoutState.revision, 11);
    assert.equal(layoutState.layout.profiles?.["device-comprehensive"]?.activeSectionId, undefined);
    console.log("setSectionMode & setActiveSection: PASS");

    console.log("=== Phase B.7: removeSection (Clean up B then A) ===");
    events.length = 0;
    let removeNameConflictCaught = false;
    try {
      await realAgentService.removeSection({
        sectionId: sectionBId,
        expectedSectionName: "wrong name",
        expectedWidgetCount: 0,
        expectedLayoutRevision: 11,
      });
    } catch (error: any) {
      removeNameConflictCaught = true;
      assert.equal(error.code, "section_name_conflict");
    }
    assert.equal(removeNameConflictCaught, true);
    assert.equal(layoutState.revision, 11);
    const removeB = await realAgentService.removeSection({
      sectionId: sectionBId,
      expectedSectionName: sectionBName,
      expectedWidgetCount: 0,
      expectedLayoutRevision: 11,
    });
    assert.equal(removeB.changed, true);
    assert.equal(layoutState.revision, 12);

    const removeA = await realAgentService.removeSection({
      sectionId: sectionAId,
      expectedSectionName: sectionARenamed,
      expectedWidgetCount: 0,
      expectedLayoutRevision: 12,
    });
    assert.equal(removeA.changed, true);
    assert.equal(layoutState.revision, 13);

    const finalSecs = await realAgentService.listSections("desktop-homepage");
    const finalSecList = finalSecs.sections as any[];
    assert.equal(finalSecList.length, 2);
    assert.deepEqual(finalSecList.map((s) => s.id), ["section-user-1", "section-user-2"]);
    console.log("removeSection & Final Invariants: PASS");

    console.log("=== Phase B.8: CAS Conflict Safety ===");
    let conflictCaught = false;
    try {
      await realAgentService.createSection({
        name: "Stale Create",
        expectedLayoutRevision: 1, // Current is 13
      });
    } catch (e: any) {
      conflictCaught = true;
      assert.ok(e.message.includes("已变化") || e.code === "layout_revision_conflict");
    }
    assert.equal(conflictCaught, true, "Outdated expectedLayoutRevision must throw conflict");
    assert.equal(viewState.revision, 1, "Section lifecycle must not write view revision");
    assert.deepEqual(viewState.config, {
      TitleIconEmoji: "1f3e0",
      pageTitle: "思源主页",
      componentSectionsNavAlign: "center",
      buttonsList: [
        { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
        { id: 2, label: "我的链接", checked: true, order: 1 },
        { id: 3, label: "日记", checked: false, order: 2 },
      ],
    });
    console.log("CAS Conflict Safety: PASS");

    console.log("=== Phase B.9: corrupted marker remains blocked with safe Agent text ===");
    layoutState.layout.profiles!["device-comprehensive"].componentSectionsModelVersion = 99;
    let blockedReadCaught = false;
    try {
      await realAgentService.createSection({
        name: "Blocked Create",
        expectedLayoutRevision: layoutState.revision,
      });
    } catch (error: any) {
      blockedReadCaught = true;
      assert.equal(error.code, "desktop_section_layout_corrupted");
      assert.doesNotMatch(error.message, /device-comprehensive|99|Error|JSON/);
      assert.match(error.message, /未知分栏模型版本|分栏数据/);
    }
    assert.equal(blockedReadCaught, true);
    assert.equal(layoutState.revision, 13);
    console.log("corrupted marker safe Agent block: PASS");

    console.log("Homepage Agent Comprehensive Verification: ALL PASS");
  } finally {
    (globalThis as any).window = prevWindow;
    (globalThis as any).CustomEvent = prevCustomEvent;
  }
}

async function verifySettingsAndButtonsCas(): Promise<void> {
  console.log("=== Phase C: Homepage Settings & Buttons View CAS Baseline ===");

  const previousWindow = (globalThis as any).window;
  const previousCustomEvent = (globalThis as any).CustomEvent;
  const events: Array<{ type: string; detail: unknown }> = [];
  (globalThis as any).CustomEvent = class MockCustomEvent {
    public detail: unknown;
    constructor(public type: string, init?: { detail?: unknown }) {
      this.detail = init?.detail;
    }
  };
  (globalThis as any).window = {
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      events.push({ type: event.type, detail: event.detail });
      return true;
    },
  };

  try {
    class InMemorySettingsService extends HomepageSettingsService {
      public revision = 1;
      public config: Record<string, unknown> = {
        TitleIconEmoji: "1f3e0",
        pageTitle: "思源主页",
        buttonsList: [
          { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
          { id: 2, label: "我的链接", checked: true, order: 1 },
        ],
      };

      protected override async readView() {
        return {
          context: { scopeId: "settings-cas", surface: "desktop-homepage", isMobileShared: false } as any,
          view: { revision: this.revision, config: JSON.parse(JSON.stringify(this.config)) } as any,
        };
      }

      protected override async readViewSettings(_context: any) {
        return { revision: this.revision, config: JSON.parse(JSON.stringify(this.config)) } as any;
      }

      protected override async commitViewMutation(
        _context: any,
        mutation: (config: Record<string, unknown>) => Record<string, unknown>,
        expectedViewRevision: number,
      ): Promise<void> {
        if (expectedViewRevision !== this.revision) throw new Error("并发更新冲突");
        this.config = mutation(this.config);
        this.revision += 1;
      }
    }

    const service = new InMemorySettingsService({ getPlugin: () => ({ isMobile: false }) as any });
    const first = await service.updateSettings({ TitleIconEmoji: "1f600" }, 1);
    assert.equal(first.viewRevision, 2);
    assert.equal(events.at(-1)?.type, HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT);
    assert.deepEqual((events.at(-1)?.detail as any).reason, "settings-updated");

    const unchanged = await service.updateSettings({ TitleIconEmoji: "1f600" }, 2);
    assert.equal(unchanged.changed, false);
    assert.equal(service.revision, 2);

    const buttons = await service.updateButtons([{ op: "toggle", id: 1, checked: false }], 2);
    assert.equal(buttons.viewRevision, 3);
    assert.equal((service.config.buttonsList as any[])[0]?.checked, false);
    assert.equal(events.at(-1)?.type, HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT);
    assert.deepEqual((events.at(-1)?.detail as any).reason, "buttons-updated");

    let staleCaught = false;
    try {
      await service.updateSettings({ TitleIconEmoji: "1f601" }, 2);
    } catch (error) {
      staleCaught = true;
      assert.equal((error as HomepageSettingsServiceError).code, "view_revision_conflict");
    }
    assert.equal(staleCaught, true);
    assert.equal(service.revision, 3);
    assert.equal(service.config.TitleIconEmoji, "1f600");
    console.log("settings/buttons CAS baseline: PASS");
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).CustomEvent = previousCustomEvent;
  }
}

function createCoordinatedSaveState(scopeId: string): {
  context: DeviceViewContext;
  layoutRevision: number;
  layout: WidgetLayoutData;
  viewRevision: number;
  viewConfig: Record<string, unknown>;
} {
  const context: DeviceViewContext = {
    plugin: { isMobile: false } as any,
    physicalDeviceId: scopeId,
    scopeId,
    surface: "desktop-homepage",
    isMobileShared: false,
  };
  return {
    context,
    layoutRevision: 1,
    layout: {
      order: [{ id: "w-1", style: "card", index: 0 }],
      profiles: {
        [scopeId]: {
          order: [{ id: "w-1", style: "card", index: 0 }],
          sections: { "sec-1": { widgetIds: ["w-1"], name: "One", createdAt: 100, updatedAt: 100 } },
          activeSectionId: "sec-1",
          componentSectionsModeEnabled: true,
          componentSectionsModelVersion: 1,
          widgetLayoutNumber: 4,
          widgetGap: 8,
        },
      },
      componentSectionsModelVersion: 1,
    },
    viewRevision: 1,
    viewConfig: { pageTitle: "旧标题", concurrentView: false },
  };
}

function snapshotForSaveState(state: ReturnType<typeof createCoordinatedSaveState>): CoordinatedSnapshot {
  return {
    layout: {
      layout: structuredClone(state.layout),
      revision: state.layoutRevision,
      deviceId: state.context.scopeId,
      surface: state.context.surface,
    },
    view: {
      schema: "siyuan-homepage-device-view",
      version: 2,
      revision: state.viewRevision,
      updatedAt: "1970-01-01T00:00:01.000Z",
      deviceId: state.context.scopeId,
      surface: "desktop-homepage",
      config: structuredClone(state.viewConfig),
    } as any,
  };
}

function layoutSnapshotForSaveState(state: ReturnType<typeof createCoordinatedSaveState>): LayoutSnapshot {
  return {
    layout: structuredClone(state.layout),
    revision: state.layoutRevision,
    deviceId: state.context.scopeId,
    surface: state.context.surface,
  };
}

async function verifyCoordinatedSaveBehavior(): Promise<void> {
  console.log("=== Phase C.2: Real saveHomepageSettingsCoordinated behavior ===");
  const input = {
    config: {
      pageTitle: "新标题",
      concurrentView: false,
      componentSectionsEnabled: true,
      componentSections: [{ id: "sec-1", name: "One" }],
      mobileAutoOpenEnabled: true,
    },
    sectionsEnabled: true,
    sections: [{ id: "sec-1", name: "One", createdAt: 100, updatedAt: 100 }],
    deletedSectionIds: [],
    widgetLayoutNumber: 4,
    widgetGap: 8,
  };

  const missingViewState = createCoordinatedSaveState("coordinated-missing-view");
  let missingViewReadCalls = 0;
  let missingViewLayoutWrites = 0;
  let missingViewSharedWrites = 0;
  let missingViewSettingsWrites = 0;
  await assert.rejects(
    saveHomepageSettingsCoordinated(missingViewState.context.plugin as any, input, {
      context: missingViewState.context,
      readSnapshot: async () => {
        missingViewReadCalls += 1;
        return { ...snapshotForSaveState(missingViewState), view: null };
      },
      saveLayoutData: async () => {
        missingViewLayoutWrites += 1;
      },
      saveSharedSettings: async () => {
        missingViewSharedWrites += 1;
      },
      updateViewSettings: async () => {
        missingViewSettingsWrites += 1;
        return {} as any;
      },
    }),
    /缺少 view\.json/,
  );
  assert.equal(missingViewReadCalls, 1);
  assert.equal(missingViewLayoutWrites, 0);
  assert.equal(missingViewSharedWrites, 0);
  assert.equal(missingViewSettingsWrites, 0);

  const wrongSurfaceState = createCoordinatedSaveState("coordinated-wrong-surface");
  const wrongSurfaceContext: DeviceViewContext = {
    ...wrongSurfaceState.context,
    surface: "desktop-sidebar",
  };
  let wrongSurfaceReadCalls = 0;
  let wrongSurfaceLayoutWrites = 0;
  let wrongSurfaceSharedWrites = 0;
  let wrongSurfaceSettingsWrites = 0;
  await assert.rejects(
    saveHomepageSettingsCoordinated(wrongSurfaceContext.plugin as any, input, {
      context: wrongSurfaceContext,
      readSnapshot: async () => {
        wrongSurfaceReadCalls += 1;
        return snapshotForSaveState(wrongSurfaceState);
      },
      saveLayoutData: async () => {
        wrongSurfaceLayoutWrites += 1;
      },
      saveSharedSettings: async () => {
        wrongSurfaceSharedWrites += 1;
      },
      updateViewSettings: async () => {
        wrongSurfaceSettingsWrites += 1;
        return {} as any;
      },
    }),
    /只支持 desktop-homepage context/,
  );
  assert.equal(wrongSurfaceReadCalls, 0);
  assert.equal(wrongSurfaceLayoutWrites, 0);
  assert.equal(wrongSurfaceSharedWrites, 0);
  assert.equal(wrongSurfaceSettingsWrites, 0);

  const mismatchedPluginState = createCoordinatedSaveState("coordinated-wrong-plugin");
  const mismatchedPlugin = { isMobile: false } as any;
  let mismatchedPluginReadCalls = 0;
  let mismatchedPluginLayoutWrites = 0;
  let mismatchedPluginSharedWrites = 0;
  let mismatchedPluginSettingsWrites = 0;
  await assert.rejects(
    saveHomepageSettingsCoordinated(mismatchedPlugin, input, {
      context: mismatchedPluginState.context,
      readSnapshot: async () => {
        mismatchedPluginReadCalls += 1;
        return snapshotForSaveState(mismatchedPluginState);
      },
      saveLayoutData: async () => {
        mismatchedPluginLayoutWrites += 1;
      },
      saveSharedSettings: async () => {
        mismatchedPluginSharedWrites += 1;
      },
      updateViewSettings: async () => {
        mismatchedPluginSettingsWrites += 1;
        return {} as any;
      },
    }),
    /只支持 desktop-homepage context.*plugin 与 context 一致/,
  );
  assert.equal(mismatchedPluginReadCalls, 0);
  assert.equal(mismatchedPluginLayoutWrites, 0);
  assert.equal(mismatchedPluginSharedWrites, 0);
  assert.equal(mismatchedPluginSettingsWrites, 0);

  const invalidSnapshotCases: Array<{
    label: string;
    mutate: (snapshot: CoordinatedSnapshot) => CoordinatedSnapshot;
  }> = [
    {
      label: "deviceId",
      mutate: (snapshot) => ({
        ...snapshot,
        layout: { ...snapshot.layout, deviceId: "other-device" },
        view: snapshot.view ? { ...snapshot.view, deviceId: "other-device" } : null,
      }),
    },
    {
      label: "surface",
      mutate: (snapshot) => ({
        ...snapshot,
        layout: { ...snapshot.layout, surface: "desktop-sidebar" },
        view: snapshot.view ? { ...snapshot.view, surface: "desktop-sidebar" } : null,
      }),
    },
  ];
  for (const testCase of invalidSnapshotCases) {
    const invalidSnapshotState = createCoordinatedSaveState(`coordinated-wrong-snapshot-${testCase.label}`);
    let invalidSnapshotReadCalls = 0;
    let invalidSnapshotLayoutWrites = 0;
    let invalidSnapshotSharedWrites = 0;
    let invalidSnapshotSettingsWrites = 0;
    await assert.rejects(
      saveHomepageSettingsCoordinated(invalidSnapshotState.context.plugin as any, input, {
        context: invalidSnapshotState.context,
        readSnapshot: async () => {
          invalidSnapshotReadCalls += 1;
          return testCase.mutate(snapshotForSaveState(invalidSnapshotState));
        },
        saveLayoutData: async () => {
          invalidSnapshotLayoutWrites += 1;
        },
        saveSharedSettings: async () => {
          invalidSnapshotSharedWrites += 1;
        },
        updateViewSettings: async () => {
          invalidSnapshotSettingsWrites += 1;
          return {} as any;
        },
      }),
      /协调快照与固定 desktop-homepage context 不一致/,
    );
    assert.equal(invalidSnapshotReadCalls, 1);
    assert.equal(invalidSnapshotLayoutWrites, 0);
    assert.equal(invalidSnapshotSharedWrites, 0);
    assert.equal(invalidSnapshotSettingsWrites, 0);
  }

  const postWriteSnapshotState = createCoordinatedSaveState("coordinated-post-write-snapshot");
  let postWriteLayoutWrites = 0;
  let postWriteLoadCalls = 0;
  let postWriteSharedWrites = 0;
  let postWriteSettingsWrites = 0;
  await assert.rejects(
    saveHomepageSettingsCoordinated(postWriteSnapshotState.context.plugin as any, input, {
      context: postWriteSnapshotState.context,
      readSnapshot: async () => snapshotForSaveState(postWriteSnapshotState),
      loadLayoutSnapshot: async () => {
        postWriteLoadCalls += 1;
        return {
          ...layoutSnapshotForSaveState(postWriteSnapshotState),
          deviceId: "other-device",
        };
      },
      saveLayoutData: async (_context, nextLayout) => {
        postWriteLayoutWrites += 1;
        postWriteSnapshotState.layout = structuredClone(nextLayout);
        postWriteSnapshotState.layoutRevision += 1;
      },
      saveSharedSettings: async () => {
        postWriteSharedWrites += 1;
      },
      updateViewSettings: async () => {
        postWriteSettingsWrites += 1;
        return {} as any;
      },
    }),
    /写后 layout snapshot 与固定 desktop-homepage context 不一致/,
  );
  assert.equal(postWriteLayoutWrites, 1);
  assert.equal(postWriteLoadCalls, 1);
  assert.equal(postWriteSharedWrites, 0);
  assert.equal(postWriteSettingsWrites, 0);

  const casState = createCoordinatedSaveState("coordinated-cas");
  let viewUpdateCalls = 0;
  const casResult = await saveHomepageSettingsCoordinated(casState.context.plugin as any, input, {
    context: casState.context,
    readSnapshot: async () => snapshotForSaveState(casState),
    loadLayoutSnapshot: async () => layoutSnapshotForSaveState(casState),
    saveLayoutData: async (_context, nextLayout, options) => {
      assert.equal(options?.expectedRevision, casState.layoutRevision);
      casState.layout = structuredClone(nextLayout);
      casState.layoutRevision += 1;
    },
    saveSharedSettings: async () => undefined,
    updateViewSettings: async (_context, _config, options) => {
      viewUpdateCalls += 1;
      assert.equal(options?.expectedRevision, 1);
      casState.viewRevision += 1;
      casState.viewConfig = { ...casState.viewConfig, concurrentView: true };
      if (options?.expectedRevision !== casState.viewRevision) {
        throw new Error("simulated concurrent view CAS conflict");
      }
    },
  });
  assert.equal(viewUpdateCalls, 1);
  assert.equal(casResult.success, true);
  assert.equal(casResult.partial, true);
  assert.equal(casResult.layoutRevision, casState.layoutRevision);
  assert.match(casResult.warning ?? "", /视图配置更新失败/);
  assert.equal(casState.viewConfig.concurrentView, true);
  assert.equal(casState.viewConfig.pageTitle, "旧标题", "concurrent view content must not be overwritten");
  assert.equal(casState.layoutRevision, 2);

  const sharedFailureState = createCoordinatedSaveState("coordinated-shared-failure");
  const sharedFailureResult = await saveHomepageSettingsCoordinated(sharedFailureState.context.plugin as any, input, {
    context: sharedFailureState.context,
    readSnapshot: async () => snapshotForSaveState(sharedFailureState),
    loadLayoutSnapshot: async () => layoutSnapshotForSaveState(sharedFailureState),
    saveLayoutData: async (_context, nextLayout, options) => {
      assert.equal(options?.expectedRevision, 1);
      sharedFailureState.layout = structuredClone(nextLayout);
      sharedFailureState.layoutRevision += 1;
    },
    saveSharedSettings: async () => { throw new Error("simulated shared settings failure"); },
    updateViewSettings: async (_context, config, options) => {
      assert.equal(options?.expectedRevision, 1);
      assert.equal(config.componentSectionsEnabled, undefined);
      assert.equal(config.componentSections, undefined);
      assert.equal(config.mobileAutoOpenEnabled, undefined);
      sharedFailureState.viewConfig = structuredClone(config);
      sharedFailureState.viewRevision += 1;
      return {} as any;
    },
  });
  assert.equal(sharedFailureResult.partial, true);
  assert.match(sharedFailureResult.warning ?? "", /共享设置写入失败/);
  assert.equal(sharedFailureState.layoutRevision, 2);
  assert.equal(sharedFailureState.viewRevision, 2);

  const viewFailureState = createCoordinatedSaveState("coordinated-view-failure");
  const viewFailureResult = await saveHomepageSettingsCoordinated(viewFailureState.context.plugin as any, input, {
    context: viewFailureState.context,
    readSnapshot: async () => snapshotForSaveState(viewFailureState),
    loadLayoutSnapshot: async () => layoutSnapshotForSaveState(viewFailureState),
    saveLayoutData: async (_context, nextLayout, options) => {
      assert.equal(options?.expectedRevision, 1);
      viewFailureState.layout = structuredClone(nextLayout);
      viewFailureState.layoutRevision += 1;
    },
    saveSharedSettings: async () => undefined,
    updateViewSettings: async (_context, _config, options) => {
      assert.equal(options?.expectedRevision, 1);
      throw new Error("simulated view settings failure");
    },
  });
  assert.equal(viewFailureResult.partial, true);
  assert.match(viewFailureResult.warning ?? "", /视图配置更新失败/);
  assert.equal(viewFailureState.layoutRevision, 2);
  assert.equal(viewFailureState.viewRevision, 1);
  console.log("saveHomepageSettingsCoordinated partial/CAS behavior: PASS");
}

async function verifyTemplateAndResetContracts(): Promise<void> {
  console.log("=== Phase D: Template, Widget Move, and Reset Layout-Only Contracts ===");
  const context: DeviceViewContext = {
    plugin: { isMobile: false } as any,
    physicalDeviceId: "template-production",
    scopeId: "template-production",
    surface: "desktop-homepage",
    isMobileShared: false,
  };
  let layoutRevision = 1;
  let layout: WidgetLayoutData = {
    order: [
      { id: "existing-widget", style: "existing-style", index: 0 },
      { id: "other-widget", style: "other-style", index: 1 },
    ],
    profiles: {
      [context.scopeId]: {
        order: [
          { id: "existing-widget", style: "existing-style", index: 0 },
          { id: "other-widget", style: "other-style", index: 1 },
        ],
        sections: {
          "sec-1": { widgetIds: ["existing-widget"], name: "One", createdAt: 100, updatedAt: 100 },
          "sec-2": { widgetIds: ["other-widget"], name: "Two", createdAt: 101, updatedAt: 101 },
        },
        activeSectionId: "sec-1",
        componentSectionsModeEnabled: true,
        componentSectionsModelVersion: 1,
        widgetLayoutNumber: 2,
        widgetGap: 8,
      },
    },
    componentSectionsModelVersion: 1,
  };
  const viewConfig = { keep: "view-unchanged" };
  const widgetDocuments: Record<string, DeviceWidgetDocument> = {
    "existing-widget": { deviceId: context.scopeId, surface: context.surface, instanceId: "existing-widget", revision: 1, config: { type: "existing" } } as any,
    "other-widget": { deviceId: context.scopeId, surface: context.surface, instanceId: "other-widget", revision: 1, config: { type: "other" } } as any,
  };
  const loadLayoutSnapshot = async (): Promise<LayoutSnapshot> => ({
    layout: structuredClone(layout),
    revision: layoutRevision,
    deviceId: context.scopeId,
    surface: context.surface,
  });
  const template = {
    id: "template-for-behavior",
    name: "行为模板",
    createdAt: 100,
    updatedAt: 100,
    columns: 2,
    gap: 8,
    layoutItems: [{ widgetId: "template-widget", order: 0, style: "template-style", colSpan: 1, rowSpan: 1, hasContent: true }],
    widgetConfigs: { "template-widget": { type: "template-demo", instanceId: "template-widget" } },
  } as any;
  const beforeView = structuredClone(viewConfig);
  const templateResult = await applyUserLayoutTemplateToCurrentDevice(context.plugin as any, template.id, {
    context,
    loadTemplates: async () => [template],
    loadLayoutSnapshot,
    createWidgetId: () => "template-widget-new",
    createWidgetDocument: async (fixedContext, widgetId, config) => {
      const document = { deviceId: fixedContext.scopeId, surface: fixedContext.surface, instanceId: widgetId, revision: 1, config } as any;
      widgetDocuments[widgetId] = document;
      return document;
    },
    readWidgetDocument: async (_fixedContext, widgetId) => widgetDocuments[widgetId] ?? null,
    saveLayoutData: async (_fixedContext, nextLayout, options) => {
      assert.equal(options?.expectedRevision, layoutRevision);
      layout = structuredClone(nextLayout);
      layoutRevision += 1;
    },
  });
  assert.equal(templateResult.success, true);
  assert.deepEqual(layout.profiles?.[context.scopeId]?.sections?.["sec-1"]?.widgetIds, ["existing-widget", "template-widget-new"]);
  assert.deepEqual(layout.profiles?.[context.scopeId]?.sections?.["sec-2"]?.widgetIds, ["other-widget"]);
  assert.deepEqual(layout.profiles?.[context.scopeId]?.order.map((item) => item.id), ["existing-widget", "template-widget-new", "other-widget"]);
  assert.equal(layout.profiles?.[context.scopeId]?.componentSectionsModelVersion, 1);
  assert.deepEqual(viewConfig, beforeView, "template append must not modify view");
  assert.ok(widgetDocuments["template-widget-new"]);
  console.log("template append production path: PASS");

  const moveResult = await moveWidgetToComponentSectionForCurrentDevice(
    context.plugin as any,
    "template-widget-new",
    {
      fromSectionId: "sec-1",
      toSectionId: "sec-2",
      style: "moved-style",
      deviceViewContext: context,
      operations: {
        isDesktopDeviceProfileEnabled: () => true,
        isSectionsEnabled: async () => true,
        loadLayoutSnapshot,
        updateLayout: async (fixedContext, mutate) => {
          layout = mutate(structuredClone(layout), fixedContext.scopeId, fixedContext);
          layoutRevision += 1;
          return layoutRevision;
        },
      },
    },
  );
  assert.equal(moveResult.success, true, moveResult.error);
  assert.deepEqual(layout.profiles?.[context.scopeId]?.sections?.["sec-1"]?.widgetIds, ["existing-widget"]);
  assert.deepEqual(layout.profiles?.[context.scopeId]?.sections?.["sec-2"]?.widgetIds, ["template-widget-new", "other-widget"]);
  assert.deepEqual(layout.profiles?.[context.scopeId]?.order.map((item) => item.id), ["existing-widget", "template-widget-new", "other-widget"]);
  assert.equal(layout.profiles?.[context.scopeId]?.order.find((item) => item.id === "template-widget-new")?.style, "moved-style");
  assert.equal(layout.profiles?.[context.scopeId]?.sections?.["sec-2"]?.name, "Two");
  assert.equal(layout.profiles?.[context.scopeId]?.sections?.["sec-2"]?.createdAt, 101);
  assert.equal(layout.profiles?.[context.scopeId]?.componentSectionsModelVersion, 1);
  assert.deepEqual(viewConfig, beforeView, "widget move must not modify view");
  console.log("widget move production path: PASS");

  const resetSnapshot = async (): Promise<CoordinatedSnapshot> => ({
    layout: await loadLayoutSnapshot(),
    view: {
      schema: "siyuan-homepage-device-view",
      version: 2,
      revision: 1,
      updatedAt: "1970-01-01T00:00:01.000Z",
      deviceId: context.scopeId,
      surface: context.surface,
      config: structuredClone(viewConfig),
    } as any,
  });
  const documentsBeforeReset = structuredClone(widgetDocuments);
  await resetCurrentDesktopHomepageLayout(context.plugin as any, {
    context,
    readSnapshot: resetSnapshot,
    saveLayoutData: async (_fixedContext, nextLayout, options) => {
      assert.equal(options?.expectedRevision, layoutRevision);
      layout = structuredClone(nextLayout);
      layoutRevision += 1;
    },
    readWidgetDocument: async (_fixedContext, widgetId) => widgetDocuments[widgetId] ?? null,
  });
  const resetProfile = layout.profiles?.[context.scopeId];
  assert.deepEqual(resetProfile?.order, []);
  assert.deepEqual(layout.order, []);
  assert.equal(resetProfile?.componentSectionsModelVersion, 1);
  assert.deepEqual(resetProfile?.sections?.["sec-1"], { widgetIds: [], name: "One", createdAt: 100, updatedAt: 100 });
  assert.deepEqual(resetProfile?.sections?.["sec-2"], { widgetIds: [], name: "Two", createdAt: 101, updatedAt: 101 });
  assert.deepEqual(widgetDocuments, documentsBeforeReset, "reset must not delete widget documents");
  assert.deepEqual(viewConfig, beforeView, "reset must not modify view");
  console.log("desktop reset production path: PASS");

  const wrongResetContext: DeviceViewContext = {
    ...context,
    surface: "desktop-sidebar",
  };
  let wrongResetReadCalls = 0;
  let wrongResetLayoutWrites = 0;
  let wrongResetWidgetReads = 0;
  await assert.rejects(
    resetCurrentDesktopHomepageLayout(context.plugin as any, {
      context: wrongResetContext,
      readSnapshot: async () => {
        wrongResetReadCalls += 1;
        return resetSnapshot();
      },
      saveLayoutData: async () => {
        wrongResetLayoutWrites += 1;
      },
      readWidgetDocument: async () => {
        wrongResetWidgetReads += 1;
        return null;
      },
    }),
    /只支持 desktop-homepage context/,
  );
  assert.equal(wrongResetReadCalls, 0);
  assert.equal(wrongResetLayoutWrites, 0);
  assert.equal(wrongResetWidgetReads, 0);
  console.log("desktop reset wrong-surface boundary: PASS");

  const invalidResetSnapshotCases: Array<{
    label: string;
    mutate: (snapshot: CoordinatedSnapshot) => CoordinatedSnapshot;
  }> = [
    {
      label: "deviceId",
      mutate: (snapshot) => ({
        ...snapshot,
        layout: { ...snapshot.layout, deviceId: "other-device" },
        view: snapshot.view ? { ...snapshot.view, deviceId: "other-device" } : null,
      }),
    },
    {
      label: "surface",
      mutate: (snapshot) => ({
        ...snapshot,
        layout: { ...snapshot.layout, surface: "desktop-sidebar" },
        view: snapshot.view ? { ...snapshot.view, surface: "desktop-sidebar" } : null,
      }),
    },
  ];
  for (const testCase of invalidResetSnapshotCases) {
    let invalidResetReadCalls = 0;
    let invalidResetLayoutWrites = 0;
    let invalidResetWidgetReads = 0;
    await assert.rejects(
      resetCurrentDesktopHomepageLayout(context.plugin as any, {
        context,
        readSnapshot: async () => {
          invalidResetReadCalls += 1;
          return testCase.mutate(await resetSnapshot());
        },
        saveLayoutData: async () => {
          invalidResetLayoutWrites += 1;
        },
        readWidgetDocument: async () => {
          invalidResetWidgetReads += 1;
          return null;
        },
      }),
      /协调快照与固定 desktop-homepage context 不一致/,
    );
    assert.equal(invalidResetReadCalls, 1);
    assert.equal(invalidResetLayoutWrites, 0);
    assert.equal(invalidResetWidgetReads, 0);
  }
  console.log("desktop reset snapshot identity boundaries: PASS");

  const templateSource = readFileSync("src/homepage/templates/userLayoutTemplates.ts", "utf8");
  assert.match(templateSource, /loadLayoutSnapshotForContext/);
  assert.doesNotMatch(templateSource, /readCoordinatedSnapshotForContext|CoordinatedSnapshot|viewRevision|viewConfig/);
  assert.match(templateSource, /saveLayoutDataForContext/);

  const resetSource = readFileSync("src/homepage/deviceView/resetCurrentDesktopHomepageLayout.ts", "utf8");
  assert.match(resetSource, /saveLayoutDataForContext/);
  assert.match(resetSource, /profile\.sections/);
  assert.doesNotMatch(resetSource, /deleteWidgetInstance\(/);

  const sectionOpsSource = readFileSync("src/components/utils/widgetBlock/utils/layout-section-ops.ts", "utf8");
  assert.match(sectionOpsSource, /mergeRemovedSectionRangesIntoAdjacentSections/);
  const layoutSharedSource = readFileSync("src/components/utils/widgetBlock/utils/layout-shared.ts", "utf8");
  assert.match(layoutSharedSource, /moveWidgetToComponentSectionForCurrentDevice/);
  console.log("template/reset/widget move source contracts: PASS");
}

async function main(): Promise<void> {
  await verifyMigrationMatrix();
  await verifyAgentLifecycle();
  await verifySettingsAndButtonsCas();
  await verifyCoordinatedSaveBehavior();
  await verifyTemplateAndResetContracts();
  console.log("\n==========================================");
  console.log("🎉 ALL HOMEPAGE MANAGE TESTS PASSED! 🎉");
  console.log("==========================================");
}

await main();

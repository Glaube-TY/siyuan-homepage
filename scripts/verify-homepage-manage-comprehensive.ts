import assert from "node:assert/strict";
import { HomepageAgentService } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-service";
import { HomepageSettingsService } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-settings-service";
import { HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, type HomepageAgentStorageChangedDetail } from "../src/homepage/deviceView/deviceViewEvents";
import type { DeviceViewContext, DeviceWidgetDocument } from "../src/homepage/deviceView/deviceViewTypes";
import type { WidgetLayoutData } from "../src/components/utils/widgetBlock/utils/layout-shared";

async function verifyHomepageManageComprehensive(): Promise<void> {
  const ts = Date.now();
  const sectionAId = `nb_agent_section_a_${ts}`;
  const sectionBId = `nb_agent_section_b_${ts}`;
  const sectionAName = `NB_AGENT_SECTION_A_${ts}`;
  const sectionBName = `NB_AGENT_SECTION_B_${ts}`;
  const sectionARenamed = `NB_AGENT_SECTION_A_RENAMED_${ts}`;

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
    // ── Simulated Coordinated In-Memory Store ──
    const initialSections = [
      { id: "section-user-1", name: "主要分栏", createdAt: 1000, updatedAt: 1000 },
      { id: "section-user-2", name: "次要分栏", createdAt: 1001, updatedAt: 1001 },
    ];
    const initialButtons = [
      { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
      { id: 2, label: "我的链接", checked: true, order: 1 },
      { id: 3, label: "日记", checked: false, order: 2 },
    ];
    const initialSettings = {
      TitleIconEmoji: "1f3e0",
      pageTitle: "思源主页",
      homepageAppearance: { preferredThemeId: "classic" },
    };

    let layoutState: { revision: number; layout: WidgetLayoutData } = {
      revision: 1,
      layout: {
        order: [
          { id: "weather-1", style: null, index: 0 },
          { id: "music-1", style: null, index: 1 },
          { id: "accounting-1", style: null, index: 2 },
        ],
        profiles: {
          "device-comprehensive": {
            order: [
              { id: "weather-1", style: null, index: 0 },
              { id: "music-1", style: null, index: 1 },
              { id: "accounting-1", style: null, index: 2 },
            ],
            sections: {
              "section-user-1": { widgetIds: ["weather-1", "music-1"] },
              "section-user-2": { widgetIds: ["accounting-1"] },
            },
            activeSectionId: "section-user-1",
            componentSectionsModeEnabled: false,
            widgetLayoutNumber: 4,
            widgetGap: 8,
          },
        },
      },
    };

    let viewState: { revision: number; config: Record<string, unknown> } = {
      revision: 1,
      config: {
        ...initialSettings,
        buttonsList: JSON.parse(JSON.stringify(initialButtons)),
        componentSections: JSON.parse(JSON.stringify(initialSections)),
        componentSectionsEnabled: false,
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

    class ComprehensiveSettingsService extends HomepageSettingsService {
      protected override async readViewSettings() {
        return {
          revision: viewState.revision,
          config: JSON.parse(JSON.stringify(viewState.config)),
        } as any;
      }
      protected override async readView() {
        return {
          context: fakeContext,
          view: {
            revision: viewState.revision,
            config: JSON.parse(JSON.stringify(viewState.config)),
          } as any,
        };
      }
      protected override async commitViewMutation(
        _context: any,
        mutation: (config: Record<string, unknown>) => Record<string, unknown>,
        expectedViewRevision: number,
      ) {
        if (viewState.revision !== expectedViewRevision) {
          throw new Error(`并发冲突：预期 viewRevision ${expectedViewRevision}，实际 ${viewState.revision}`);
        }
        viewState.config = mutation(viewState.config);
        viewState.revision += 1;
      }
    }

    class ComprehensiveAgentService extends HomepageAgentService {
      override async createSection(input: Parameters<HomepageAgentService["createSection"]>[0]) {
        if (layoutState.revision !== input.expectedLayoutRevision) {
          throw new Error(`并发冲突：layoutRevision ${input.expectedLayoutRevision} vs ${layoutState.revision}`);
        }
        if (viewState.revision !== input.expectedViewRevision) {
          throw new Error(`并发冲突：viewRevision ${input.expectedViewRevision} vs ${viewState.revision}`);
        }
        const currentSections = viewState.config.componentSections as any[];
        const secId = input.sectionId ?? `section-${Date.now()}`;
        const nextSections = [...currentSections, { id: secId, name: input.name, createdAt: Date.now(), updatedAt: Date.now() }];
        viewState.config.componentSections = nextSections;
        viewState.revision += 1;
        layoutState.revision += 1;
        const profile = layoutState.layout.profiles!["device-comprehensive"];
        profile.sections = { ...(profile.sections ?? {}), [secId]: { widgetIds: [] } };
        const verified = await this.listSections("desktop-homepage");
        this.dispatchRefresh("desktop-homepage", {
          reason: "sections-updated",
          affectedSectionIds: [secId],
          layoutRevision: layoutState.revision,
          viewRevision: viewState.revision,
        });
        return { ...verified, changed: true, createdSectionId: secId };
      }

      override async renameSection(input: Parameters<HomepageAgentService["renameSection"]>[0]) {
        if (layoutState.revision !== input.expectedLayoutRevision) {
          throw new Error(`并发冲突：layoutRevision ${input.expectedLayoutRevision} vs ${layoutState.revision}`);
        }
        if (viewState.revision !== input.expectedViewRevision) {
          throw new Error(`并发冲突：viewRevision ${input.expectedViewRevision} vs ${viewState.revision}`);
        }
        const currentSections = viewState.config.componentSections as any[];
        const target = currentSections.find((s) => s.id === input.sectionId);
        if (!target) throw new Error("目标分栏不存在");
        if (target.name !== input.expectedSectionName) throw new Error("预期分栏名不匹配");
        target.name = input.name;
        target.updatedAt = Date.now();
        viewState.revision += 1;
        const verified = await this.listSections("desktop-homepage");
        this.dispatchRefresh("desktop-homepage", {
          reason: "sections-updated",
          affectedSectionIds: [input.sectionId],
          layoutRevision: layoutState.revision,
          viewRevision: viewState.revision,
        });
        return { ...verified, changed: true };
      }

      override async reorderSections(input: Parameters<HomepageAgentService["reorderSections"]>[0]) {
        if (layoutState.revision !== input.expectedLayoutRevision) {
          throw new Error(`并发冲突：layoutRevision ${input.expectedLayoutRevision} vs ${layoutState.revision}`);
        }
        if (viewState.revision !== input.expectedViewRevision) {
          throw new Error(`并发冲突：viewRevision ${input.expectedViewRevision} vs ${viewState.revision}`);
        }
        const currentSections = viewState.config.componentSections as any[];
        const ordered = input.orderedSectionIds.map((id) => currentSections.find((s) => s.id === id)!);
        viewState.config.componentSections = ordered;
        viewState.revision += 1;
        layoutState.revision += 1;
        const verified = await this.listSections("desktop-homepage");
        this.dispatchRefresh("desktop-homepage", {
          reason: "sections-updated",
          layoutRevision: layoutState.revision,
          viewRevision: viewState.revision,
        });
        return { ...verified, changed: true };
      }

      override async setActiveSection(input: Parameters<HomepageAgentService["setActiveSection"]>[0]) {
        if (layoutState.revision !== input.expectedLayoutRevision) {
          throw new Error(`并发冲突：layoutRevision ${input.expectedLayoutRevision} vs ${layoutState.revision}`);
        }
        layoutState.layout.profiles!["device-comprehensive"].activeSectionId = input.sectionId;
        layoutState.revision += 1;
        const verified = await this.getLayout("desktop-homepage");
        this.dispatchRefresh("desktop-homepage", {
          reason: "active-section-updated",
          affectedSectionIds: [input.sectionId],
          layoutRevision: layoutState.revision,
        });
        return { ...verified, changed: true };
      }

      override async setSectionMode(input: Parameters<HomepageAgentService["setSectionMode"]>[0]) {
        if (layoutState.revision !== input.expectedLayoutRevision) {
          throw new Error(`并发冲突：layoutRevision ${input.expectedLayoutRevision} vs ${layoutState.revision}`);
        }
        if (viewState.revision !== input.expectedViewRevision) {
          throw new Error(`并发冲突：viewRevision ${input.expectedViewRevision} vs ${viewState.revision}`);
        }
        layoutState.layout.profiles!["device-comprehensive"].componentSectionsModeEnabled = input.enabled;
        viewState.config.componentSectionsEnabled = input.enabled;
        layoutState.revision += 1;
        viewState.revision += 1;
        const verified = await this.listSections("desktop-homepage");
        this.dispatchRefresh("desktop-homepage", {
          reason: "sections-updated",
          layoutRevision: layoutState.revision,
          viewRevision: viewState.revision,
        });
        return { ...verified, changed: true };
      }

      override async removeSection(input: Parameters<HomepageAgentService["removeSection"]>[0]) {
        if (layoutState.revision !== input.expectedLayoutRevision) {
          throw new Error(`并发冲突：layoutRevision ${input.expectedLayoutRevision} vs ${layoutState.revision}`);
        }
        if (viewState.revision !== input.expectedViewRevision) {
          throw new Error(`并发冲突：viewRevision ${input.expectedViewRevision} vs ${viewState.revision}`);
        }
        const currentSections = viewState.config.componentSections as any[];
        const target = currentSections.find((s) => s.id === input.sectionId);
        if (!target) throw new Error("目标分栏不存在");
        if (target.name !== input.expectedSectionName) throw new Error("预期分栏名不匹配");
        viewState.config.componentSections = currentSections.filter((s) => s.id !== input.sectionId);
        const profile = layoutState.layout.profiles!["device-comprehensive"];
        if (profile.sections?.[input.sectionId]) {
          delete profile.sections[input.sectionId];
        }
        layoutState.revision += 1;
        viewState.revision += 1;
        const verified = await this.listSections("desktop-homepage");
        this.dispatchRefresh("desktop-homepage", {
          reason: "sections-updated",
          affectedSectionIds: [input.sectionId],
          layoutRevision: layoutState.revision,
          viewRevision: viewState.revision,
        });
        return { ...verified, changed: true, removedWidgetCount: 0 };
      }
    }

    const settingsService = new ComprehensiveSettingsService({
      getPlugin: () => ({ isMobile: false }) as any,
    });

    const agentService = new ComprehensiveAgentService({
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
        deleteWidgetFromSurface: async () => ({ status: "success" }) as any,
      },
    });

    console.log("=== Phase B.1: update_settings Baseline -> Mutation -> Readback -> Restore ===");
    const baselineSettings = await settingsService.getSettings();
    assert.equal(baselineSettings.viewRevision, 1);
    assert.equal(baselineSettings.settings.TitleIconEmoji, "1f3e0");

    events.length = 0;
    const settingsMutate = await settingsService.updateSettings({ TitleIconEmoji: "1f680" }, 1);
    assert.equal(settingsMutate.changed, true);
    assert.equal(settingsMutate.viewRevision, 2);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.detail.reason, "settings-updated");

    const readbackSettings1 = await settingsService.getSettings();
    assert.equal(readbackSettings1.viewRevision, 2);
    assert.equal(readbackSettings1.settings.TitleIconEmoji, "1f680");

    events.length = 0;
    const settingsRestore = await settingsService.updateSettings({ TitleIconEmoji: "1f3e0" }, 2);
    assert.equal(settingsRestore.changed, true);
    assert.equal(settingsRestore.viewRevision, 3);
    assert.equal(events.length, 1);

    const readbackSettings2 = await settingsService.getSettings();
    assert.equal(readbackSettings2.viewRevision, 3);
    assert.equal(readbackSettings2.settings.TitleIconEmoji, "1f3e0");
    console.log("update_settings: PASS");

    console.log("=== Phase B.2: update_buttons Baseline -> Mutation -> Readback -> Restore ===");
    const baselineButtons = await settingsService.listButtons();
    assert.equal(baselineButtons.viewRevision, 3);
    assert.equal(baselineButtons.buttons[0]?.checked, true);

    events.length = 0;
    const buttonsMutate = await settingsService.updateButtons([{ op: "toggle", id: 1, checked: false }], 3);
    assert.equal(buttonsMutate.changed, true);
    assert.equal(buttonsMutate.viewRevision, 4);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.detail.reason, "buttons-updated");

    const readbackButtons1 = await settingsService.listButtons();
    assert.equal(readbackButtons1.viewRevision, 4);
    assert.equal(readbackButtons1.buttons[0]?.checked, false);

    events.length = 0;
    const buttonsRestore = await settingsService.updateButtons([{ op: "toggle", id: 1, checked: true }], 4);
    assert.equal(buttonsRestore.changed, true);
    assert.equal(buttonsRestore.viewRevision, 5);
    assert.equal(events.length, 1);

    const readbackButtons2 = await settingsService.listButtons();
    assert.equal(readbackButtons2.viewRevision, 5);
    assert.equal(readbackButtons2.buttons[0]?.checked, true);
    console.log("update_buttons: PASS");

    console.log("=== Phase B.3: create_section (A and B) ===");
    const secBaseline = await agentService.listSections("desktop-homepage");
    assert.equal(secBaseline.layoutRevision, 1);
    assert.equal(secBaseline.viewRevision, 5);
    assert.equal((secBaseline.sections as any[]).length, 2);

    events.length = 0;
    const createA = await agentService.createSection({
      name: sectionAName,
      sectionId: sectionAId,
      expectedLayoutRevision: 1,
      expectedViewRevision: 5,
    });
    assert.equal(createA.changed, true);
    assert.equal(createA.createdSectionId, sectionAId);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.detail.reason, "sections-updated");

    const createB = await agentService.createSection({
      name: sectionBName,
      sectionId: sectionBId,
      expectedLayoutRevision: 2,
      expectedViewRevision: 6,
    });
    assert.equal(createB.changed, true);
    assert.equal(createB.createdSectionId, sectionBId);

    const secRead1 = await agentService.listSections("desktop-homepage");
    assert.equal(secRead1.layoutRevision, 3);
    assert.equal(secRead1.viewRevision, 7);
    const secList1 = secRead1.sections as any[];
    assert.equal(secList1.length, 4);
    assert.equal(secList1.find((s) => s.id === sectionAId)?.widgetCount, 0);
    assert.equal(secList1.find((s) => s.id === sectionBId)?.widgetCount, 0);
    console.log("create_section: PASS");

    console.log("=== Phase B.4: rename_section (A) ===");
    events.length = 0;
    const renameA = await agentService.renameSection({
      sectionId: sectionAId,
      name: sectionARenamed,
      expectedSectionName: sectionAName,
      expectedLayoutRevision: 3,
      expectedViewRevision: 7,
    });
    assert.equal(renameA.changed, true);
    assert.equal(events.length, 1);

    const secRead2 = await agentService.listSections("desktop-homepage");
    assert.equal(secRead2.viewRevision, 8);
    const secList2 = secRead2.sections as any[];
    assert.equal(secList2.find((s) => s.id === sectionAId)?.name, sectionARenamed);
    console.log("rename_section: PASS");

    console.log("=== Phase B.5: reorder_sections (Swap A and B) ===");
    events.length = 0;
    const newOrder = ["section-user-1", "section-user-2", sectionBId, sectionAId];
    const reorderRes = await agentService.reorderSections({
      orderedSectionIds: newOrder,
      expectedLayoutRevision: 3,
      expectedViewRevision: 8,
    });
    assert.equal(reorderRes.changed, true);
    assert.equal(events.length, 1);

    const secRead3 = await agentService.listSections("desktop-homepage");
    assert.equal(secRead3.layoutRevision, 4);
    assert.equal(secRead3.viewRevision, 9);
    const secList3 = secRead3.sections as any[];
    assert.deepEqual(secList3.map((s) => s.id), newOrder);
    console.log("reorder_sections: PASS");

    console.log("=== Phase B.6: set_active_section (Temporary -> Restore) ===");
    events.length = 0;
    const setActiveRes = await agentService.setActiveSection({
      sectionId: sectionBId,
      expectedLayoutRevision: 4,
    });
    assert.equal(setActiveRes.changed, true);

    const layoutRead1 = await agentService.getLayout("desktop-homepage");
    assert.equal(layoutRead1.layoutRevision, 5);
    assert.equal(layoutRead1.activeSectionId, sectionBId);

    const restoreActiveRes = await agentService.setActiveSection({
      sectionId: "section-user-1",
      expectedLayoutRevision: 5,
    });
    assert.equal(restoreActiveRes.changed, true);

    const layoutRead2 = await agentService.getLayout("desktop-homepage");
    assert.equal(layoutRead2.layoutRevision, 6);
    assert.equal(layoutRead2.activeSectionId, "section-user-1");
    console.log("set_active_section: PASS");

    console.log("=== Phase B.7: set_section_mode (Enable -> Restore Disable) ===");
    events.length = 0;
    const setModeRes = await agentService.setSectionMode({
      enabled: true,
      expectedLayoutRevision: 6,
      expectedViewRevision: 9,
    });
    assert.equal(setModeRes.changed, true);
    assert.equal(setModeRes.layoutRevision, 7);
    assert.equal(setModeRes.viewRevision, 10);

    const layoutRead3 = await agentService.getLayout("desktop-homepage");
    assert.equal(layoutRead3.layoutRevision, 7);
    assert.equal(layoutRead3.sectionModeEnabled, true);

    const restoreModeRes = await agentService.setSectionMode({
      enabled: false,
      expectedLayoutRevision: 7,
      expectedViewRevision: 10,
    });
    assert.equal(restoreModeRes.changed, true);
    assert.equal(restoreModeRes.layoutRevision, 8);
    assert.equal(restoreModeRes.viewRevision, 11);

    const layoutRead4 = await agentService.getLayout("desktop-homepage");
    assert.equal(layoutRead4.layoutRevision, 8);
    assert.equal(layoutRead4.sectionModeEnabled, false);
    console.log("set_section_mode: PASS");

    console.log("=== Phase B.8: remove_section (Clean up B then A) ===");
    events.length = 0;
    const removeB = await agentService.removeSection({
      sectionId: sectionBId,
      expectedSectionName: sectionBName,
      expectedWidgetCount: 0,
      expectedLayoutRevision: 8,
      expectedViewRevision: 11,
    });
    assert.equal(removeB.changed, true);
    assert.equal(events.length, 1);

    const removeA = await agentService.removeSection({
      sectionId: sectionAId,
      expectedSectionName: sectionARenamed,
      expectedWidgetCount: 0,
      expectedLayoutRevision: 9,
      expectedViewRevision: 12,
    });
    assert.equal(removeA.changed, true);

    console.log("=== Phase B Final Invariant Checks ===");
    const finalSections = await agentService.listSections("desktop-homepage");
    assert.equal(finalSections.layoutRevision, 10);
    assert.equal(finalSections.viewRevision, 13);
    const finalSecList = finalSections.sections as any[];
    assert.equal(finalSecList.length, 2);
    assert.deepEqual(finalSecList.map((s) => s.id), ["section-user-1", "section-user-2"]);
    assert.deepEqual(finalSecList.map((s) => s.name), ["主要分栏", "次要分栏"]);
    assert.equal(finalSecList.some((s) => s.id.startsWith("nb_agent_section_")), false, "零 disposable section 残留");

    const finalLayout = await agentService.getLayout("desktop-homepage");
    assert.equal(finalLayout.activeSectionId, "section-user-1");
    assert.equal(finalLayout.sectionModeEnabled, false);

    const finalWidgets = await agentService.listWidgets("desktop-homepage");
    const finalWidgetList = finalWidgets.widgets as any[];
    assert.equal(finalWidgetList.length, 3);
    assert.deepEqual(finalWidgetList.map((w) => w.widgetId), ["weather-1", "music-1", "accounting-1"]);

    const finalSettingsResult = await settingsService.getSettings();
    assert.equal(finalSettingsResult.settings.TitleIconEmoji, "1f3e0");

    const finalButtonsResult = await settingsService.listButtons();
    assert.equal(finalButtonsResult.buttons[0]?.checked, true);

    console.log("homepage_manage comprehensive verification: ALL PASS");
  } finally {
    (globalThis as any).window = prevWindow;
    (globalThis as any).CustomEvent = prevCustomEvent;
  }
}

await verifyHomepageManageComprehensive();

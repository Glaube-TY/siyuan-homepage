import type { Plugin } from "siyuan";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewMigrated } from "@/homepage/deviceView/deviceViewMigration";
import {
  createWidgetInstanceConfig,
  createWidgetInstanceId,
  deleteWidgetInstance,
  readWidgetInstanceDocument,
  updateWidgetInstanceConfigExpected,
} from "@/homepage/deviceView/widgetInstanceRepository";
import {
  deleteWidgetFromSurface,
  loadWidgetLayoutSettings,
  normalizeLayoutItems,
  readCoordinatedSnapshotForContext,
  saveLayoutDataForContext,
  syncLayoutAndViewInTransaction,
  validateLayoutViewSectionConsistency,
} from "@/components/utils/widgetBlock/utils/layout-shared";
import { normalizeComponentSections } from "@/homepage/homepageSetting/config";
import type { HomepageAgentReadResult, HomepageAgentSurface } from "./homepage-manage-types";
import {
  getHomepageAgentWidgetDescriptor,
  HOMEPAGE_AGENT_WIDGET_CATALOG,
} from "./homepage-agent-widget-catalog";
import { sanitizeWidgetConfigForAgent } from "./homepage-agent-widget-sanitizer";
import { applyHomepageWidgetPatch, createHomepageWidgetConfig, readHomepageWidgetData, validateAndNormalizeHomepageWidgetPatch } from "./homepage-agent-widget-adapters";
import type { WidgetLayoutData, WidgetLayoutProfileData } from "@/components/utils/widgetBlock/utils/layout-shared";
import { mergeRemovedSectionRangesIntoAdjacentSections, rearrangeGlobalOrderBySections } from "@/components/utils/widgetBlock/utils/layout-section-ops";

export class HomepageAgentServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable = true,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HomepageAgentServiceError";
  }
}

interface HomepageAgentServiceDeps {
  getPlugin(): Plugin;
}

function getProfile(snapshot: Awaited<ReturnType<typeof readCoordinatedSnapshotForContext>>) {
  return snapshot.layout.layout.profiles?.[snapshot.layout.deviceId] ?? null;
}

function normalizeType(config: Record<string, unknown>): string {
  return typeof config.type === "string" ? config.type.trim() : "";
}

function sectionForWidget(
  sections: Record<string, { widgetIds: string[] }> | undefined,
  widgetId: string,
): string | null {
  for (const [sectionId, section] of Object.entries(sections ?? {})) {
    if (section.widgetIds.includes(widgetId)) return sectionId;
  }
  return null;
}

export class HomepageAgentService {
  constructor(private readonly deps: HomepageAgentServiceDeps) {}

  resolveSurface(surface?: HomepageAgentSurface): HomepageAgentSurface {
    if (surface === "desktop-homepage" || surface === "mobile-homepage") return surface;
    return (this.deps.getPlugin() as Plugin & { isMobile?: boolean }).isMobile
      ? "mobile-homepage"
      : "desktop-homepage";
  }

  private async read(surface?: HomepageAgentSurface) {
    const resolvedSurface = this.resolveSurface(surface);
    const plugin = this.deps.getPlugin();
    const context = getCurrentDeviceViewContext(plugin, resolvedSurface);
    try {
      await ensureCurrentDeviceViewMigrated(context);
      const snapshot = await readCoordinatedSnapshotForContext(context);
      return { plugin, context, surface: resolvedSurface, snapshot, profile: getProfile(snapshot) };
    } catch (error) {
      throw new HomepageAgentServiceError(
        "homepage_not_ready",
        error instanceof Error ? error.message : "主页数据暂不可用。",
      );
    }
  }

  async overview(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const sections = normalizeComponentSections(state.snapshot.view?.config.componentSections);
    const sectionModeEnabled = state.profile?.componentSectionsModeEnabled === true;
    const typeCounts: Record<string, number> = {};
    const warnings: string[] = [];
    for (const item of order) {
      const doc = await readWidgetInstanceDocument(state.context, item.id);
      if (!doc) {
        warnings.push(`组件 ${item.id} 的配置缺失`);
        continue;
      }
      const type = normalizeType(doc.config) || "unknown";
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }
    const consistency = state.surface === "desktop-homepage" && state.snapshot.view
      ? validateLayoutViewSectionConsistency(state.snapshot.layout.layout, state.context.scopeId, state.snapshot.view.config)
      : { ok: true as const };
    if (consistency.ok === false) warnings.push(consistency.reason);
    const layoutSettings = state.surface === "desktop-homepage"
      ? await loadWidgetLayoutSettings(state.plugin, {
          sectionsEnabled: sectionModeEnabled,
          sectionId: state.profile?.activeSectionId ?? null,
        }, state.context)
      : null;
    return {
      status: consistency.ok ? "ok" : "degraded",
      surface: state.surface,
      surfaceLabel: state.surface === "desktop-homepage" ? "桌面主页" : "移动主页",
      scopeKind: state.context.isMobileShared ? "mobile-shared" : "current-device",
      layoutRevision: state.snapshot.layout.revision,
      viewRevision: state.snapshot.view?.revision,
      widgetCount: order.length,
      sectionModeEnabled: state.surface === "desktop-homepage" ? sectionModeEnabled : undefined,
      activeSectionId: state.surface === "desktop-homepage" ? state.profile?.activeSectionId ?? null : undefined,
      sections: state.surface === "desktop-homepage"
        ? sections.map((item) => ({ id: item.id, name: item.name, widgetCount: state.profile?.sections?.[item.id]?.widgetIds.length ?? 0 }))
        : undefined,
      widgetLayoutNumber: layoutSettings?.widgetLayoutNumber,
      widgetGap: layoutSettings?.widgetGap,
      widgetTypeCounts: typeCounts,
      safelyWritable: consistency.ok,
      advancedEnabled: Boolean((state.plugin as Plugin & { ADVANCED?: boolean }).ADVANCED),
      warnings,
    };
  }

  async listWidgets(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const sections = normalizeComponentSections(state.snapshot.view?.config.componentSections);
    const sectionNames = new Map(sections.map((item) => [item.id, item.name]));
    const items = await Promise.all(order.map(async (item, index) => {
      const doc = await readWidgetInstanceDocument(state.context, item.id);
      const type = doc ? normalizeType(doc.config) : "unknown";
      const descriptor = getHomepageAgentWidgetDescriptor(type);
      const sectionId = state.surface === "desktop-homepage"
        ? sectionForWidget(state.profile?.sections, item.id)
        : null;
      return {
        widgetId: item.id,
        type,
        label: descriptor?.label ?? (type || "未知组件"),
        index,
        sectionId,
        sectionName: sectionId ? sectionNames.get(sectionId) ?? sectionId : null,
        styleSummary: item.style ? "已配置" : "默认",
        configRevision: doc?.revision ?? null,
        editable: (descriptor?.editableFields.length ?? 0) > 0,
        advancedRequired: descriptor?.advancedRequired ?? false,
        businessCapability: descriptor?.businessCapability ?? { businessTool: null, reason: "unknown_widget_type" },
        warnings: doc ? [] : ["组件配置缺失"],
      };
    }));
    return { status: "ok", surface: state.surface, layoutRevision: state.snapshot.layout.revision, widgets: items };
  }

  async getWidget(surface: HomepageAgentSurface | undefined, widgetId: string, expectedType?: string): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const layoutIndex = order.findIndex((item) => item.id === widgetId);
    if (layoutIndex < 0) throw new HomepageAgentServiceError("widget_not_found", `当前 ${state.surface} 中不存在组件 ${widgetId}。`);
    const doc = await readWidgetInstanceDocument(state.context, widgetId);
    if (!doc) throw new HomepageAgentServiceError("widget_not_found", `组件 ${widgetId} 的配置不存在。`);
    const type = normalizeType(doc.config);
    if (expectedType && expectedType !== type) {
      throw new HomepageAgentServiceError("widget_type_conflict", `组件类型已变化：预期 ${expectedType}，当前为 ${type}。`);
    }
    const descriptor = getHomepageAgentWidgetDescriptor(type);
    const sectionId = state.surface === "desktop-homepage" ? sectionForWidget(state.profile?.sections, widgetId) : null;
    const sectionName = sectionId
      ? normalizeComponentSections(state.snapshot.view?.config.componentSections).find((item) => item.id === sectionId)?.name ?? sectionId
      : null;
    return {
      status: "ok",
      surface: state.surface,
      layoutRevision: state.snapshot.layout.revision,
      widgetId,
      type,
      label: descriptor?.label ?? type,
      configRevision: doc.revision,
      layoutIndex,
      sectionId,
      sectionName,
      safeConfig: sanitizeWidgetConfigForAgent(doc.config),
      editableFields: descriptor?.editableFields ?? [],
      readOnlyFields: ["type", "instanceId", "schema", "version", "revision"],
      unsupportedFields: ["业务数据", "凭据", "本地绝对路径"],
      businessCapability: descriptor?.businessCapability ?? { businessTool: null, reason: "unknown_widget_type" },
      warnings: descriptor ? [] : ["当前组件类型没有 Agent 配置适配器"],
    };
  }

  async listWidgetTypes(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const advancedEnabled = Boolean((state.plugin as Plugin & { ADVANCED?: boolean }).ADVANCED);
    const existing = await this.listWidgets(state.surface);
    const existingTypes = new Set(((existing.widgets as Array<{ type: string }>) ?? []).map((item) => item.type));
    return {
      status: "ok",
      surface: state.surface,
      widgetTypes: HOMEPAGE_AGENT_WIDGET_CATALOG.map((item) => ({
        ...item,
        canAdd: (!item.advancedRequired || advancedEnabled) && (!item.singleton || !existingTypes.has(item.type)),
        canUpdate: item.editableFields.length > 0,
        available: !item.advancedRequired || advancedEnabled,
        lockReason: item.advancedRequired && !advancedEnabled
          ? "advanced_feature_unavailable"
          : item.singleton && existingTypes.has(item.type) ? "singleton_conflict" : null,
        requiredInitialFields: [],
      })),
    };
  }

  async getLayout(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    if (state.surface === "mobile-homepage") {
      return { status: "ok", surface: state.surface, layoutRevision: state.snapshot.layout.revision, widgetCount: order.length, order: order.map((item) => item.id) };
    }
    const sectionModeEnabled = state.profile?.componentSectionsModeEnabled === true;
    const layoutSettings = await loadWidgetLayoutSettings(state.plugin, { sectionsEnabled: sectionModeEnabled, sectionId: state.profile?.activeSectionId ?? null }, state.context);
    return {
      status: "ok", surface: state.surface, layoutRevision: state.snapshot.layout.revision,
      widgetLayoutNumber: layoutSettings.widgetLayoutNumber, widgetGap: layoutSettings.widgetGap,
      sectionModeEnabled, activeSectionId: state.profile?.activeSectionId ?? null,
      widgetCount: order.length, order: order.map((item) => item.id),
    };
  }

  async listSections(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    if (state.surface !== "desktop-homepage") {
      throw new HomepageAgentServiceError("unsupported_surface_action", "移动主页不支持分栏操作。", true, { surface: state.surface });
    }
    if (!state.snapshot.view) throw new HomepageAgentServiceError("view_missing", "桌面主页 view 配置缺失。", false);
    const consistency = validateLayoutViewSectionConsistency(state.snapshot.layout.layout, state.context.scopeId, state.snapshot.view.config);
    const sections = normalizeComponentSections(state.snapshot.view.config.componentSections);
    return {
      status: consistency.ok ? "ok" : "degraded",
      surface: state.surface,
      sectionModeEnabled: state.profile?.componentSectionsModeEnabled === true,
      activeSectionId: state.profile?.activeSectionId ?? null,
      layoutRevision: state.snapshot.layout.revision,
      viewRevision: state.snapshot.view.revision,
      consistent: consistency.ok,
      inconsistencyReason: consistency.ok === false ? consistency.reason : undefined,
      sections: sections.map((section) => ({
        ...section,
        widgetIds: [...(state.profile?.sections?.[section.id]?.widgetIds ?? [])],
        widgetCount: state.profile?.sections?.[section.id]?.widgetIds.length ?? 0,
        widgetLayoutNumber: state.profile?.sections?.[section.id]?.widgetLayoutNumber,
        widgetGap: state.profile?.sections?.[section.id]?.widgetGap,
        active: state.profile?.activeSectionId === section.id,
      })),
    };
  }

  private assertLayoutRevision(actual: number, expected: number): void {
    if (actual !== expected) {
      throw new HomepageAgentServiceError("layout_revision_conflict", `主页布局已变化：预期 revision ${expected}，当前为 ${actual}。`);
    }
  }

  private assertWritableConsistency(state: Awaited<ReturnType<HomepageAgentService["read"]>>): void {
    if (state.surface !== "desktop-homepage") return;
    if (!state.snapshot.view) throw new HomepageAgentServiceError("view_missing", "桌面主页 view 配置缺失，已拒绝写入。", false);
    const consistency = validateLayoutViewSectionConsistency(
      state.snapshot.layout.layout,
      state.context.scopeId,
      state.snapshot.view.config,
    );
    if (consistency.ok === false) {
      throw new HomepageAgentServiceError("layout_inconsistent", `主页布局与分栏配置不一致，已拒绝写入：${consistency.reason}`, false);
    }
  }

  private setOrder(
    layout: WidgetLayoutData,
    scopeId: string,
    order: Array<{ id: string; style: string | null; index: number }>,
    mutateProfile?: (profile: WidgetLayoutProfileData) => WidgetLayoutProfileData,
  ): WidgetLayoutData {
    const normalized = order.map((item, index) => ({ ...item, index }));
    const currentProfile = layout.profiles?.[scopeId] ?? { order: normalized };
    const nextProfile = mutateProfile ? mutateProfile({ ...currentProfile, order: normalized }) : { ...currentProfile, order: normalized };
    return { ...layout, order: normalized, profiles: { ...(layout.profiles ?? {}), [scopeId]: nextProfile } };
  }

  async addWidget(input: {
    surface?: HomepageAgentSurface; widgetType: string; sectionId?: string; position?: number;
    expectedLabel: string; initialConfig?: Record<string, unknown>; expectedLayoutRevision: number;
  }): Promise<HomepageAgentReadResult> {
    const state = await this.read(input.surface);
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    const descriptor = getHomepageAgentWidgetDescriptor(input.widgetType);
    if (!descriptor || !descriptor.supportedSurfaces.includes(state.surface)) throw new HomepageAgentServiceError("widget_type_unsupported", `当前主页不支持组件 ${input.widgetType}。`);
    if (descriptor.label !== input.expectedLabel) throw new HomepageAgentServiceError("widget_type_conflict", `组件名称已变化：预期 ${input.expectedLabel}，当前为 ${descriptor.label}。`);
    if (descriptor.advancedRequired && !(state.plugin as Plugin & { ADVANCED?: boolean }).ADVANCED) throw new HomepageAgentServiceError("advanced_feature_unavailable", `组件 ${descriptor.label} 需要高级功能。`);
    const currentOrder = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    if (descriptor.singleton) {
      for (const item of currentOrder) {
        const doc = await readWidgetInstanceDocument(state.context, item.id);
        if (doc && normalizeType(doc.config) === input.widgetType) throw new HomepageAgentServiceError("singleton_conflict", `${descriptor.label} 在当前主页只能存在一个。`);
      }
    }
    const widgetId = createWidgetInstanceId();
    const config = createHomepageWidgetConfig(input.widgetType, widgetId, input.initialConfig ?? {}, { advancedEnabled: Boolean((state.plugin as Plugin & { ADVANCED?: boolean }).ADVANCED) });
    const created = await createWidgetInstanceConfig(state.context, widgetId, config);
    let layoutCommitted = false;
    try {
      const position = Math.max(0, Math.min(Math.trunc(input.position ?? currentOrder.length), currentOrder.length));
      const nextOrder = [...currentOrder];
      nextOrder.splice(position, 0, { id: widgetId, style: null, index: position });
      let committedOrder = nextOrder;
      let committedSections: WidgetLayoutProfileData["sections"] | undefined;
      let targetSectionId: string | null = null;
      if (state.surface === "desktop-homepage" && state.profile?.componentSectionsModeEnabled === true) {
        targetSectionId = input.sectionId ?? state.profile.activeSectionId ?? null;
        if (!targetSectionId || !state.profile.sections?.[targetSectionId]) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在或当前活动分栏无效。");
        const sections = Object.fromEntries(Object.entries(state.profile.sections).map(([id, section]) => [id, { ...section, widgetIds: section.widgetIds.filter((value) => value !== widgetId) }]));
        sections[targetSectionId] = { ...sections[targetSectionId], widgetIds: [...sections[targetSectionId].widgetIds, widgetId] };
        const sectionIds = normalizeComponentSections(state.snapshot.view?.config.componentSections).map((item) => item.id);
        const arranged = rearrangeGlobalOrderBySections(nextOrder, sections, sectionIds, { assignOrphansToFirstSection: true });
        committedOrder = arranged.nextGlobalOrder;
        committedSections = arranged.nextSections;
      }
      const nextLayout = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, committedOrder, (profile) => committedSections ? { ...profile, sections: committedSections } : profile);
      await saveLayoutDataForContext(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
      layoutCommitted = true;
    } catch (error) {
      const latest = await readWidgetInstanceDocument(state.context, widgetId).catch(() => null);
      if (!layoutCommitted && latest?.revision === created.revision) {
        const rolledBack = await deleteWidgetInstance(state.context, widgetId, latest.revision).then(() => true).catch(() => false);
        if (!rolledBack) throw new HomepageAgentServiceError("write_state_uncertain", "组件布局提交失败，且新建配置无法安全回滚，请人工检查。", false, { orphanWidgetId: widgetId });
      } else if (!layoutCommitted && latest) {
        throw new HomepageAgentServiceError("write_state_uncertain", "组件布局提交失败，但新建配置已发生变化，未自动删除，请人工检查。", false, { orphanWidgetId: widgetId, configRevision: latest.revision });
      }
      throw error;
    }
    const verified = await this.getWidget(state.surface, widgetId, input.widgetType);
    const verifiedDocument = await readWidgetInstanceDocument(state.context, widgetId);
    if (!verifiedDocument || verifiedDocument.config.instanceId !== widgetId) throw new HomepageAgentServiceError("write_not_committed", "组件已创建，但实例配置写后验证失败。", false);
    if (state.surface === "desktop-homepage" && state.profile?.componentSectionsModeEnabled === true) {
      const expectedSectionId = input.sectionId ?? state.profile.activeSectionId ?? null;
      if (verified.sectionId !== expectedSectionId) throw new HomepageAgentServiceError("write_not_committed", "组件已创建，但分栏归属写后验证失败。", false);
    }
    this.dispatchRefresh(state.surface);
    return { ...verified, finalIndex: verified.layoutIndex, changed: true, summary: `已添加${descriptor.label}` };
  }

  async updateWidget(input: {
    surface?: HomepageAgentSurface; widgetId: string; expectedType: string; expectedWidgetRevision: number;
    expectedLayoutRevision?: number; expectedValues: Record<string, unknown>; patch: Record<string, unknown>;
  }): Promise<HomepageAgentReadResult> {
    const state = await this.read(input.surface);
    this.assertWritableConsistency(state);
    if (input.expectedLayoutRevision !== undefined) this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    const current = await readWidgetInstanceDocument(state.context, input.widgetId);
    if (!current) throw new HomepageAgentServiceError("widget_not_found", `组件 ${input.widgetId} 不存在。`);
    const type = normalizeType(current.config);
    if (type !== input.expectedType) throw new HomepageAgentServiceError("widget_type_conflict", `组件类型已变化：预期 ${input.expectedType}，当前为 ${type}。`);
    if (current.revision !== input.expectedWidgetRevision) throw new HomepageAgentServiceError("widget_revision_conflict", `组件配置已变化：预期 revision ${input.expectedWidgetRevision}，当前为 ${current.revision}。`);
    const advancedEnabled = Boolean((state.plugin as Plugin & { ADVANCED?: boolean }).ADVANCED);
    let expectedValues: Record<string, unknown>;
    try {
      expectedValues = validateAndNormalizeHomepageWidgetPatch(type, input.expectedValues, { advancedEnabled });
      const patchKeys = Object.keys(input.patch).sort();
      const expectedKeys = Object.keys(expectedValues).sort();
      if (JSON.stringify(patchKeys) !== JSON.stringify(expectedKeys)) throw new Error("expectedValues 必须与 patch 包含相同字段");
    } catch (error) {
      throw new HomepageAgentServiceError("invalid_widget_patch", error instanceof Error ? error.message : "expectedValues 无效。");
    }
    const currentData = readHomepageWidgetData(current.config);
    if (Object.entries(expectedValues).some(([key, value]) => JSON.stringify(currentData[key] ?? null) !== JSON.stringify(value ?? null))) {
      throw new HomepageAgentServiceError("widget_revision_conflict", "组件目标字段已与预期值不一致，请重新读取组件配置。");
    }
    try {
      await updateWidgetInstanceConfigExpected(state.context, input.widgetId, input.expectedWidgetRevision, (config) => applyHomepageWidgetPatch(config, type, input.patch, { advancedEnabled }));
    } catch (error) {
      if (error instanceof HomepageAgentServiceError) throw error;
      throw new HomepageAgentServiceError("invalid_widget_patch", error instanceof Error ? error.message : "组件 patch 无效。");
    }
    const verified = await this.getWidget(state.surface, input.widgetId, type);
    if (Number(verified.configRevision) <= input.expectedWidgetRevision) throw new HomepageAgentServiceError("write_not_committed", "组件 revision 未增长，写后验证失败。", false);
    const verifiedDocument = await readWidgetInstanceDocument(state.context, input.widgetId);
    const verifiedData = verifiedDocument ? readHomepageWidgetData(verifiedDocument.config) : null;
    const normalizedPatch = validateAndNormalizeHomepageWidgetPatch(type, input.patch, { advancedEnabled });
    if (!verifiedData || Object.entries(normalizedPatch).some(([key, value]) => JSON.stringify(verifiedData[key] ?? null) !== JSON.stringify(value ?? null))) {
      throw new HomepageAgentServiceError("write_not_committed", "组件目标字段写后验证失败。", false);
    }
    this.dispatchRefresh(state.surface);
    return { ...verified, changed: true, summary: "组件展示配置已更新" };
  }

  async moveWidget(input: {
    surface?: HomepageAgentSurface; widgetId: string; expectedType: string; targetIndex: number;
    expectedIndex: number; expectedSectionId: string | null; targetSectionId?: string; expectedLayoutRevision: number;
  }): Promise<HomepageAgentReadResult> {
    const state = await this.read(input.surface);
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    const doc = await readWidgetInstanceDocument(state.context, input.widgetId);
    if (!doc) throw new HomepageAgentServiceError("widget_not_found", `组件 ${input.widgetId} 不存在。`);
    if (normalizeType(doc.config) !== input.expectedType) throw new HomepageAgentServiceError("widget_type_conflict", "组件类型与预期不一致。");
    const currentOrder = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const currentIndex = currentOrder.findIndex((value) => value.id === input.widgetId);
    const currentSectionId = state.surface === "desktop-homepage" && state.profile?.componentSectionsModeEnabled === true
      ? sectionForWidget(state.profile.sections, input.widgetId)
      : null;
    if (currentIndex !== input.expectedIndex || currentSectionId !== input.expectedSectionId) throw new HomepageAgentServiceError("layout_revision_conflict", "组件当前位置或分栏已变化，请重新读取主页布局。");
    const item = currentOrder.find((value) => value.id === input.widgetId);
    if (!item) throw new HomepageAgentServiceError("widget_not_found", "组件不在当前主页布局中。");
    const without = currentOrder.filter((value) => value.id !== input.widgetId);
    const targetIndex = Math.max(0, Math.min(Math.trunc(input.targetIndex), without.length));
    without.splice(targetIndex, 0, item);
    let committedOrder = without;
    let committedSections: WidgetLayoutProfileData["sections"] | undefined;
    let expectedSectionId: string | null = null;
    if (state.surface === "desktop-homepage" && state.profile?.componentSectionsModeEnabled === true) {
      const currentSection = sectionForWidget(state.profile.sections, input.widgetId);
      expectedSectionId = input.targetSectionId ?? currentSection;
      if (!expectedSectionId || !state.profile.sections?.[expectedSectionId]) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
      const sections = Object.fromEntries(Object.entries(state.profile.sections).map(([id, section]) => [id, { ...section, widgetIds: section.widgetIds.filter((value) => value !== input.widgetId) }]));
      sections[expectedSectionId] = { ...sections[expectedSectionId], widgetIds: [...sections[expectedSectionId].widgetIds, input.widgetId] };
      const sectionIds = normalizeComponentSections(state.snapshot.view?.config.componentSections).map((section) => section.id);
      const arranged = rearrangeGlobalOrderBySections(without, sections, sectionIds, { assignOrphansToFirstSection: true });
      committedOrder = arranged.nextGlobalOrder;
      committedSections = arranged.nextSections;
    }
    const nextLayout = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, committedOrder, (profile) => committedSections ? { ...profile, sections: committedSections } : profile);
    await saveLayoutDataForContext(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verified = await this.listWidgets(state.surface);
    const widgets = (verified.widgets as Array<{ widgetId: string; index: number; sectionId: string | null }> | undefined) ?? [];
    if (widgets.some((row, index) => row.index !== index) || new Set(widgets.map((row) => row.widgetId)).size !== widgets.length) throw new HomepageAgentServiceError("write_not_committed", "组件顺序写后验证失败。", false);
    const moved = widgets.find((row) => row.widgetId === input.widgetId);
    if (!moved || (expectedSectionId !== null && moved.sectionId !== expectedSectionId)) throw new HomepageAgentServiceError("write_not_committed", "组件位置或分栏归属写后验证失败。", false);
    this.dispatchRefresh(state.surface);
    return { ...verified, changed: true, movedWidgetId: input.widgetId, finalIndex: moved.index, sectionId: moved.sectionId };
  }

  async removeWidget(input: {
    surface?: HomepageAgentSurface; widgetId: string; expectedType: string;
    expectedWidgetRevision: number; expectedLayoutRevision: number; expectedIndex: number; expectedSectionId: string | null; expectedLabel: string;
  }): Promise<HomepageAgentReadResult> {
    const state = await this.read(input.surface);
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    const doc = await readWidgetInstanceDocument(state.context, input.widgetId);
    if (!doc) throw new HomepageAgentServiceError("widget_not_found", `组件 ${input.widgetId} 不存在。`);
    if (doc.revision !== input.expectedWidgetRevision) throw new HomepageAgentServiceError("widget_revision_conflict", "组件配置 revision 已变化。");
    if (normalizeType(doc.config) !== input.expectedType) throw new HomepageAgentServiceError("widget_type_conflict", "组件类型与预期不一致。");
    const descriptor = getHomepageAgentWidgetDescriptor(input.expectedType);
    if (!descriptor || descriptor.label !== input.expectedLabel) throw new HomepageAgentServiceError("widget_type_conflict", "组件名称与预期不一致。");
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const currentIndex = order.findIndex((item) => item.id === input.widgetId);
    const currentSectionId = state.surface === "desktop-homepage" && state.profile?.componentSectionsModeEnabled === true
      ? sectionForWidget(state.profile.sections, input.widgetId)
      : null;
    if (currentIndex !== input.expectedIndex || currentSectionId !== input.expectedSectionId) throw new HomepageAgentServiceError("layout_revision_conflict", "组件当前位置或分栏已变化，请重新读取主页布局。");
    const result = await deleteWidgetFromSurface(state.context, input.widgetId, {
      expectedLayoutRevision: input.expectedLayoutRevision,
      expectedWidgetRevision: input.expectedWidgetRevision,
    });
    if (result.status === "notCommitted") throw new HomepageAgentServiceError("write_not_committed", result.reason ?? "组件未被移除。");
    if (result.status === "uncertainManualCheck") throw new HomepageAgentServiceError("write_state_uncertain", result.reason ?? "组件删除状态不确定。", false);
    this.dispatchRefresh(state.surface);
    const warning = result.status === "layoutCommittedConfigRetained" ? result.warning : undefined;
    return { status: result.status === "success" ? "ok" : "degraded", surface: state.surface, changed: true, target: { widgetId: input.widgetId, type: input.expectedType }, summary: result.status === "success" ? "组件已从主页移除" : "组件已从布局移除，但配置因安全原因保留", warnings: warning ? [warning] : [] };
  }

  async updateLayout(input: { surface?: HomepageAgentSurface; widgetLayoutNumber: number; widgetGap: number; expectedWidgetLayoutNumber: number; expectedWidgetGap: number; sectionId?: string; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.read(input.surface);
    if (state.surface !== "desktop-homepage") throw new HomepageAgentServiceError("unsupported_surface_action", "移动主页不支持修改桌面列数和间距。");
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    if (!Number.isInteger(input.widgetLayoutNumber) || input.widgetLayoutNumber < 1 || input.widgetLayoutNumber > 12) throw new HomepageAgentServiceError("invalid_widget_patch", "主页列数必须是 1 到 12 的整数。");
    if (!Number.isFinite(input.widgetGap) || input.widgetGap < 0 || input.widgetGap > 200) throw new HomepageAgentServiceError("invalid_widget_patch", "主页间距必须是 0 到 200 的有限数字。");
    const currentSettings = await loadWidgetLayoutSettings(state.plugin, {
      sectionsEnabled: state.profile?.componentSectionsModeEnabled === true,
      sectionId: input.sectionId ?? state.profile?.activeSectionId ?? null,
    }, state.context);
    if (currentSettings.widgetLayoutNumber !== input.expectedWidgetLayoutNumber || currentSettings.widgetGap !== input.expectedWidgetGap) {
      throw new HomepageAgentServiceError("layout_revision_conflict", `主页布局值已变化：当前为 ${currentSettings.widgetLayoutNumber} 列、间距 ${currentSettings.widgetGap}。`);
    }
    const profile = state.profile ?? { order: normalizeLayoutItems(state.snapshot.layout.layout.order) };
    const nextLayout = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, normalizeLayoutItems(profile.order), (current) => {
      if (current.componentSectionsModeEnabled === true) {
        const sectionId = input.sectionId ?? current.activeSectionId;
        if (!sectionId || !current.sections?.[sectionId]) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
        return { ...current, sections: { ...current.sections, [sectionId]: { ...current.sections[sectionId], widgetLayoutNumber: input.widgetLayoutNumber, widgetGap: input.widgetGap } } };
      }
      return { ...current, widgetLayoutNumber: input.widgetLayoutNumber, widgetGap: input.widgetGap };
    });
    await saveLayoutDataForContext(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSettings = await loadWidgetLayoutSettings(state.plugin, {
      sectionsEnabled: state.profile?.componentSectionsModeEnabled === true,
      sectionId: input.sectionId ?? state.profile?.activeSectionId ?? null,
    }, state.context);
    if (verifiedSettings.widgetLayoutNumber !== input.widgetLayoutNumber || verifiedSettings.widgetGap !== input.widgetGap) throw new HomepageAgentServiceError("write_not_committed", "主页列数或间距写后验证失败。", false);
    const verified = await this.getLayout(state.surface);
    this.dispatchRefresh(state.surface);
    return { ...verified, changed: true };
  }

  private async sectionWriteState(expectedLayoutRevision: number, expectedViewRevision: number) {
    const state = await this.read("desktop-homepage");
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, expectedLayoutRevision);
    if (!state.snapshot.view) throw new HomepageAgentServiceError("view_missing", "桌面主页 view 配置缺失。", false);
    if (state.snapshot.view.revision !== expectedViewRevision) throw new HomepageAgentServiceError("view_revision_conflict", `主页设置已变化：预期 revision ${expectedViewRevision}，当前为 ${state.snapshot.view.revision}。`);
    const consistency = validateLayoutViewSectionConsistency(state.snapshot.layout.layout, state.context.scopeId, state.snapshot.view.config);
    if (consistency.ok === false) throw new HomepageAgentServiceError("section_inconsistent", consistency.reason, false);
    return state;
  }

  async createSection(input: { name: string; sectionId?: string; position?: number; expectedLayoutRevision: number; expectedViewRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision, input.expectedViewRevision);
    const name = input.name.trim();
    if (!name || name.length > 60) throw new HomepageAgentServiceError("invalid_widget_patch", "分栏名称必须为 1 到 60 个字符。");
    const currentSections = normalizeComponentSections(state.snapshot.view!.config.componentSections);
    const sectionId = (input.sectionId?.trim() || `section-${globalThis.crypto.randomUUID().slice(0, 8)}`).toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(sectionId) || currentSections.some((item) => item.id === sectionId)) throw new HomepageAgentServiceError("invalid_section_order", "分栏 ID 无效或已存在。");
    const position = Math.max(0, Math.min(Math.trunc(input.position ?? currentSections.length), currentSections.length));
    const now = Date.now();
    const nextViewSections = [...currentSections]; nextViewSections.splice(position, 0, { id: sectionId, name, createdAt: now, updatedAt: now });
    await syncLayoutAndViewInTransaction(state.context, (layout) => this.setOrder(layout, state.context.scopeId, normalizeLayoutItems(state.profile?.order ?? layout.order), (profile) => {
      const sections = { ...(profile.sections ?? {}) };
      const ordered: Record<string, typeof sections[string]> = {};
      for (const item of nextViewSections) ordered[item.id] = item.id === sectionId ? { widgetIds: [] } : sections[item.id];
      return { ...profile, sections: ordered };
    }), (config) => ({ ...config, componentSections: nextViewSections }), state.snapshot);
    this.dispatchRefresh("desktop-homepage");
    return { ...(await this.listSections("desktop-homepage")), changed: true, createdSectionId: sectionId };
  }

  async renameSection(input: { sectionId: string; name: string; expectedSectionName: string; expectedLayoutRevision: number; expectedViewRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision, input.expectedViewRevision);
    const sections = normalizeComponentSections(state.snapshot.view!.config.componentSections);
    const target = sections.find((item) => item.id === input.sectionId);
    if (!target) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    if (target.name !== input.expectedSectionName) throw new HomepageAgentServiceError("view_revision_conflict", "分栏名称与预期不一致。");
    const name = input.name.trim(); if (!name || name.length > 60) throw new HomepageAgentServiceError("invalid_widget_patch", "分栏名称必须为 1 到 60 个字符。");
    const next = sections.map((item) => item.id === input.sectionId ? { ...item, name, updatedAt: Date.now() } : item);
    await syncLayoutAndViewInTransaction(state.context, (layout) => layout, (config) => ({ ...config, componentSections: next }), state.snapshot);
    this.dispatchRefresh("desktop-homepage");
    return { ...(await this.listSections("desktop-homepage")), changed: true };
  }

  async reorderSections(input: { orderedSectionIds: string[]; expectedLayoutRevision: number; expectedViewRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision, input.expectedViewRevision);
    const sections = normalizeComponentSections(state.snapshot.view!.config.componentSections);
    const currentIds = sections.map((item) => item.id);
    if (new Set(input.orderedSectionIds).size !== currentIds.length || input.orderedSectionIds.length !== currentIds.length || input.orderedSectionIds.some((id) => !currentIds.includes(id))) throw new HomepageAgentServiceError("invalid_section_order", "orderedSectionIds 必须无重复地包含全部现有分栏。");
    const nextView = input.orderedSectionIds.map((id) => sections.find((item) => item.id === id)!);
    await syncLayoutAndViewInTransaction(state.context, (layout) => {
      const profile = layout.profiles?.[state.context.scopeId]; if (!profile) return layout;
      const arranged = rearrangeGlobalOrderBySections(normalizeLayoutItems(profile.order ?? layout.order), profile.sections ?? {}, input.orderedSectionIds, { assignOrphansToFirstSection: true });
      return this.setOrder(layout, state.context.scopeId, arranged.nextGlobalOrder, (current) => ({ ...current, sections: arranged.nextSections }));
    }, (config) => ({ ...config, componentSections: nextView }), state.snapshot);
    this.dispatchRefresh("desktop-homepage");
    return { ...(await this.listSections("desktop-homepage")), changed: true };
  }

  async removeSection(input: { sectionId: string; expectedSectionName: string; expectedWidgetCount: number; expectedReceivingSectionId?: string | null; expectedLayoutRevision: number; expectedViewRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision, input.expectedViewRevision);
    const viewSections = normalizeComponentSections(state.snapshot.view!.config.componentSections);
    const target = viewSections.find((item) => item.id === input.sectionId);
    if (!target) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    if (target.name !== input.expectedSectionName) throw new HomepageAgentServiceError("view_revision_conflict", "分栏名称与预期不一致。");
    const targetWidgetCount = state.profile?.sections?.[input.sectionId]?.widgetIds.length ?? 0;
    if (targetWidgetCount !== input.expectedWidgetCount) throw new HomepageAgentServiceError("layout_revision_conflict", "分栏内组件数量已变化，请重新读取。");
    const remaining = viewSections.filter((item) => item.id !== input.sectionId);
    const previewMerged = mergeRemovedSectionRangesIntoAdjacentSections(normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order), state.profile?.sections ?? {}, viewSections.map((item) => item.id), [input.sectionId]);
    const receivingSectionId = previewMerged.receivingSectionByRemoved.get(input.sectionId) ?? null;
    if (input.expectedReceivingSectionId !== undefined && input.expectedReceivingSectionId !== receivingSectionId) throw new HomepageAgentServiceError("layout_revision_conflict", "分栏接收目标已变化，请重新读取。");
    await syncLayoutAndViewInTransaction(state.context, (layout) => {
      const profile = layout.profiles?.[state.context.scopeId]; if (!profile) return layout;
      const merged = mergeRemovedSectionRangesIntoAdjacentSections(normalizeLayoutItems(profile.order ?? layout.order), profile.sections ?? {}, viewSections.map((item) => item.id), [input.sectionId]);
      const activeSectionId = profile.activeSectionId === input.sectionId ? merged.receivingSectionByRemoved.get(input.sectionId) : profile.activeSectionId;
      return this.setOrder(layout, state.context.scopeId, merged.nextGlobalOrder, (current) => ({ ...current, sections: merged.nextSections, activeSectionId, componentSectionsModeEnabled: remaining.length > 0 && current.componentSectionsModeEnabled === true }));
    }, (config) => ({ ...config, componentSections: remaining, componentSectionsEnabled: remaining.length > 0 && config.componentSectionsEnabled === true }), state.snapshot);
    this.dispatchRefresh("desktop-homepage");
    return { ...(await this.listSections("desktop-homepage")), changed: true, removedWidgetCount: targetWidgetCount, receivingSectionId };
  }

  async setSectionMode(input: { enabled: boolean; expectedLayoutRevision: number; expectedViewRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision, input.expectedViewRevision);
    const sections = normalizeComponentSections(state.snapshot.view!.config.componentSections);
    if (input.enabled && sections.length === 0) throw new HomepageAgentServiceError("section_not_found", "至少需要一个合法分栏才能开启分栏模式。");
    await syncLayoutAndViewInTransaction(state.context, (layout) => {
      const order = normalizeLayoutItems(state.profile?.order ?? layout.order);
      return this.setOrder(layout, state.context.scopeId, order, (profile) => {
        if (!input.enabled) return { ...profile, componentSectionsModeEnabled: false };
        const sectionIds = sections.map((item) => item.id);
        const arranged = rearrangeGlobalOrderBySections(order, profile.sections ?? {}, sectionIds, { assignOrphansToFirstSection: true });
        return { ...profile, order: arranged.nextGlobalOrder, sections: arranged.nextSections, activeSectionId: profile.activeSectionId && sectionIds.includes(profile.activeSectionId) ? profile.activeSectionId : sectionIds[0], componentSectionsModeEnabled: true };
      });
    }, (config) => ({ ...config, componentSectionsEnabled: input.enabled }), state.snapshot);
    this.dispatchRefresh("desktop-homepage");
    return { ...(await this.listSections("desktop-homepage")), changed: true };
  }

  async setActiveSection(input: { sectionId: string; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.read("desktop-homepage");
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    if (state.profile?.componentSectionsModeEnabled !== true) throw new HomepageAgentServiceError("section_mode_disabled", "当前未开启分栏模式。");
    if (!state.profile.sections?.[input.sectionId]) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    const next = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, normalizeLayoutItems(state.profile.order), (profile) => ({ ...profile, activeSectionId: input.sectionId }));
    await saveLayoutDataForContext(state.context, next, { expectedRevision: input.expectedLayoutRevision });
    this.dispatchRefresh("desktop-homepage");
    return { ...(await this.listSections("desktop-homepage")), changed: true };
  }

  private dispatchRefresh(surface: HomepageAgentSurface): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("homepage-settings-saved", { detail: { source: "agent", surface } }));
  }
}

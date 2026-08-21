import type { Plugin } from "siyuan";
import { isHomepageEntitlementGranted } from "@/features/entitlement/homepage-entitlement";
import { createRuntimeUuid } from "@/libs/runtime-id";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewReady } from "@/homepage/deviceView/deviceViewReadiness";
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
  type DeleteWidgetResult,
  type WidgetLayoutData,
  type WidgetLayoutProfileData,
} from "@/components/utils/widgetBlock/utils/layout-shared";
import {
  mergeRemovedSectionRangesIntoAdjacentSections,
  rearrangeGlobalOrderBySections,
} from "@/components/utils/widgetBlock/utils/layout-section-ops";
import {
  dispatchHomepageAgentStorageChanged,
  type HomepageAgentStorageChangeReason,
} from "@/homepage/deviceView/deviceViewEvents";
import type { DeviceViewContext, DeviceWidgetDocument } from "@/homepage/deviceView/deviceViewTypes";
import {
  assertDesktopHomepageLayoutInvariants,
  deriveDesktopHomepageSectionsFromLayout,
} from "@/homepage/deviceView/desktopHomepageSectionModel";
import {
    createDeviceViewBlockedError,
    DeviceViewAccessBlockedError,
    getSafeDeviceViewErrorMessage,
} from "@/homepage/deviceView/deviceViewErrors";
import type { HomepageAgentReadResult, HomepageAgentSurface, HomepageWidgetResolutionStatus } from "./homepage-manage-types";
import { getHomepageAgentWidgetDescriptor, HOMEPAGE_AGENT_WIDGET_CATALOG } from "./homepage-agent-widget-catalog";
import type { HomepageBusinessCapability } from "./homepage-agent-business-capabilities";
import {
  computeOverviewCounts,
  missingConfigWarningText,
  surfaceCategoryId,
  surfaceCategoryLabel,
  surfaceCategorySource,
} from "./homepage-agent-surface-resolution";
import { isSecurityRedactedValue, sanitizeWidgetConfigForAgent } from "./homepage-agent-widget-sanitizer";
import { applyHomepageWidgetPatch, createHomepageWidgetConfig, readHomepageWidgetData, validateAndNormalizeHomepageWidgetPatch } from "./homepage-agent-widget-adapters";
import {
  applyWidgetStylePatch,
  readWidgetStyle,
  type WidgetStylePatch,
} from "@/homepage/theme/widgetAppearance/widgetAppearanceCompat";

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

/**
 * 设备视图访问操作集合。生产环境使用默认实现；测试可通过 HomepageAgentServiceDeps.deviceView 注入内存假实现。
 */
export interface HomepageAgentDeviceViewOps {
  getContext(plugin: Plugin, surface: HomepageAgentSurface): DeviceViewContext;
  ensureReady(context: DeviceViewContext): Promise<void>;
  readSnapshot(context: DeviceViewContext): Promise<Awaited<ReturnType<typeof readCoordinatedSnapshotForContext>>>;
  readWidgetDocument(context: DeviceViewContext, widgetId: string): Promise<DeviceWidgetDocument | null>;
  loadLayoutSettings(plugin: Plugin, options: { sectionsEnabled?: boolean; sectionId?: string | null }, context: DeviceViewContext): Promise<{ widgetLayoutNumber: number; widgetGap: number }>;
  saveLayoutData(context: DeviceViewContext, layout: WidgetLayoutData, options?: { expectedRevision?: number }): Promise<void>;
  deleteWidgetFromSurface(context: DeviceViewContext, widgetId: string, options: { expectedLayoutRevision?: number; expectedWidgetRevision?: number }): Promise<DeleteWidgetResult>;
}

interface HomepageAgentServiceDeps {
  getPlugin(): Plugin;
  deviceView?: Partial<HomepageAgentDeviceViewOps>;
}

type WidgetResolution =
  | { status: "resolved"; doc: DeviceWidgetDocument }
  | { status: "missing_config" };

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

/**
 * 从写后读取验证结果中安全读取 revision。
 * HomepageAgentReadResult 使用索引签名，这里显式收敛为 number。
 */
function revisionOf(result: HomepageAgentReadResult, key: "layoutRevision" | "viewRevision"): number | undefined {
  const value = result[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * 把内部业务能力转换为 Agent 可见的路由描述：
 * - 统一以 homepage_components + subtool + dotted operations 暴露；
 * - operations 只保留本轮真实 aggregateActionHelp 中存在的 action；
 * - display-only 组件也保留实例读写能力，不把它误判为无能力。
 * 不暴露内部 businessTool（旧顶层工具名）给 Agent。
 */
export function providerBusinessCapability(
  capability: HomepageBusinessCapability | undefined,
  availableActions?: ReadonlySet<string>,
): {
  toolName: string | null;
  subtool: string | null;
  operations: string[];
  supported?: boolean;
  reusedExistingTool?: boolean;
  reason?: string;
} {
  if (!capability) return { toolName: null, subtool: null, operations: [], reason: "unknown_widget_type" };
  const projectOperations = (operations: readonly string[]): string[] => availableActions
    ? operations.filter((action) => availableActions.has(action))
    : [...operations];
  const projected = projectOperations(capability.operations ?? []);
  const projectedUnavailable = availableActions !== undefined && projected.length === 0;
  if (capability.subtool && capability.toolName) {
    return {
      toolName: capability.toolName,
      subtool: capability.subtool,
      operations: projected,
      ...(projectedUnavailable ? { supported: false, reason: "subtool_disabled" } : {}),
      ...(capability.reusedExistingTool ? { reusedExistingTool: true } : {}),
      ...(!projectedUnavailable && capability.reason ? { reason: capability.reason } : {}),
    };
  }
  if (capability.reusedExistingTool && capability.toolName) {
    return {
      toolName: capability.toolName,
      subtool: null,
      operations: projected,
      ...(projectedUnavailable ? { supported: false, reason: "subtool_disabled" } : {}),
      reusedExistingTool: true,
    };
  }
  return { toolName: null, subtool: null, operations: [], reason: capability.reason ?? "no_dedicated_business_tool" };
}

export class HomepageAgentService {
  private readonly dv: HomepageAgentDeviceViewOps;
  private availableComponentActions: ReadonlySet<string> | undefined;

  constructor(private readonly deps: HomepageAgentServiceDeps) {
    const overrides = deps.deviceView ?? {};
    this.dv = {
      getContext: overrides.getContext ?? getCurrentDeviceViewContext,
      ensureReady: overrides.ensureReady ?? ensureCurrentDeviceViewReady,
      readSnapshot: overrides.readSnapshot ?? readCoordinatedSnapshotForContext,
      readWidgetDocument: overrides.readWidgetDocument ?? readWidgetInstanceDocument,
      loadLayoutSettings: overrides.loadLayoutSettings ?? loadWidgetLayoutSettings,
      saveLayoutData: overrides.saveLayoutData ?? saveLayoutDataForContext,
      deleteWidgetFromSurface: overrides.deleteWidgetFromSurface ?? deleteWidgetFromSurface,
    };
  }

  /** 注册完成后注入本轮真实 homepage_components action 集合，供所有 Agent 可见结果统一投影。 */
  setAvailableComponentActions(actions: Iterable<string>): void {
    this.availableComponentActions = new Set(actions);
  }

  resolveSurface(surface?: HomepageAgentSurface): HomepageAgentSurface {
    if (surface === "desktop-homepage" || surface === "mobile-homepage") return surface;
    return (this.deps.getPlugin() as Plugin & { isMobile?: boolean }).isMobile
      ? "mobile-homepage"
      : "desktop-homepage";
  }

  private async read(surface?: HomepageAgentSurface) {
    const resolvedSurface = this.resolveSurface(surface);
    const plugin = this.deps.getPlugin();
    const context = this.dv.getContext(plugin, resolvedSurface);
    try {
      await this.dv.ensureReady(context);
      const snapshot = await this.dv.readSnapshot(context);
      return { plugin, context, surface: resolvedSurface, snapshot, profile: getProfile(snapshot) };
    } catch (error) {
      if (error instanceof DeviceViewAccessBlockedError) {
        throw new HomepageAgentServiceError(
          "homepage_not_ready",
          error.safeMessage,
        );
      }
      throw new HomepageAgentServiceError(
        "homepage_not_ready",
        getSafeDeviceViewErrorMessage(error),
      );
    }
  }

  private async widgetResolutionOf(state: Awaited<ReturnType<HomepageAgentService["read"]>>, widgetId: string): Promise<WidgetResolution> {
    const doc = await this.dv.readWidgetDocument(state.context, widgetId);
    if (doc) return { status: "resolved", doc };
    return { status: "missing_config" };
  }

  private async hasMissingConfigOnSurface(state: Awaited<ReturnType<HomepageAgentService["read"]>>): Promise<boolean> {
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    for (const item of order) {
      if ((await this.widgetResolutionOf(state, item.id)).status === "missing_config") return true;
    }
    return false;
  }

  async overview(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const sections = state.surface === "desktop-homepage"
      ? deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId)
      : [];
    const sectionModeEnabled = state.profile?.componentSectionsModeEnabled === true;
    const warnings: string[] = [];
    const rows = await Promise.all(order.map(async (item) => {
      const resolution = await this.widgetResolutionOf(state, item.id);
      if (resolution.status === "resolved") return { status: resolution.status as HomepageWidgetResolutionStatus, type: normalizeType(resolution.doc.config) };
      return { status: resolution.status as HomepageWidgetResolutionStatus, type: null };
    }));
    const counts = computeOverviewCounts(rows);
    if (counts.missingConfigWidgetCount > 0) warnings.push(missingConfigWarningText(counts.missingConfigWidgetCount));
    const layoutSettings = state.surface === "desktop-homepage"
      ? await this.dv.loadLayoutSettings(state.plugin, {
          sectionsEnabled: sectionModeEnabled,
          sectionId: state.profile?.activeSectionId ?? null,
        }, state.context)
      : null;
    const hasUnresolvedOrMissing = counts.missingConfigWidgetCount > 0;
    return {
      status: !hasUnresolvedOrMissing ? "ok" : "degraded",
      surface: state.surface,
      surfaceLabel: state.surface === "desktop-homepage" ? "桌面主页" : "移动主页",
      scopeKind: state.context.isMobileShared ? "mobile-shared" : "current-device",
      layoutRevision: state.snapshot.layout.revision,
      viewRevision: state.snapshot.view?.revision,
      layoutReferenceCount: order.length,
      widgetCount: counts.resolvedWidgetCount,
      resolvedWidgetCount: counts.resolvedWidgetCount,
      missingConfigWidgetCount: counts.missingConfigWidgetCount,
      sectionModeEnabled: state.surface === "desktop-homepage" ? sectionModeEnabled : undefined,
      activeSectionId: state.surface === "desktop-homepage" ? state.profile?.activeSectionId ?? null : undefined,
      sections: state.surface === "desktop-homepage"
        ? sections.map((item) => ({ id: item.id, name: item.name, widgetCount: state.profile?.sections?.[item.id]?.widgetIds.length ?? 0 }))
        : undefined,
      widgetLayoutNumber: layoutSettings?.widgetLayoutNumber,
      widgetGap: layoutSettings?.widgetGap,
      widgetTypeCounts: counts.widgetTypeCounts,
      safelyWritable: !hasUnresolvedOrMissing,
      structuralWritesSafe: true,
      widgetConfigWritesSafe: !hasUnresolvedOrMissing,
      advancedEnabled: isHomepageEntitlementGranted(),
      warnings,
    };
  }

  async listWidgets(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const sections = state.surface === "desktop-homepage" ? deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId) : [];
    const sectionNames = new Map(sections.map((item) => [item.id, item.name]));
    const items = await Promise.all(order.map(async (item, index) => {
      const resolution = await this.widgetResolutionOf(state, item.id);
      const sectionId = state.surface === "desktop-homepage"
        ? sectionForWidget(state.profile?.sections, item.id)
        : null;
      const sectionName = sectionId ? sectionNames.get(sectionId) ?? sectionId : null;
      if (resolution.status !== "resolved") {
        return {
          widgetId: item.id,
          resolutionStatus: resolution.status,
          type: null,
          label: "组件配置缺失",
          index,
          sectionId,
          sectionName,
          styleSummary: item.style ? "已配置" : "默认",
          configRevision: null,
          editable: false,
          advancedRequired: false,
          businessCapability: null,
          warnings: ["该组件仍在布局中，但组件配置文件缺失，无法识别类型或正常渲染。"],
        };
      }
      const doc = resolution.doc;
      const type = normalizeType(doc.config);
      const descriptor = getHomepageAgentWidgetDescriptor(type);
      return {
        widgetId: item.id,
        resolutionStatus: "resolved" as HomepageWidgetResolutionStatus,
        type,
        label: descriptor?.label ?? type,
        index,
        sectionId,
        sectionName,
        styleSummary: item.style ? "已配置" : "默认",
        configRevision: doc.revision,
        editable: (descriptor?.editableFields.length ?? 0) > 0,
        advancedRequired: descriptor?.advancedRequired ?? false,
        businessCapability: providerBusinessCapability(descriptor?.businessCapability, this.availableComponentActions),
        warnings: [],
      };
    }));
    const degraded = items.some((row) => row.resolutionStatus !== "resolved");
    return { status: degraded ? "degraded" : "ok", surface: state.surface, layoutRevision: state.snapshot.layout.revision, widgets: items };
  }

  async getWidget(surface: HomepageAgentSurface | undefined, widgetId: string, expectedType?: string): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const layoutIndex = order.findIndex((item) => item.id === widgetId);
    if (layoutIndex < 0) throw new HomepageAgentServiceError("widget_not_found", `当前 ${state.surface} 中不存在组件 ${widgetId}。`);
    const resolution = await this.widgetResolutionOf(state, widgetId);
    if (resolution.status !== "resolved") {
      throw new HomepageAgentServiceError(
        "widget_config_missing",
        `组件 ${widgetId} 存在于布局中，但组件配置文件缺失，无法识别类型或正常渲染。`,
        true,
        { widgetId, resolutionStatus: "missing_config", layoutIndex },
      );
    }
    const doc = resolution.doc;
    const type = normalizeType(doc.config);
    if (expectedType && expectedType !== type) {
      throw new HomepageAgentServiceError("widget_type_conflict", `组件类型已变化：预期 ${expectedType}，当前为 ${type}。`);
    }
    const descriptor = getHomepageAgentWidgetDescriptor(type);
    const layoutItem = order[layoutIndex];
    const sectionId = state.surface === "desktop-homepage" ? sectionForWidget(state.profile?.sections, widgetId) : null;
    const sectionName = sectionId
      ? deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId).find((item) => item.id === sectionId)?.name ?? sectionId
      : null;
    const rawData = readHomepageWidgetData(doc.config);
    const editableConfig: Record<string, unknown> = {};
    const redactedEditableFields: string[] = [];
    if (descriptor?.editableFields) {
      for (const field of descriptor.editableFields) {
        if (field in rawData && rawData[field] !== undefined) {
          const rawVal = rawData[field];
          const sanitizedVal = sanitizeWidgetConfigForAgent(rawVal);
          if (isSecurityRedactedValue(rawVal, sanitizedVal)) {
            redactedEditableFields.push(field);
          } else {
            editableConfig[field] = rawVal;
          }
        }
      }
    }
    return {
      status: "ok",
      surface: state.surface,
      layoutRevision: state.snapshot.layout.revision,
      widgetId,
      resolutionStatus: "resolved",
      type,
      label: descriptor?.label ?? type,
      configRevision: doc.revision,
      layoutIndex,
      sectionId,
      sectionName,
      style: state.surface === "desktop-homepage" ? readWidgetStyle(layoutItem.style, doc.config) : undefined,
      safeConfig: sanitizeWidgetConfigForAgent(doc.config),
      editableConfig,
      redactedEditableFields,
      editableFields: descriptor?.editableFields ?? [],
      readOnlyFields: ["type", "instanceId", "schema", "version", "revision"],
      unsupportedFields: ["业务数据", "凭据", "本地绝对路径"],
      businessCapability: providerBusinessCapability(descriptor?.businessCapability, this.availableComponentActions),
      warnings: descriptor ? [] : ["当前组件类型没有 Agent 配置适配器"],
    };
  }

  async listWidgetTypes(surface?: HomepageAgentSurface, categoryId?: string): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const advancedEnabled = isHomepageEntitlementGranted();
    const existing = await this.listWidgets(state.surface);
    const existingTypes = new Set(((existing.widgets as Array<{ type: string }>) ?? []).map((item) => item.type));
    const categorySource = surfaceCategorySource(state.surface);
    const enriched = HOMEPAGE_AGENT_WIDGET_CATALOG.map((item) => ({
      item,
      categoryId: surfaceCategoryId(state.surface, item),
      categoryLabel: surfaceCategoryLabel(state.surface, item),
      canAdd: (!item.advancedRequired || advancedEnabled) && (!item.singleton || !existingTypes.has(item.type)),
      available: !item.advancedRequired || advancedEnabled,
      lockReason: item.advancedRequired && !advancedEnabled
        ? "advanced_feature_unavailable"
        : item.singleton && existingTypes.has(item.type) ? "singleton_conflict" : null,
    }));
    const knownCategoryIds = new Set(enriched.map((entry) => entry.categoryId));
    if (categoryId && !knownCategoryIds.has(categoryId)) {
      throw new HomepageAgentServiceError(
        "widget_category_not_found",
        `当前主页不存在组件分类 ${categoryId}。`,
        true,
        { availableCategoryIds: [...knownCategoryIds] },
      );
    }
    const filtered = categoryId
      ? enriched.filter((entry) => entry.categoryId === categoryId)
      : enriched;
    const categories = [...knownCategoryIds].map((id) => {
      const entries = enriched.filter((entry) => entry.categoryId === id);
      return {
        categoryId: id,
        categoryLabel: entries[0]?.categoryLabel ?? id,
        total: entries.length,
        available: entries.filter((entry) => entry.available).length,
        canAdd: entries.filter((entry) => entry.canAdd).length,
      };
    });
    return {
      status: "ok",
      surface: state.surface,
      categorySource,
      categoryFilter: categoryId ?? null,
      total: filtered.length,
      categories,
      widgetTypes: filtered.map((entry) => ({
        type: entry.item.type,
        label: entry.item.label,
        categoryId: entry.categoryId,
        categoryLabel: entry.categoryLabel,
        categorySource,
        canAdd: entry.canAdd,
        available: entry.available,
        lockReason: entry.lockReason,
      })),
      detailHint: "需要某个组件的 editableFields、surface 支持或业务能力时，调用 catalog.get_type。",
    };
  }

  async getWidgetType(surface: HomepageAgentSurface | undefined, widgetType: string): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const descriptor = getHomepageAgentWidgetDescriptor(widgetType);
    if (!descriptor || !descriptor.supportedSurfaces.includes(state.surface)) {
      throw new HomepageAgentServiceError("widget_type_unsupported", `当前主页不支持组件 ${widgetType}。`);
    }
    const advancedEnabled = isHomepageEntitlementGranted();
    const existing = await this.listWidgets(state.surface);
    const existingTypes = new Set(((existing.widgets as Array<{ type: string }>) ?? []).map((item) => item.type));
    const available = !descriptor.advancedRequired || advancedEnabled;
    const canAdd = available && (!descriptor.singleton || !existingTypes.has(descriptor.type));
    return {
      status: "ok",
      surface: state.surface,
      widgetType: {
        ...descriptor,
        categoryId: surfaceCategoryId(state.surface, descriptor),
        categoryLabel: surfaceCategoryLabel(state.surface, descriptor),
        categorySource: surfaceCategorySource(state.surface),
        canAdd,
        canUpdate: descriptor.editableFields.length > 0,
        available,
        lockReason: descriptor.advancedRequired && !advancedEnabled
          ? "advanced_feature_unavailable"
          : descriptor.singleton && existingTypes.has(descriptor.type) ? "singleton_conflict" : null,
        requiredInitialFields: [],
        businessCapability: providerBusinessCapability(descriptor.businessCapability, this.availableComponentActions),
      },
    };
  }

  async getLayout(surface?: HomepageAgentSurface): Promise<HomepageAgentReadResult> {
    const state = await this.read(surface);
    const order = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    if (state.surface === "mobile-homepage") {
      return { status: "ok", surface: state.surface, layoutRevision: state.snapshot.layout.revision, widgetCount: order.length, order: order.map((item) => item.id) };
    }
    const sectionModeEnabled = state.profile?.componentSectionsModeEnabled === true;
    const layoutSettings = await this.dv.loadLayoutSettings(state.plugin, { sectionsEnabled: sectionModeEnabled, sectionId: state.profile?.activeSectionId ?? null }, state.context);
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
    const sections = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId);
    return {
      status: "ok",
      surface: state.surface,
      sectionModeEnabled: state.profile?.componentSectionsModeEnabled === true,
      activeSectionId: state.profile?.activeSectionId ?? null,
      layoutRevision: state.snapshot.layout.revision,
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
    try {
      assertDesktopHomepageLayoutInvariants(state.snapshot.layout.layout, state.context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = createDeviceViewBlockedError(
        state.context,
        "desktop_section_layout_corrupted",
        message,
      );
      throw new HomepageAgentServiceError(
        "desktop_section_layout_corrupted",
        blocked.safeMessage,
        false,
      );
    }
  }

  private assertNextLayout(
    state: Awaited<ReturnType<HomepageAgentService["read"]>>,
    layout: WidgetLayoutData,
  ): void {
    if (state.surface !== "desktop-homepage") return;
    try {
      assertDesktopHomepageLayoutInvariants(layout, state.context);
    } catch (error) {
      const blocked = createDeviceViewBlockedError(
        state.context,
        "desktop_section_layout_corrupted",
        error instanceof Error ? error.message : String(error),
      );
      throw new HomepageAgentServiceError(
        "desktop_section_layout_corrupted",
        blocked.safeMessage,
        false,
      );
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
    if (descriptor.advancedRequired && !isHomepageEntitlementGranted()) throw new HomepageAgentServiceError("advanced_feature_unavailable", `组件 ${descriptor.label} 需要高级功能。`);
    const currentOrder = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    if (descriptor.singleton) {
      for (const item of currentOrder) {
        const doc = await this.dv.readWidgetDocument(state.context, item.id);
        if (doc && normalizeType(doc.config) === input.widgetType) throw new HomepageAgentServiceError("singleton_conflict", `${descriptor.label} 在当前主页只能存在一个。`);
      }
      if (await this.hasMissingConfigOnSurface(state)) {
        throw new HomepageAgentServiceError(
          "singleton_state_uncertain",
          "当前主页仍有缺失配置的组件引用，请先修复主页数据后再添加单实例组件。",
          true,
        );
      }
    }
    const widgetId = createWidgetInstanceId();
    let config: Record<string, unknown>;
    try {
      config = createHomepageWidgetConfig(input.widgetType, widgetId, input.initialConfig ?? {}, {
        advancedEnabled: isHomepageEntitlementGranted(),
        surface: state.surface,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "initialConfig 校验失败";
      throw new HomepageAgentServiceError(
        "invalid_widget_patch",
        `组件初始配置无效：${message}。initialConfig 只接受 editableFields 中的扁平字段；不要传 data 外壳或只读/样式字段。`,
        true,
      );
    }
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
        const sectionIds = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId).map((item) => item.id);
        const arranged = rearrangeGlobalOrderBySections(nextOrder, sections, sectionIds, { assignOrphansToFirstSection: true });
        committedOrder = arranged.nextGlobalOrder;
        committedSections = arranged.nextSections;
      }
      const nextLayout = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, committedOrder, (profile) => committedSections ? { ...profile, sections: committedSections } : profile);
      this.assertNextLayout(state, nextLayout);
      await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
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
    this.dispatchRefresh(state.surface, { reason: "widget-added", affectedWidgetIds: [widgetId], layoutRevision: revisionOf(verified, "layoutRevision") });
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
    const advancedEnabled = isHomepageEntitlementGranted();
    let expectedValues: Record<string, unknown>;
    try {
      expectedValues = validateAndNormalizeHomepageWidgetPatch(type, input.expectedValues, { advancedEnabled });
      const patchKeys = Object.keys(input.patch).sort();
      const expectedKeys = Object.keys(expectedValues).sort();
      if (JSON.stringify(patchKeys) !== JSON.stringify(expectedKeys)) throw new Error("expectedValues 必须与 patch 包含相同字段");
    } catch {
      throw new HomepageAgentServiceError("invalid_widget_patch", "expectedValues 无效，请重新读取组件后重试。");
    }
    const currentData = readHomepageWidgetData(current.config);
    if (Object.entries(expectedValues).some(([key, value]) => JSON.stringify(currentData[key] ?? null) !== JSON.stringify(value ?? null))) {
      throw new HomepageAgentServiceError("widget_revision_conflict", "组件目标字段已与预期值不一致，请重新读取组件配置。");
    }
    try {
      await updateWidgetInstanceConfigExpected(state.context, input.widgetId, input.expectedWidgetRevision, (config) => applyHomepageWidgetPatch(config, type, input.patch, { advancedEnabled }));
    } catch (error) {
      if (error instanceof HomepageAgentServiceError) throw error;
      throw new HomepageAgentServiceError("invalid_widget_patch", "组件 patch 无效，请重新读取组件后重试。");
    }
    const verified = await this.getWidget(state.surface, input.widgetId, type);
    if (Number(verified.configRevision) <= input.expectedWidgetRevision) throw new HomepageAgentServiceError("write_not_committed", "组件 revision 未增长，写后验证失败。", false);
    const verifiedDocument = await readWidgetInstanceDocument(state.context, input.widgetId);
    const verifiedData = verifiedDocument ? readHomepageWidgetData(verifiedDocument.config) : null;
    const normalizedPatch = validateAndNormalizeHomepageWidgetPatch(type, input.patch, { advancedEnabled });
    if (!verifiedData || Object.entries(normalizedPatch).some(([key, value]) => JSON.stringify(verifiedData[key] ?? null) !== JSON.stringify(value ?? null))) {
      throw new HomepageAgentServiceError("write_not_committed", "组件目标字段写后验证失败。", false);
    }
    this.dispatchRefresh(state.surface, { reason: "widget-updated", affectedWidgetIds: [input.widgetId], layoutRevision: revisionOf(verified, "layoutRevision") });
    return { ...verified, changed: true, summary: "组件展示配置已更新" };
  }

  async updateWidgetStyle(input: {
    surface: "desktop-homepage";
    widgetId: string;
    expectedType: string;
    expectedWidgetRevision: number;
    expectedLayoutRevision: number;
    expectedSectionId: string | null;
    patch: WidgetStylePatch & { targetSectionId?: string };
  }): Promise<HomepageAgentReadResult> {
    const state = await this.read(input.surface);
    if (state.surface !== "desktop-homepage") {
      throw new HomepageAgentServiceError("unsupported_surface_action", "组件样式 Agent 工具仅支持桌面主页；移动端请在界面中手动设置。");
    }
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    const current = await readWidgetInstanceDocument(state.context, input.widgetId);
    if (!current) throw new HomepageAgentServiceError("widget_not_found", `组件 ${input.widgetId} 不存在。`);
    const type = normalizeType(current.config);
    if (type !== input.expectedType) throw new HomepageAgentServiceError("widget_type_conflict", `组件类型已变化：预期 ${input.expectedType}，当前为 ${type}。`);
    if (current.revision !== input.expectedWidgetRevision) throw new HomepageAgentServiceError("widget_revision_conflict", `组件配置已变化：预期 revision ${input.expectedWidgetRevision}，当前为 ${current.revision}。`);

    const currentOrder = normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order);
    const currentItem = currentOrder.find((item) => item.id === input.widgetId);
    if (!currentItem) throw new HomepageAgentServiceError("widget_not_found", "组件不在当前主页布局中。");
    const currentSectionId = sectionForWidget(state.profile?.sections, input.widgetId);
    if (currentSectionId !== input.expectedSectionId) {
      throw new HomepageAgentServiceError("layout_revision_conflict", "组件分栏已变化，请重新读取组件。");
    }

    const targetSectionId = input.patch.targetSectionId;
    if (targetSectionId !== undefined && state.profile?.componentSectionsModeEnabled !== true) {
      throw new HomepageAgentServiceError("unsupported_surface_action", "桌面主页只有启用分栏模式后才能通过样式设置迁移分栏。");
    }
    if (targetSectionId !== undefined && !state.profile?.sections?.[targetSectionId]) {
      throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    }
    if (input.patch.appearanceMode === "inherit" && (
      input.patch.backgroundColor !== undefined || input.patch.backgroundOpacity !== undefined
      || input.patch.borderColor !== undefined || input.patch.borderWidth !== undefined
    )) throw new HomepageAgentServiceError("invalid_widget_patch", "继承主题时不能同时设置自定义背景或边框。");

    const sizeSectionId = targetSectionId ?? currentSectionId ?? state.profile?.activeSectionId ?? null;
    const maxColSize = (await this.dv.loadLayoutSettings(state.plugin, {
          sectionsEnabled: state.profile?.componentSectionsModeEnabled === true,
          sectionId: sizeSectionId,
        }, state.context)).widgetLayoutNumber;
    const maxRowSize = maxColSize;
    if (input.patch.colSize !== undefined && (
      !Number.isInteger(input.patch.colSize) || input.patch.colSize < 1 || input.patch.colSize > maxColSize
    )) throw new HomepageAgentServiceError("invalid_widget_patch", `组件列跨度必须是 1 到 ${maxColSize} 的整数。`);
    if (input.patch.rowSize !== undefined && (
      !Number.isInteger(input.patch.rowSize) || input.patch.rowSize < 1 || input.patch.rowSize > maxRowSize
    )) throw new HomepageAgentServiceError("invalid_widget_patch", `组件行跨度必须是 1 到 ${maxRowSize} 的整数。`);

    const currentStyle = readWidgetStyle(currentItem.style, current.config);
    if (input.patch.backgroundOpacity !== undefined && input.patch.backgroundColor === undefined
      && !currentStyle.backgroundColor?.match(/^#[0-9a-f]{6}$/i)) {
      throw new HomepageAgentServiceError("invalid_widget_patch", "当前没有可复用的自定义背景色；修改透明度时请同时提交 backgroundColor。");
    }
    const stylePatch: WidgetStylePatch = {
      rowSize: input.patch.rowSize,
      colSize: input.patch.colSize,
      appearanceMode: input.patch.appearanceMode,
      backgroundColor: input.patch.backgroundColor?.toLowerCase(),
      backgroundOpacity: input.patch.backgroundOpacity,
      borderColor: input.patch.borderColor?.toLowerCase(),
      borderWidth: input.patch.borderWidth,
    };
    let nextStyle: string | null;
    try {
      nextStyle = applyWidgetStylePatch(currentItem.style, stylePatch);
    } catch {
      throw new HomepageAgentServiceError("invalid_widget_patch", "组件样式无效，请重新读取组件后重试。");
    }
    let nextOrder = currentOrder.map((item) => item.id === input.widgetId ? { ...item, style: nextStyle } : item);
    let nextSections: WidgetLayoutProfileData["sections"] | undefined;
    let verifiedSectionId = currentSectionId;
    if (targetSectionId !== undefined && targetSectionId !== currentSectionId) {
      const sections = Object.fromEntries(Object.entries(state.profile!.sections!).map(([id, section]) => [
        id,
        { ...section, widgetIds: section.widgetIds.filter((widgetId) => widgetId !== input.widgetId) },
      ]));
      sections[targetSectionId] = { ...sections[targetSectionId], widgetIds: [...sections[targetSectionId].widgetIds, input.widgetId] };
      const sectionIds = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId).map((section) => section.id);
      const arranged = rearrangeGlobalOrderBySections(nextOrder, sections, sectionIds, { assignOrphansToFirstSection: true });
      nextOrder = arranged.nextGlobalOrder;
      nextSections = arranged.nextSections;
      verifiedSectionId = targetSectionId;
    }

    const changesSize = input.patch.rowSize !== undefined || input.patch.colSize !== undefined;
    let updatedConfig: DeviceWidgetDocument | null = null;
    if (changesSize) {
      updatedConfig = await updateWidgetInstanceConfigExpected(state.context, input.widgetId, input.expectedWidgetRevision, (config) => ({
        ...config,
        ...(input.patch.rowSize !== undefined ? { rowSize: input.patch.rowSize } : {}),
        ...(input.patch.colSize !== undefined ? { colSize: input.patch.colSize } : {}),
      }));
    }

    try {
      const nextLayout = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, nextOrder, (profile) => (
        nextSections ? { ...profile, sections: nextSections } : profile
      ));
      this.assertNextLayout(state, nextLayout);
      await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    } catch (error) {
      if (updatedConfig) {
        const rolledBack = await updateWidgetInstanceConfigExpected(
          state.context,
          input.widgetId,
          updatedConfig.revision,
          () => current.config,
        ).then(() => true).catch(() => false);
        if (!rolledBack) throw new HomepageAgentServiceError("write_state_uncertain", "样式布局提交失败，且组件尺寸无法安全回滚，请人工检查。", false);
      }
      throw error;
    }

    const verified = await this.getWidget(state.surface, input.widgetId, type);
    const verifiedStyle = verified.style as ReturnType<typeof readWidgetStyle> | undefined;
    if (stylePatch.appearanceMode === "inherit") {
      // classifyWidgetAppearance 会把未知声明（自定义属性等）计入 custom 模式，
      // 因此继承主题的验证标准是“自定义背景/边框声明已全部移除”，而不是比较派生模式。
      if (
        verifiedStyle?.backgroundColor !== null
        || verifiedStyle?.backgroundOpacity !== null
        || verifiedStyle?.borderColor !== null
        || verifiedStyle?.borderWidth !== null
      ) {
        throw new HomepageAgentServiceError("write_not_committed", "组件样式字段 appearanceMode 写后验证失败。", false);
      }
    }
    for (const key of ["rowSize", "colSize", "appearanceMode", "backgroundColor", "backgroundOpacity", "borderColor", "borderWidth"] as const) {
      if (key === "appearanceMode" && stylePatch.appearanceMode === "inherit") continue;
      const expectedValue = stylePatch[key];
      if (expectedValue !== undefined && verifiedStyle?.[key] !== expectedValue) {
        throw new HomepageAgentServiceError("write_not_committed", `组件样式字段 ${key} 写后验证失败。`, false);
      }
    }
    if (verified.sectionId !== verifiedSectionId) throw new HomepageAgentServiceError("write_not_committed", "组件分栏写后验证失败。", false);
    this.dispatchRefresh(state.surface, { reason: "widget-updated", affectedWidgetIds: [input.widgetId], layoutRevision: revisionOf(verified, "layoutRevision") });
    return { ...verified, changed: true, summary: "组件样式已更新" };
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
      const sectionIds = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId).map((section) => section.id);
      const arranged = rearrangeGlobalOrderBySections(without, sections, sectionIds, { assignOrphansToFirstSection: true });
      committedOrder = arranged.nextGlobalOrder;
      committedSections = arranged.nextSections;
    }
    const nextLayout = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, committedOrder, (profile) => committedSections ? { ...profile, sections: committedSections } : profile);
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verified = await this.listWidgets(state.surface);
    const widgets = (verified.widgets as Array<{ widgetId: string; index: number; sectionId: string | null }> | undefined) ?? [];
    if (widgets.some((row, index) => row.index !== index) || new Set(widgets.map((row) => row.widgetId)).size !== widgets.length) throw new HomepageAgentServiceError("write_not_committed", "组件顺序写后验证失败。", false);
    const moved = widgets.find((row) => row.widgetId === input.widgetId);
    if (!moved || (expectedSectionId !== null && moved.sectionId !== expectedSectionId)) throw new HomepageAgentServiceError("write_not_committed", "组件位置或分栏归属写后验证失败。", false);
    this.dispatchRefresh(state.surface, { reason: "widget-moved", affectedWidgetIds: [input.widgetId], layoutRevision: revisionOf(verified, "layoutRevision") });
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
    this.dispatchRefresh(state.surface, { reason: "widget-removed", affectedWidgetIds: [input.widgetId] });
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
    const currentSettings = await this.dv.loadLayoutSettings(state.plugin, {
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
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSettings = await this.dv.loadLayoutSettings(state.plugin, {
      sectionsEnabled: state.profile?.componentSectionsModeEnabled === true,
      sectionId: input.sectionId ?? state.profile?.activeSectionId ?? null,
    }, state.context);
    if (verifiedSettings.widgetLayoutNumber !== input.widgetLayoutNumber || verifiedSettings.widgetGap !== input.widgetGap) throw new HomepageAgentServiceError("write_not_committed", "主页列数或间距写后验证失败。", false);
    const verified = await this.getLayout(state.surface);
    this.dispatchRefresh(state.surface, { reason: "layout-updated", layoutRevision: revisionOf(verified, "layoutRevision") });
    return { ...verified, changed: true };
  }

  private async sectionWriteState(expectedLayoutRevision: number) {
    const state = await this.read("desktop-homepage");
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, expectedLayoutRevision);
    return state;
  }

  async createSection(input: { name: string; sectionId?: string; position?: number; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision);
    const name = input.name.trim();
    if (!name || name.length > 60) throw new HomepageAgentServiceError("invalid_widget_patch", "分栏名称必须为 1 到 60 个字符。");
    const currentSections = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId);
    const sectionId = (input.sectionId?.trim() || `section-${createRuntimeUuid().slice(0, 8)}`).toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(sectionId) || currentSections.some((item) => item.id === sectionId)) throw new HomepageAgentServiceError("invalid_section_order", "分栏 ID 无效或已存在。");
    if (currentSections.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new HomepageAgentServiceError("section_name_conflict", "分栏名称已存在，请使用其他名称。");
    }
    const position = Math.max(0, Math.min(Math.trunc(input.position ?? currentSections.length), currentSections.length));
    const now = Date.now();
    const nextSections = [...currentSections];
    nextSections.splice(position, 0, { id: sectionId, name, createdAt: now, updatedAt: now });

    const nextLayout = this.setOrder(
      state.snapshot.layout.layout,
      state.context.scopeId,
      normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order),
      (profile) => {
        const sections = { ...(profile.sections ?? {}) };
        const ordered: Record<string, typeof sections[string]> = {};
        for (const item of nextSections) {
          ordered[item.id] = item.id === sectionId
            ? { widgetIds: [], name, createdAt: now, updatedAt: now }
            : sections[item.id];
        }
        return { ...profile, sections: ordered, componentSectionsModelVersion: 1 };
      },
    );
    nextLayout.componentSectionsModelVersion = 1;
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSections = await this.listSections("desktop-homepage");
    this.dispatchRefresh(state.surface, { reason: "sections-updated", affectedSectionIds: [sectionId], layoutRevision: revisionOf(verifiedSections, "layoutRevision") });
    return { ...verifiedSections, changed: true, createdSectionId: sectionId };
  }

  async renameSection(input: { sectionId: string; name: string; expectedSectionName: string; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision);
    const sections = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId);
    const target = sections.find((item) => item.id === input.sectionId);
    if (!target) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    if (target.name !== input.expectedSectionName) throw new HomepageAgentServiceError("section_name_conflict", "分栏名称已变化，请重新读取分栏后再操作。");
    const name = input.name.trim();
    if (!name || name.length > 60) throw new HomepageAgentServiceError("invalid_widget_patch", "分栏名称必须为 1 到 60 个字符。");
    if (sections.some((item) => item.id !== input.sectionId && item.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new HomepageAgentServiceError("section_name_conflict", "分栏名称已存在，请使用其他名称。");
    }

    const nextLayout = this.setOrder(
      state.snapshot.layout.layout,
      state.context.scopeId,
      normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order),
      (profile) => {
        const sectionsMap = { ...(profile.sections ?? {}) };
        if (sectionsMap[input.sectionId]) {
          sectionsMap[input.sectionId] = {
            ...sectionsMap[input.sectionId],
            name,
            updatedAt: Date.now(),
          };
        }
        return { ...profile, sections: sectionsMap, componentSectionsModelVersion: 1 };
      },
    );
    nextLayout.componentSectionsModelVersion = 1;
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSections = await this.listSections("desktop-homepage");
    this.dispatchRefresh(state.surface, { reason: "sections-updated", affectedSectionIds: [input.sectionId], layoutRevision: revisionOf(verifiedSections, "layoutRevision") });
    return { ...verifiedSections, changed: true };
  }

  async reorderSections(input: { orderedSectionIds: string[]; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision);
    const sections = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId);
    const currentIds = sections.map((item) => item.id);
    if (new Set(input.orderedSectionIds).size !== currentIds.length || input.orderedSectionIds.length !== currentIds.length || input.orderedSectionIds.some((id) => !currentIds.includes(id))) {
      throw new HomepageAgentServiceError("invalid_section_order", "orderedSectionIds 必须无重复地包含全部现有分栏。");
    }

    if (input.orderedSectionIds.every((id, index) => id === currentIds[index])) {
      const current = await this.listSections("desktop-homepage");
      return { ...current, changed: false };
    }

    const currentProfile = state.profile ?? { order: normalizeLayoutItems(state.snapshot.layout.layout.order) };
    const arranged = rearrangeGlobalOrderBySections(
      normalizeLayoutItems(currentProfile.order ?? state.snapshot.layout.layout.order),
      currentProfile.sections ?? {},
      input.orderedSectionIds,
      { assignOrphansToFirstSection: currentProfile.componentSectionsModeEnabled === true },
    );
    const nextSections = Object.fromEntries(
      input.orderedSectionIds.map((sectionId, index) => [
        sectionId,
        { ...arranged.nextSections[sectionId], index },
      ]),
    );

    const nextLayout = this.setOrder(
      state.snapshot.layout.layout,
      state.context.scopeId,
      arranged.nextGlobalOrder,
      (profile) => {
        return {
          ...profile,
          order: arranged.nextGlobalOrder,
          sections: nextSections,
          componentSectionsModelVersion: 1,
        };
      },
    );
    nextLayout.componentSectionsModelVersion = 1;
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSections = await this.listSections("desktop-homepage");
    const verifiedSectionIds = Array.isArray(verifiedSections.sections)
      ? verifiedSections.sections.map((section) => (
        section && typeof section === "object" && "id" in section ? section.id : undefined
      ))
      : [];
    const verifiedRevision = revisionOf(verifiedSections, "layoutRevision");
    if (
      verifiedSections.status !== "ok"
      || verifiedRevision !== input.expectedLayoutRevision + 1
      || verifiedSectionIds.length !== input.orderedSectionIds.length
      || verifiedSectionIds.some((id, index) => id !== input.orderedSectionIds[index])
    ) {
      throw new HomepageAgentServiceError(
        "write_not_committed",
        "分栏重排写后验证失败，目标顺序或 layout revision 未提交。",
        false,
        {
          expectedLayoutRevision: input.expectedLayoutRevision + 1,
          actualLayoutRevision: verifiedRevision,
          expectedSectionIds: input.orderedSectionIds,
          actualSectionIds: verifiedSectionIds,
        },
      );
    }
    this.dispatchRefresh(state.surface, { reason: "sections-updated", layoutRevision: revisionOf(verifiedSections, "layoutRevision") });
    return { ...verifiedSections, changed: true };
  }

  async removeSection(input: { sectionId: string; expectedSectionName: string; expectedWidgetCount: number; expectedReceivingSectionId?: string | null; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision);
    const sections = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId);
    const target = sections.find((item) => item.id === input.sectionId);
    if (!target) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    if (target.name !== input.expectedSectionName) throw new HomepageAgentServiceError("section_name_conflict", "分栏名称已变化，请重新读取分栏后再操作。");
    const targetWidgetCount = state.profile?.sections?.[input.sectionId]?.widgetIds.length ?? 0;
    if (targetWidgetCount !== input.expectedWidgetCount) throw new HomepageAgentServiceError("layout_revision_conflict", "分栏内组件数量已变化，请重新读取。");
    const remaining = sections.filter((item) => item.id !== input.sectionId);
    const previewMerged = mergeRemovedSectionRangesIntoAdjacentSections(
      normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order),
      state.profile?.sections ?? {},
      sections.map((item) => item.id),
      [input.sectionId],
      { assignOrphansToFirstSection: state.profile?.componentSectionsModeEnabled === true },
    );
    const receivingSectionId = previewMerged.receivingSectionByRemoved.get(input.sectionId) ?? null;
    if (input.expectedReceivingSectionId !== undefined && input.expectedReceivingSectionId !== receivingSectionId) {
      throw new HomepageAgentServiceError("layout_revision_conflict", "分栏接收目标已变化，请重新读取。");
    }

    const nextLayout = this.setOrder(
      state.snapshot.layout.layout,
      state.context.scopeId,
      normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order),
      (profile) => {
        const merged = mergeRemovedSectionRangesIntoAdjacentSections(
          normalizeLayoutItems(profile.order ?? state.snapshot.layout.layout.order),
          profile.sections ?? {},
          sections.map((item) => item.id),
          [input.sectionId],
          { assignOrphansToFirstSection: profile.componentSectionsModeEnabled === true },
        );
        const modeEnabled = remaining.length > 0 && profile.componentSectionsModeEnabled === true;
        const activeSectionId = profile.activeSectionId === input.sectionId
          ? merged.receivingSectionByRemoved.get(input.sectionId)
          : profile.activeSectionId;
        const { activeSectionId: _previousActiveSectionId, ...withoutActiveSection } = profile;
        return {
          ...withoutActiveSection,
          order: merged.nextGlobalOrder,
          sections: merged.nextSections,
          ...(modeEnabled && activeSectionId ? { activeSectionId } : {}),
          componentSectionsModeEnabled: modeEnabled,
          componentSectionsModelVersion: 1,
        };
      },
    );
    nextLayout.componentSectionsModelVersion = 1;
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSections = await this.listSections("desktop-homepage");
    this.dispatchRefresh(state.surface, { reason: "sections-updated", affectedSectionIds: [input.sectionId], layoutRevision: revisionOf(verifiedSections, "layoutRevision") });
    return { ...verifiedSections, changed: true, removedWidgetCount: targetWidgetCount, receivingSectionId };
  }

  async setSectionMode(input: { enabled: boolean; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.sectionWriteState(input.expectedLayoutRevision);
    const sections = deriveDesktopHomepageSectionsFromLayout(state.snapshot.layout.layout, state.context.scopeId);
    if (input.enabled && sections.length === 0) throw new HomepageAgentServiceError("section_not_found", "至少需要一个合法分栏才能开启分栏模式。");

    const nextLayout = this.setOrder(
      state.snapshot.layout.layout,
      state.context.scopeId,
      normalizeLayoutItems(state.profile?.order ?? state.snapshot.layout.layout.order),
      (profile) => {
        if (!input.enabled) {
          const { activeSectionId: _activeSectionId, ...withoutActiveSection } = profile;
          return { ...withoutActiveSection, componentSectionsModeEnabled: false, componentSectionsModelVersion: 1 };
        }
        const sectionIds = sections.map((item) => item.id);
        const arranged = rearrangeGlobalOrderBySections(
          normalizeLayoutItems(profile.order ?? state.snapshot.layout.layout.order),
          profile.sections ?? {},
          sectionIds,
          { assignOrphansToFirstSection: true },
        );
        return {
          ...profile,
          order: arranged.nextGlobalOrder,
          sections: arranged.nextSections,
          activeSectionId: profile.activeSectionId && sectionIds.includes(profile.activeSectionId) ? profile.activeSectionId : sectionIds[0],
          componentSectionsModeEnabled: true,
          componentSectionsModelVersion: 1,
        };
      },
    );
    nextLayout.componentSectionsModelVersion = 1;
    this.assertNextLayout(state, nextLayout);
    await this.dv.saveLayoutData(state.context, nextLayout, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSections = await this.listSections("desktop-homepage");
    this.dispatchRefresh(state.surface, { reason: "sections-updated", layoutRevision: revisionOf(verifiedSections, "layoutRevision") });
    return { ...verifiedSections, changed: true };
  }

  async setActiveSection(input: { sectionId: string; expectedLayoutRevision: number }): Promise<HomepageAgentReadResult> {
    const state = await this.read("desktop-homepage");
    this.assertWritableConsistency(state);
    this.assertLayoutRevision(state.snapshot.layout.revision, input.expectedLayoutRevision);
    if (state.profile?.componentSectionsModeEnabled !== true) throw new HomepageAgentServiceError("section_mode_disabled", "当前未开启分栏模式。");
    if (!state.profile.sections?.[input.sectionId]) throw new HomepageAgentServiceError("section_not_found", "目标分栏不存在。");
    const next = this.setOrder(state.snapshot.layout.layout, state.context.scopeId, normalizeLayoutItems(state.profile.order), (profile) => ({ ...profile, activeSectionId: input.sectionId, componentSectionsModelVersion: 1 }));
    next.componentSectionsModelVersion = 1;
    this.assertNextLayout(state, next);
    await this.dv.saveLayoutData(state.context, next, { expectedRevision: input.expectedLayoutRevision });
    const verifiedSections = await this.listSections("desktop-homepage");
    this.dispatchRefresh(state.surface, { reason: "active-section-updated", affectedSectionIds: [input.sectionId], layoutRevision: revisionOf(verifiedSections, "layoutRevision") });
    return { ...verifiedSections, changed: true };
  }

  private dispatchRefresh(
    surface: HomepageAgentSurface,
    detail: { reason: HomepageAgentStorageChangeReason; affectedWidgetIds?: string[]; affectedSectionIds?: string[]; layoutRevision?: number; viewRevision?: number },
  ): void {
    if (typeof window === "undefined") return;
    dispatchHomepageAgentStorageChanged({ source: "agent", surface, ...detail });
  }
}

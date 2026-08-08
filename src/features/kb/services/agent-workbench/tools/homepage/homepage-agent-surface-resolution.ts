import { DESKTOP_CONTENT_CATEGORY_LABELS, MOBILE_WIDGET_CATEGORY_LABELS } from "./homepage-agent-widget-catalog";
import type { HomepageAgentSurface, HomepageWidgetResolutionStatus } from "./homepage-manage-types";

/**
 * 主页 Agent 布局引用解析与分类的纯函数集合。
 *
 * 这些函数不依赖 siyuan 内核、设备视图存储或组件配置文件系统，
 * 可在 Node 测试环境中直接验证。HomepageAgentService 是这些决策的薄封装。
 */

/** 配置文档缺失时，根据 manifest.unresolvedLegacyWidgetIds 判定真实状态。 */
export function resolveMissingWidgetStatus(
  widgetId: string,
  manifestUnresolvedWidgetIds: readonly string[] | undefined,
): Exclude<HomepageWidgetResolutionStatus, "resolved"> {
  return (manifestUnresolvedWidgetIds ?? []).includes(widgetId) ? "legacy_unresolved" : "missing_config";
}

export interface OverviewWidgetRow {
  status: HomepageWidgetResolutionStatus;
  /** resolved 时才参与 type 计数。 */
  type?: string | null;
}

export interface OverviewCounts {
  resolvedWidgetCount: number;
  unresolvedWidgetCount: number;
  missingConfigWidgetCount: number;
  widgetTypeCounts: Record<string, number>;
}

export function computeOverviewCounts(rows: readonly OverviewWidgetRow[]): OverviewCounts {
  const counts: OverviewCounts = {
    resolvedWidgetCount: 0,
    unresolvedWidgetCount: 0,
    missingConfigWidgetCount: 0,
    widgetTypeCounts: {},
  };
  for (const row of rows) {
    if (row.status === "resolved") {
      counts.resolvedWidgetCount += 1;
      const type = (row.type && row.type.trim()) || "unknown";
      counts.widgetTypeCounts[type] = (counts.widgetTypeCounts[type] ?? 0) + 1;
    } else if (row.status === "legacy_unresolved") {
      counts.unresolvedWidgetCount += 1;
    } else {
      counts.missingConfigWidgetCount += 1;
    }
  }
  return counts;
}

export function unresolvedLegacyWarningText(count: number): string {
  return `当前布局包含 ${count} 个没有组件配置的旧布局引用，它们无法识别类型，也无法正常渲染。`;
}

export function missingConfigWarningText(count: number): string {
  return `当前布局包含 ${count} 个缺失组件配置的引用，无法识别类型或正常渲染。`;
}

export interface WidgetCategorySourceItem {
  activeTab: string;
  category: string;
}

/** 按 surface 返回真实分类 ID：desktop 用 activeTab，mobile 用 category。 */
export function surfaceCategoryId(surface: HomepageAgentSurface, item: WidgetCategorySourceItem): string {
  return surface === "desktop-homepage" ? item.activeTab : item.category;
}

/** 按 surface 返回分类中文标签。 */
export function surfaceCategoryLabel(surface: HomepageAgentSurface, item: WidgetCategorySourceItem): string {
  return surface === "desktop-homepage"
    ? DESKTOP_CONTENT_CATEGORY_LABELS[item.activeTab] ?? item.activeTab
    : MOBILE_WIDGET_CATEGORY_LABELS[item.category] ?? item.category;
}

export function surfaceCategorySource(surface: HomepageAgentSurface): string {
  return surface === "desktop-homepage" ? "desktop-content-setting" : "mobile-widget-catalog";
}

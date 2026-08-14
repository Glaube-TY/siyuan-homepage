import { WIDGET_CONTENT_CATEGORY_LABELS } from "./homepage-agent-widget-catalog";
import type { HomepageAgentSurface, HomepageWidgetResolutionStatus } from "./homepage-manage-types";

/**
 * 主页 Agent 布局引用解析与分类的纯函数集合。
 *
 * 这些函数不依赖 siyuan 内核、设备视图存储或组件配置文件系统，
 * 可在 Node 测试环境中直接验证。HomepageAgentService 是这些决策的薄封装。
 */

export interface OverviewWidgetRow {
  status: HomepageWidgetResolutionStatus;
  /** resolved 时才参与 type 计数。 */
  type?: string | null;
}

export interface OverviewCounts {
  resolvedWidgetCount: number;
  missingConfigWidgetCount: number;
  widgetTypeCounts: Record<string, number>;
}

export function computeOverviewCounts(rows: readonly OverviewWidgetRow[]): OverviewCounts {
  const counts: OverviewCounts = {
    resolvedWidgetCount: 0,
    missingConfigWidgetCount: 0,
    widgetTypeCounts: {},
  };
  for (const row of rows) {
    if (row.status === "resolved") {
      counts.resolvedWidgetCount += 1;
      const type = (row.type && row.type.trim()) || "unknown";
      counts.widgetTypeCounts[type] = (counts.widgetTypeCounts[type] ?? 0) + 1;
    } else {
      counts.missingConfigWidgetCount += 1;
    }
  }
  return counts;
}

export function missingConfigWarningText(count: number): string {
  return `当前布局包含 ${count} 个缺失组件配置的引用，无法识别类型或正常渲染。`;
}

export interface WidgetCategorySourceItem {
  activeTab: string;
}

/** 桌面与移动主页统一使用组件内容分类 activeTab。 */
export function surfaceCategoryId(_surface: HomepageAgentSurface, item: WidgetCategorySourceItem): string {
  return item.activeTab;
}

/** 按 surface 返回分类中文标签。 */
export function surfaceCategoryLabel(_surface: HomepageAgentSurface, item: WidgetCategorySourceItem): string {
  return WIDGET_CONTENT_CATEGORY_LABELS[item.activeTab] ?? item.activeTab;
}

export function surfaceCategorySource(_surface: HomepageAgentSurface): string {
  return "widget-content-category";
}

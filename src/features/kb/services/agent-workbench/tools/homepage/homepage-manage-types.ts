export type HomepageAgentSurface = "desktop-homepage" | "mobile-homepage";

/**
 * 布局引用对应的组件配置解析状态：
 * - resolved: layout 中存在，且能读取到合法组件配置文档；
 * - legacy_unresolved: layout 中存在，配置文档明确不存在，且当前 manifest
 *   migration.unresolvedLegacyWidgetIds 明确声明该 ID 为旧版迁移残留；
 * - missing_config: layout 中存在，配置文档当前不存在，但 manifest 没有
 *   明确声明该 ID 是 legacy unresolved。
 */
export type HomepageWidgetResolutionStatus = "resolved" | "legacy_unresolved" | "missing_config";

export interface HomepageSurfaceArgs {
  surface?: HomepageAgentSurface;
}

export interface HomepageWidgetArgs extends HomepageSurfaceArgs {
  widgetId: string;
  expectedType?: string;
}

export interface HomepageAgentReadResult {
  status: "ok" | "degraded";
  surface: HomepageAgentSurface;
  [key: string]: unknown;
}

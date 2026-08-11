export type HomepageAgentSurface = "desktop-homepage" | "mobile-homepage";

/**
 * 布局引用对应的组件配置解析状态：
 * - resolved: layout 中存在，且能读取到合法组件配置文档；
 * - missing_config: layout 中存在，但组件配置文档当前不存在。
 */
export type HomepageWidgetResolutionStatus = "resolved" | "missing_config";

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

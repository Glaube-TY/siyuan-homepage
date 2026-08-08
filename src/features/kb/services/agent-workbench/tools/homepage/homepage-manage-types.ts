export type HomepageAgentSurface = "desktop-homepage" | "mobile-homepage";

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

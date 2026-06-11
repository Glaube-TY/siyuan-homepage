/**
 * Composition: register web tools (web_search, web_read_page).
 * These are global web access tools, not bound to any specific domain.
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createWebSearchTool } from "../tools/web-search/web-search.tool";
import { createWebReadPageTool } from "../tools/web-search/web-read-page.tool";
import type { WebSearchProvider } from "../tools/web-search/web-search-provider";

export interface WebToolOptions {
  /** When present, registers web_search. */
  webSearchToolDeps?: {
    getProvider(): WebSearchProvider;
    maxResults: number;
    timeoutMs: number;
  };
  /** When present and not disabled, registers web_read_page. */
  webReadPageToolDeps?: {
    readProxyEndpoint?: string;
    readPageMaxChars: number;
    timeoutMs: number;
  };
  globalToolAccess?: {
    webReadPage: boolean;
  };
}

export function registerWebTools(
  toolRegistry: ToolRegistry,
  options: WebToolOptions = {},
): void {
  if (options.webSearchToolDeps) {
    toolRegistry.ensureTool(createWebSearchTool({
      getProvider: options.webSearchToolDeps.getProvider,
      maxResults: options.webSearchToolDeps.maxResults,
      timeoutMs: options.webSearchToolDeps.timeoutMs,
    }));
  }

  if (options.webReadPageToolDeps && options.globalToolAccess?.webReadPage !== false) {
    toolRegistry.ensureTool(createWebReadPageTool({
      readProxyEndpoint: options.webReadPageToolDeps.readProxyEndpoint,
      readPageMaxChars: options.webReadPageToolDeps.readPageMaxChars,
      timeoutMs: options.webReadPageToolDeps.timeoutMs,
    }));
  }
}

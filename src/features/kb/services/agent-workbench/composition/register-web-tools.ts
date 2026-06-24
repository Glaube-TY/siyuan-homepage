/**
 * Composition: register web tools (web_search, web_read_page, web_http_get, web_http_post).
 * These are global web access tools, not bound to any specific domain.
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createWebSearchTool } from "../tools/web-search/web-search.tool";
import { createWebReadPageTool } from "../tools/web-search/web-read-page.tool";
import { createWebHttpGetTool, createWebHttpPostTool } from "../tools/web-search/web-http-api.tool";
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
    webHttpGet: boolean;
    webHttpPost: boolean;
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

  // Register HTTP API tools — gated by globalToolAccess switches
  const httpTimeout = options.webReadPageToolDeps?.timeoutMs ?? 15000;
  if (options.globalToolAccess?.webHttpGet !== false) {
    toolRegistry.ensureTool(createWebHttpGetTool({ timeoutMs: httpTimeout }));
  }
  if (options.globalToolAccess?.webHttpPost !== false) {
    toolRegistry.ensureTool(createWebHttpPostTool({ timeoutMs: httpTimeout }));
  }
}

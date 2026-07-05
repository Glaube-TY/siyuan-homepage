/**
 * Composition: register web_fetch aggregate tool.
 * These are global web access tools, not bound to any specific domain.
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createReadPageActionTool } from "../tools/web-search/web-read-page.tool";
import { createHttpGetActionTool, createHttpPostActionTool } from "../tools/web-search/web-http-api.tool";
import { createAggregateTool, type AggregateActionBinding } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";

export interface WebToolOptions {
  /** When present and not disabled, registers web_fetch.read_page. */
  webReadPageToolDeps?: {
    readProxyEndpoint?: string;
    readPageMaxChars: number;
    timeoutMs: number;
  };
  globalToolAccess?: {
    webFetch: boolean;
  };
}

export function registerWebTools(
  toolRegistry: ToolRegistry,
  options: WebToolOptions = {},
): void {
  if (options.globalToolAccess?.webFetch === false) return;
  const actions: AggregateActionBinding[] = [];
  if (options.webReadPageToolDeps) {
    actions.push({
      action: "read_page",
      tool: createReadPageActionTool({
        readProxyEndpoint: options.webReadPageToolDeps.readProxyEndpoint,
        readPageMaxChars: options.webReadPageToolDeps.readPageMaxChars,
        timeoutMs: options.webReadPageToolDeps.timeoutMs,
      }),
    });
  }
  const httpTimeout = options.webReadPageToolDeps?.timeoutMs ?? 15000;
  actions.push(
    { action: "http_get", tool: createHttpGetActionTool({ timeoutMs: httpTimeout }) },
    { action: "http_post", tool: createHttpPostActionTool({ timeoutMs: httpTimeout }) },
  );
  const meta = findAggregateToolMeta("web_fetch");
  toolRegistry.ensureTool(createAggregateTool({
    name: "web_fetch",
    title: meta?.title ?? "网页与 HTTP",
    description: meta?.description ?? "读取网页或调用 HTTP API。",
    boundary: meta?.boundary ?? "只访问公开 http/https URL；POST 需要确认。",
    source: "builtin",
    actions,
  }));
}

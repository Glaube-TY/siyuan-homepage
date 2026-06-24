/**
 * Runtime tool resolver — high-level API for command resolution.
 *
 * Provides a singleton-like interface that caches detection results
 * and exposes helpers for MCP/command runner integration.
 */

import type { RuntimeToolDetection, RuntimeToolName, RuntimeToolReport, RuntimeToolsSettings } from "./runtime-tool-types";
import { detectRuntimeTools, resolveCommandForSpawn, buildMergedPath } from "./runtime-tool-detector";
import { DEFAULT_RUNTIME_TOOLS_SETTINGS } from "../../../constants/default-settings";

let cachedReport: RuntimeToolReport | null = null;
let cachedSettings: RuntimeToolsSettings | null = null;

/**
 * Get or refresh the runtime tool detection report.
 * Returns cached results if settings haven't changed; otherwise re-detects.
 */
export function getRuntimeToolReport(settings?: RuntimeToolsSettings): RuntimeToolReport {
  const effective = settings ?? DEFAULT_RUNTIME_TOOLS_SETTINGS;

  // Simple cache: if settings object is the same reference, return cached
  if (cachedReport && cachedSettings === effective) {
    return cachedReport;
  }

  cachedReport = detectRuntimeTools(effective);
  cachedSettings = effective;
  return cachedReport;
}

/**
 * Force a fresh detection (e.g. user clicked "detect" in settings UI).
 */
export function refreshRuntimeToolReport(settings: RuntimeToolsSettings): RuntimeToolReport {
  cachedReport = detectRuntimeTools(settings);
  cachedSettings = settings;
  return cachedReport;
}

/**
 * Get detection result for a single tool.
 */
export function getToolDetection(
  name: RuntimeToolName,
  settings?: RuntimeToolsSettings,
): RuntimeToolDetection {
  return getRuntimeToolReport(settings).tools[name];
}

/**
 * Resolve a command for spawn, returning the resolved absolute path and merged PATH env.
 * Used by MCP stdio connection and notebrain command runner.
 *
 * @returns null if command cannot be resolved (caller should fall back to raw command).
 */
export function resolveForSpawn(
  command: string,
  settings?: RuntimeToolsSettings,
): { resolvedPath: string; envPATH: string } | null {
  return resolveCommandForSpawn(command, settings ?? DEFAULT_RUNTIME_TOOLS_SETTINGS);
}

/**
 * Build the merged environment PATH for child process spawn.
 * Merges extraPathDirs with system PATH.
 */
export function getMergedEnvPATH(settings?: RuntimeToolsSettings): string {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  if (!req) return "";
  try {
    const processModule = req("node:process");
    const isWindows = processModule.platform === "win32";
    const sep = isWindows ? ";" : ":";
    const systemPath = processModule.env?.PATH ?? processModule.env?.Path ?? "";
    return buildMergedPath((settings ?? DEFAULT_RUNTIME_TOOLS_SETTINGS).extraPathDirs, systemPath, sep);
  } catch {
    return "";
  }
}

/**
 * Build spawn env with merged PATH. Used by MCP and command runner.
 */
export function buildSpawnEnv(settings?: RuntimeToolsSettings): Record<string, string> {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  if (!req) return {};
  try {
    const processModule = req("node:process");
    const mergedPath = getMergedEnvPATH(settings);
    return {
      ...processModule.env,
      PATH: mergedPath,
      ...(processModule.platform === "win32" ? { Path: mergedPath } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Format a short status summary for Agent context.
 * Only includes tools that are relevant (node ecosystem + git + python).
 */
export function formatRuntimeToolStatusForAgent(settings?: RuntimeToolsSettings): string {
  const report = getRuntimeToolReport(settings);
  const importantTools: RuntimeToolName[] = ["node", "npx", "npm", "git", "python", "uvx"];
  const lines: string[] = [];

  for (const name of importantTools) {
    const det = report.tools[name];
    if (!det) continue;
    if (det.available) {
      lines.push(`- ${name}: available (${det.resolvedPath})`);
    } else {
      lines.push(`- ${name}: NOT AVAILABLE${det.warning ? ` — ${det.warning}` : ""}`);
    }
  }

  return lines.join("\n");
}

/** Clear cached report (e.g. when settings change). */
export function clearRuntimeToolCache(): void {
  cachedReport = null;
  cachedSettings = null;
}

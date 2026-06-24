/**
 * Runtime tool detector — finds commands on the system PATH.
 *
 * Uses only Node built-ins (fs, path, child_process) via dynamic require
 * so it works in Electron without bundler issues.
 */

import type { RuntimeToolDetection, RuntimeToolName, RuntimeToolReport, RuntimeToolsSettings } from "./runtime-tool-types";

function getNodeRequire(): ((id: string) => any) | null {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  return typeof req === "function" ? req : null;
}

/** Split PATH env into directories. */
function splitPathDirs(pathEnv: string, sep: string): string[] {
  return pathEnv
    .split(sep)
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

/** Merge system PATH with extraPathDirs (extra dirs prepended). */
export function buildMergedPath(
  extraPathDirs: string[],
  systemPath: string,
  sep: string,
): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const dir of [...extraPathDirs, ...splitPathDirs(systemPath, sep)]) {
    const normalized = dir.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      merged.push(dir);
    }
  }
  return merged.join(sep);
}

/**
 * On Windows, check a candidate path with extension variants.
 * Priority: .cmd > .exe > bare name.
 * Returns the first existing path, or null.
 */
function tryWithWindowsExtensions(
  basePath: string,
  fsModule: any,
  isWindows: boolean,
  preferExe?: boolean,
): string | null {
  if (!isWindows) {
    return fsModule.existsSync(basePath) ? basePath : null;
  }
  const lower = basePath.toLowerCase();
  // If user already specified an exact extension, try that first
  if (lower.endsWith(".exe") || lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    if (fsModule.existsSync(basePath)) return basePath;
  }
  // Try extensions in priority order:
  //   npx/npm: .cmd > .exe > .bat (cmd wrappers are the real entry point on Windows)
  //   node/git/python/etc: .exe > .cmd > .bat (native executables preferred)
  const exts = preferExe ? [".exe", ".cmd", ".bat"] : [".cmd", ".exe", ".bat"];
  for (const ext of exts) {
    const candidate = basePath + ext;
    if (fsModule.existsSync(candidate)) return candidate;
  }
  // Only after all extensions fail, try bare name
  if (fsModule.existsSync(basePath)) return basePath;
  return null;
}

/**
 * Detect a single tool by searching PATH directories.
 *
 * @param name  The base command name (e.g. "npx").
 * @param pathDirs  Directories to search (already merged).
 * @param isWindows  Whether to try Windows extensions.
 * @param fsModule  Node fs module.
 * @param pathModule  Node path module.
 * @param preferExe  For node/git/python — prefer .exe over .cmd.
 * @param avoidWindowsApps  For python — try to skip WindowsApps stub.
 */
function detectSingle(
  name: string,
  pathDirs: string[],
  isWindows: boolean,
  fsModule: any,
  pathModule: any,
  preferExe = false,
  avoidWindowsApps = false,
): RuntimeToolDetection {
  const candidates: string[] = [];
  let found: string | undefined;
  let foundSource: "auto_detected" | "not_found" | "user_override" = "auto_detected";

  for (const dir of pathDirs) {
    const base = pathModule.join(dir, name);
    if (!isWindows) {
      if (fsModule.existsSync(base)) {
        candidates.push(base);
        if (!found) found = base;
      }
      continue;
    }

    // Windows: check extensions in priority order
    const exts = preferExe ? [".exe", ".cmd", ".bat"] : [".cmd", ".exe", ".bat"];
    for (const ext of exts) {
      const candidate = base + ext;
      if (fsModule.existsSync(candidate)) {
        candidates.push(candidate);
        // Skip WindowsApps python stub unless it's the only option
        const isWindowsApps = dir.toLowerCase().includes("windowsapps");
        if (avoidWindowsApps && isWindowsApps && found) {
          continue; // Skip this candidate for primary selection
        }
        if (!found || (preferExe && ext === ".exe" && !found.endsWith(".exe"))) {
          found = candidate;
        }
      }
    }
    // Also check bare name (some PATH entries have it)
    if (fsModule.existsSync(base)) {
      candidates.push(base);
      if (!found) found = base;
    }
  }

  if (found) {
    return {
      available: true,
      resolvedPath: found,
      candidates,
      source: foundSource,
      lastCheckedAt: Date.now(),
    };
  }

  let warning = `命令 "${name}" 未在 PATH 中找到。`;
  if (isWindows) {
    warning += ` 请确认已安装 ${name} 并将其目录加入 PATH，或在设置中手动指定完整路径。`;
  } else {
    warning += ` 请确认已安装 ${name} 并且其所在目录在系统 PATH 中。`;
  }
  return {
    available: false,
    candidates,
    source: "not_found",
    warning,
    lastCheckedAt: Date.now(),
  };
}

/** Tools to detect and their configuration. */
interface ToolDetectConfig {
  name: RuntimeToolName;
  preferExe?: boolean;
  avoidWindowsApps?: boolean;
}

const TOOL_CONFIGS: ToolDetectConfig[] = [
  { name: "node", preferExe: true },
  { name: "npm" },
  { name: "npx" },
  { name: "git", preferExe: true },
  { name: "python", preferExe: true, avoidWindowsApps: true },
  { name: "python3", preferExe: true, avoidWindowsApps: true },
  { name: "py", preferExe: true },
  { name: "uv", preferExe: true },
  { name: "uvx", preferExe: true },
];

/**
 * Run full detection for all tracked tools.
 * Returns a report with per-tool results and the merged PATH used.
 */
export function detectRuntimeTools(settings: RuntimeToolsSettings): RuntimeToolReport {
  const req = getNodeRequire();
  if (!req) {
    // Not in Electron — return empty report
    const emptyTools: Record<RuntimeToolName, RuntimeToolDetection> = {} as any;
    for (const config of TOOL_CONFIGS) {
      emptyTools[config.name] = {
        available: false,
        candidates: [],
        source: "not_found",
        warning: "当前环境不支持本地命令检测（需要 PC/Electron）。",
        lastCheckedAt: Date.now(),
      };
    }
    return { tools: emptyTools, mergedPath: "", platform: "unknown" };
  }

  const processModule = req("node:process");
  const pathModule = req("node:path");
  const fsModule = req("node:fs");

  const isWindows = processModule.platform === "win32";
  const pathSep = isWindows ? ";" : ":";
  const systemPath = processModule.env?.PATH ?? processModule.env?.Path ?? "";
  const mergedPath = buildMergedPath(settings.extraPathDirs, systemPath, pathSep);
  const pathDirs = splitPathDirs(mergedPath, pathSep);

  const tools: Record<RuntimeToolName, RuntimeToolDetection> = {} as any;

  for (const config of TOOL_CONFIGS) {
    // User override takes priority
    const override = settings.commandOverrides[config.name];
    if (override) {
      const resolved = tryWithWindowsExtensions(override, fsModule, isWindows);
      tools[config.name] = {
        available: !!resolved,
        resolvedPath: resolved ?? undefined,
        candidates: resolved ? [resolved] : [],
        source: "user_override",
        warning: resolved ? undefined : `用户指定的路径不存在: ${override}`,
        lastCheckedAt: Date.now(),
      };
      continue;
    }

    const detection = detectSingle(
      config.name,
      pathDirs,
      isWindows,
      fsModule,
      pathModule,
      config.preferExe,
      config.avoidWindowsApps,
    );

    // For python with avoidWindowsApps: if we skipped a WindowsApps stub,
    // re-check without the avoidance filter as fallback
    if (!detection.available && config.avoidWindowsApps) {
      const fallback = detectSingle(
        config.name,
        pathDirs,
        isWindows,
        fsModule,
        pathModule,
        config.preferExe,
        false, // Don't avoid WindowsApps for fallback
      );
      if (fallback.available) {
        fallback.warning = `${config.name} 仅找到 WindowsApps 启动别名，可能不是完整安装。`;
        tools[config.name] = fallback;
        continue;
      }
    }

    tools[config.name] = detection;
  }

  return { tools, mergedPath, platform: processModule.platform };
}

/**
 * Quote a single argument for Windows cmd.exe /d /s /c.
 *
 * cmd.exe quoting rules:
 *   - Backslashes are NOT escape characters (unlike C/Unix shells)
 *   - Double quotes delimit the quoted region
 *   - Inside a quoted region, \" can embed a literal quote (CRT convention)
 *   - For MCP args (paths, @scope/pkg, flags), we never expect embedded "
 *
 * Strategy: if arg is safe (alphanum, path chars, @, -), return as-is.
 * Otherwise wrap in double quotes, leaving backslashes literal.
 * For embedded double quotes, use CRT \" escape.
 */
export function quoteWindowsCmdArg(arg: string): string {
  // Fast path: no special characters that need quoting
  if (/^[a-zA-Z0-9_@./\\:,-]+$/.test(arg)) {
    return arg;
  }
  // No embedded double quotes — just wrap in double quotes, backslashes literal
  if (!arg.includes('"')) {
    return `"${arg}"`;
  }
  // Has embedded double quotes — use CRT escape: \" for each internal "
  // Backslashes before " must be doubled to avoid ambiguity (CRT rule)
  let escaped = "";
  let backslashRun = 0;
  for (const ch of arg) {
    if (ch === "\\") {
      backslashRun++;
    } else if (ch === '"') {
      // Double the preceding backslashes (so CRT parser knows they're literal)
      escaped += "\\".repeat(backslashRun * 2) + '\\"';
      backslashRun = 0;
    } else {
      if (backslashRun > 0) {
        escaped += "\\".repeat(backslashRun);
        backslashRun = 0;
      }
      escaped += ch;
    }
  }
  if (backslashRun > 0) escaped += "\\".repeat(backslashRun);
  return `"${escaped}"`;
}

/**
 * Quick check: resolve a specific command name using current settings.
 * Used by MCP and command runner before spawn.
 */
export function resolveCommandForSpawn(
  command: string,
  settings: RuntimeToolsSettings,
): { resolvedPath: string; envPATH: string } | null {
  const req = getNodeRequire();
  if (!req) return null;

  const processModule = req("node:process");
  const pathModule = req("node:path");
  const fsModule = req("node:fs");

  const isWindows = processModule.platform === "win32";
  const pathSep = isWindows ? ";" : ":";
  const systemPath = processModule.env?.PATH ?? processModule.env?.Path ?? "";
  const mergedPath = buildMergedPath(settings.extraPathDirs, systemPath, pathSep);
  const pathDirs = splitPathDirs(mergedPath, pathSep);

  // Already absolute — use as-is if exists
  if (pathModule.isAbsolute(command)) {
    const resolved = tryWithWindowsExtensions(command, fsModule, isWindows);
    return resolved ? { resolvedPath: resolved, envPATH: mergedPath } : null;
  }

  // Check user override first
  const baseName = pathModule.basename(command);
  const override = settings.commandOverrides[baseName] || settings.commandOverrides[command];
  if (override) {
    const resolved = tryWithWindowsExtensions(override, fsModule, isWindows);
    if (resolved) return { resolvedPath: resolved, envPATH: mergedPath };
  }

  // Search PATH
  const isKnownTool = ["node", "npm", "npx", "git", "python", "python3", "py", "uv", "uvx"].includes(baseName);
  const preferExe = ["node", "git", "python", "python3", "py", "uv", "uvx"].includes(baseName);

  for (const dir of pathDirs) {
    const base = pathModule.join(dir, command);
    if (isWindows && isKnownTool) {
      const exts = preferExe ? [".exe", ".cmd", ".bat"] : [".cmd", ".exe", ".bat"];
      // Extensions first — bare name last (avoid bare npx when npx.cmd exists)
      for (const ext of exts) {
        const candidate = base + ext;
        if (fsModule.existsSync(candidate)) return { resolvedPath: candidate, envPATH: mergedPath };
      }
      // Only after all extensions fail, try bare name
      if (fsModule.existsSync(base)) return { resolvedPath: base, envPATH: mergedPath };
    } else {
      if (fsModule.existsSync(base)) return { resolvedPath: base, envPATH: mergedPath };
    }
  }

  return null;
}

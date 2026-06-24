/**
 * Runtime tool types — unified command resolution for MCP, command runner, etc.
 */

/** Well-known tool names that the resolver knows about. */
export type RuntimeToolName =
  | "node"
  | "npm"
  | "npx"
  | "git"
  | "python"
  | "python3"
  | "py"
  | "uv"
  | "uvx";

/** Per-tool detection result. */
export interface RuntimeToolDetection {
  /** Whether the tool was found. */
  available: boolean;
  /** Resolved absolute path if found. */
  resolvedPath?: string;
  /** All candidate paths found during detection. */
  candidates: string[];
  /** How this tool was resolved: "user_override" | "auto_detected" | "not_found". */
  source: "user_override" | "auto_detected" | "not_found";
  /** Human-readable warning if not found or degraded. */
  warning?: string;
  /** Timestamp of last check. */
  lastCheckedAt: number;
}

/** Full detection report for all tracked tools. */
export interface RuntimeToolReport {
  tools: Record<RuntimeToolName, RuntimeToolDetection>;
  /** Merged PATH used for detection (extraPathDirs + system PATH). */
  mergedPath: string;
  /** Platform info. */
  platform: NodeJS.Platform | string;
}

/** User-facing settings for runtime tools. */
export interface RuntimeToolsSettings {
  /** Master switch — when false, detection still runs but results are not exposed to Agent. */
  enabled: boolean;
  /** Whether to include runtime tool status in Agent context instructions. */
  exposeToAgent: boolean;
  /** Additional directories to prepend to PATH for command lookup. */
  extraPathDirs: string[];
  /** User-specified command overrides, e.g. { "npx": "C:\\APP\\nodejs\\npx.cmd" }. */
  commandOverrides: Record<string, string>;
  /** Cached detection results (persisted for quick UI display; refreshed on demand). */
  detectedTools?: Record<string, RuntimeToolDetection>;
}

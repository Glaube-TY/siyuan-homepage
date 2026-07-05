import type { NotebrainAgentWorkspaceSettings, NotebrainPermissionAction } from "../../../types/settings";

function wildcardToRegExp(rule: string): RegExp {
  const escaped = rule
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesRule(command: string, rule: string): boolean {
  const normalizedRule = rule.trim();
  if (!normalizedRule) return false;
  if (normalizedRule === "*") return true;
  if (normalizedRule.includes("*") || normalizedRule.includes("?")) {
    return wildcardToRegExp(normalizedRule).test(command);
  }
  return command.toLowerCase().includes(normalizedRule.toLowerCase());
}

function firstMatchingRule(command: string, rules: readonly string[]): string | undefined {
  return rules.find((rule) => matchesRule(command, rule));
}

export function evaluateNotebrainCommandPermission(
  settings: NotebrainAgentWorkspaceSettings,
  command: string,
): { action: NotebrainPermissionAction; matchedRule?: string } {
  const trimmed = command.trim();
  const deny = firstMatchingRule(trimmed, settings.commandDenyRules);
  if (deny) return { action: "deny", matchedRule: deny };
  const allow = firstMatchingRule(trimmed, settings.commandAllowRules);
  if (allow) return { action: "allow", matchedRule: allow };
  const ask = firstMatchingRule(trimmed, settings.commandAskRules);
  if (ask) return { action: "ask", matchedRule: ask };
  return { action: settings.commandDefaultAction };
}

// ── Command risk analysis (heuristic, not a real OS sandbox) ──

export interface CommandRiskResult {
  level: "low" | "medium" | "high";
  reasons: string[];
  hardDeny: boolean;
  categories: string[];
}

/** Patterns that indicate system info / privacy reading. */
const SYSTEM_INFO_PATTERNS = [
  "systeminfo", "wmic", "ipconfig", "whoami", "hostname",
  "net user", "net view", "reg query", "getmac", "tasklist", "ver", "msinfo32",
  /\bset\s/,
  /\benv\s/,
];

/** Patterns that indicate strong shell / scripting. */
const STRONG_SHELL_PATTERNS = [
  "powershell", "pwsh", "cmd /c", "bash -c", "sh -c",
  "cmd.exe /c", "cmd /d /s /c", "cmd.exe /d /s /c",
  "start-process", "invoke-expression", "iex",
];

/** Patterns that indicate file read/write/delete. */
const FILE_OPS_PATTERNS = [
  "type ", "more ", "copy ", "xcopy", "robocopy",
  "del ", "erase", "rd ", "rmdir", "rm ", "mv ", "cp ",
  "cat ", "move ", "ren ", "rename", "dir ", "ls ",
];

/** Patterns that indicate network outbound. */
const NETWORK_PATTERNS = [
  "curl", "wget", "invoke-webrequest", "iwr",
  "invoke-restmethod", "nc ", "netcat", "telnet",
];

/** Characters that indicate pipe or redirect. */
const PIPE_REDIRECT_CHARS = ["|", ">", ">>", "<"];

/** Patterns that indicate destructive version control operations. */
const DESTRUCTIVE_VCS_PATTERNS = [
  "git reset",
  "git clean",
  "git checkout --",
  "git checkout .",
  "git restore --source",
  "git restore --staged",
];

export function analyzeNotebrainCommandRisk(
  command: string,
  settings: {
    strictMode: boolean;
    allowNetworkAccess: boolean;
    allowSystemInfoCommands: boolean;
    allowAbsolutePaths: boolean;
  },
): CommandRiskResult {
  const reasons: string[] = [];
  const categories: string[] = [];
  let level: "low" | "medium" | "high" = "low";
  const lower = command.toLowerCase().replace(/\s+/g, " ");
  let hasSystemInfo = false;
  let hasStrongShell = false;
  let hasDangerousDelete = false;
  let hasAbsolutePath = false;
  let hasPipeRedirect = false;
  let hasNetwork = false;
  let hasDestructiveVcs = false;

function patternMatches(commandText: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    if (!pattern) return false;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}`).test(commandText);
  }
  return pattern.test(commandText);
}

function patternDisplay(pattern: string | RegExp): string {
  return typeof pattern === "string" ? pattern : pattern.source;
}

  // System info / privacy
  for (const pattern of SYSTEM_INFO_PATTERNS) {
    if (patternMatches(lower, pattern)) {
      reasons.push(`会读取本机系统/网络/用户信息（${patternDisplay(pattern)}）`);
      categories.push("system_info");
      hasSystemInfo = true;
      if (!settings.allowSystemInfoCommands) level = "high";
      else if (level === "low") level = "medium";
      break;
    }
  }

  // Strong shell
  for (const pattern of STRONG_SHELL_PATTERNS) {
    if (patternMatches(lower, pattern)) {
      reasons.push(`使用强 shell/脚本引擎（${patternDisplay(pattern)}）`);
      categories.push("strong_shell");
      hasStrongShell = true;
      level = "high";
      break;
    }
  }

  // File operations
  for (const pattern of FILE_OPS_PATTERNS) {
    if (patternMatches(lower, pattern)) {
      reasons.push(`可能修改或删除文件（${patternDisplay(pattern).trim()}）`);
      categories.push("file_ops");
      if (level !== "high") level = "medium";
      // Mark dangerous delete verbs
      if (["del ", "erase", "rd ", "rmdir", "rm "].some((p) => patternDisplay(pattern).includes(p))) {
        hasDangerousDelete = true;
      }
      break;
    }
  }

  // Network
  for (const pattern of NETWORK_PATTERNS) {
    if (patternMatches(lower, pattern)) {
      reasons.push(`会发起外部网络请求（${patternDisplay(pattern)}）`);
      categories.push("network");
      hasNetwork = true;
      if (!settings.allowNetworkAccess) level = "high";
      else if (level === "low") level = "medium";
      break;
    }
  }

  // Absolute paths (match anywhere in command, not just start)
  // Windows drive letter must be preceded by start-of-string or whitespace
  // so that URLs like http://example.com are not flagged.
  if (
    /(?:^|\s)[a-z]:[\\/]/i.test(lower) ||
    /\\\\[^\\/\s]+[\\/][^\\/\s]+/.test(command) ||
    /\/home\b|\/etc\b|\/users\b|\/root\b|\/tmp\b|\/var\b/.test(lower)
  ) {
    reasons.push("包含绝对路径，可能访问 notebrain 工作区外路径");
    categories.push("absolute_path");
    hasAbsolutePath = true;
    if (!settings.allowAbsolutePaths) level = "high";
  }

  // Parent path
  if (/\.\./.test(command)) {
    reasons.push("包含父级路径 (..)，可能逃逸工作区");
    categories.push("parent_path");
    level = "high";
  }

  // Destructive version control operations
  for (const pattern of DESTRUCTIVE_VCS_PATTERNS) {
    if (lower.includes(pattern)) {
      reasons.push(`包含破坏性版本控制操作（${pattern}）`);
      categories.push("destructive_vcs");
      hasDestructiveVcs = true;
      level = "high";
      break;
    }
  }

  // Pipe / redirect
  for (const ch of PIPE_REDIRECT_CHARS) {
    if (command.includes(ch)) {
      reasons.push(`包含管道或重定向（${ch}）`);
      categories.push("pipe_redirect");
      hasPipeRedirect = true;
      level = "high";
      break;
    }
  }

  const hardDeny = settings.strictMode && (
    (hasSystemInfo && !settings.allowSystemInfoCommands) ||
    (hasAbsolutePath && !settings.allowAbsolutePaths) ||
    (hasNetwork && !settings.allowNetworkAccess) ||
    hasStrongShell ||
    hasDangerousDelete ||
    hasDestructiveVcs ||
    hasPipeRedirect
  );

  return { level, reasons, hardDeny, categories };
}


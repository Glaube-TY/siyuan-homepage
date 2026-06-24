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


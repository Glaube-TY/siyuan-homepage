/**
 * Notebrain 本地命令运行时。
 *
 * 该文件不再提供独立的 provider-visible native tool；命令执行能力由
 * `notebrain_file.run_command` 聚合工具 action 暴露。此处仅保留
 * preview 构建与实际执行逻辑，供聚合 action 调用。
 */

import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { ToolResult } from "../../../agent-workbench/contracts/tool-contract";
import type { RunNotebrainCommandArgs, RunNotebrainCommandResult } from "../../../agent-workbench/command/notebrain-command-runner";
import { runNotebrainCommand } from "../../../agent-workbench/command/notebrain-command-runner";
import { evaluateNotebrainCommandPermission, analyzeNotebrainCommandRisk } from "../../../agent-workbench/command/notebrain-command-policy";
import { getNotebrainRuntimeEnvironment } from "../../../agent-workbench/workspace/notebrain-runtime-env";
import { toProjectDefaultRelativePath } from "../../../agent-workbench/workspace/notebrain-workspace-paths";
import { pushAgentDebugEvent } from "../../../agent-workbench/debug/workbench-debug";

function redactCommandPreviewText(value: unknown, max = 240): string {
  const protectedUrls: string[] = [];
  const text = String(value ?? "")
    .replace(/\bhttps?:\/\/[^\s"`<>]+/gi, (match) => {
      try {
        const url = new URL(match);
        for (const key of Array.from(url.searchParams.keys())) {
          if (/(^|[_-])(token|api[_-]?key|apikey|secret|password|authorization|bearer|cookie|credential|private[_-]?key)([_-]|$)/i.test(key)) {
            url.searchParams.set(key, "[REDACTED]");
          }
        }
        const index = protectedUrls.push(url.toString().replace(/%5BREDACTED%5D/gi, "[REDACTED]")) - 1;
        return `__NB_COMMAND_URL_${index}__`;
      } catch {
        const index = protectedUrls.push(match) - 1;
        return `__NB_COMMAND_URL_${index}__`;
      }
    })
    .replace(/Authorization\s*:\s*Bearer\s+[^\s,;"']+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/\b(token|api_key|apikey|password|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [REDACTED]")
    .replace(/([A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*|\/(?:home|mnt\/data|data|workspace|Users|var|tmp|opt|root)(?:\/[^\s"`<>]*)?)/g, "[path]")
    .replace(/__NB_COMMAND_URL_(\d+)__/g, (_, rawIndex: string) => protectedUrls[Number(rawIndex)] ?? "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

function parseRunCommandArgs(args: Record<string, unknown>): RunNotebrainCommandArgs {
  return {
    command: typeof args.command === "string" ? args.command : "",
    cwd: typeof args.cwd === "string" ? args.cwd : ".",
    timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
    maxOutputChars: typeof args.maxOutputChars === "number" ? args.maxOutputChars : undefined,
  };
}

export function buildNotebrainCommandPermissionPreview(
  args: Record<string, unknown>,
  settings: NotebrainAgentWorkspaceSettings,
): Record<string, unknown> {
  const parsed = parseRunCommandArgs(args);
  const command = parsed.command;
  const policy = evaluateNotebrainCommandPermission(settings, command);
  const risk = analyzeNotebrainCommandRisk(command, {
    strictMode: settings.commandStrictWorkspaceMode !== false,
    allowNetworkAccess: settings.allowNetworkAccess === true,
    allowSystemInfoCommands: settings.allowSystemInfoCommands === true,
    allowAbsolutePaths: settings.allowAbsolutePaths === true,
  });
  const cwd = toProjectDefaultRelativePath(parsed.cwd ?? ".");
  const safeCommand = redactCommandPreviewText(command, 500);
  const safeCwd = redactCommandPreviewText(cwd, 180);
  const riskDisplayLevel = risk.level;
  const riskLabel = riskDisplayLevel === "high" ? "⚠ 高风险" : riskDisplayLevel === "medium" ? "中风险" : "低风险";
  const summaryParts = [
    `命令：${safeCommand}`,
    `cwd：${safeCwd}`,
    `风险：${riskLabel}`,
    ...risk.reasons.map((r) => `- ${r}`),
    settings.commandStrictWorkspaceMode !== false ? "严格模式：是" : "严格模式：否",
  ];

  return {
    title: riskDisplayLevel === "high" ? `本地命令执行 ⚠ 高风险` : "本地命令执行",
    risk: riskDisplayLevel === "high" ? "high" : riskDisplayLevel === "medium" ? "medium" : "low",
    summary: summaryParts.join("\n"),
    permissionAction: risk.hardDeny ? "deny" : policy.action,
    permissionReasonCode: risk.hardDeny
      ? "safety_blocked"
      : policy.action === "deny"
        ? "permission_denied"
        : undefined,
    permissionReason: risk.hardDeny
      ? `严格工作区模式已拒绝高风险命令：${risk.reasons.join("；")}`
      : policy.action === "deny"
        ? `命令匹配 deny 规则：${policy.matchedRule ?? ""}`
        : undefined,
    operationLabel: "执行 Notebrain 本地命令",
    targetSummary: `cwd=${safeCwd}`,
    impactSummary: "将在 notebrain/projects/default 限制工作区内执行非交互式命令。",
    riskReason: risk.reasons.length > 0 ? risk.reasons.join("；") : "本地命令不是系统级沙箱，仅有 cwd 限制。",
    warnings: [
      "这不是系统级沙箱，只限制 cwd。",
      ...risk.reasons,
      ...(risk.hardDeny ? ["严格模式已拒绝，不进入确认执行。"] : []),
    ],
    sections: [
      { label: "命令", value: safeCommand },
      { label: "cwd", value: safeCwd },
      { label: "执行限制", value: `${settings.commandStrictWorkspaceMode !== false ? "严格模式：开启" : "严格模式：关闭"}\n不是系统级沙箱，仅限制 cwd。` },
      { label: "运行参数", value: [`timeout=${parsed.timeoutMs ?? settings.defaultCommandTimeoutMs}`, `maxOutputChars=${parsed.maxOutputChars ?? settings.maxCommandOutputChars}`].join("\n") },
      { label: "风险类别", value: risk.categories.length > 0 ? risk.categories.join("、") : "未标记" },
    ],
    argsPreview: {
      command: safeCommand,
      cwd: safeCwd,
      timeoutMs: parsed.timeoutMs ?? settings.defaultCommandTimeoutMs,
      maxOutputChars: parsed.maxOutputChars ?? settings.maxCommandOutputChars,
      matchedRule: policy.matchedRule,
      riskLevel: risk.level,
      riskReasons: risk.reasons,
      riskCategories: risk.categories,
      strictWorkspaceMode: settings.commandStrictWorkspaceMode !== false,
      hardDeny: risk.hardDeny,
    },
  };
}

export async function executeNotebrainCommand(
  args: Record<string, unknown>,
  settings: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): Promise<ToolResult<RunNotebrainCommandResult>> {
  const env = getNotebrainRuntimeEnvironment();
  if (!env.isPcElectron) {
    return {
      ok: false,
      data: null,
      error: {
        code: "prerequisite_missing",
        message: env.aiHint || env.message || "本地命令执行环境不可用。",
        recoverable: false,
        details: {
          reasonCode: env.reasonCode,
          environment: env.platformLabel,
          unsupportedCapabilities: env.unsupportedCapabilities,
        },
      },
    };
  }

  const parsed = parseRunCommandArgs(args);
  const command = parsed.command;
  if (!command.trim()) {
    return {
      ok: false,
      data: null,
      error: { code: "invalid_args", message: "命令不能为空。", recoverable: true },
    };
  }

  const policy = evaluateNotebrainCommandPermission(settings, command);
  if (policy.action === "deny") {
    const message = `命令匹配 deny 规则，已拒绝执行：${policy.matchedRule ?? ""}`;
    return {
      ok: false,
      data: null,
      error: { code: "permission_denied", message, recoverable: false },
    };
  }

  const risk = analyzeNotebrainCommandRisk(command, {
    strictMode: settings.commandStrictWorkspaceMode !== false,
    allowNetworkAccess: settings.allowNetworkAccess === true,
    allowSystemInfoCommands: settings.allowSystemInfoCommands === true,
    allowAbsolutePaths: settings.allowAbsolutePaths === true,
  });

  if (risk.hardDeny) {
    const message = `严格工作区模式已拒绝高风险命令：${risk.reasons.join("；")}`;
    pushAgentDebugEvent("NOTEBRAIN_COMMAND_RISK", {
      commandRiskLevel: risk.level,
      commandRiskReasons: risk.reasons,
      commandRiskCategories: risk.categories,
      strictWorkspaceMode: true,
      hardDeny: true,
      cwd: toProjectDefaultRelativePath(parsed.cwd ?? "."),
      platformLabel: env.platformLabel,
    }, "warn");
    return {
      ok: false,
      data: null,
      error: {
        code: "safety_blocked",
        message,
        recoverable: false,
        details: {
          commandRiskLevel: risk.level,
          commandRiskReasons: risk.reasons,
          commandRiskCategories: risk.categories,
          strictWorkspaceMode: true,
        },
      },
    };
  }

  try {
    const result = await runNotebrainCommand(parsed, settings, runtimeToolsSettings);
    const ok = result.exitCode === 0 && !result.timedOut;
    return {
      ok,
      data: result,
      error: ok
        ? undefined
        : {
            code: result.timedOut ? "timeout" : "non_zero_exit",
            message: result.timedOut ? "notebrain 命令执行超时。" : `notebrain 命令退出码：${result.exitCode}`,
            recoverable: true,
          },
    };
  } catch (err) {
    const code = (err as any)?.code ?? "tool_execution_failed";
    const message = err instanceof Error ? err.message : "notebrain 命令执行失败。";
    return {
      ok: false,
      data: null,
      error: { code, message, recoverable: true },
    };
  }
}

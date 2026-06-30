import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { NativeTool } from "../native-tool";
import { runNotebrainCommand } from "../../../agent-workbench/command/notebrain-command-runner";
import { evaluateNotebrainCommandPermission, analyzeNotebrainCommandRisk } from "../../../agent-workbench/command/notebrain-command-policy";
import { getNotebrainRuntimeEnvironment } from "../../../agent-workbench/workspace/notebrain-runtime-env";
import { toProjectDefaultRelativePath } from "../../../agent-workbench/workspace/notebrain-workspace-paths";
import { stringifyToolResultContent } from "../tool-execution-result";
import { pushAgentDebugEvent } from "../../../agent-workbench/debug/workbench-debug";

const parameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    command: { type: "string", description: "要在 notebrain/projects/default 内执行的命令。" },
    cwd: { type: "string", description: "相对 notebrain/projects/default 的子目录，默认 ." },
    timeoutMs: { type: "number", description: "超时时间毫秒，不超过设置上限。" },
    maxOutputChars: { type: "number", description: "stdout/stderr 预览最大字符数，不超过设置上限。" },
  },
  required: ["command"],
};

function redactCommandPreviewText(value: unknown, max = 240): string {
  const protectedUrls: string[] = [];
  const text = String(value ?? "")
    .replace(/\bhttps?:\/\/[^\s"'`<>]+/gi, (match) => {
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
    .replace(/([A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*|\/(?:home|mnt\/data|data|workspace|Users|var|tmp|opt|root)(?:\/[^\s"'`<>]*)?)/g, "[path]")
    .replace(/__NB_COMMAND_URL_(\d+)__/g, (_, rawIndex: string) => protectedUrls[Number(rawIndex)] ?? "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

export function createRunNotebrainCommandNativeTool(
  settings: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): NativeTool | null {
  if (!settings.commandExecutionEnabled) return null;
  const env = getNotebrainRuntimeEnvironment();

  return {
    name: "run_notebrain_command",
    title: "执行 notebrain 本地命令",
    description: "在 PC/Electron 端 notebrain/projects/default 工作区内执行非交互式命令（非系统级沙箱，仅限制 cwd）。主要用于安装/构建/调试外部 Skill。不要主动读取系统配置、网络、用户名、环境变量、注册表或用户目录，除非用户明确要求且确认弹窗已展示风险。",
    parameters,
    readOnly: false,
    parallelSafe: false,
    riskLevel: "high",
    providerVisible: true,
    source: "local",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.command" },
    async preview(args) {
      const command = typeof args.command === "string" ? args.command : "";
      const policy = evaluateNotebrainCommandPermission(settings, command);
      const risk = analyzeNotebrainCommandRisk(command, {
        strictMode: settings.commandStrictWorkspaceMode !== false,
        allowNetworkAccess: settings.allowNetworkAccess === true,
        allowSystemInfoCommands: settings.allowSystemInfoCommands === true,
        allowAbsolutePaths: settings.allowAbsolutePaths === true,
      });
      const cwd = toProjectDefaultRelativePath(args.cwd ?? ".");
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
          { label: "运行参数", value: [`timeout=${args.timeoutMs ?? settings.defaultCommandTimeoutMs}`, `maxOutputChars=${args.maxOutputChars ?? settings.maxCommandOutputChars}`].join("\n") },
          { label: "风险类别", value: risk.categories.length > 0 ? risk.categories.join("、") : "未标记" },
        ],
        argsPreview: {
          command: safeCommand,
          cwd: safeCwd,
          timeoutMs: args.timeoutMs ?? settings.defaultCommandTimeoutMs,
          maxOutputChars: args.maxOutputChars ?? settings.maxCommandOutputChars,
          matchedRule: policy.matchedRule,
          riskLevel: risk.level,
          riskReasons: risk.reasons,
          riskCategories: risk.categories,
          strictWorkspaceMode: settings.commandStrictWorkspaceMode !== false,
          hardDeny: risk.hardDeny,
        },
      };
    },
    async execute(args) {
      if (!env.isPcElectron) {
        return {
          ok: false,
          summary: "不是命令写错，而是当前运行环境不支持本地进程。请改用 HTTP/SSE MCP Server 或在 PC 桌面端执行。",
          errorCode: "prerequisite_missing",
          data: {
            reasonCode: env.reasonCode,
            environment: env.platformLabel,
            platformLabel: env.platformLabel,
            aiHint: env.aiHint,
            userHint: env.userHint,
            unsupportedCapabilities: env.unsupportedCapabilities,
          },
          content: stringifyToolResultContent({
            ok: false,
            toolName: "run_notebrain_command",
            code: "prerequisite_missing",
            message: env.aiHint || env.message || "本地命令执行环境不可用。",
          }),
        };
      }
      const command = typeof args.command === "string" ? args.command : "";
      const policy = evaluateNotebrainCommandPermission(settings, command);
      if (policy.action === "deny") {
        const message = `命令匹配 deny 规则，已拒绝执行：${policy.matchedRule ?? ""}`;
        return {
          ok: false,
          summary: message,
          errorCode: "permission_denied",
          content: stringifyToolResultContent({
            ok: false,
            toolName: "run_notebrain_command",
            code: "permission_denied",
            message,
          }),
        };
      }
      // Strict workspace mode risk check (hard deny for high-risk commands)
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
          cwd: toProjectDefaultRelativePath(args.cwd ?? "."),
          platformLabel: env.platformLabel,
        }, "warn");
        return {
          ok: false,
          summary: message,
          errorCode: "permission_denied",
          data: {
            commandRiskLevel: risk.level,
            commandRiskReasons: risk.reasons,
            commandRiskCategories: risk.categories,
            strictWorkspaceMode: true,
          },
          content: stringifyToolResultContent({
            ok: false,
            toolName: "run_notebrain_command",
            code: "permission_denied",
            message,
          }),
        };
      }
      try {
        const result = await runNotebrainCommand({
          command,
          cwd: typeof args.cwd === "string" ? args.cwd : ".",
          timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
          maxOutputChars: typeof args.maxOutputChars === "number" ? args.maxOutputChars : undefined,
        }, settings, runtimeToolsSettings);
        const ok = result.exitCode === 0 && !result.timedOut;
        return {
          ok,
          summary: ok ? "notebrain 命令执行成功。" : result.timedOut ? "notebrain 命令执行超时。" : `notebrain 命令退出码：${result.exitCode}`,
          errorCode: ok ? undefined : result.timedOut ? "timeout" : "non_zero_exit",
          data: result,
          content: stringifyToolResultContent({
            ok,
            toolName: "run_notebrain_command",
            data: result,
          }),
        };
      } catch (err) {
        const code = (err as any)?.code ?? "tool_execution_failed";
        const message = err instanceof Error ? err.message : "notebrain 命令执行失败。";
        return {
          ok: false,
          summary: message,
          errorCode: code,
          content: stringifyToolResultContent({
            ok: false,
            toolName: "run_notebrain_command",
            code,
            message,
          }),
        };
      }
    },
  };
}

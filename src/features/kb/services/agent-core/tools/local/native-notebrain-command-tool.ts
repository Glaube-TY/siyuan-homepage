import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { NativeTool } from "../native-tool";
import { runNotebrainCommand } from "../../../agent-workbench/command/notebrain-command-runner";
import { evaluateNotebrainCommandPermission } from "../../../agent-workbench/command/notebrain-command-policy";
import { getNotebrainRuntimeEnvironment } from "../../../agent-workbench/workspace/notebrain-runtime-env";
import { toProjectDefaultRelativePath } from "../../../agent-workbench/workspace/notebrain-workspace-paths";
import { stringifyToolResultContent } from "../tool-execution-result";

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

export function createRunNotebrainCommandNativeTool(
  settings: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): NativeTool | null {
  if (!settings.commandExecutionEnabled) return null;
  const env = getNotebrainRuntimeEnvironment();

  return {
    name: "run_notebrain_command",
    title: "执行 notebrain 本地命令",
    description: "在 PC/Electron 端 notebrain/projects/default 工作区内执行非交互式命令。每次执行都限制 cwd、timeout 和输出长度，并写入命令日志。",
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
      const cwd = toProjectDefaultRelativePath(args.cwd ?? ".");
      return {
        permissionAction: policy.action,
        permissionReason: policy.action === "deny" ? `命令匹配 deny 规则：${policy.matchedRule ?? ""}` : undefined,
        argsPreview: {
          command,
          cwd,
          timeoutMs: args.timeoutMs ?? settings.defaultCommandTimeoutMs,
          maxOutputChars: args.maxOutputChars ?? settings.maxCommandOutputChars,
          matchedRule: policy.matchedRule,
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


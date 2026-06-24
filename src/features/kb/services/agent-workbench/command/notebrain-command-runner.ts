import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../types/settings";
import { ensureNotebrainWorkspace } from "../workspace/notebrain-workspace-service";
import { resolveNotebrainCommandCwd } from "../workspace/notebrain-runtime-env";
import { toProjectDefaultRelativePath } from "../workspace/notebrain-workspace-paths";
import {
  appendNotebrainLog,
  createNotebrainLogId,
} from "../workspace/notebrain-log-service";
import { buildSpawnEnv } from "../runtime-tools/runtime-tool-resolver";

export interface RunNotebrainCommandArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface RunNotebrainCommandResult {
  exitCode: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  cwd: string;
  logPath?: string;
  timedOut: boolean;
}

function getNodeRequire(): ((id: string) => any) | null {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  return typeof req === "function" ? req : null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function appendLimited(current: string, chunk: unknown, limit: number): { value: string; truncated: boolean } {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk as any).toString("utf8");
  if (current.length >= limit) return { value: current, truncated: true };
  const next = current + text;
  if (next.length <= limit) return { value: next, truncated: false };
  return { value: next.slice(0, limit), truncated: true };
}

export async function runNotebrainCommand(
  args: RunNotebrainCommandArgs,
  settings: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): Promise<RunNotebrainCommandResult> {
  const command = args.command.trim();
  if (!settings.commandExecutionEnabled) {
    throw new Error("notebrain 本地命令执行未启用。");
  }
  if (!command) {
    throw new Error("命令不能为空。");
  }

  await ensureNotebrainWorkspace();
  const cwdRelative = toProjectDefaultRelativePath(args.cwd ?? ".");
  const cwdResolved = await resolveNotebrainCommandCwd(cwdRelative);
  if (!cwdResolved.ok || !cwdResolved.absolutePath) {
    const err = new Error(cwdResolved.message || "无法解析 notebrain 本地路径。");
    (err as any).code = cwdResolved.errorCode ?? "prerequisite_missing";
    throw err;
  }

  const req = getNodeRequire();
  if (!req) {
    const err = new Error("本地命令执行仅支持 PC/Electron。");
    (err as any).code = "prerequisite_missing";
    throw err;
  }
  const childProcess = req("node:child_process");
  const processModule = req("node:process");
  const timeoutMs = clampNumber(args.timeoutMs, settings.defaultCommandTimeoutMs, 5000, settings.defaultCommandTimeoutMs);
  const maxOutputChars = clampNumber(args.maxOutputChars, settings.maxCommandOutputChars, 2000, settings.maxCommandOutputChars);
  const startedAt = Date.now();
  const logId = createNotebrainLogId("command");

  const isWindows = processModule.platform === "win32";
  const executable = isWindows ? "cmd.exe" : "sh";
  const spawnArgs = isWindows ? ["/d", "/s", "/c", command] : ["-lc", command];

  let stdoutPreview = "";
  let stderrPreview = "";
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;

  const result = await new Promise<{ exitCode: number | null }>((resolve, reject) => {
    // Use merged PATH from runtime tool resolver (extraPathDirs + system PATH)
    const spawnEnv = buildSpawnEnv(runtimeToolsSettings);
    const child = childProcess.spawn(executable, spawnArgs, {
      cwd: cwdResolved.absolutePath,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: Object.keys(spawnEnv).length > 0 ? spawnEnv : processModule.env,
    });
    // ponytail: using child_process.spawn instead of execa for zero-dependency Node-only path.
    // If more robust process management is needed (cancel, retries, IPC), switch to execa via dynamic import.
    let sigkillTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      // Escalate to SIGKILL after 3s if SIGTERM doesn't stop the process
      sigkillTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }, 3000);
    }, timeoutMs);

    function clearAllTimers() {
      clearTimeout(timer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
    }

    child.stdout?.on("data", (chunk: unknown) => {
      const next = appendLimited(stdoutPreview, chunk, maxOutputChars);
      stdoutPreview = next.value;
      stdoutTruncated = stdoutTruncated || next.truncated;
    });
    child.stderr?.on("data", (chunk: unknown) => {
      const next = appendLimited(stderrPreview, chunk, maxOutputChars);
      stderrPreview = next.value;
      stderrTruncated = stderrTruncated || next.truncated;
    });
    child.on("error", (err: Error) => {
      clearAllTimers();
      try { child.kill("SIGKILL"); } catch { /* best-effort cleanup */ }
      reject(err);
    });
    child.on("close", (code: number | null) => {
      clearAllTimers();
      resolve({ exitCode: code });
    });
  });

  const durationMs = Date.now() - startedAt;
  const ok = result.exitCode === 0 && !timedOut;
  const logPath = await appendNotebrainLog({
    id: logId,
    type: "command",
    startedAt,
    finishedAt: Date.now(),
    ok,
    cwd: cwdRelative,
    command,
    durationMs,
    summary: ok ? "命令执行成功。" : timedOut ? "命令执行超时。" : `命令退出码：${result.exitCode}`,
    errorCode: ok ? undefined : timedOut ? "timeout" : "non_zero_exit",
  });

  return {
    exitCode: timedOut ? null : result.exitCode,
    stdoutPreview,
    stderrPreview,
    stdoutTruncated,
    stderrTruncated,
    durationMs,
    cwd: cwdRelative,
    logPath,
    timedOut,
  };
}


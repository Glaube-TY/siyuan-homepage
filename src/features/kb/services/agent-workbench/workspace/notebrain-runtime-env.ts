import {
  NOTEBRAIN_WORKSPACE_LOGICAL_ROOT,
  normalizeNotebrainRelativePath,
  toNotebrainLogicalPath,
  type ResolveAbsoluteInsideResult,
} from "./notebrain-workspace-paths";

interface NodeRequireLike {
  (id: string): any;
}

export interface RuntimeCapabilityStatus {
  isPcElectron: boolean;
  hasNodeRequire: boolean;
  platformLabel: "pc_electron" | "non_pc";
  /** Stable machine-readable reason code; "pc_electron_required" when non-PC. */
  reasonCode: "ok" | "pc_electron_required";
  message?: string;
  /** Hint for the AI model — what capabilities are unavailable and what to use instead. */
  aiHint: string;
  /** Hint for the user — why capabilities are limited. */
  userHint: string;
  /** Which capability categories are unsupported in this environment. */
  unsupportedCapabilities: Array<"local_command" | "mcp_stdio" | "runtime_detection">;
}

function getWindowRequire(): NodeRequireLike | null {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  return typeof req === "function" ? req as NodeRequireLike : null;
}

export function getNotebrainRuntimeEnvironment(): RuntimeCapabilityStatus {
  const req = getWindowRequire();
  const hasNodeRequire = !!req;
  const isPcElectron = hasNodeRequire && typeof (globalThis as any)?.window !== "undefined";

  if (isPcElectron) {
    return {
      isPcElectron: true,
      hasNodeRequire: true,
      platformLabel: "pc_electron",
      reasonCode: "ok",
      aiHint: "",
      userHint: "",
      unsupportedCapabilities: [],
    };
  }

  return {
    isPcElectron: false,
    hasNodeRequire: false,
    platformLabel: "non_pc",
    reasonCode: "pc_electron_required",
    message: "本地命令执行仅支持 PC/Electron 环境。",
    aiHint: "本地命令（notebrain_file.run_command）、MCP stdio、运行时工具检测仅支持 PC/Electron；当前环境不能启动本地进程。请改用 HTTP/SSE MCP Server，或在 PC 桌面端执行本任务。",
    userHint: "当前运行环境不支持本地命令和 MCP stdio，这些能力仅在 PC/Electron 桌面端可用。",
    unsupportedCapabilities: ["local_command", "mcp_stdio", "runtime_detection"],
  };
}

function readSiyuanPathCandidates(): string[] {
  const system = (globalThis as any)?.window?.siyuan?.config?.system ?? {};
  const candidates = [
    system.workspaceDir,
    system.workspacePath,
    system.workspace,
    system.dataDir,
    system.dataPath,
  ];
  return candidates
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

/**
 * Resolve and validate a command cwd path for use with spawn/execa.
 * Ensures the target directory exists, resolves realpath, and confirms
 * the resolved path is still inside the notebrain root realpath.
 * Prevents symlink or path-trick escapes.
 */
export async function resolveNotebrainCommandCwd(
  relativePath: unknown = "",
): Promise<ResolveAbsoluteInsideResult> {
  const req = getWindowRequire();
  if (!req) {
    return {
      ok: false,
      errorCode: "prerequisite_missing",
      message: "无法解析 notebrain 本地路径，本地命令执行仅支持 PC/Electron 且需要可访问本地文件系统。",
    };
  }

  let normalizedRelative: string;
  try {
    normalizedRelative = normalizeNotebrainRelativePath(relativePath);
  } catch (err) {
    return {
      ok: false,
      errorCode: "invalid_path",
      message: err instanceof Error ? err.message : "Notebrain path invalid.",
    };
  }

  try {
    const path = req("node:path");
    const fs = req("node:fs/promises");
    const candidates = readSiyuanPathCandidates();
    const rootSuffix = NOTEBRAIN_WORKSPACE_LOGICAL_ROOT.replace(/\//g, path.sep);
    const relativeSuffix = normalizedRelative.replace(/\//g, path.sep);

    const rootCandidates = candidates.flatMap((candidate) => {
      const normalized = path.normalize(candidate);
      const endsWithData = /[\\/]data$/i.test(normalized);
      return endsWithData
        ? [path.join(normalized, "storage", "petal", "siyuan-homepage", "notebrain")]
        : [path.join(normalized, rootSuffix), path.join(normalized, "data", "storage", "petal", "siyuan-homepage", "notebrain")];
    });

    for (const rootCandidate of rootCandidates) {
      const root = path.resolve(rootCandidate);
      try {
        await fs.mkdir(root, { recursive: true });
        const rootReal = await fs.realpath(root);
        const target = path.resolve(rootReal, relativeSuffix);

        // Ensure the target directory exists before realpath
        await fs.mkdir(target, { recursive: true });
        const targetReal = await fs.realpath(target);

        // Final escape check using resolved realpaths
        const rel = path.relative(rootReal, targetReal);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return {
            ok: false,
            errorCode: "path_escape",
            message: "Notebrain command cwd escaped workspace root.",
          };
        }
        return {
          ok: true,
          absolutePath: targetReal,
          rootAbsolutePath: rootReal,
        };
      } catch {
        // Try next candidate.
      }
    }
  } catch {
    return {
      ok: false,
      errorCode: "prerequisite_missing",
      message: "无法访问 Electron Node 文件系统能力。",
    };
  }

  return {
    ok: false,
    errorCode: "prerequisite_missing",
    message: `无法将 ${toNotebrainLogicalPath(normalizedRelative)} 解析为本地 OS 路径。`,
  };
}

export async function resolveNotebrainAbsolutePath(
  relativePath: unknown = "",
): Promise<ResolveAbsoluteInsideResult> {
  const req = getWindowRequire();
  if (!req) {
    return {
      ok: false,
      errorCode: "prerequisite_missing",
      message: "无法解析 notebrain 本地路径，本地命令执行仅支持 PC/Electron 且需要可访问本地文件系统。",
    };
  }

  let normalizedRelative: string;
  try {
    normalizedRelative = normalizeNotebrainRelativePath(relativePath);
  } catch (err) {
    return {
      ok: false,
      errorCode: "invalid_path",
      message: err instanceof Error ? err.message : "Notebrain path invalid.",
    };
  }

  try {
    const path = req("node:path");
    const fs = req("node:fs/promises");
    const candidates = readSiyuanPathCandidates();
    const rootSuffix = NOTEBRAIN_WORKSPACE_LOGICAL_ROOT.replace(/\//g, path.sep);
    const relativeSuffix = normalizedRelative.replace(/\//g, path.sep);

    const rootCandidates = candidates.flatMap((candidate) => {
      const normalized = path.normalize(candidate);
      const endsWithData = /[\\/]data$/i.test(normalized);
      return endsWithData
        ? [path.join(normalized, "storage", "petal", "siyuan-homepage", "notebrain")]
        : [path.join(normalized, rootSuffix), path.join(normalized, "data", "storage", "petal", "siyuan-homepage", "notebrain")];
    });

    for (const rootCandidate of rootCandidates) {
      const root = path.resolve(rootCandidate);
      try {
        await fs.mkdir(root, { recursive: true });
        const rootReal = await fs.realpath(root);
        const target = path.resolve(rootReal, relativeSuffix);
        const parent = path.dirname(target);
        await fs.mkdir(parent, { recursive: true });
        const parentReal = await fs.realpath(parent);
        const finalTarget = path.resolve(parentReal, path.basename(target));
        const rel = path.relative(rootReal, finalTarget);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return {
            ok: false,
            errorCode: "path_escape",
            message: "Notebrain path escaped workspace root.",
          };
        }
        return {
          ok: true,
          absolutePath: finalTarget,
          rootAbsolutePath: rootReal,
        };
      } catch {
        // Try next candidate.
      }
    }
  } catch {
    return {
      ok: false,
      errorCode: "prerequisite_missing",
      message: "无法访问 Electron Node 文件系统能力。",
    };
  }

  return {
    ok: false,
    errorCode: "prerequisite_missing",
    message: `无法将 ${toNotebrainLogicalPath(normalizedRelative)} 解析为本地 OS 路径。`,
  };
}


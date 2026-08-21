import type { ToolResult } from "../../contracts/tool-contract";

export class HomepageComponentConflictError extends Error {
  readonly code = "conflict";
  constructor(message: string) {
    super(message);
    this.name = "HomepageComponentConflictError";
  }
}

export function isComponentConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  return (
    typeof err.code === "string" && (
      err.code === "conflict"
      || err.code.endsWith("_conflict")
      || err.code === "revision_mismatch"
      || err.code === "stale_revision"
    )
  );
}

export function homepageComponentFailure(error: unknown, fallbackCode: string, fallbackMessage: string): ToolResult {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const conflict = isComponentConflictError(error);
  return {
    ok: false,
    data: null,
    error: {
      code: conflict ? `${fallbackCode.replace(/_failed$/, "")}_conflict` : fallbackCode,
      message,
      recoverable: true,
      hint: conflict ? "请重新读取最新数据，确认后再提交，不要自动覆盖。" : undefined,
    },
  };
}

export const alwaysAvailable = () => ({ available: true as const });

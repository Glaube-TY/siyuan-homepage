import type { ToolResult } from "../../contracts/tool-contract";

export function homepageComponentFailure(error: unknown, fallbackCode: string, fallbackMessage: string): ToolResult {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const conflict = /conflict|stale|revision|expected/i.test(message)
    || /已变化|已被.*修改|冲突|重新读取|版本不一致/.test(message);
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

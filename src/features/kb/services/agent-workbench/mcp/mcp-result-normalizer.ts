/**
 * Redact sensitive tokens, Node.js stack traces, and local paths from MCP error text.
 * Used for sync error messages and debug event previews.
 */
export function redactMcpSyncError(message: string): string {
  if (!message) return message;
  return (
    message
      // Authorization / Bearer tokens
      .replace(/(["']?\s*Authorization\s*:\s*Bearer\s+)\S+/gi, "$1***")
      .replace(/(["']?\s*Bearer\s+)\S+/gi, "$1***")
      // Generic secrets
      .replace(
        /(\b(token|api[_-]?key|apiKey|secret|password|access_token|refresh_token|client_secret|accessToken|refreshToken|clientSecret)\s*[:=]\s*)([^\s,;"'}]+)/gi,
        "$1***",
      )
      // Encrypted secrets
      .replace(/enc:v1:[A-Za-z0-9+/=]+/g, "enc:v1:***")
      // Node.js / TypeScript stack traces
      .replace(/\s+at\s+[^\r\n]+/g, " [栈跟踪已脱敏]")
      // Windows drive paths and common Unix absolute paths
      .replace(
        /([A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*|\/(?:home|Users|usr|lib|bin|etc|srv|media|run|proc|sys|dev|boot|data|workspace|tmp|var|mnt|opt|root|node_modules|\.pnpm|\.npm|\.cache|\.cargo|\.rustup)(?:\/[^\s"']*)*)/gi,
        "[本地路径已脱敏]",
      )
      // Explicit notebrain root path field leaked in logs
      .replace(/notebrainRootAbsolutePath[=:]\s*\S+/gi, "notebrainRootAbsolutePath=[已脱敏]")
      // Collapse repeated stack markers
      .replace(/(?:\[栈跟踪已脱敏]\s*)+/g, "[栈跟踪已脱敏]")
  );
}

export function normalizeMcpResultContent(result: any, maxChars = 20000): {
  ok: boolean;
  data: unknown;
  contentText: string;
  summary: string;
  truncated: boolean;
} {
  const isError = Boolean(result?.isError);
  const structuredContent = result?.structuredContent;
  const contentItems = Array.isArray(result?.content) ? result.content : [];
  const contentText = contentItems.map((item: any) => {
    if (typeof item?.text === "string") return item.text;
    if (typeof item === "string") return item;
    return JSON.stringify(item);
  }).join("\n");
  const rawText = structuredContent !== undefined
    ? JSON.stringify(structuredContent, null, 2)
    : contentText;
  const truncated = rawText.length > maxChars;
  const preview = truncated ? rawText.slice(0, maxChars) : rawText;

  if (isError) {
    // Return real error text from MCP server instead of generic message
    const errorPreview = preview.length > 500 ? `${preview.slice(0, 500)}...` : preview;
    return {
      ok: false,
      data: structuredContent !== undefined ? structuredContent : { content: contentItems },
      contentText: preview,
      summary: errorPreview || "MCP 工具返回错误（无详细信息）。",
      truncated,
    };
  }

  return {
    ok: true,
    data: structuredContent !== undefined ? structuredContent : { content: contentItems },
    contentText: preview,
    summary: "MCP 工具执行完成。",
    truncated,
  };
}


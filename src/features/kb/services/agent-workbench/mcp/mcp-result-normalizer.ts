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


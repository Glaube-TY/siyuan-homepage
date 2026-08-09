/**
 * 机器人回复长度切分（纯函数）。
 * 聊天平台不适合超长输出；按段落/行边界切分，尽量不从字符串中间破坏 Markdown code / URL。
 */

export function splitRobotReply(text: string, maxChars: number): string[] {
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (current && current.length + 2 + trimmed.length > maxChars) {
      pushCurrent();
    }
    if (trimmed.length > maxChars) {
      // 单个超长段落：按行再拆，最后按字符边界（尽量不切断 URL/code）。
      for (const line of splitLongBlock(trimmed, maxChars)) {
        if (current && current.length + 1 + line.length > maxChars) pushCurrent();
        current = current ? `${current}\n${line}` : line;
      }
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }
  pushCurrent();
  return chunks;
}

function splitLongBlock(block: string, maxChars: number): string[] {
  const lines = block.split(/\n/);
  const out: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length > maxChars) {
      out.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
    if (current.length > maxChars) {
      out.push(cutAtSafeBoundary(current, maxChars));
      current = "";
    }
  }
  if (current) out.push(current);
  return out;
}

function cutAtSafeBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // 优先在空格/换行处切断；否则回退到硬切。
  const segment = text.slice(0, maxChars);
  const lastSpace = Math.max(segment.lastIndexOf(" "), segment.lastIndexOf("\n"));
  if (lastSpace > maxChars * 0.5) return segment.slice(0, lastSpace).trimEnd();
  return segment;
}

export type UnfinishedAgentOutputReason = "repetitive_output";

export interface UnfinishedAgentOutputDiagnostic {
  reason: UnfinishedAgentOutputReason;
  answerChars: number;
  forceToolCall: boolean;
  repeatedChars?: number;
  repeatedParagraphs?: number;
}

const MIN_REPEATED_PARAGRAPH_CHARS = 48;
const MIN_REPEATED_TOTAL_CHARS = 280;
const MIN_REPEATED_RATIO = 0.18;

function normalizeParagraph(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function repeatedParagraphDiagnostic(answer: string): UnfinishedAgentOutputDiagnostic | undefined {
  const paragraphs = answer
    .split(/\n\s*\n+/)
    .map(normalizeParagraph)
    .filter((paragraph) => paragraph.length >= MIN_REPEATED_PARAGRAPH_CHARS);
  if (paragraphs.length < 3) return undefined;

  const counts = new Map<string, number>();
  for (const paragraph of paragraphs) {
    counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1);
  }

  let repeatedChars = 0;
  let repeatedParagraphs = 0;
  for (const [paragraph, count] of counts) {
    if (count < 2) continue;
    repeatedParagraphs += count - 1;
    repeatedChars += paragraph.length * (count - 1);
  }

  if (
    repeatedParagraphs < 2
    || repeatedChars < MIN_REPEATED_TOTAL_CHARS
    || repeatedChars / Math.max(1, answer.length) < MIN_REPEATED_RATIO
  ) {
    return undefined;
  }

  return {
    reason: "repetitive_output",
    answerChars: answer.length,
    forceToolCall: false,
    repeatedChars,
    repeatedParagraphs,
  };
}

/**
 * 语言无关的模型输出缺陷检测：
 * 仅基于段落结构和重复统计进行退化检测，不依赖任何自然语言关键词或正则。
 */
export function inspectUnfinishedAgentOutput(
  answer: string,
  _options?: { toolsAvailable?: boolean },
): UnfinishedAgentOutputDiagnostic | undefined {
  const trimmed = answer.trim();
  if (!trimmed) return undefined;

  return repeatedParagraphDiagnostic(trimmed);
}

export function buildUnfinishedAgentOutputRetryInstruction(
  _diagnostic: UnfinishedAgentOutputDiagnostic,
): string {
  return [
    "内部恢复指令：上一轮 assistant 正文出现大段重复，属于退化输出，草稿已被运行时丢弃。",
    "请根据已有工具结果与上下文直接给出结构清晰、不重复的回答。",
    "如果还需要调用工具，请直接发起 tool_calls；不得重复已经输出过的段落。",
  ].join("\n");
}

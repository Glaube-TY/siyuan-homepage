export type UnfinishedAgentOutputReason = "repetitive_output" | "dangling_tool_intent";

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

const DANGLING_TOOL_INTENT_PATTERNS = [
  /(?:让我|我来|我(?:现在|接下来|下一步)?(?:会|将|需要|准备|尝试|先|继续))[^。！？!?\n]{0,80}(?:查看|检查|确认|获取|调用|使用|读取|搜索|查询|执行|操作|添加|修改|创建|测试|验证)/i,
  /(?:接下来|下一步)[^。！？!?\n]{0,40}(?:我(?:会|将|需要|准备|尝试)|(?:需要|准备))[^。！？!?\n]{0,80}(?:查看|检查|确认|获取|调用|使用|读取|搜索|查询|执行|操作|添加|修改|创建|测试|验证)/i,
  /\b(?:let me|i(?:'ll| will| need to| am going to)|next i(?:'ll| will))\b[^.!?\n]{0,100}\b(?:check|inspect|look up|fetch|call|use|read|search|query|execute|add|update|create|test|verify)\b/i,
];

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
    forceToolCall: hasDanglingToolIntent(answer),
    repeatedChars,
    repeatedParagraphs,
  };
}

function hasUserInputRequestAtEnd(answer: string): boolean {
  const tail = answer.slice(-360);
  return /(?:请|麻烦)(?:您|你)?(?:告诉|提供|选择|确认|补充|指定)|(?:是否|能否|可否).{0,80}[？?]/i.test(tail);
}

function hasDanglingToolIntent(answer: string): boolean {
  if (hasUserInputRequestAtEnd(answer)) return false;
  const tail = normalizeParagraph(answer.slice(-520));
  if (!tail) return false;

  const terminalSentence = tail
    .split(/[。！？!?]\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(-2)
    .join("。 ");
  return DANGLING_TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(terminalSentence));
}

/**
 * Detect provider text that must not be accepted as a completed Agent turn.
 *
 * This intentionally uses high-signal checks only:
 * - repeated full paragraphs consuming a material part of the answer;
 * - a terminal first-person promise to inspect/call/execute something when tools exist.
 */
export function inspectUnfinishedAgentOutput(
  answer: string,
  options: { toolsAvailable: boolean },
): UnfinishedAgentOutputDiagnostic | undefined {
  const trimmed = answer.trim();
  if (!trimmed) return undefined;

  const repeated = repeatedParagraphDiagnostic(trimmed);
  if (repeated) return repeated;

  if (options.toolsAvailable && hasDanglingToolIntent(trimmed)) {
    return {
      reason: "dangling_tool_intent",
      answerChars: trimmed.length,
      forceToolCall: true,
    };
  }
  return undefined;
}

export function buildUnfinishedAgentOutputRetryInstruction(
  diagnostic: UnfinishedAgentOutputDiagnostic,
): string {
  const problem = diagnostic.reason === "repetitive_output"
    ? "上一轮 assistant 正文出现大段重复，属于退化输出，草稿已被运行时丢弃。"
    : "上一轮 assistant 只在正文中描述了下一步操作，却没有发出任何原生工具调用，草稿已被运行时丢弃。";
  return [
    `内部恢复指令：${problem}`,
    "如果下一步需要读取、检查或修改任何状态，现在必须直接使用 provider 原生 tool_calls；不要先解释准备做什么。",
    "不得把“让我查看”“我将调用”“接下来执行”等行动计划当作最终回答。",
    "不得重复已经输出过的段落。",
    "只有任务确实完成，或明确需要用户补充无法自行获取的信息时，才输出简洁最终回答。",
  ].join("\n");
}

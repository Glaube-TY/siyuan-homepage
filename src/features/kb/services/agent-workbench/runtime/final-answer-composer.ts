import { AgentProviderError } from "../../agent-core/providers/provider-error";
import {
  callModelText,
  streamModelText,
} from "../../qa/kb-model-call";
import type { ChatModelSelection } from "../../../types/chat-model-selection";
import type { ThinkingMode } from "../../../types/session";
import type { ToolResultEntry } from "./tool-result-log";

export type FinalComposeMode = "auto" | "stream" | "non_stream";

export interface FinalAnswerComposerParams {
  question: string;
  draftBody: string;
  observations: readonly ToolResultEntry[];
  globalMemory?: string;
  finalComposeMode: FinalComposeMode;
  abortSignal?: AbortSignal;
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode: ThinkingMode;
  onChunk?: (event: { chunk: string; fullContent: string }) => void;
  onReasoningDelta?: (event: {
    type: "reasoning-start" | "reasoning-delta" | "reasoning-end";
    delta?: string;
  }) => void;
}

const MAX_DRAFT_CHARS = 12_000;
const MAX_MEMORY_CHARS = 4_000;
const MAX_OBSERVATION_CHARS = 6_000;
const MAX_OBSERVATION_SUMMARY_CHARS = 500;

function boundText(value: string | undefined, maxChars: number): string {
  return (value ?? "").split(String.fromCharCode(0)).join("").trim().slice(0, maxChars);
}

function safePromptText(value: string | undefined, maxChars: number): string {
  return boundText(value, maxChars)
    .replace(/\b(?:api[_ -]?key|token|password|secret)\s*[:=]\s*\S+/gi, "[敏感值已隐藏]")
    .replace(/\b[A-Za-z]:\\[^\s<>"']+/g, "[本地路径]");
}

function buildObservationSummary(observations: readonly ToolResultEntry[]): string {
  let totalChars = 0;
  const lines: string[] = [];
  for (const observation of observations) {
    const summary = safePromptText(observation.summary, MAX_OBSERVATION_SUMMARY_CHARS);
    if (!summary) continue;
    const line = `- ${observation.toolName ?? observation.kind}: ${summary}`;
    if (totalChars + line.length > MAX_OBSERVATION_CHARS) break;
    lines.push(line);
    totalChars += line.length;
  }
  return lines.join("\n");
}

export function buildFinalAnswerComposerPrompt(params: Pick<
  FinalAnswerComposerParams,
  "question" | "draftBody" | "observations" | "globalMemory"
>): string {
  const memory = safePromptText(params.globalMemory, MAX_MEMORY_CHARS);
  const observationSummary = buildObservationSummary(params.observations);
  const draftBody = safePromptText(params.draftBody, MAX_DRAFT_CHARS);

  return [
    "你是知识库 Agent 的最终回答 Composer。请根据用户问题、已完成工具摘要和 Agent 草稿，直接生成给用户看的最终回答。",
    "只输出最终回答正文：不要输出思考过程、执行计划、工具调用、核对过程、草稿说明或 JSON；不要把 Agent 的过程性话术原样复述为回答。",
    "只使用提供的事实；证据不足时要明确说明，不要编造来源、结果或已完成的写入。保留草稿中可验证且对用户有用的引用标记。",
    "用户问题：",
    "<question>",
    safePromptText(params.question, 4_000),
    "</question>",
    memory ? "全局记忆（仅作必要上下文）：\n<memory>\n" + memory + "\n</memory>" : "",
    observationSummary
      ? "已完成工具结果的安全摘要（不是原始工具正文）：\n<observations>\n" + observationSummary + "\n</observations>"
      : "已完成工具结果摘要：无。",
    "Agent 草稿（可能包含过程性文字，只可提炼事实）：",
    "<draft>",
    draftBody,
    "</draft>",
  ].filter(Boolean).join("\n\n");
}

export function assertFinalAnswer(answer: string): string {
  if (answer.trim()) return answer;
  throw new AgentProviderError("最终回答生成阶段没有返回正文。", {
    code: "final_answer_composer_empty",
    retryable: false,
    safeToReplay: false,
    userAction: "retry",
  });
}

/**
 * Agent 完成工具执行后唯一的最终正文生成入口。
 * Composer 失败时直接抛出，不把 Agent 草稿降级为最终正文。
 */
export async function streamFinalAnswerFromDraft(
  params: FinalAnswerComposerParams,
): Promise<string> {
  const prompt = buildFinalAnswerComposerPrompt(params);
  if (params.finalComposeMode === "non_stream") {
    const answer = await callModelText(prompt, params.thinkingMode, {
      purpose: "compose",
      chatModelSelection: params.chatModelSelection,
      abortSignal: params.abortSignal,
    });
    return assertFinalAnswer(answer);
  }

  let fullContent = "";
  await streamModelText(
    prompt,
    params.thinkingMode,
    {
      onChunk: (event) => {
        fullContent = event.fullContent;
        params.onChunk?.(event);
      },
      onStreamStatus: (event) => {
        if (event.type === "reasoning-start") {
          params.onReasoningDelta?.({ type: "reasoning-start" });
        } else if (event.type === "reasoning-delta") {
          params.onReasoningDelta?.({ type: "reasoning-delta", delta: event.delta });
        } else if (event.type === "reasoning-end") {
          params.onReasoningDelta?.({ type: "reasoning-end" });
        }
      },
    },
    {
      purpose: "compose",
      chatModelSelection: params.chatModelSelection,
      abortSignal: params.abortSignal,
    },
  );
  return assertFinalAnswer(fullContent);
}

import { generatePlainText } from "@/services/ai/plain-text-generation";
import { streamModelText } from "../qa/kb-model-call";
import { getKbSettings } from "../settings/kb-settings-service";
import { buildChatModelOptions, findDefaultChatModelOption } from "../settings/chat-model-options";
import { buildChatModelKey, type ChatModelSelection } from "../../types/chat-model-selection";
import { buildSelectionAiPrompt } from "./selection-ai-prompts";
import type {
  SelectionAiRequest,
  SelectionAiRunCallbacks,
  SelectionAiRunResult,
  SelectionAiSkill,
  SelectionAiToolbarSettings,
} from "./selection-ai-types";

const FALLBACK_GENERATION = {
  temperature: 0.3,
  maxOutputChars: 3000,
  maxSelectedTextChars: 6000,
  stream: true,
} as const;

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    return error.name === "AbortError" || /abort|aborted|cancel/i.test(error.message);
  }
  return false;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "未知错误");
}

function trimOutput(text: string, maxChars: number): { text: string; truncatedOutput: boolean } {
  const normalized = String(text ?? "").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxChars) return { text: normalized, truncatedOutput: false };
  return {
    text: chars.slice(0, maxChars).join("").trim(),
    truncatedOutput: true,
  };
}

function resolveMaxOutputTokens(maxOutputChars: number): number {
  return Math.max(256, Math.min(8192, Math.ceil(maxOutputChars * 1.2)));
}

async function resolveSelectionAiModel(
  skill: SelectionAiSkill
): Promise<ChatModelSelection | null> {
  const kbSettings = await getKbSettings();
  const options = buildChatModelOptions(kbSettings);
  if (options.length === 0) return null;

  // 优先使用技能指定的模型
  if (skill.modelProviderId && skill.modelId) {
    const key = buildChatModelKey(skill.modelProviderId, skill.modelId);
    const matched = options.find((option) => option.key === key);
    if (matched) {
      return { providerId: matched.providerId, modelId: matched.modelId };
    }
  }

  // fallback 到 AI 知识库默认模型
  const fallback = findDefaultChatModelOption(kbSettings, options);
  return fallback ? { providerId: fallback.providerId, modelId: fallback.modelId } : null;
}

function findSkillForRequest(
  request: SelectionAiRequest,
  settings: SelectionAiToolbarSettings
): SelectionAiSkill | undefined {
  if (request.skillId) {
    const byId = settings.skills.find((s) => s.id === request.skillId);
    if (byId) return byId;
  }
  return settings.skills.find((s) => s.builtInAction === request.action && s.enabled)
    ?? settings.skills.find((s) => s.builtInAction === request.action);
}

export async function runSelectionAiAction(
  request: SelectionAiRequest,
  settings: SelectionAiToolbarSettings,
  callbacks: SelectionAiRunCallbacks = {}
): Promise<SelectionAiRunResult> {
  if (request.action === "ask") {
    return { text: "", error: "AI 问答应打开侧边栏，不在原地生成。" };
  }

  const skill = findSkillForRequest(request, settings);
  const temperature = skill?.temperature ?? FALLBACK_GENERATION.temperature;
  const maxOutputChars = skill?.maxOutputChars ?? FALLBACK_GENERATION.maxOutputChars;
  const useStream = skill?.stream ?? FALLBACK_GENERATION.stream;

  try {
    const modelSelection = skill ? await resolveSelectionAiModel(skill) : null;
    if (!modelSelection) {
      return {
        text: "",
        error: "未配置可用大模型，请到 AI 知识库设置中配置。",
      };
    }

    const prompt = buildSelectionAiPrompt(request, settings);
    const maxOutputTokens = resolveMaxOutputTokens(maxOutputChars);

    if (useStream) {
      let streamedText = "";
      await streamModelText(
        prompt,
        "off",
        {
          onChunk: ({ chunk, fullContent }) => {
            streamedText = fullContent;
            callbacks.onToken?.(chunk, fullContent);
          },
        },
        {
          chatModelSelection: modelSelection,
          abortSignal: callbacks.signal,
          maxOutputTokens,
          temperature,
          purpose: "generic",
        }
      );
      return trimOutput(streamedText, maxOutputChars);
    }

    const result = await generatePlainText({
      prompt,
      modelSelection,
      thinkingMode: "off",
      maxOutputTokens,
      temperature,
      abortSignal: callbacks.signal,
      purpose: "generic",
    });

    if (!result.ok) {
      const reason = "reason" in result ? result.reason : "unknown";
      const message = "message" in result ? result.message : "模型调用失败";
      return {
        text: "",
        stopped: reason === "aborted",
        error: reason === "aborted" ? undefined : message,
      };
    }

    const trimmed = trimOutput(result.text, maxOutputChars);
    callbacks.onToken?.(trimmed.text, trimmed.text);
    return trimmed;
  } catch (error) {
    if (isAbortError(error)) {
      return { text: "", stopped: true };
    }
    return {
      text: "",
      error: getErrorMessage(error),
    };
  }
}

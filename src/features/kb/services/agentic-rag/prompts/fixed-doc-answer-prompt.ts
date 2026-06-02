/**
 * Fixed Document Answer Prompt
 *
 * 构建固定文档问答 prompt，用于 current_doc / custom_docs 模式。
 *
 * 职责：
 * - 明确只根据提供的固定文档回答
 * - 如果问题要求总结当前文档，就总结给定文档
 * - 如果文档内容不足，说明不足
 * - 不要编造未提供文档
 * - 不需要 AI 决策是否检索
 */

export interface FixedDocInfo {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  content: string;
  truncated?: boolean;
}

export interface BuildFixedDocAnswerPromptParams {
  question: string;
  recentContextSummary?: string;
  scopeSummary?: string;
  documents: FixedDocInfo[];
}

export function buildFixedDocAnswerPrompt(params: BuildFixedDocAnswerPromptParams): string {
  const { question, recentContextSummary, scopeSummary, documents } = params;

  const docSections = documents
    .map((doc, idx) => {
      const header = doc.truncated
        ? `## 文档 ${idx + 1}：${doc.title}（已截断）`
        : `## 文档 ${idx + 1}：${doc.title}`;
      return `${header}\n\n${doc.content}`;
    })
    .join("\n\n---\n\n");

  const recentContextPart = recentContextSummary
    ? `\n\n### 最近对话上下文\n\n${recentContextSummary}`
    : "";

  const scopePart = scopeSummary
    ? `\n\n### 文档范围\n\n${scopeSummary}`
    : "";

  const prompt = `# 固定文档问答

## 你的任务

请根据以下提供的文档内容，回答用户的问题。

## 回答规则

1. **只根据提供的文档内容回答**，不要编造、不要引入外部知识。
2. 如果文档内容不足以完整回答问题，请明确说明不足，并基于已有内容给出部分回答。
3. 如果问题要求总结当前文档，请总结提供的文档内容。
4. 不要输出文档 ID、路径或块 ID。
5. 不要输出任何内部工具日志或调试信息。
6. 使用与用户问题相同的语言回答。

## 提供的文档内容

${docSections}
${scopePart}${recentContextPart}

## 用户问题

${question}

请根据以上文档内容回答：`;

  return prompt;
}

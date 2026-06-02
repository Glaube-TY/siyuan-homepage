/**
 * Run Fixed Document QA Turn
 *
 * 固定文档问答直读流程，用于 current_doc / custom_docs 模式。
 *
 * 职责：
 * - 从 scope 确定 docIds
 * - 直接调用 readDocsFullForAgenticRag 读取固定文档全文
 * - 不进入 LangGraph retrieval workflow
 * - 不调用 analyze-turn-node
 * - 不调用 EvidenceReuseDecision
 * - 不调用 RetrievalPolicy
 * - 不调用 SourceQualification / EvidenceValidation
 * - 生成 fixedEvidencePack，items 只来自成功读取的固定文档
 * - finalEvidenceDocIds = 成功读取的固定 docIds
 * - footerReferences 直接来自 fixedEvidencePack 的文档项
 * - 调用 streamLlm 流式输出
 * - 如果读取失败，返回 insufficient_evidence
 *
 * 不职责：
 * - 不写 UI/store
 * - 不构建 Agent 图状态
 */

import type { AgentScope, AgentScopeMode, AgentScopeSummary } from "../scope/types";
import type { AgenticRuntimeContext } from "../runtime/recent-context-types";
import type { AgenticRagBudget } from "../runtime/budget";
import type { AgenticRagProgressEvent } from "../run-agentic-rag-turn";
import type { AgenticEvidencePack } from "../evidence/evidence-types";
import type { ReferenceItem } from "../../../types/chat";
import type { AttachedKbDoc } from "../../../types/chat";
import { readDocsFullForAgenticRag } from "../tools/readers/read-doc-full";
import type { AgenticDocFull, AgenticDocLite } from "../tools/doc-types";
import { buildFixedDocAnswerPrompt } from "../prompts/fixed-doc-answer-prompt";
import { streamLlm, callLlm } from "../../qa/llm-client";
import type { TraceStep } from "../graph/state";
import { debugStreamChunkIfNeeded, pushAgentDebugEvent } from "../debug/agentic-rag-debug";

export interface RunFixedDocQaTurnParams {
  question: string;
  mode: AgentScopeMode;
  scope: AgentScope;
  scopeSummary: AgentScopeSummary;
  budget: AgenticRagBudget;
  recentContextSummary?: string;
  attachedDocs?: AttachedKbDoc[];
  runtime?: Partial<AgenticRuntimeContext>;
  trace?: boolean;
  abortSignal?: AbortSignal;
  onProgress?: (event: AgenticRagProgressEvent) => void;
}

export interface FixedDocQaTurnResult {
  answer: string;
  finalEvidencePack: AgenticEvidencePack;
  footerReferences: ReferenceItem[];
  warnings: string[];
  traceLog: TraceStep[];
  finalEvidenceDocIds: string[];
}

function emitProgress(
  onProgress?: (event: AgenticRagProgressEvent) => void,
  event?: AgenticRagProgressEvent
) {
  if (onProgress && event) {
    onProgress(event);
  }
}

function getFixedDocIds(scope: AgentScope, mode: AgentScopeMode): string[] {
  if (mode === "current_doc" && scope.type === "current_doc") {
    return [scope.docId];
  }
  if (mode === "custom_docs" && scope.type === "custom_docs") {
    return scope.docIds.filter(Boolean);
  }
  return [];
}

function buildFixedDocLiteFromScope(scope: AgentScope, attachedDocs?: AttachedKbDoc[]): AgenticDocLite[] {
  if (scope.type === "current_doc") {
    return [{
      docId: scope.docId,
      title: scope.title || "当前文档",
      box: scope.box,
      path: undefined,
    }];
  }
  if (scope.type === "custom_docs") {
    const docMetaMap = new Map<string, AttachedKbDoc>();
    if (attachedDocs) {
      for (const doc of attachedDocs) {
        docMetaMap.set(doc.docId, doc);
      }
    }
    return scope.docIds.map((docId) => {
      const meta = docMetaMap.get(docId);
      return {
        docId,
        title: meta?.title || "未命名文档",
        box: meta?.box,
        path: meta?.path,
      };
    });
  }
  return [];
}

export async function runFixedDocQaTurn(
  params: RunFixedDocQaTurnParams
): Promise<FixedDocQaTurnResult> {
  const {
    question,
    mode,
    scope,
    scopeSummary,
    recentContextSummary,
    attachedDocs,
    runtime,
    trace,
    abortSignal,
    onProgress,
  } = params;

  const warnings: string[] = [];
  const traceLog: TraceStep[] = [];

  const fixedDocIds = getFixedDocIds(scope, mode);

  if (trace) {
    console.info("[KB-AGENT | FIXED_DOC_DIRECT_MODE]", {
      mode,
      scopeType: scope.type,
      fixedDocCount: fixedDocIds.length,
    });
  }

  traceLog.push({
    name: "fixed_doc_direct_mode",
    status: "success",
    detail: `固定文档模式：${fixedDocIds.length} 个文档`,
  });

  // 1. resolving_scope
  emitProgress(onProgress, { phase: "resolving_scope", scopeType: scope.type });

  // 2. building_context
  emitProgress(onProgress, { phase: "building_context" });

  // 3. analyzing_question
  emitProgress(onProgress, { phase: "analyzing_question" });

  // 4. reading_fixed_docs
  emitProgress(onProgress, { phase: "reading_fixed_docs" });

  const docLites = buildFixedDocLiteFromScope(scope, attachedDocs);
  const maxChars = 12000;

  if (trace) {
    console.info("[KB-AGENT | FIXED_DOC_READ_STARTED]", {
      mode,
      docCount: fixedDocIds.length,
    });
  }

  traceLog.push({
    name: "fixed_doc_read_started",
    status: "success",
    detail: `读取 ${fixedDocIds.length} 个固定文档`,
  });

  const readDocs = await readDocsFullForAgenticRag({
    docs: docLites,
    maxChars,
    concurrency: 3,
    trace,
  });

  const successfullyReadDocIds = readDocs.map((d) => d.docId);

  if (readDocs.length === 0) {
    warnings.push("固定文档读取失败，无可用内容");
    traceLog.push({
      name: "fixed_doc_read_failed",
      status: "failed",
      detail: "所有固定文档读取失败",
    });

    return {
      answer: "无法读取指定文档内容，请确认文档是否存在。",
      finalEvidencePack: {
        items: [],
        coverage: {
          selectedDocCount: 0,
          readDocCount: 0,
          readBlockContextCount: 0,
          outlineCount: 0,
          recentEvidenceCount: 0,
          searchedQueryMetas: [],
          warnings: ["固定文档读取失败"],
          hasSubstantiveEvidence: false,
        },
        evidenceMode: "insufficient_evidence",
      },
      footerReferences: [],
      warnings,
      traceLog,
      finalEvidenceDocIds: [],
    };
  }

  if (trace) {
    console.info("[KB-AGENT | FIXED_DOC_EVIDENCE_LOCK]", {
      mode,
      requestedDocCount: fixedDocIds.length,
      successfullyReadDocCount: successfullyReadDocIds.length,
      readDocCount: successfullyReadDocIds.length,
    });
  }

  traceLog.push({
    name: "fixed_doc_evidence_lock",
    status: "success",
    detail: `固定文档证据锁定：${successfullyReadDocIds.length} 个文档`,
  });

  // 5. Build fixed evidence pack
  const fixedEvidencePack = buildFixedEvidencePack(readDocs, fixedDocIds);

  // 6. Build footer references
  const footerReferences = buildFixedDocFooterReferences(readDocs);

  // 7. streaming_answer
  emitProgress(onProgress, { phase: "streaming_answer" });

  // 8. Build prompt
  const prompt = buildFixedDocAnswerPrompt({
    question,
    recentContextSummary,
    scopeSummary: scopeSummary.title,
    documents: readDocs.map((doc) => ({
      docId: doc.docId,
      title: doc.title,
      box: doc.box,
      path: doc.path,
      content: doc.content,
      truncated: doc.truncated,
    })),
  });

  // 9. Stream LLM
  let streamedContent = "";
  const hasStreamingCallback = runtime?.onAnswerChunk;

  if (hasStreamingCallback) {
    const streamStartTime = Date.now();
    let chunkCount = 0;

    if (trace) {
      console.info("[KB-AGENT | FIXED_DOC_STREAM_START]", {
        mode,
        docCount: readDocs.length,
      });
    }

    traceLog.push({
      name: "fixed_doc_stream_start",
      status: "success",
      detail: `固定文档流式回答开始：${readDocs.length} 个文档`,
    });

    pushAgentDebugEvent("FIXED_DOC_STREAM_UI_START_SAFE", {
      docCount: readDocs.length,
      hasOnAnswerChunk: !!runtime?.onAnswerChunk,
      statusSetBeforeFirstChunk: true,
    }, "info");

    runtime?.onAnswerStart?.();

    await streamLlm(
      prompt,
      {
        onChunk: ({ chunk, fullContent }) => {
          streamedContent = fullContent;
          chunkCount++;
          debugStreamChunkIfNeeded(trace, chunkCount, fullContent.length, "FIXED_DOC_STREAM_CHUNK");
          runtime?.onAnswerChunk?.({ chunk, fullContent });
        },
        onFinish: async (fullContent) => {
          streamedContent = fullContent;
          const durationMs = Date.now() - streamStartTime;
          if (trace) {
            console.info("[KB-AGENT | FIXED_DOC_STREAM_FINISH]", {
              answerChars: fullContent.length,
              chunkCount,
              durationMs,
              docCount: readDocs.length,
            });
          }
          runtime?.onAnswerFinish?.(fullContent);
        },
        onError: (error) => {
          const errorMessage = error.message || String(error);
          warnings.push(`最终回答流式调用失败：${errorMessage}`);
        },
      },
      { temperature: 0.2, abortSignal },
      abortSignal
    );

    if (warnings.some((w) => w.includes("最终回答流式调用失败"))) {
      const fallbackAnswer = readDocs.length > 0
        ? `已读取 ${readDocs.length} 个文档，但回答生成失败。请稍后重试。`
        : "回答生成失败。";

      return {
        answer: fallbackAnswer,
        finalEvidencePack: fixedEvidencePack,
        footerReferences,
        warnings,
        traceLog,
        finalEvidenceDocIds: successfullyReadDocIds,
      };
    }
  } else {
    if (trace) {
      console.info("[KB-AGENT | FIXED_DOC_STREAM_FALLBACK_TO_CALL_LLM]", {
        mode,
        reason: "无流式回调",
      });
    }

    // Fallback to non-streaming
    try {
      const response = await callLlm(prompt, { temperature: 0.2, abortSignal });
      streamedContent = response.content;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        traceLog.push({
          name: "compose_answer",
          status: "skipped",
          detail: "模型调用被中断信号取消",
        });
        return {
          answer: streamedContent || "",
          finalEvidencePack: fixedEvidencePack,
          footerReferences,
          warnings: [...warnings, "回答生成已中断"],
          traceLog,
          finalEvidenceDocIds: successfullyReadDocIds,
        };
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      warnings.push(`最终回答模型调用失败：${errorMessage}`);
    }
  }

  // 10. done
  emitProgress(onProgress, { phase: "done" });

  traceLog.push({
    name: "fixed_doc_qa_done",
    status: "success",
    detail: `固定文档问答完成：${streamedContent.length} 字符，${readDocs.length} 个文档`,
  });

  return {
    answer: streamedContent.trim() || "",
    finalEvidencePack: fixedEvidencePack,
    footerReferences,
    warnings,
    traceLog,
    finalEvidenceDocIds: successfullyReadDocIds,
  };
}

function buildFixedEvidencePack(
  readDocs: AgenticDocFull[],
  fixedDocIds: string[]
): AgenticEvidencePack {
  const items = readDocs.map((doc) => ({
    id: `fixed_${doc.docId}`,
    docId: doc.docId,
    docTitle: doc.title,
    box: doc.box,
    path: doc.path,
    readLevel: "document" as const,
    content: doc.content,
    truncated: doc.truncated,
  }));

  return {
    items,
    coverage: {
      selectedDocCount: fixedDocIds.length,
      readDocCount: readDocs.length,
      readBlockContextCount: 0,
      outlineCount: 0,
      recentEvidenceCount: 0,
      searchedQueryMetas: [],
      warnings: [],
      hasSubstantiveEvidence: readDocs.length > 0,
    },
    evidenceMode: readDocs.length > 0 ? "with_evidence" : "insufficient_evidence",
  };
}

function buildFixedDocFooterReferences(readDocs: AgenticDocFull[]): ReferenceItem[] {
  return readDocs.map((doc, index) => ({
    index: index + 1,
    docId: doc.docId,
    docTitle: doc.title,
    path: doc.path,
    box: doc.box,
    headingPathText: doc.title,
    sourceBlockIds: [],
  }));
}

/**
 * Agent Action Validation
 *
 * 职责：
 * - 提供 parseAgentAction(raw) 调用 AgentActionSchema.safeParse
 * - 返回结构化结果，不做语义判断，不做 fallback 到其他 action type
 * - 提供 buildAllowedToolIds(state) 构建 ID 白名单
 */

import { AgentActionSchema, type AgentActionObject } from "./action-schema";
import type { AgenticRagState } from "../graph/state";
import type { AgentScope } from "../scope/types";

export interface ParsedAgentActionSuccess {
  ok: true;
  data: AgentActionObject;
}

export interface ParsedAgentActionFailure {
  ok: false;
  errors: Array<{
    path: (string | number)[];
    message: string;
  }>;
}

export type ParsedAgentAction = ParsedAgentActionSuccess | ParsedAgentActionFailure;

export function parseAgentAction(raw: unknown): ParsedAgentAction {
  const result = AgentActionSchema.safeParse(raw);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
    };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.filter((p): p is string | number => typeof p === "string" || typeof p === "number"),
    message: issue.message,
  }));

  return {
    ok: false,
    errors,
  };
}

export interface AllowedToolIdsResult {
  allowedDocIds: Set<string>;
  allowedBlockIds: Set<string>;
  docTitleById: Record<string, string>;
  blockTitleById: Record<string, string>;
  sources: Record<string, string[]>;
}

function getScopeDocIds(scope?: AgentScope): string[] {
  if (!scope) return [];
  switch (scope.type) {
    case "current_doc":
      return scope.docId ? [scope.docId] : [];
    case "custom_docs":
      return scope.docIds ?? [];
    case "doc_tree":
      return scope.rootDocId ? [scope.rootDocId] : [];
    default:
      return [];
  }
}

export function buildAllowedToolIds(state: AgenticRagState): AllowedToolIdsResult {
  const { scope, workspace } = state;

  const allowedDocIds = new Set<string>();
  const allowedBlockIds = new Set<string>();
  const docTitleById: Record<string, string> = {};
  const blockTitleById: Record<string, string> = {};
  const sources: Record<string, string[]> = {};

  const trackDocId = (id: string, title: string | undefined, _source: string) => {
    if (!id) return;
    allowedDocIds.add(id);
    if (title) docTitleById[id] = title;
    if (!sources[id]) sources[id] = [];
    if (!sources[id].includes(_source)) sources[id].push(_source);
  };

  const trackBlockId = (id: string, title: string | undefined, _source: string) => {
    if (!id) return;
    allowedBlockIds.add(id);
    if (title) blockTitleById[id] = title;
  };

  // 1. 当前固定 scope 文档
  for (const id of getScopeDocIds(scope)) {
    trackDocId(id, undefined, "scope");
  }

  // 2. workspace.candidateDocs
  for (const d of workspace.candidateDocs) {
    trackDocId(d.docId, d.title, "candidateDocs");
  }

  // 3. workspace.candidateBlocks
  for (const b of workspace.candidateBlocks) {
    trackBlockId(b.blockId, undefined, "candidateBlocks");
    if (b.docId) {
      trackDocId(b.docId, b.docTitle, "candidateBlocks");
    }
  }

  // 4. workspace.readDocuments
  for (const d of workspace.readDocuments) {
    trackDocId(d.docId, d.title, "readDocuments");
  }

  // 5. workspace.recentEvidence
  for (const e of workspace.recentEvidence) {
    if (e.docId) {
      trackDocId(e.docId, e.docTitle, "recentEvidence");
    }
  }

  // 6. workspace.conversationUsedReferences[*].references[*].internalDocId（历史引用内部映射，仅用于验证）
  if (workspace.conversationUsedReferences && workspace.conversationUsedReferences.length > 0) {
    for (const turnRef of workspace.conversationUsedReferences) {
      for (const ref of turnRef.references ?? []) {
        if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
          trackDocId(ref.internalDocId, ref.docTitle, "conversationUsedReferences.internalDocId");
        }
      }
    }
  }

  return {
    allowedDocIds,
    allowedBlockIds,
    docTitleById,
    blockTitleById,
    sources,
  };
}

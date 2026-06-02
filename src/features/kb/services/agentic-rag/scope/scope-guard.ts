/**
 * Scope Guard
 *
 * 统一判断 docId/blockId 是否允许被当前 scope 或 workspace 读取。
 *
 * 职责：
 * - 提供 isDocIdAllowedInScope / isBlockAllowedInScope / getAllowedDocIdsFromWorkspace
 * - 允许来源：current_doc、custom_docs、notebook、doc_tree、whole_kb
 * - workspace.candidateDocs/readDocuments/recentEvidence/candidateBlocks 作为已发现证据来源
 * - 不允许 fixed scope 失败后 fallback 到 whole_kb
 * - 不使用 hpath/name/alias
 */

import type { AgentScope } from "./types";
import type { EvidenceWorkspace } from "../workspace/evidence-workspace";

export interface ScopeGuardContext {
  scope?: AgentScope;
  workspace?: EvidenceWorkspace;
}

export function isDocIdAllowedInScope(docId: string, context: ScopeGuardContext): boolean {
  const { scope, workspace } = context;

  if (!scope) return false;

  switch (scope.type) {
    case "current_doc":
      return scope.docId === docId;

    case "custom_docs":
      return scope.docIds?.includes(docId) ?? false;

    case "doc_tree":
      if (scope.rootDocId === docId) return true;
      if (workspace) {
        const allowed = getAllowedDocIdsFromWorkspace(context);
        if (allowed.has(docId)) return true;
      }
      return false;

    case "notebook":
      if (workspace) {
        const allowed = getAllowedDocIdsFromWorkspace(context);
        if (allowed.has(docId)) return true;
      }
      return false;

    case "whole_kb":
      return true;

    default:
      return false;
  }
}

export interface BlockLike {
  root_id: string;
  box?: string;
}

export function isBlockAllowedInScope(block: BlockLike, context: ScopeGuardContext): boolean {
  const { scope, workspace } = context;

  if (!scope) return false;

  const blockDocId = block.root_id;

  switch (scope.type) {
    case "current_doc":
      return scope.docId === blockDocId;

    case "custom_docs":
      return scope.docIds?.includes(blockDocId) ?? false;

    case "doc_tree":
      if (scope.rootDocId === blockDocId) return true;
      if (workspace) {
        const allowed = getAllowedDocIdsFromWorkspace(context);
        if (allowed.has(blockDocId)) return true;
      }
      return false;

    case "notebook":
      if (scope.notebookId === block.box) return true;
      if (workspace) {
        const allowed = getAllowedDocIdsFromWorkspace(context);
        if (allowed.has(blockDocId)) return true;
      }
      return false;

    case "whole_kb":
      return true;

    default:
      return false;
  }
}

export function getAllowedDocIdsFromWorkspace(context: ScopeGuardContext): Set<string> {
  const { workspace } = context;
  if (!workspace) return new Set();

  const ids = new Set<string>();

  for (const d of workspace.candidateDocs) {
    ids.add(d.docId);
  }
  for (const d of workspace.readDocuments) {
    ids.add(d.docId);
  }
  for (const d of workspace.recentEvidence) {
    ids.add(d.docId);
  }
  for (const b of workspace.candidateBlocks) {
    ids.add(b.docId);
  }

  return ids;
}

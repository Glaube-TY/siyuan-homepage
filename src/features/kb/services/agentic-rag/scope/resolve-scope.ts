/**
 * Resolve Agentic RAG Scope
 *
 * 职责：
 * - mode 只负责归一到 AgentScope，后续 Planner/Executor 只接收 AgentScope
 * - 不要在 resolver 里做检索、读全文、加载 notebook docs 或全库 docs
 * - 从旧 agent-core/scope/resolve-agent-scope.ts 低风险迁移
 */

import { sqlSelectReadonly } from "../../siyuan/read-only-kernel";
import type { AgentScope, ResolveAgentScopeParams, ResolvedAgentScope } from "./types";
import { summarizeAgentScope } from "./scope-label";
import { getCurrentDocumentIdOrThrow } from "../../siyuan/current-doc-service";
import { getNotebookIdByDocId } from "../../siyuan/notebook-resolver";

/**
 * 解析文档元数据（title 和 box）
 * @param docId 文档 ID
 * @returns title 和 box
 */
async function resolveDocMeta(docId: string): Promise<{ title?: string; box?: string }> {
  try {
    const escapedDocId = docId.replace(/'/g, "''");
    const rows = await sqlSelectReadonly<{ content?: string; box?: string }>(
      `SELECT id, content, box FROM blocks WHERE id = '${escapedDocId}' AND type = 'd'`,
      { maxLimit: 1, allowedTables: ["blocks"] }
    );

    if (rows && rows.length > 0) {
      return {
        title: rows[0].content,
        box: rows[0].box,
      };
    }
  } catch (e) {
    console.warn("[AgenticRagScope] 解析文档元信息失败");
  }
  return {};
}

/**
 * 解析 Agent Scope
 * 将 mode 归一到 AgentScope
 * @param params ResolveAgentScopeParams
 * @returns ResolvedAgentScope
 */
export async function resolveAgentScope(
  params: ResolveAgentScopeParams
): Promise<ResolvedAgentScope> {
  const { mode, customDocIds, trace } = params;

  if (trace) {
    console.log(`[AgenticRagScope] 解析范围模式: ${mode}`);
  }

  switch (mode) {
    case "current_doc":
      return await resolveCurrentDocScope(trace);

    case "current_doc_with_children":
      return await resolveDocTreeScope(trace);

    case "current_notebook":
      return await resolveNotebookScope(trace);

    case "whole_kb":
      return resolveWholeKbScope(trace);

    case "custom_docs":
      return resolveCustomDocsScope(customDocIds, trace);

    default:
      throw new Error(`未知范围模式: ${mode}`);
  }
}

/**
 * 解析当前文档 scope
 */
async function resolveCurrentDocScope(trace?: boolean): Promise<ResolvedAgentScope> {
  const docId = getCurrentDocumentIdOrThrow();
  const meta = await resolveDocMeta(docId);

  const scope: AgentScope = {
    type: "current_doc",
    docId,
    title: meta.title,
    box: meta.box,
  };

  if (trace) {
    console.log(`[AgenticRagScope] 当前文档 scope 已解析，hasTitle=${!!meta.title}`);
  }

  return {
    scope,
    summary: summarizeAgentScope(scope),
  };
}

/**
 * 解析文档树 scope（当前文档及子文档）
 */
async function resolveDocTreeScope(trace?: boolean): Promise<ResolvedAgentScope> {
  const docId = getCurrentDocumentIdOrThrow();
  const meta = await resolveDocMeta(docId);

  if (!meta.box) {
    throw new Error("无法确定当前文档所属笔记本，不能构造文档树范围");
  }

  const scope: AgentScope = {
    type: "doc_tree",
    rootDocId: docId,
    rootTitle: meta.title,
    box: meta.box,
  };

  if (trace) {
    console.log(`[AgenticRagScope] 文档树 scope 已解析，hasTitle=${!!meta.title}, hasBox=${!!meta.box}`);
  }

  return {
    scope,
    summary: summarizeAgentScope(scope),
  };
}

/**
 * 解析笔记本 scope
 */
async function resolveNotebookScope(trace?: boolean): Promise<ResolvedAgentScope> {
  const docId = getCurrentDocumentIdOrThrow();
  const notebookId = await getNotebookIdByDocId(docId);

  if (!notebookId) {
    throw new Error("无法确定当前文档所属笔记本");
  }

  const scope: AgentScope = {
    type: "notebook",
    notebookId,
    notebookName: notebookId,
  };

  if (trace) {
    console.log(`[AgenticRagScope] 当前笔记本 scope 已解析，hasNotebook=${!!notebookId}`);
  }

  return {
    scope,
    summary: summarizeAgentScope(scope, { isLazy: true }),
  };
}

/**
 * 解析全库 scope
 */
function resolveWholeKbScope(trace?: boolean): ResolvedAgentScope {
  const scope: AgentScope = { type: "whole_kb" };

  if (trace) {
    console.log(`[AgenticRagScope] 全库`);
  }

  return {
    scope,
    summary: summarizeAgentScope(scope, { isLazy: true }),
  };
}

/**
 * 解析自定义文档 scope
 */
function resolveCustomDocsScope(
  customDocIds: string[] | undefined,
  trace?: boolean
): ResolvedAgentScope {
  if (!customDocIds || customDocIds.length === 0) {
    throw new Error("自定义文档模式需要提供 customDocIds");
  }

  const docIds = [
    ...new Set(
      customDocIds
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];

  if (docIds.length === 0) {
    throw new Error("customDocIds 中没有有效的文档 ID");
  }

  const scope: AgentScope = {
    type: "custom_docs",
    docIds,
  };

  if (trace) {
    console.log(`[AgenticRagScope] 自定义文档: ${docIds.length} 个文档`);
  }

  return {
    scope,
    summary: summarizeAgentScope(scope, { docCount: docIds.length }),
  };
}

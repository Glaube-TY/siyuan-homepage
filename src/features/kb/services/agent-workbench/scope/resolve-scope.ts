/**
 * Resolve Agent Workbench Scope
 *
 * 职责：
 * - mode 只负责归一到 AgentScope，后续 Agent/Executor 只接收 AgentScope
 * - 不要在 resolver 里做检索、读全文、加载 notebook docs 或全库 docs
 * - 只返回本轮可见范围事实
 */

import { sqlSelectReadonly } from "../../siyuan/read-only-kernel";
import type { AgentScope, ResolveAgentScopeParams, ResolvedAgentScope } from "./types";
import { summarizeAgentScope } from "./scope-label";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import { getCurrentDocumentIdOrThrow } from "../../siyuan/current-doc-service";
import { getNotebookIdByDocId } from "../../siyuan/notebook-resolver";
import { parseDocIdPath, getParentDocIdFromPath } from "../../doc-graph/path-utils";

/**
 * 解析文档元数据（title 和 box）
 * @param docId 文档 ID
 * @returns title 和 box
 */
async function resolveDocMeta(docId: string): Promise<{ title?: string; box?: string; path?: string }> {
  try {
    const escapedDocId = docId.replace(/'/g, "''");
    const rows = await sqlSelectReadonly<{ content?: string; box?: string; path?: string }>(
      `SELECT id, content, box, path FROM blocks WHERE id = '${escapedDocId}' AND type = 'd'`,
      { maxLimit: 1, allowedTables: ["blocks"] }
    );

    if (rows && rows.length > 0) {
      return {
        title: rows[0].content,
        box: rows[0].box,
        path: rows[0].path,
      };
    }
  } catch (e) {
    pushAgentDebugEvent("SCOPE_DOC_META_FAILED", {}, "warn");
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
    pushAgentDebugEvent("SCOPE_PARSE_MODE", { mode }, "debug");
  }

  switch (mode) {
    case "current_doc":
      return await resolveCurrentDocScope(trace);

    case "current_doc_with_children":
      return await resolveDocTreeScope(trace);

    case "current_doc_neighborhood":
      return await resolveCurrentDocNeighborhoodScope(trace);

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
    pushAgentDebugEvent("SCOPE_RESOLVED", { type: "current_doc", hasTitle: !!meta.title }, "debug");
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
    pushAgentDebugEvent("SCOPE_RESOLVED", { type: "doc_tree", hasTitle: !!meta.title, hasBox: !!meta.box }, "debug");
  }

  return {
    scope,
    summary: summarizeAgentScope(scope),
  };
}

/**
 * 解析当前文档邻域 scope
 *
 * 当前文档邻域 = 当前文档 + 父级链 + 同级兄弟文档 + 直接子文档
 * - 不包含孙子文档及更深后代
 * - 不包含父文档的兄弟文档
 * - 不包含反链、提及、标签文档
 */
async function resolveCurrentDocNeighborhoodScope(trace?: boolean): Promise<ResolvedAgentScope> {
  const docId = getCurrentDocumentIdOrThrow();
  const meta = await resolveDocMeta(docId);

  if (!meta.box || !meta.path) {
    throw new Error("无法确定当前文档的笔记本或路径，不能构造文档邻域范围");
  }

  // 从当前文档 path 解析父级链（根到父）
  const pathParts = parseDocIdPath(meta.path);
  const ancestorDocIds = pathParts.slice(0, -1);

  // 查询同一 box 下所有文档的轻量元数据
  const rows = await sqlSelectReadonly<{ id: string; content: string; path: string }>(
    `SELECT id, content, path FROM blocks WHERE box = '${meta.box.replace(/'/g, "''")}' AND type = 'd'`,
    { maxLimit: 5000, allowedTables: ["blocks"] },
  );

  const allDocs = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.content || "",
    path: r.path || "",
    parentDocId: getParentDocIdFromPath(r.path || ""),
  }));

  const currentDoc = allDocs.find((d) => d.id === docId);
  const currentParentDocId = currentDoc?.parentDocId;

  // 同级兄弟：同 parentDocId，排除当前文档
  const siblingDocIds = allDocs
    .filter((d) => d.id !== docId && d.parentDocId === currentParentDocId)
    .map((d) => d.id);

  // 直接子文档：parentDocId 等于当前 docId
  const childDocIds = allDocs
    .filter((d) => d.parentDocId === docId)
    .map((d) => d.id);

  // 组装：父级链（根到父）→ 当前文档 → 同级兄弟 → 直接子文档
  const docIds = [
    ...ancestorDocIds,
    docId,
    ...siblingDocIds,
    ...childDocIds,
  ];
  const uniqueDocIds = [...new Set(docIds)];

  if (trace) {
    pushAgentDebugEvent("SCOPE_RESOLVED", {
      type: "doc_neighborhood",
      docCount: uniqueDocIds.length,
      hasParent: ancestorDocIds.length > 0,
      siblingCount: siblingDocIds.length,
      childCount: childDocIds.length,
      ancestorCount: ancestorDocIds.length,
    }, "debug");
  }

  const scope: AgentScope = {
    type: "doc_neighborhood",
    centerDocId: docId,
    centerTitle: meta.title,
    box: meta.box,
    docIds: uniqueDocIds,
  };

  return {
    scope,
    summary: summarizeAgentScope(scope, { docCount: uniqueDocIds.length }),
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
    pushAgentDebugEvent("SCOPE_RESOLVED", { type: "current_notebook", hasNotebook: !!notebookId }, "debug");
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
    pushAgentDebugEvent("SCOPE_RESOLVED", { type: "whole_kb" }, "debug");
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
    pushAgentDebugEvent("SCOPE_RESOLVED", { type: "custom_docs", docCount: docIds.length }, "debug");
  }

  return {
    scope,
    summary: summarizeAgentScope(scope, { docCount: docIds.length }),
  };
}

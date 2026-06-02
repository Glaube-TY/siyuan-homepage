/**
 * Focus Doc Scope Tool Executor
 *
 * Agentic RAG 只读工具：根据安全 handle 设置本轮临时检索范围。
 *
 * 职责：
 * - 从 workspace.docHandleMappings 解析 handle 到真实 docId
 * - 根据 mode 扩展 docId 列表
 * - 不读取正文，不搜索，不作为证据
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import type { KnowledgeDocHandleMapping, ActiveFocusScope, ExpandedFocusDoc } from "../knowledge-map-types";
import { isDescendantPath, isSiblingPath } from "../../../doc-graph/path-utils";

const FocusDocScopeArgsSchema = z.object({
  handles: z.array(z.string()).min(1).max(20),
  mode: z.enum(["exact", "subtree", "siblings", "notebook"]).optional(),
  reason: z.string().optional(),
  maxDocIds: z.number().min(1).max(200).optional(),
});

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { workspace } = context;

  if (!workspace?.docHandleMappings || workspace.docHandleMappings.length === 0) {
    return { available: false, reason: "未加载文档图谱，请先调用 list_knowledge_map" };
  }

  return { available: true };
}

function calcBudgetCost(): AgentToolBudgetCost {
  return {
    toolCallsUsed: 1,
    toolCallsRemaining: 0,
  };
}

function resolveHandlesToDocIds(
  handles: string[],
  mappings: KnowledgeDocHandleMapping[]
): KnowledgeDocHandleMapping[] {
  const mappingMap = new Map<string, KnowledgeDocHandleMapping>();
  for (const m of mappings) {
    mappingMap.set(m.handle, m);
  }

  const resolved: KnowledgeDocHandleMapping[] = [];
  for (const handle of handles) {
    const mapping = mappingMap.get(handle);
    if (mapping) {
      resolved.push(mapping);
    }
  }

  return resolved;
}

function expandSubtreeDocIds(
  resolvedMappings: KnowledgeDocHandleMapping[],
  allMappings: KnowledgeDocHandleMapping[],
  maxDocIds: number
): { docIds: string[]; expandedDocs: ExpandedFocusDoc[]; descendantCount: number } {
  const docIds = new Set<string>();
  const expandedDocs: ExpandedFocusDoc[] = [];
  let descendantCount = 0;

  for (const mapping of resolvedMappings) {
    if (!docIds.has(mapping.internalDocId)) {
      docIds.add(mapping.internalDocId);
      expandedDocs.push({
        docId: mapping.internalDocId,
        title: mapping.title || "未命名文档",
        titlePath: mapping.titlePath,
        relationToFocus: "root",
        structuralReason: "AI 选择该文档作为聚焦根，系统按文档树展开其子文档。",
        depth: mapping.depth,
      });
    }

    if (mapping.path && mapping.box) {
      for (const m of allMappings) {
        if (m.box === mapping.box && m.path && m.internalDocId !== mapping.internalDocId) {
          if (isDescendantPath(m.path, mapping.path)) {
            if (!docIds.has(m.internalDocId)) {
              docIds.add(m.internalDocId);
              descendantCount++;
              expandedDocs.push({
                docId: m.internalDocId,
                title: m.title || "未命名文档",
                titlePath: m.titlePath,
                parentTitle: mapping.title,
                relationToFocus: "descendant",
                structuralReason: "该文档位于所选文档树下，作为结构候选纳入读取范围。",
                depth: m.depth,
              });
            }
            if (docIds.size >= maxDocIds) break;
          }
        }
      }
    }

    if (docIds.size >= maxDocIds) break;
  }

  return { docIds: [...docIds], expandedDocs, descendantCount };
}

function expandSiblingDocIds(
  resolvedMappings: KnowledgeDocHandleMapping[],
  allMappings: KnowledgeDocHandleMapping[],
  maxDocIds: number
): { docIds: string[]; expandedDocs: ExpandedFocusDoc[]; siblingCount: number } {
  const docIds = new Set<string>();
  const expandedDocs: ExpandedFocusDoc[] = [];
  let siblingCount = 0;

  for (const mapping of resolvedMappings) {
    if (!docIds.has(mapping.internalDocId)) {
      docIds.add(mapping.internalDocId);
      expandedDocs.push({
        docId: mapping.internalDocId,
        title: mapping.title || "未命名文档",
        titlePath: mapping.titlePath,
        relationToFocus: "root",
        structuralReason: "AI 选择该文档作为聚焦根，系统按文档树展开其子文档。",
        depth: mapping.depth,
      });
    }

    if (mapping.path && mapping.box) {
      for (const m of allMappings) {
        if (m.box === mapping.box && m.path && m.internalDocId !== mapping.internalDocId) {
          if (isSiblingPath(m.path, mapping.path)) {
            if (!docIds.has(m.internalDocId)) {
              docIds.add(m.internalDocId);
              siblingCount++;
              expandedDocs.push({
                docId: m.internalDocId,
                title: m.title || "未命名文档",
                titlePath: m.titlePath,
                relationToFocus: "sibling",
                structuralReason: "同一父级下的文档可作为结构补充材料。",
                depth: m.depth,
              });
            }
            if (docIds.size >= maxDocIds) break;
          }
        }
      }
    }

    if (docIds.size >= maxDocIds) break;
  }

  return { docIds: [...docIds], expandedDocs, siblingCount };
}

function expandNotebookDocIds(
  resolvedMappings: KnowledgeDocHandleMapping[],
  allMappings: KnowledgeDocHandleMapping[],
  maxDocIds: number
): string[] {
  const docIds = new Set<string>();

  for (const mapping of resolvedMappings) {
    docIds.add(mapping.internalDocId);

    if (mapping.box) {
      for (const m of allMappings) {
        if (m.box === mapping.box) {
          docIds.add(m.internalDocId);
          if (docIds.size >= maxDocIds) break;
        }
      }
    }

    if (docIds.size >= maxDocIds) break;
  }

  return [...docIds];
}

async function execute(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const { workspace } = context;

  if (!workspace?.docHandleMappings || workspace.docHandleMappings.length === 0) {
    return { success: false, error: "未加载文档图谱", warning: "请先调用 list_knowledge_map" };
  }

  const parsed = FocusDocScopeArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `参数无效：${parsed.error.message}` };
  }

  const { handles, mode = "subtree", reason, maxDocIds = 80 } = parsed.data;

  const resolvedMappings = resolveHandlesToDocIds(handles, workspace.docHandleMappings);

  if (resolvedMappings.length === 0) {
    return {
      success: false,
      error: "无法解析 handles",
      warning: "提供的 handles 在文档图谱中不存在",
    };
  }

  let docIds: string[];
  let expandedDocs: ExpandedFocusDoc[] = [];
  let descendantCount = 0;
  let siblingCount = 0;

  switch (mode) {
    case "exact":
      docIds = resolvedMappings.map((m) => m.internalDocId);
      expandedDocs = resolvedMappings.map((m) => ({
        docId: m.internalDocId,
        title: m.title || "未命名文档",
        titlePath: m.titlePath,
        relationToFocus: "root" as const,
        structuralReason: "AI 选择该文档作为聚焦根，系统按文档树展开其子文档。",
        depth: m.depth,
      }));
      break;
    case "subtree": {
      const result = expandSubtreeDocIds(resolvedMappings, workspace.docHandleMappings, maxDocIds);
      docIds = result.docIds;
      expandedDocs = result.expandedDocs;
      descendantCount = result.descendantCount;
      break;
    }
    case "siblings": {
      const result = expandSiblingDocIds(resolvedMappings, workspace.docHandleMappings, maxDocIds);
      docIds = result.docIds;
      expandedDocs = result.expandedDocs;
      siblingCount = result.siblingCount;
      break;
    }
    case "notebook":
      docIds = expandNotebookDocIds(resolvedMappings, workspace.docHandleMappings, maxDocIds);
      expandedDocs = docIds.map((docId) => {
        const m = workspace.docHandleMappings.find((mm) => mm.internalDocId === docId);
        return {
          docId,
          title: m?.title || "未命名文档",
          titlePath: m?.titlePath,
          relationToFocus: "root" as const,
          depth: m?.depth ?? 0,
        };
      });
      break;
    default:
      docIds = resolvedMappings.map((m) => m.internalDocId);
      expandedDocs = resolvedMappings.map((m) => ({
        docId: m.internalDocId,
        title: m.title || "未命名文档",
        titlePath: m.titlePath,
        relationToFocus: "root" as const,
        structuralReason: "AI 选择该文档作为聚焦根，系统按文档树展开其子文档。",
        depth: m.depth,
      }));
  }

  console.info("[KB-AGENT | FOCUS_SCOPE_EXPANDED_SAFE]", {
    requestedHandleCount: handles.length,
    focusedDocCount: docIds.length,
    descendantCount,
    siblingCount,
    mode,
  });

  const activeFocusScope: ActiveFocusScope = {
    handles,
    docIds: docIds.slice(0, maxDocIds),
    mode,
    reason: reason ?? `focus_doc_scope: ${mode} mode`,
    source: "focus_doc_scope",
    createdAtActionIndex: workspace.toolObservations.length,
    maxDocIds,
    expandedDocs: expandedDocs.slice(0, maxDocIds),
    primaryRoot: resolvedMappings.length > 0
      ? {
          title: resolvedMappings[0].title || "未命名文档",
          titlePath: resolvedMappings[0].titlePath,
          handle: resolvedMappings[0].handle,
        }
      : undefined,
  };

  return {
    success: true,
    data: {
      activeFocusScope,
    },
  };
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "focus_doc_scope 执行失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const activeFocusScope = data?.activeFocusScope as Record<string, unknown> | undefined;
  const focusedHandleCount = (activeFocusScope?.handles as string[])?.length ?? 0;
  const focusedDocCount = (activeFocusScope?.docIds as string[])?.length ?? 0;
  const mode = (activeFocusScope?.mode as string) ?? "subtree";

  return {
    summary: `focus_doc_scope 设置聚焦范围：${focusedHandleCount} 个 handle → ${focusedDocCount} 个文档（${mode} 模式）`,
    counts: { focusedHandles: focusedHandleCount, focusedDocs: focusedDocCount },
    warning: result.warning,
  };
}

export function createFocusDocScopeTool(): AgentToolDefinition {
  return {
    name: "focus_doc_scope",
    description: "根据 list_knowledge_map 返回的安全 handle，设置本轮临时检索范围。不读取正文，不作为证据。",
    readOnly: true,
    inputSchema: FocusDocScopeArgsSchema,
    outputSchema: z.object({
      activeFocusScope: z.unknown(),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}

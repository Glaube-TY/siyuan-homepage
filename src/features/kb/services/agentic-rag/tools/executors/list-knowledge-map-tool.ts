/**
 * List Knowledge Map Tool Executor
 *
 * Agentic RAG 只读工具：返回当前 scope 内的文档层级图谱。
 *
 * 职责：
 * - 复用 buildKnowledgeMap 构建文档层级结构
 * - 只读，不读取正文，不作为证据
 * - 返回安全 handle 映射，不暴露真实 docId
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import { buildKnowledgeMap } from "../readers/knowledge-map-reader";

const ListKnowledgeMapArgsSchema = z.object({
  maxDepth: z.number().min(1).max(6).optional(),
  maxNodes: z.number().min(20).max(300).optional(),
  rootHandles: z.array(z.string()).optional(),
  includeAncestors: z.boolean().optional(),
  includeChildrenPreview: z.boolean().optional(),
});

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { scope } = context;

  if (!scope) {
    return { available: false, reason: "未定义检索范围" };
  }

  return { available: true };
}

function calcBudgetCost(): AgentToolBudgetCost {
  return {
    toolCallsUsed: 1,
    toolCallsRemaining: 0,
  };
}

async function execute(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const { scope, trace } = context;

  if (!scope) {
    return { success: false, error: "未定义检索范围", warning: "list_knowledge_map 需要检索范围" };
  }

  const parsed = ListKnowledgeMapArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `参数无效：${parsed.error.message}` };
  }

  try {
    const result = await buildKnowledgeMap({
      scope,
      maxDepth: parsed.data.maxDepth,
      maxNodes: parsed.data.maxNodes,
      rootHandles: parsed.data.rootHandles,
      includeAncestors: parsed.data.includeAncestors,
      includeChildrenPreview: parsed.data.includeChildrenPreview,
      trace: trace ?? false,
    });

    return {
      success: true,
      data: {
        safeOutput: result.safeOutput,
        internalMapping: result.internalMapping,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `list_knowledge_map 执行失败：${msg}` };
  }
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "list_knowledge_map 执行失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const safeOutput = data?.safeOutput as Record<string, unknown> | undefined;
  const totalNodeCount = (safeOutput?.totalNodeCount as number) ?? 0;
  const returnedNodeCount = (safeOutput?.returnedNodeCount as number) ?? 0;
  const matchedNodeCount = (safeOutput?.matchedNodeCount as number) ?? 0;

  return {
    summary: `list_knowledge_map 返回 ${returnedNodeCount}/${totalNodeCount} 个节点${matchedNodeCount > 0 ? `，匹配 ${matchedNodeCount} 个` : ""}`,
    counts: { knowledgeMapNodes: returnedNodeCount },
    warning: result.warning,
  };
}

export function createListKnowledgeMapTool(): AgentToolDefinition {
  return {
    name: "list_knowledge_map",
    description: "返回当前 scope 内的文档层级图谱，帮助判断资料可能在哪些目录或文档树中。不读取正文，不作为证据。",
    readOnly: true,
    inputSchema: ListKnowledgeMapArgsSchema,
    outputSchema: z.object({
      safeOutput: z.unknown(),
      internalMapping: z.array(z.unknown()),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}

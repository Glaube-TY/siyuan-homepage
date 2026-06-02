/**
 * List Scope Docs Tool Executor
 *
 * Agentic RAG 只读工具：枚举 scope 范围内的文档。
 *
 * 职责：
 * - 复用旧 listDocsForAgent 或等价实现
 * - 只读，不导入写入 API，不直接 import api.ts
 * - 不做全库无上限枚举，limit 必须 clamp
 * - current_doc/custom_docs 也可用，但只能列当前固定范围内文档
 * - budgetCost 不依赖 searchCallCount
 * - 不直接修改 workspace
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import { mapAgentDocLiteToCandidateDoc } from "../tool-mappers";
import { listDocsForAgenticRag } from "../readers/list-docs";
import { getKbSettings } from "../../../settings/kb-settings-service";

const ListScopeDocsArgsSchema = z.object({
  limit: z.number().optional(),
  query: z.string().optional(),
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
    return { success: false, error: "未定义检索范围", warning: "list_scope_docs 需要检索范围" };
  }

  const parsed = ListScopeDocsArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `参数无效：${parsed.error.message}` };
  }

  const settings = await getKbSettings();
  const defaultLimit = Number.isFinite(settings.firstPassMaxHits) ? settings.firstPassMaxHits : 200;
  const effectiveLimit = Math.min(Math.max(1, parsed.data.limit ?? defaultLimit), defaultLimit);

  try {
    const docs = await listDocsForAgenticRag({
      scope,
      limit: effectiveLimit,
      query: parsed.data.query,
      trace: trace ?? false,
    });

    const candidateDocs = docs.map((d) => mapAgentDocLiteToCandidateDoc(d, { query: parsed.data.query }));

    return {
      success: true,
      data: {
        docs,
        candidateDocs,
        totalCount: docs.length,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `list_scope_docs 执行失败：${msg}` };
  }
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "list_scope_docs 执行失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const count = (data?.totalCount as number) ?? 0;

  return {
    summary: `list_scope_docs 找到 ${count} 个文档`,
    counts: { candidateDocs: count },
    warning: result.warning,
  };
}

export function createListScopeDocsTool(): AgentToolDefinition {
  return {
    name: "list_scope_docs",
    description: "枚举当前 scope 内文档清单，不代表相关证据，不读取正文。",
    readOnly: true,
    inputSchema: ListScopeDocsArgsSchema,
    outputSchema: z.object({
      docs: z.array(z.unknown()),
      candidateDocs: z.array(z.unknown()),
      totalCount: z.number(),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}

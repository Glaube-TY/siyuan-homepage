/**
 * Read Block Context Tool Executor
 *
 * Agentic RAG 只读工具：读取命中块的局部上下文。
 *
 * 职责：
 * - 读取每个命中块及其父块、前后相邻块、子块、附近标题
 * - 校验命中块所属 docId 在 scope 或 workspace 范围内
 * - 按 maxCharsPerBlock 截断
 * - 只返回 data/observation，不直接修改 workspace
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import {
  getBlocksByIdsReadonly,
  getSiblingBlocksReadonly,
  getChildBlocksByParentReadonly,
  getParentBlockReadonly,
  getNearestHeadingBlocksReadonly,
  getDocTitleBlockReadonly,
  type BlockLite,
} from "../../../siyuan/block-structure";
import { findDocMetaById } from "../tool-mappers";
import { isBlockAllowedInScope } from "../../scope/scope-guard";
import { canReadMoreBlockContexts } from "../../safety/budget-guard";

const ReadBlockContextArgsSchema = z.object({
  blockIds: z.array(z.string()).min(1),
  before: z.number().optional(),
  after: z.number().optional(),
  includeParent: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  includeHeadingPath: z.boolean().optional(),
  maxCharsPerBlock: z.number().optional(),
});

function truncateContent(content: string, maxChars: number): { content: string; truncated: boolean; contentChars: number } {
  if (content.length <= maxChars) {
    return { content, truncated: false, contentChars: content.length };
  }
  return { content: content.slice(0, maxChars) + "...", truncated: true, contentChars: maxChars };
}

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { scope, budget, workspace } = context;

  if (!scope) {
    return { available: false, reason: "未定义检索范围" };
  }

  const budgetCheck = canReadMoreBlockContexts(budget, {
    counters: undefined,
    workspaceCoverage: workspace?.coverage,
  });
  if (!budgetCheck.allowed) {
    return { available: false, reason: budgetCheck.reason };
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
  const { budget, trace, scope, workspace } = context;

  const parsed = ReadBlockContextArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `无效参数值: ${parsed.error.message}` };
  }

  const inputArgs = parsed.data;
  const maxBlockContexts = budget?.maxBlockContexts ?? 20;

  const uniqueBlockIds = [...new Set(inputArgs.blockIds)];
  const clampedBlockIds = uniqueBlockIds.slice(0, maxBlockContexts);

  const warnings: string[] = [];
  if (uniqueBlockIds.length > maxBlockContexts) {
    warnings.push(`blockIds 被截断为 ${maxBlockContexts} 个（maxBlockContexts）`);
  }

  const blocks = await getBlocksByIdsReadonly(clampedBlockIds);
  const blockMap = new Map<string, BlockLite>(blocks.map((b) => [b.id, b]));

  const failedBlockIds: string[] = [];
  const contexts: Array<{
    blockId: string;
    docId: string;
    docTitle: string;
    content: string;
    box?: string;
    path?: string;
    truncated: boolean;
    contentChars: number;
    headingPath?: string[];
    contextBlocks?: Array<{ blockId: string; content: string; type?: string; subtype?: string }>;
    sourceBlockIds?: string[];
  }> = [];

  const maxCharsPerBlock = inputArgs.maxCharsPerBlock ?? 2000;
  const beforeCount = inputArgs.before ?? 2;
  const afterCount = inputArgs.after ?? 2;

  for (const blockId of clampedBlockIds) {
    const block = blockMap.get(blockId);
    if (!block) {
      failedBlockIds.push(blockId);
      continue;
    }

    if (!isBlockAllowedInScope(block, { scope, workspace })) {
      failedBlockIds.push(blockId);
      if (trace) {
        console.debug(`[ReadBlockContextTool] 块超出范围`);
      }
      continue;
    }

    const docMeta = findDocMetaById(block.root_id, context, context.runtime?.recentContext);
    let docTitle = docMeta?.title;
    if (!docTitle) {
      const titleBlock = await getDocTitleBlockReadonly(block.root_id);
      docTitle = titleBlock?.content || block.root_id;
    }

    const mainContent = truncateContent(block.content || "", maxCharsPerBlock);
    const siblingMaxChars = Math.min(maxCharsPerBlock, 800);

    const contextBlocks: Array<{ blockId: string; content: string; type?: string; subtype?: string }> = [];
    const sourceBlockIds: string[] = [blockId];
    let headingPath: string[] | undefined;

    if (inputArgs.includeParent && block.parent_id) {
      const parent = await getParentBlockReadonly(block.parent_id);
      if (parent) {
        const parentTruncated = truncateContent(parent.content || "", siblingMaxChars);
        contextBlocks.push({
          blockId: parent.id,
          content: parentTruncated.content,
          type: parent.type,
          subtype: parent.subtype,
        });
        sourceBlockIds.push(parent.id);
      }
    }

    if (beforeCount > 0 || afterCount > 0) {
      const siblings = await getSiblingBlocksReadonly(block.root_id, block.sort, beforeCount, afterCount);
      for (const sibling of siblings) {
        const siblingTruncated = truncateContent(sibling.content || "", siblingMaxChars);
        contextBlocks.push({
          blockId: sibling.id,
          content: siblingTruncated.content,
          type: sibling.type,
          subtype: sibling.subtype,
        });
        sourceBlockIds.push(sibling.id);
      }
    }

    if (inputArgs.includeChildren) {
      const children = await getChildBlocksByParentReadonly(blockId, 20);
      for (const child of children) {
        const childTruncated = truncateContent(child.content || "", siblingMaxChars);
        contextBlocks.push({
          blockId: child.id,
          content: childTruncated.content,
          type: child.type,
          subtype: child.subtype,
        });
        sourceBlockIds.push(child.id);
      }
    }

    if (inputArgs.includeHeadingPath) {
      const headings = await getNearestHeadingBlocksReadonly(block.root_id, block.sort, 5);
      headingPath = headings.map((h) => h.content || "");
    }

    contexts.push({
      blockId,
      docId: block.root_id,
      docTitle,
      content: mainContent.content,
      box: block.box,
      path: block.path,
      truncated: mainContent.truncated,
      contentChars: mainContent.contentChars,
      headingPath,
      contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
      sourceBlockIds,
    });
  }

  return {
    success: true,
    data: {
      contexts,
      failedBlockIds,
      warnings,
    },
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "read_block_context 失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const contextCount = (data?.contexts as unknown[])?.length ?? 0;
  const failedCount = (data?.failedBlockIds as unknown[])?.length ?? 0;

  return {
    summary: `read_block_context 加载了 ${contextCount} 个块上下文`,
    counts: { contexts: contextCount, failedBlocks: failedCount },
    warning: result.warning,
  };
}

export function createReadBlockContextTool(): AgentToolDefinition {
  return {
    name: "read_block_context",
    description: "读取特定块的本地上下文：父级、兄弟级、子级和标题路径。",
    readOnly: true,
    inputSchema: ReadBlockContextArgsSchema,
    outputSchema: z.object({
      contexts: z.array(z.unknown()),
      failedBlockIds: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}

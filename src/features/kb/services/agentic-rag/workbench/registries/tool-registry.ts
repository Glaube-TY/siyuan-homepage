/**
 * ToolRegistry: 集中注册 Tool contract。
 */

import type {
  ToolContract,
  ToolManifest,
  ToolSafetyInfo,
  ToolRuntimeContext,
} from "../contracts/tool-contract";
import { assertNoFlowControlFields } from "../guards/flow-control-guard";
import type { BudgetGuard } from "../runtime/budget-guard";

/** execution-only helper 名字集合：Planner **不可见**。 */
export const EXECUTION_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set();

function assertSafetyObject(tool: ToolContract): void {
  const safety = tool.safety as ToolSafetyInfo | undefined;
  if (!safety || typeof safety !== "object" || typeof safety.readOnly !== "boolean") {
    throw new Error(
      `[ToolRegistry] Tool "${tool.name}" must declare safety as a ToolSafetyInfo object ` +
        `with readOnly: boolean (got ${typeof safety?.readOnly}).`,
    );
  }
}

function assertInputSchemaDefined(tool: ToolContract): void {
  if (!tool.inputSchema || typeof (tool.inputSchema as { parse?: unknown }).parse !== "function") {
    throw new Error(
      `[ToolRegistry] Tool "${tool.name}" must declare a real ZodSchema as inputSchema. ` +
        `undefined placeholders are forbidden in v3.`,
    );
  }
}

interface RegisteredTool {
  tool: ToolContract;
  registeredAt: number;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  /**
   * 注册一个 Tool。
   */
  registerTool(tool: ToolContract): void {
    if (!tool?.name) {
      throw new Error("[ToolRegistry] Tool must have a name.");
    }
    assertNoFlowControlFields(tool, `Tool "${tool.name}"`);
    assertSafetyObject(tool);
    assertInputSchemaDefined(tool);
    if (this.tools.has(tool.name)) {
      throw new Error(
        `[ToolRegistry] Tool "${tool.name}" is already registered. ` +
          `Call unregisterTool first if you want to replace it.`,
      );
    }
    this.tools.set(tool.name, { tool, registeredAt: Date.now() });
  }

  /**
   * 注销一个 Tool。
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 取某个 Tool 的 contract（含 execute / availability）。
   * 仅供 Harness / Skill getTools 内部使用，**不**暴露给 Planner。
   */
  getTool(name: string): ToolContract | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * 列出所有已注册的 Tool contract（含 execute / availability）。
   */
  listTools(): ToolContract[] {
    return Array.from(this.tools.values()).map((e) => e.tool);
  }

  /**
   * 生成 Planner 可见的 Tool manifest。
   * 自动过滤 execution-only helper。
   * availability 是 snapshot 结果，但**不**含任何"建议下一工具"语义。
   * budgetGuard 可选：传入后，budget 不足时 manifest availability 为
   * available:false / reasonCode:"budget_exhausted"。
   */
  getPlannerToolManifest(
    ctx: ToolRuntimeContext,
    budgetGuard?: BudgetGuard,
  ): ToolManifest[] {
    const all = this.listTools();
    return all
      .filter((tool) => !EXECUTION_ONLY_TOOL_NAMES.has(tool.name))
      .map((tool) => this.snapshotManifest(tool, ctx, budgetGuard))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 把 ToolContract 拍成 manifest（无 execute）。
   * availability 已根据 ctx 实时计算。
   * budgetGuard 可选：合并预算检查到 availability。
   */
  private snapshotManifest(
    tool: ToolContract,
    ctx: ToolRuntimeContext,
    budgetGuard?: BudgetGuard,
  ): ToolManifest {
    let availability = tool.availability(ctx);
    if (availability.available && budgetGuard) {
      const budgetCheck = budgetGuard.check(tool.name, ctx);
      if (!budgetCheck.available) {
        availability = {
          available: false,
          reasonCode: "budget_exhausted",
          hint: budgetCheck.hint,
        };
      }
    }
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      capability: tool.capability,
      inputSchema: tool.inputSchema,
      outputKind: tool.outputKind,
      safety: tool.safety,
      boundary: tool.boundary,
      source: tool.source,
      inputHint: tool.inputHint,
      availability,
    };
  }

  /**
   * 调试辅助：返回所有工具名 + availability 摘要。
   *
   * - 该方法**只**做 debug 摘要，**不**参与 Planner 决策，**不**自动选择工具。
   * - 传入 budgetGuard 后，debug availability 同样会合并 BudgetGuard.check 的结果，
   *   与 getPlannerToolManifest 的预算侧表现保持一致。
   * - execution-only helper 始终显示 available:false / reasonCode:"execution_only_helper"。
   */
  describeRegistry(
    ctx: ToolRuntimeContext,
    budgetGuard?: BudgetGuard,
  ): Array<{
    name: string;
    source: ToolContract["source"];
    available: boolean;
    reasonCode?: string;
    isExecutionOnly: boolean;
  }> {
    return Array.from(this.tools.values()).map((entry) => {
      const tool = entry.tool;
      const isExecutionOnly = EXECUTION_ONLY_TOOL_NAMES.has(tool.name);
      let availability = isExecutionOnly
        ? { available: false, reasonCode: "execution_only_helper" as const }
        : tool.availability(ctx);
      if (availability.available && !isExecutionOnly && budgetGuard) {
        const budgetCheck = budgetGuard.check(tool.name, ctx);
        if (!budgetCheck.available) {
          availability = {
            available: false,
            reasonCode: budgetCheck.reasonCode ?? "budget_exhausted",
            hint: budgetCheck.hint,
          };
        }
      }
      return {
        name: tool.name,
        source: tool.source,
        available: availability.available,
        reasonCode: availability.reasonCode,
        isExecutionOnly,
      };
    });
  }
}

let globalRegistry: ToolRegistry | null = null;

export function getGlobalToolRegistry(): ToolRegistry {
  if (!globalRegistry) globalRegistry = new ToolRegistry();
  return globalRegistry;
}

export function resetGlobalToolRegistry(): void {
  globalRegistry = null;
}

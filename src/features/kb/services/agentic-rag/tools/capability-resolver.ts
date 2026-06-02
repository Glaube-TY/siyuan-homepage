/**
 * Capability Resolver
 *
 * 根据 scope/runtime/workspace/budget/counters 判断当前可用工具集合。
 *
 * 职责：
 * - 内部调用 getAgenticRagToolRegistry()，再调用每个 tool.availability(context)
 * - 只能根据运行时能力判断，不允许读用户问题文本
 * - 不允许写具体问法规则
 * - 提供 resolveAgenticRagToolCapabilities / getAvailableAgenticRagTools / getUnavailableAgenticRagTools
 */

import type { AgentToolDefinition, AgentToolExecutionContext, AgentToolAvailability } from "./tool-types";
import { getAgenticRagToolRegistry } from "./registry";

export interface AgenticRagCapabilityContext extends AgentToolExecutionContext {}

export interface ResolvedAgentTool {
  definition: AgentToolDefinition;
  available: boolean;
  reason?: string;
}

export function resolveAgenticRagToolCapabilities(
  context: AgenticRagCapabilityContext
): ResolvedAgentTool[] {
  const registry = getAgenticRagToolRegistry();

  return registry.map((tool) => {
    try {
      const availability: AgentToolAvailability = tool.availability(context);
      return {
        definition: tool,
        available: availability.available,
        reason: availability.reason,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        definition: tool,
        available: false,
        reason: `availability error: ${msg}`,
      };
    }
  });
}

export function getAvailableAgenticRagTools(
  context: AgenticRagCapabilityContext
): AgentToolDefinition[] {
  const resolved = resolveAgenticRagToolCapabilities(context);
  return resolved
    .filter((r) => r.available)
    .map((r) => r.definition);
}

export function getUnavailableAgenticRagTools(
  context: AgenticRagCapabilityContext
): Array<{ name: string; reason?: string }> {
  const resolved = resolveAgenticRagToolCapabilities(context);
  return resolved
    .filter((r) => !r.available)
    .map((r) => ({
      name: r.definition.name,
      reason: r.reason,
    }));
}

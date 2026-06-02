/**
 * System answer tool: register entry
 *
 * 幂等注册：如果 toolRegistry.getTool("answer") 已存在则跳过。
 */

import type { ToolRegistry } from "../../../workbench/registries/tool-registry";
import { getGlobalToolRegistry } from "../../../workbench/registries/tool-registry";
import { createSystemAnswerTool } from "./answer.tool";

export function registerSystemAnswerTool(
  toolRegistry: ToolRegistry = getGlobalToolRegistry(),
): void {
  if (toolRegistry.getTool("answer")) return;
  toolRegistry.registerTool(createSystemAnswerTool());
}

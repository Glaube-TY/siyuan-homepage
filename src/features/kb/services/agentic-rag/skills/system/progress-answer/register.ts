/**
 * System progress_answer tool: register entry
 */

import type { ToolRegistry } from "../../../workbench/registries/tool-registry";
import { getGlobalToolRegistry } from "../../../workbench/registries/tool-registry";
import { createProgressAnswerTool } from "./progress-answer.tool";

export function registerProgressAnswerTool(
  toolRegistry: ToolRegistry = getGlobalToolRegistry(),
): void {
  if (toolRegistry.getTool("progress_answer")) return;
  toolRegistry.registerTool(createProgressAnswerTool());
}

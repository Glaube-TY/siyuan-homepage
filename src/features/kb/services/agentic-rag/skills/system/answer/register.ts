/**
 * System final_answer tool: register entry
 */

import type { ToolRegistry } from "../../../workbench/registries/tool-registry";
import { getGlobalToolRegistry } from "../../../workbench/registries/tool-registry";
import { createFinalAnswerTool } from "./answer.tool";

export function registerFinalAnswerTool(
  toolRegistry: ToolRegistry = getGlobalToolRegistry(),
): void {
  if (toolRegistry.getTool("final_answer")) return;
  if (toolRegistry.getTool("answer")) {
    toolRegistry.unregisterTool("answer");
  }
  toolRegistry.registerTool(createFinalAnswerTool());
}

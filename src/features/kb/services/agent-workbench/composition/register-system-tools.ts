/**
 * Composition: register system tools (final_answer, edit_global_memory).
 * These are global system-level tools, not bound to any specific domain.
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createFinalAnswerTool } from "../tools/system/final-answer.tool";
import { createEditGlobalMemoryTool } from "../tools/system/edit-global-memory.tool";

export interface SystemToolOptions {
  /** When present and not disabled, registers edit_global_memory. */
  globalMemoryToolDeps?: {
    docId: string;
    maxEntryChars: number;
  };
  globalToolAccess?: {
    editGlobalMemory: boolean;
  };
}

export function registerSystemTools(
  toolRegistry: ToolRegistry,
  options: SystemToolOptions = {},
): void {
  // final_answer is plannerVisible: false — not in tool manifest
  toolRegistry.ensureTool(createFinalAnswerTool());

  // Global memory edit tool
  if (options.globalMemoryToolDeps && options.globalToolAccess?.editGlobalMemory !== false) {
    toolRegistry.ensureTool(createEditGlobalMemoryTool({
      docId: options.globalMemoryToolDeps.docId,
      maxEntryChars: options.globalMemoryToolDeps.maxEntryChars,
    }));
  }
}

/**
 * Composition: register system tools (edit_global_memory).
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createEditGlobalMemoryTool } from "../tools/system/edit-global-memory.tool";

export interface SystemToolOptions {
  /** When present and not disabled, registers edit_global_memory. */
  globalMemoryToolDeps?: {
    docId: string;
    maxMemoryChars: number;
  };
  globalToolAccess?: {
    editGlobalMemory: boolean;
  };
}

export function registerSystemTools(
  toolRegistry: ToolRegistry,
  options: SystemToolOptions = {},
): void {
  // Global memory edit tool
  if (options.globalMemoryToolDeps && options.globalToolAccess?.editGlobalMemory !== false) {
    toolRegistry.ensureTool(createEditGlobalMemoryTool({
      docId: options.globalMemoryToolDeps.docId,
      maxMemoryChars: options.globalMemoryToolDeps.maxMemoryChars,
    }));
  }
}

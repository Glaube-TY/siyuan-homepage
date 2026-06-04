/**
 * System context tools: register entry.
 *
 * These tools are global ToolRegistry abilities. They are not owned by a Skill
 * and do not imply any fixed retrieval or reading workflow.
 */

import type { ToolRegistry } from "../../../workbench/registries/tool-registry";
import { getGlobalToolRegistry } from "../../../workbench/registries/tool-registry";
import type { KbRetrievalToolDeps } from "../../builtin/kb-retrieval/adapters/kb-retrieval-tool-deps";
import { createListRecentReferencesTool } from "./tools/list-recent-references.tool";
import { createReadReferenceContentTool } from "./tools/read-reference-content.tool";

export function registerSystemContextTools(
  toolRegistry: ToolRegistry = getGlobalToolRegistry(),
  deps: KbRetrievalToolDeps,
): void {
  for (const toolName of ["list_recent_references", "read_reference_content"]) {
    if (toolRegistry.getTool(toolName)) {
      toolRegistry.unregisterTool(toolName);
    }
  }
  toolRegistry.registerTool(createListRecentReferencesTool(deps));
  toolRegistry.registerTool(createReadReferenceContentTool(deps));
}


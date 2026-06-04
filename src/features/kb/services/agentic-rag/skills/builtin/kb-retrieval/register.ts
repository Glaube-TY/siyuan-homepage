/**
 * KB retrieval skill: register entry
 */

import type { SkillRegistry } from "../../../workbench/registries/skill-registry";
import type { ToolRegistry } from "../../../workbench/registries/tool-registry";
import { getGlobalSkillRegistry } from "../../../workbench/registries/skill-registry";
import { getGlobalToolRegistry } from "../../../workbench/registries/tool-registry";
import {
  BUILTIN_KB_SKILL_NAME,
  createBuiltinKnowledgeBaseQaSkill,
} from "./skill";
import type { KbRetrievalToolDeps } from "./adapters/kb-retrieval-tool-deps";
import { createListKnowledgeMapTool } from "./tools/list-knowledge-map.tool";
import { createListRecentReferencesTool } from "./tools/list-recent-references.tool";
import { createSearchScopeTool } from "./tools/search-scope.tool";
import { createFocusDocScopeTool } from "./tools/focus-doc-scope.tool";
import { createReadCandidateDocsTool } from "./tools/read-candidate-docs.tool";
import { createReadReferenceContentTool } from "./tools/read-reference-content.tool";

/**
 * 把 builtin_knowledge_base_qa 注册到 SkillRegistry。
 * 已注册则跳过（幂等）。
 */
export function registerBuiltinKbRetrievalSkill(
  registry: SkillRegistry = getGlobalSkillRegistry(),
): void {
  if (registry.listSkills().some((s) => s.name === BUILTIN_KB_SKILL_NAME)) return;
  registry.registerSkill(createBuiltinKnowledgeBaseQaSkill(), "builtin");
}

/**
 * 把 KB retrieval tools 注册到 ToolRegistry。
 * 已存在则先注销再注册（确保 deps 更新）。
 */
export function registerBuiltinKbRetrievalTools(
  registry: ToolRegistry = getGlobalToolRegistry(),
  deps: KbRetrievalToolDeps,
): void {
  for (const toolName of [
    "list_knowledge_map",
    "list_recent_references",
    "search_scope",
    "focus_doc_scope",
    "read_candidate_docs",
    "read_reference_content",
  ]) {
    if (registry.getTool(toolName)) {
      registry.unregisterTool(toolName);
    }
  }
  registry.registerTool(createListKnowledgeMapTool(deps));
  registry.registerTool(createListRecentReferencesTool(deps));
  registry.registerTool(createSearchScopeTool(deps));
  registry.registerTool(createFocusDocScopeTool(deps));
  registry.registerTool(createReadCandidateDocsTool(deps));
  registry.registerTool(createReadReferenceContentTool(deps));
}

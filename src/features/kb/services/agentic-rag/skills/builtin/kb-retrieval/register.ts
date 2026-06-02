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
import { createGetConversationUsedReferencesTool } from "./tools/get-conversation-used-references.tool";

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
  for (const toolName of ["list_knowledge_map", "get_conversation_used_references"]) {
    if (registry.getTool(toolName)) {
      registry.unregisterTool(toolName);
    }
  }
  registry.registerTool(createListKnowledgeMapTool(deps));
  registry.registerTool(createGetConversationUsedReferencesTool(deps));
}

/**
 * KB retrieval skill: public exports
 */

export {
  BUILTIN_KB_SKILL_NAME,
  BUILTIN_KB_SKILL_PRIORITY,
  BUILTIN_KB_SKILL_TOOL_NAMES,
  createBuiltinKnowledgeBaseQaSkill,
} from "./skill";

export { registerBuiltinKbRetrievalSkill, registerBuiltinKbRetrievalTools } from "./register";
export type { KbRetrievalToolDeps } from "./adapters/kb-retrieval-tool-deps";
export { KbRetrievalRuntimeState } from "./adapters/kb-retrieval-runtime-state";

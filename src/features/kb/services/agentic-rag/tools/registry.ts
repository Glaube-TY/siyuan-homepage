/**
 * Agentic RAG Tool Registry
 *
 * 职责：
 * - 返回核心只读执行工具：search_scope、list_scope_docs、read_docs、read_block_context
 * - 返回历史对话已引用资料工具：get_conversation_used_references
 * - 返回文档树结构候选工具：get_doc_tree_context
 * - registry 不根据用户具体问法决定工具，只返回定义
 * - 可用性由 availability(context) 决定
 */

import type { AgentToolDefinition } from "./tool-types";
import { createSearchScopeTool } from "./executors/search-scope-tool";
import { createListScopeDocsTool } from "./executors/list-scope-docs-tool";
import { createReadDocsTool } from "./executors/read-docs-tool";
import { createReadBlockContextTool } from "./executors/read-block-context-tool";
import { createGetConversationUsedReferencesTool } from "./executors/get-conversation-used-references-tool";
import { createGetDocTreeContextTool } from "./executors/get-doc-tree-context-tool";
import { createListKnowledgeMapTool } from "./executors/list-knowledge-map-tool";
import { createFocusDocScopeTool } from "./executors/focus-doc-scope-tool";

export function getAgenticRagToolRegistry(): AgentToolDefinition[] {
  return [
    createListKnowledgeMapTool(),
    createFocusDocScopeTool(),
    createSearchScopeTool(),
    createListScopeDocsTool(),
    createReadDocsTool(),
    createReadBlockContextTool(),
    createGetConversationUsedReferencesTool(),
    createGetDocTreeContextTool(),
  ];
}

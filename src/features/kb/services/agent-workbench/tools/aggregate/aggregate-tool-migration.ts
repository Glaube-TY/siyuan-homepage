import type { AggregateToolName } from "./aggregate-tool-metadata";

/**
 * 旧独立小工具名 -> 聚合工具名迁移映射。
 * 仅用于旧设置迁移、结果/错误中的旧名替换、以及内部 action 路由兼容。
 * 不允许进入 provider-visible manifest、agent_tool_help 返回或模型可见结果。
 */

export const OLD_TOOL_TO_AGGREGATE_TOOL: Record<string, AggregateToolName> = {
  // siyuan_kb
  search_scope: "siyuan_kb",
  read_docs: "siyuan_kb",
  get_doc_info: "siyuan_kb",
  list_knowledge_map: "siyuan_kb",
  list_items_by_time: "siyuan_kb",
  siyuan_outline: "siyuan_kb",
  siyuan_ref: "siyuan_kb",
  siyuan_search_extra: "siyuan_kb",

  // diary_task
  get_daily_workspace_overview: "diary_task",
  query_tasks: "diary_task",
  query_diary_records: "diary_task",
  find_diary_docs: "diary_task",
  manage_diary_structure: "diary_task",
  manage_diary_task: "diary_task",
  manage_diary_record: "diary_task",
  manage_diary_review: "diary_task",

  // siyuan_database
  list_attribute_views: "siyuan_database",
  read_attribute_view: "siyuan_database",
  find_attribute_view_rows: "siyuan_database",
  update_attribute_view_cell: "siyuan_database",
  add_attribute_view_rows: "siyuan_database",
  add_attribute_view_key: "siyuan_database",
  remove_attribute_view_key: "siyuan_database",
  remove_attribute_view_rows: "siyuan_database",
  clear_attribute_view_cell: "siyuan_database",
  siyuan_database_extra_read: "siyuan_database",
  siyuan_database_view: "siyuan_database",

  // siyuan_doc_edit
  read_doc_blocks: "siyuan_doc_edit",
  siyuan_block_read: "siyuan_doc_edit",
  siyuan_block_attr: "siyuan_doc_edit",
  siyuan_block_ref: "siyuan_doc_edit",
  siyuan_block_state: "siyuan_doc_edit",
  siyuan_doc_transform: "siyuan_doc_edit",
  create_doc: "siyuan_doc_edit",
  update_block: "siyuan_doc_edit",
  insert_block: "siyuan_doc_edit",
  delete_blocks: "siyuan_doc_edit",
  move_block: "siyuan_doc_edit",
  rename_doc: "siyuan_doc_edit",
  delete_doc: "siyuan_doc_edit",
  replace_doc_content: "siyuan_doc_edit",

  // siyuan_tree
  siyuan_notebook_manage: "siyuan_tree",
  siyuan_doc_tree: "siyuan_tree",
  siyuan_doc_path: "siyuan_tree",

  // siyuan_meta
  siyuan_tag_manage: "siyuan_meta",
  siyuan_bookmark_manage: "siyuan_meta",

  // siyuan_asset
  siyuan_asset_read: "siyuan_asset",
  siyuan_asset_manage: "siyuan_asset",
  siyuan_workspace_file: "siyuan_asset",

  // siyuan_riff
  siyuan_riff_deck: "siyuan_riff",
  siyuan_riff_card: "siyuan_riff",

  // skill_manage
  skill_list: "skill_manage",
  skill_read: "skill_manage",
  skill_read_file: "skill_manage",
  skill_install: "skill_manage",
  skill_uninstall: "skill_manage",
  skill_reindex: "skill_manage",

  // mcp_manage
  mcp_list_servers: "mcp_manage",
  mcp_save_server: "mcp_manage",
  mcp_sync_tools: "mcp_manage",
  mcp_list_tools: "mcp_manage",
  mcp_read_tool: "mcp_manage",
  mcp_call_tool: "mcp_manage",
  mcp_list_presets: "mcp_manage",
  mcp_cleanup_stale_tools: "mcp_manage",

  // notebrain_file
  list_notebrain_dir: "notebrain_file",
  read_notebrain_file: "notebrain_file",
  write_notebrain_file: "notebrain_file",
  delete_notebrain_path: "notebrain_file",
  run_notebrain_command: "notebrain_file",

  // web_fetch
  web_read_page: "web_fetch",
  web_http_get: "web_fetch",
  web_http_post: "web_fetch",
};

export const OLD_TOOL_TO_AGGREGATE_ACTION: Record<string, { tool: AggregateToolName; action: string }> = {
  // siyuan_kb
  search_scope: { tool: "siyuan_kb", action: "search" },
  read_docs: { tool: "siyuan_kb", action: "read_docs" },
  get_doc_info: { tool: "siyuan_kb", action: "get_doc_info" },
  list_knowledge_map: { tool: "siyuan_kb", action: "list_map" },
  list_items_by_time: { tool: "siyuan_kb", action: "list_by_time" },
  siyuan_outline: { tool: "siyuan_kb", action: "outline" },
  siyuan_ref: { tool: "siyuan_kb", action: "refs" },
  siyuan_search_extra: { tool: "siyuan_kb", action: "extra_search" },

  // diary_task
  get_daily_workspace_overview: { tool: "diary_task", action: "overview" },
  query_tasks: { tool: "diary_task", action: "query_tasks" },
  query_diary_records: { tool: "diary_task", action: "query_records" },
  find_diary_docs: { tool: "diary_task", action: "find_docs" },
  manage_diary_structure: { tool: "diary_task", action: "ensure_structure" },
  manage_diary_task: { tool: "diary_task", action: "manage_task" },
  manage_diary_record: { tool: "diary_task", action: "manage_record" },
  manage_diary_review: { tool: "diary_task", action: "manage_review" },

  // siyuan_database
  list_attribute_views: { tool: "siyuan_database", action: "list" },
  read_attribute_view: { tool: "siyuan_database", action: "read" },
  find_attribute_view_rows: { tool: "siyuan_database", action: "find_rows" },
  update_attribute_view_cell: { tool: "siyuan_database", action: "update_cell" },
  add_attribute_view_rows: { tool: "siyuan_database", action: "add_rows" },
  add_attribute_view_key: { tool: "siyuan_database", action: "add_key" },
  remove_attribute_view_key: { tool: "siyuan_database", action: "remove_key" },
  remove_attribute_view_rows: { tool: "siyuan_database", action: "remove_rows" },
  clear_attribute_view_cell: { tool: "siyuan_database", action: "clear_cell" },
  siyuan_database_extra_read: { tool: "siyuan_database", action: "extra_read" },
  siyuan_database_view: { tool: "siyuan_database", action: "view" },

  // siyuan_doc_edit
  read_doc_blocks: { tool: "siyuan_doc_edit", action: "read_blocks" },
  siyuan_block_read: { tool: "siyuan_doc_edit", action: "block_read" },
  siyuan_block_attr: { tool: "siyuan_doc_edit", action: "block_attr" },
  siyuan_block_ref: { tool: "siyuan_doc_edit", action: "block_ref" },
  siyuan_block_state: { tool: "siyuan_doc_edit", action: "block_state" },
  siyuan_doc_transform: { tool: "siyuan_doc_edit", action: "doc_transform" },
  create_doc: { tool: "siyuan_doc_edit", action: "create_doc" },
  update_block: { tool: "siyuan_doc_edit", action: "update_block" },
  insert_block: { tool: "siyuan_doc_edit", action: "insert_block" },
  delete_blocks: { tool: "siyuan_doc_edit", action: "delete_blocks" },
  move_block: { tool: "siyuan_doc_edit", action: "move_block" },
  rename_doc: { tool: "siyuan_doc_edit", action: "rename_doc" },
  delete_doc: { tool: "siyuan_doc_edit", action: "delete_doc" },
  replace_doc_content: { tool: "siyuan_doc_edit", action: "replace_doc_content" },

  // siyuan_tree
  siyuan_notebook_manage: { tool: "siyuan_tree", action: "notebook" },
  siyuan_doc_tree: { tool: "siyuan_tree", action: "doc_tree" },
  siyuan_doc_path: { tool: "siyuan_tree", action: "doc_path" },

  // siyuan_meta
  siyuan_tag_manage: { tool: "siyuan_meta", action: "tag" },
  siyuan_bookmark_manage: { tool: "siyuan_meta", action: "bookmark" },

  // siyuan_asset
  siyuan_asset_read: { tool: "siyuan_asset", action: "read" },
  siyuan_asset_manage: { tool: "siyuan_asset", action: "manage" },
  siyuan_workspace_file: { tool: "siyuan_asset", action: "workspace_file" },

  // siyuan_riff
  siyuan_riff_deck: { tool: "siyuan_riff", action: "deck" },
  siyuan_riff_card: { tool: "siyuan_riff", action: "card" },

  // skill_manage
  skill_list: { tool: "skill_manage", action: "list" },
  skill_read: { tool: "skill_manage", action: "read" },
  skill_read_file: { tool: "skill_manage", action: "read_file" },
  skill_install: { tool: "skill_manage", action: "install" },
  skill_uninstall: { tool: "skill_manage", action: "uninstall" },
  skill_reindex: { tool: "skill_manage", action: "reindex" },

  // mcp_manage
  mcp_list_servers: { tool: "mcp_manage", action: "list_servers" },
  mcp_save_server: { tool: "mcp_manage", action: "save_server" },
  mcp_sync_tools: { tool: "mcp_manage", action: "sync_tools" },
  mcp_list_tools: { tool: "mcp_manage", action: "list_tools" },
  mcp_read_tool: { tool: "mcp_manage", action: "read_tool" },
  mcp_call_tool: { tool: "mcp_manage", action: "call_tool" },
  mcp_list_presets: { tool: "mcp_manage", action: "list_presets" },
  mcp_cleanup_stale_tools: { tool: "mcp_manage", action: "cleanup_stale_tools" },

  // notebrain_file
  list_notebrain_dir: { tool: "notebrain_file", action: "list_dir" },
  read_notebrain_file: { tool: "notebrain_file", action: "read_file" },
  write_notebrain_file: { tool: "notebrain_file", action: "write_file" },
  delete_notebrain_path: { tool: "notebrain_file", action: "delete_path" },
  run_notebrain_command: { tool: "notebrain_file", action: "run_command" },

  // web_fetch
  web_read_page: { tool: "web_fetch", action: "read_page" },
  web_http_get: { tool: "web_fetch", action: "http_get" },
  web_http_post: { tool: "web_fetch", action: "http_post" },
};

export const BUILTIN_SKILL_TO_AGGREGATE_TOOL: Record<string, AggregateToolName> = {
  builtin_knowledge_base_qa: "siyuan_kb",
  builtin_schedule_task_diary: "diary_task",
  builtin_database_assistant: "siyuan_database",
  builtin_doc_content_editing: "siyuan_doc_edit",
  builtin_notebook_doc_tree: "siyuan_tree",
  builtin_tag_bookmark_outline: "siyuan_meta",
  builtin_asset_management: "siyuan_asset",
  builtin_riff_review: "siyuan_riff",
};

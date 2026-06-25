import type { NotebrainAgentWorkspaceSettings } from "../../../types/settings";
import { ToolRegistry } from "../registries/tool-registry";
import {
  createDeleteNotebrainPathTool,
  createListNotebrainDirTool,
  createReadNotebrainFileTool,
  createWriteNotebrainFileTool,
} from "../tools/local/notebrain-file-tools";

export function registerLocalTools(
  toolRegistry: ToolRegistry,
  settings?: NotebrainAgentWorkspaceSettings,
): void {
  // Sandbox master switch must be enabled for any local file tools.
  if (settings?.enabled !== true) return;
  toolRegistry.ensureTool(createListNotebrainDirTool());
  toolRegistry.ensureTool(createReadNotebrainFileTool());
  // Write/delete tools respect the fileWriteToolsEnabled toggle.
  // skill_install bypasses this via its own confirmation flow.
  if (settings?.fileWriteToolsEnabled !== false) {
    toolRegistry.ensureTool(createWriteNotebrainFileTool());
    toolRegistry.ensureTool(createDeleteNotebrainPathTool());
  }
}


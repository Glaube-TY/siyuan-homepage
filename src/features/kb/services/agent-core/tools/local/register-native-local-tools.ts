import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { NativeToolRegistry } from "../native-tool-registry";
import { createRunNotebrainCommandNativeTool } from "./native-notebrain-command-tool";

export function registerNativeLocalTools(
  registry: NativeToolRegistry,
  settings: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): void {
  // Sandbox master switch must be enabled for native local command tool.
  if (settings.enabled !== true) return;
  const commandTool = createRunNotebrainCommandNativeTool(settings, runtimeToolsSettings);
  if (commandTool) {
    registry.register(commandTool);
  }
}


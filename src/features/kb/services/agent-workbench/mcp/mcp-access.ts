import type { McpSettings } from "../../../types/settings";

export function isMcpServerAllowed(settings: McpSettings, serverId: string): boolean {
  return !settings.disabledServerIds.includes(serverId)
    && (!settings.allowedServerIds || settings.allowedServerIds.includes(serverId));
}

export function isMcpToolAllowed(
  settings: McpSettings,
  tool: { internalName: string; originalName: string },
): boolean {
  return !settings.disabledToolNames.includes(tool.internalName)
    && !settings.disabledToolNames.includes(tool.originalName)
    && (!settings.allowedToolNames
      || settings.allowedToolNames.includes(tool.internalName)
      || settings.allowedToolNames.includes(tool.originalName));
}

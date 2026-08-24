import type { KbSettings } from "../../types/settings";

export function buildModelSettingsPatch(settings: KbSettings): Partial<KbSettings> {
  return {
    chatProviders: settings.chatProviders,
    selectedChatProviderId: settings.selectedChatProviderId,
    selectedChatModelId: settings.selectedChatModelId,
  };
}

export function buildLocalKbSettingsPatch(settings: KbSettings): Partial<KbSettings> {
  return {
    chatAppearance: settings.chatAppearance,
    assistantActionAlignment: settings.assistantActionAlignment,
    firstPassMaxHits: settings.firstPassMaxHits,
    docTitleMatchWeight: settings.docTitleMatchWeight,
    headingMatchWeight: settings.headingMatchWeight,
    textMatchWeight: settings.textMatchWeight,
    previewMatchWeight: settings.previewMatchWeight,
    agentReadMaxCharsPerDoc: settings.agentReadMaxCharsPerDoc,
    agentThinkingEnabled: settings.agentThinkingEnabled,
    agentMaxToolCallsPerTurn: settings.agentMaxToolCallsPerTurn,
    toolSettings: settings.toolSettings,
    quickPrompts: settings.quickPrompts,
    notebrainWorkspace: settings.notebrainWorkspace,
    externalSkills: settings.externalSkills,
    mcp: settings.mcp,
    runtimeTools: settings.runtimeTools,
    workbenchProcessDisplayMode: settings.workbenchProcessDisplayMode,
    reasoningProcessDisplayMode: settings.reasoningProcessDisplayMode,
  };
}

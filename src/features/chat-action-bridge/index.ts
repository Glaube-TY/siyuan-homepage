import { setChatActionSettingsPlugin } from "./chat-action-settings-store";
import { setChatActionHistoryPlugin } from "./chat-action-history-store";
import { setQuickNoteWritePlugin } from "@/features/quick-note/quick-note-write-service";
import { setDiaryTaskActionPlugin } from "./diary-task-action-service";
import { setPairingCapturePlugin } from "./chat-action-pairing-capture-store";
import { setChatActionBridgeServicePlugin } from "./chat-action-service";

export function setChatActionBridgePlugin(plugin: any): void {
  setChatActionSettingsPlugin(plugin);
  setChatActionHistoryPlugin(plugin);
  setQuickNoteWritePlugin(plugin);
  setDiaryTaskActionPlugin(plugin);
  setPairingCapturePlugin(plugin);
  setChatActionBridgeServicePlugin(plugin);
}

export * from "./types";
export * from "./constants";
export * from "./chat-action-settings-store";
export * from "./chat-action-secret-store";
export * from "./chat-action-history-store";
export * from "./chat-action-session-store";
export * from "./chat-action-redact";
export * from "./chat-action-menu";
export * from "./chat-action-render";
export * from "./chat-action-router";
export * from "./chat-action-service";
export * from "./chat-action-scheduler";
export * from "./feishu/feishu-local-gateway-process";
export * from "./quick-note-action-service";
export * from "./diary-task-action-service";
export * from "./chat-action-pairing-capture-store";

import type { ChatActionPairingCaptureState } from "./types";

const CAPTURE_STORE_KEY = "chatActionBridgePairingCapture.json";
const CAPTURE_TTL_MS = 5 * 60 * 1000;

let pluginInstance: any = null;

export function setPairingCapturePlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Pairing capture store is not initialized.");
  }
  return pluginInstance;
}

function defaultState(): ChatActionPairingCaptureState {
  return { enabled: false, expiresAt: 0 };
}

export function getCaptureRemainingSeconds(state: ChatActionPairingCaptureState): number {
  if (!state.enabled) return 0;
  return Math.max(0, Math.floor((state.expiresAt - Date.now()) / 1000));
}

export async function loadPairingCaptureState(): Promise<ChatActionPairingCaptureState> {
  try {
    const raw = await getPlugin().loadData(CAPTURE_STORE_KEY);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const state = raw as ChatActionPairingCaptureState;
      // Auto-clear if expired
      if (state.enabled && Date.now() > state.expiresAt) {
        return { enabled: false, expiresAt: 0, capturedAt: state.capturedAt };
      }
      return {
        enabled: Boolean(state.enabled),
        expiresAt: typeof state.expiresAt === "number" ? state.expiresAt : 0,
        capturedAt: typeof state.capturedAt === "number" ? state.capturedAt : undefined,
        openId: typeof state.openId === "string" ? state.openId : undefined,
        userId: typeof state.userId === "string" ? state.userId : undefined,
        chatId: typeof state.chatId === "string" ? state.chatId : undefined,
        senderName: typeof state.senderName === "string" ? state.senderName : undefined,
      };
    }
  } catch {
    // ignore read errors
  }
  return defaultState();
}

export async function savePairingCaptureState(state: ChatActionPairingCaptureState): Promise<void> {
  await getPlugin().saveData(CAPTURE_STORE_KEY, state);
}

export async function startPairingCapture(): Promise<ChatActionPairingCaptureState> {
  const state: ChatActionPairingCaptureState = {
    enabled: true,
    expiresAt: Date.now() + CAPTURE_TTL_MS,
  };
  await savePairingCaptureState(state);
  return state;
}

export async function completePairingCapture(result: {
  openId?: string;
  userId?: string;
  chatId?: string;
  senderName?: string;
}): Promise<ChatActionPairingCaptureState> {
  const state: ChatActionPairingCaptureState = {
    enabled: false,
    expiresAt: 0,
    capturedAt: Date.now(),
    openId: result.openId,
    userId: result.userId,
    chatId: result.chatId,
    senderName: result.senderName,
  };
  await savePairingCaptureState(state);
  return state;
}

export async function clearCaptureResult(): Promise<ChatActionPairingCaptureState> {
  const state = defaultState();
  await savePairingCaptureState(state);
  return state;
}

export async function refreshPairingCaptureTtl(): Promise<ChatActionPairingCaptureState> {
  const state: ChatActionPairingCaptureState = {
    enabled: true,
    expiresAt: Date.now() + CAPTURE_TTL_MS,
  };
  await savePairingCaptureState(state);
  return state;
}

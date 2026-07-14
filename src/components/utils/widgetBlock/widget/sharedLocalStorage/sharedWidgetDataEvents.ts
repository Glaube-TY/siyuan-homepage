import type { SharedWidgetStore } from "./sharedWidgetStoragePaths";

export const SHARED_WIDGET_DATA_UPDATED_EVENT = "siyuan-homepage-shared-widget-data-updated";
const SHARED_WIDGET_BROADCAST_CHANNEL = "siyuan-homepage-shared-widget-data";

export interface SharedWidgetDataUpdatedDetail {
    store: SharedWidgetStore;
    path: string;
    revision: number;
    updatedAt: string;
}

let broadcastChannel: BroadcastChannel | null = null;

function isValidDetail(value: unknown): value is SharedWidgetDataUpdatedDetail {
    if (!value || typeof value !== "object") return false;
    const detail = value as Partial<SharedWidgetDataUpdatedDetail>;
    return typeof detail.store === "string"
        && typeof detail.path === "string"
        && typeof detail.revision === "number"
        && typeof detail.updatedAt === "string";
}

function ensureBroadcastChannel(): BroadcastChannel | null {
    if (broadcastChannel || typeof BroadcastChannel === "undefined") return broadcastChannel;
    try {
        broadcastChannel = new BroadcastChannel(SHARED_WIDGET_BROADCAST_CHANNEL);
        broadcastChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (!isValidDetail(event.data) || typeof window === "undefined") return;
            window.dispatchEvent(new CustomEvent(SHARED_WIDGET_DATA_UPDATED_EVENT, { detail: event.data }));
        });
    } catch (error) {
        console.warn("[sharedWidgetDataEvents] BroadcastChannel 初始化失败", error);
        broadcastChannel = null;
    }
    return broadcastChannel;
}

export function dispatchSharedWidgetDataUpdated(detail: SharedWidgetDataUpdatedDetail): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SHARED_WIDGET_DATA_UPDATED_EVENT, { detail }));
    }
    try {
        ensureBroadcastChannel()?.postMessage(detail);
    } catch (error) {
        console.warn("[sharedWidgetDataEvents] BroadcastChannel 发送失败", error);
    }
}

export function subscribeSharedWidgetDataUpdated(
    store: SharedWidgetStore,
    listener: (detail: SharedWidgetDataUpdatedDetail) => void,
): () => void {
    if (typeof window === "undefined") return () => undefined;
    ensureBroadcastChannel();
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail;
        if (isValidDetail(detail) && detail.store === store) listener(detail);
    };
    window.addEventListener(SHARED_WIDGET_DATA_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SHARED_WIDGET_DATA_UPDATED_EVENT, handler);
}

export function destroySharedWidgetDataEvents(): void {
    try {
        broadcastChannel?.close();
    } catch {
        // BroadcastChannel cleanup is best effort.
    }
    broadcastChannel = null;
}


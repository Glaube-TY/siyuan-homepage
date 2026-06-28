import { mount, unmount } from "svelte";
import type { MusicPlayerVmStore, MusicPlayerActions } from "./musicPlayerTypes";
import MusicPlayerFloatingMini from "./MusicPlayerFloatingMini.svelte";

interface Host {
    hostId: string;
    vmStore: MusicPlayerVmStore;
    actions: MusicPlayerActions;
}

let currentHost: Host | null = null;
let floatingRootEl: HTMLElement | null = null;
let floatingComponent: Record<string, any> | null = null;

export function registerFloatingMiniHost(host: Host): void {
    if (!host || !host.vmStore || !host.actions) return;
    if (currentHost && currentHost.hostId !== host.hostId) return;
    currentHost = host;
    ensureFloatingMiniMounted();
}

export function unregisterFloatingMiniHost(hostId: string): void {
    if (!currentHost || currentHost.hostId !== hostId) return;
    destroyFloatingMini();
}

function ensureFloatingMiniMounted(): void {
    if (floatingRootEl || !currentHost) return;
    try {
        const root = document.createElement("div");
        root.className = "siyuan-homepage-music-floating-mini-root";
        document.body.appendChild(root);
        floatingRootEl = root;
        floatingComponent = mount(MusicPlayerFloatingMini, {
            target: root,
            props: {
                vmStore: currentHost.vmStore,
                actions: currentHost.actions,
            },
        });
    } catch {
        destroyFloatingMini();
    }
}

export function destroyFloatingMini(): void {
    currentHost = null;
    if (floatingComponent) {
        try { unmount(floatingComponent); } catch { /* ignore */ }
        floatingComponent = null;
    }
    if (floatingRootEl) {
        floatingRootEl.remove();
        floatingRootEl = null;
    }
}

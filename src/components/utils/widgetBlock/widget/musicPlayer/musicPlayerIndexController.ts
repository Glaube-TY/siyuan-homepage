import type { MusicMetadataIndexProgress } from "./musicPlayerTypes";

export type MusicPlayerIndexActionResult =
    | { ok: true; status: "started" | "running" | "up_to_date" }
    | { ok: false; reason: "no_controller" | "metadata_disabled" | "no_music" | "no_store" };

export interface MusicPlayerIndexController {
    buildIndex: () => Promise<MusicPlayerIndexActionResult>;
    rebuildIndex: () => Promise<MusicPlayerIndexActionResult>;
    getProgress: () => MusicMetadataIndexProgress;
}

const controllers = new Map<string, MusicPlayerIndexController>();

export function registerMusicPlayerIndexController(hostId: string, controller: MusicPlayerIndexController): void {
    if (!hostId || !controller) return;
    controllers.set(hostId, controller);
}

export function unregisterMusicPlayerIndexController(hostId: string): void {
    if (!hostId) return;
    controllers.delete(hostId);
}

export async function buildMusicPlayerIndex(hostId: string): Promise<MusicPlayerIndexActionResult> {
    const controller = controllers.get(hostId);
    if (!controller) return { ok: false, reason: "no_controller" };
    return await controller.buildIndex();
}

export async function rebuildMusicPlayerIndex(hostId: string): Promise<MusicPlayerIndexActionResult> {
    const controller = controllers.get(hostId);
    if (!controller) return { ok: false, reason: "no_controller" };
    return await controller.rebuildIndex();
}

export function getMusicPlayerIndexProgress(hostId: string): MusicMetadataIndexProgress | null {
    const controller = controllers.get(hostId);
    if (!controller) return null;
    return controller.getProgress();
}

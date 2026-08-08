export interface MusicPlaybackTrackSummary {
    trackId: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
}

export interface MusicPlaybackRuntimeStatus {
    sourceMode: "local" | "subsonic";
    isPlaying: boolean;
    currentTrack: MusicPlaybackTrackSummary | null;
    currentTime: number;
    duration: number;
    volume: number;
    queueCount: number;
    endpointStatus: "local" | "remote" | "unavailable";
}

export interface MusicPlayerPlaybackController {
    getStatus: () => MusicPlaybackRuntimeStatus;
    playTrack: (trackId: string) => Promise<void>;
    pause: () => void;
    resume: () => void;
    next: () => void;
    previous: () => void;
    seekTo: (seconds: number) => void;
    setVolume: (volume: number) => void;
}

const controllers = new Map<string, MusicPlayerPlaybackController>();
let lastRegisteredHostId = "";

export function registerMusicPlayerPlaybackController(hostId: string, controller: MusicPlayerPlaybackController): void {
    if (!hostId || !controller) return;
    controllers.set(hostId, controller);
    lastRegisteredHostId = hostId;
}

export function unregisterMusicPlayerPlaybackController(hostId: string): void {
    controllers.delete(hostId);
    if (lastRegisteredHostId === hostId) {
        const hostIds = [...controllers.keys()];
        lastRegisteredHostId = hostIds[hostIds.length - 1] ?? "";
    }
}

export function getActiveMusicPlayerPlaybackController(): MusicPlayerPlaybackController | null {
    for (const controller of controllers.values()) {
        if (controller.getStatus().isPlaying) return controller;
    }
    const values = [...controllers.values()];
    return controllers.get(lastRegisteredHostId) ?? values[values.length - 1] ?? null;
}

export function getMusicPlayerPlaybackRuntimeStatus(): MusicPlaybackRuntimeStatus | null {
    return getActiveMusicPlayerPlaybackController()?.getStatus() ?? null;
}

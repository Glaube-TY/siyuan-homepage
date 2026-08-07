export interface MusicPlaybackPresence {
    isPlaying: boolean;
}

const EMPTY_PRESENCE: MusicPlaybackPresence = Object.freeze({
    isPlaying: false,
});

let currentPresence: MusicPlaybackPresence = EMPTY_PRESENCE;
const listeners = new Set<(presence: MusicPlaybackPresence) => void>();

export function getMusicPlaybackPresence(): MusicPlaybackPresence {
    return currentPresence;
}

export function publishMusicPlaybackPresence(presence: MusicPlaybackPresence): void {
    if (presence.isPlaying === currentPresence.isPlaying) return;
    currentPresence = Object.freeze({ ...presence });
    for (const listener of listeners) listener(currentPresence);
}

export function clearMusicPlaybackPresence(): void {
    publishMusicPlaybackPresence(EMPTY_PRESENCE);
}

export function subscribeMusicPlaybackPresence(
    listener: (presence: MusicPlaybackPresence) => void,
): () => void {
    listeners.add(listener);
    listener(currentPresence);
    return () => listeners.delete(listener);
}

export const OPEN_MOBILE_MUSIC_PLAYER_EVENT = "siyuan-homepage:open-mobile-music-player";

export interface OpenMobileMusicPlayerRequest {
    handled: boolean;
    unavailableReason?: string;
}

export type PersistentMobileMusicPlayerHandler = (request: OpenMobileMusicPlayerRequest) => void;

let persistentHandler: PersistentMobileMusicPlayerHandler | null = null;

export function registerPersistentMobileMusicPlayer(
    handler: PersistentMobileMusicPlayerHandler,
): () => void {
    persistentHandler = handler;
    return () => {
        if (persistentHandler === handler) persistentHandler = null;
    };
}

export function requestOpenMobileMusicPlayer(): OpenMobileMusicPlayerRequest {
    const detail: OpenMobileMusicPlayerRequest = { handled: false };
    if (persistentHandler) {
        persistentHandler(detail);
        return detail;
    }
    window.dispatchEvent(new CustomEvent<OpenMobileMusicPlayerRequest>(OPEN_MOBILE_MUSIC_PLAYER_EVENT, { detail }));
    return detail;
}

export interface SubsonicRestoredQueueState {
    currentTrackKey?: string;
    positionMs?: number;
}

export interface InitialCloudPlaybackState {
    currentTrackKey?: string;
    positionSeconds: number;
    restoredFromServer: boolean;
}

export interface CloudQueueSaveCursor {
    currentId?: string;
    positionMs?: number;
}

export function resolveInitialCloudPlaybackState(
    serverQueue: SubsonicRestoredQueueState | undefined,
    widgetCurrentTrackKey: string | undefined,
): InitialCloudPlaybackState {
    if (serverQueue?.currentTrackKey) {
        return {
            currentTrackKey: serverQueue.currentTrackKey,
            positionSeconds: Math.max(0, Number(serverQueue.positionMs || 0) / 1000),
            restoredFromServer: true,
        };
    }
    return {
        currentTrackKey: widgetCurrentTrackKey,
        positionSeconds: 0,
        restoredFromServer: false,
    };
}

export function normalizeCloudQueueAfterMutation(
    trackKeys: string[],
    currentTrackKey: string | undefined,
    preserveCurrentPlayback: boolean,
): string[] {
    const normalized = [...new Set(trackKeys.filter(Boolean))];
    if (preserveCurrentPlayback && currentTrackKey && !normalized.includes(currentTrackKey)) {
        normalized.push(currentTrackKey);
    }
    return normalized;
}

export function resolveCloudQueueSaveCursor(
    queueTrackKeys: string[],
    currentTrackKey: string | undefined,
    currentTrackId: string | undefined,
    positionSeconds: number,
): CloudQueueSaveCursor {
    if (!currentTrackKey || !currentTrackId || !queueTrackKeys.includes(currentTrackKey)) return {};
    const safePosition = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
    return { currentId: currentTrackId, positionMs: Math.round(safePosition * 1000) };
}

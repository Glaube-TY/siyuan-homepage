import type { MusicTrack } from "./musicPlayerTypes";

export function isSubsonicTrack(track: MusicTrack): boolean {
    return track.sourceKind === "subsonic";
}

export function isLocalTrack(track: MusicTrack): boolean {
    return !isSubsonicTrack(track);
}

export function getTrackKey(track: MusicTrack): string {
    if (isSubsonicTrack(track)) {
        const profileId = String(track.sourceProfileId || "");
        const songId = String(track.sourceTrackId || "");
        return `subsonic:${profileId}:${songId}`;
    }
    return stableHash(`${track.filePath || ""}|${track.size}|${track.mtimeMs}`);
}

export function stableHash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) + hash + input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

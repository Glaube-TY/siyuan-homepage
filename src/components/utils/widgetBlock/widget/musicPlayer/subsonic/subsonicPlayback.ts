import type { MusicCloudStreamQuality, MusicTrack } from "../musicPlayerTypes";
import type { ResolvedPlaybackSource } from "../musicSourceTypes";
import type { EndpointRequestContext } from "./subsonicEndpointManager";

export function resolveSubsonicPlaybackSource(
    buildUrl: (params: Record<string, string | number>) => string,
    context: EndpointRequestContext,
    track: MusicTrack,
    quality: MusicCloudStreamQuality,
): ResolvedPlaybackSource {
    if (!track.sourceTrackId) throw new Error("云端歌曲缺少 song id。" );
    const original = quality === "original";
    return {
        url: buildUrl({ id: track.sourceTrackId, format: original ? "raw" : "mp3", maxBitRate: original ? 0 : Number(quality) }),
        format: original ? (track.ext.replace(/^\./, "") || undefined) : "mp3",
        html5: true,
        endpointKind: context.kind,
        endpointGeneration: context.generation,
    };
}

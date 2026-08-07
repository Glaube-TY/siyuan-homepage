import type { MusicTrack } from "../musicPlayerTypes";
import { normalizedPlayedAt, normalizedStarredAt } from "./subsonicResponse";
import type { SubsonicSong } from "./subsonicTypes";

function fileNameForSong(song: SubsonicSong): string {
    const serverPath = song.path || "";
    const tail = serverPath.split(/[\\/]/).pop();
    if (tail) return tail;
    const suffix = String(song.suffix || "mp3").replace(/^\./, "");
    return `${song.title || "未知歌曲"}.${suffix}`;
}

export function mapSubsonicSongToTrack(song: SubsonicSong, profileId: string): MusicTrack {
    const suffix = String(song.suffix || "").replace(/^\./, "").toLowerCase();
    return {
        sourceKind: "subsonic", sourceProfileId: profileId, sourceTrackId: String(song.id),
        fileName: fileNameForSong(song), baseName: song.title || "未知歌曲", ext: suffix ? `.${suffix}` : "",
        size: song.size || 0, mtimeMs: 0,
        title: song.title || "未知歌曲", artist: song.artist || "", album: song.album || "",
        duration: song.duration || 0, bitrate: song.bitRate, sampleRate: song.samplingRate,
        lyrics: [], lyricsStatus: "pending", metadataStatus: "loaded", metadataLoadLevel: "full",
        albumId: song.albumId, artistId: song.artistId, coverArtId: song.coverArt,
        contentType: song.contentType, serverPlayCount: song.playCount,
        serverPlayedAt: normalizedPlayedAt(song), serverStarredAt: normalizedStarredAt(song), serverPath: song.path,
    };
}

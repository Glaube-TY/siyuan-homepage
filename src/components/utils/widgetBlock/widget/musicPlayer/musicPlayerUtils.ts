import type { MusicPlayerSettings, MusicTrack } from "./musicPlayerTypes";
import { DEFAULT_MUSIC_PLAYER_SETTINGS } from "./musicPlayerTypes";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
const MAX_TRACKS_PER_SCAN = 1000;

export function safeParseMusicPlayerConfig(contentTypeJson: string): MusicPlayerSettings {
    try {
        const parsed = JSON.parse(contentTypeJson);
        const data = parsed?.data || {};
        return {
            musicFolderPath: data.musicFolderPath || "",
            currentTrackIndex: Number.isFinite(data.currentTrackIndex) ? data.currentTrackIndex : 0,
            playMode: ["order", "repeat", "shuffle"].includes(data.playMode) ? data.playMode : "order",
            isMuted: !!data.isMuted,
            volume: Number.isFinite(data.volume) ? data.volume : 0.5,
            autoPlay: !!data.autoPlay,
            showLyrics: data.showLyrics !== undefined ? !!data.showLyrics : true,
            showCover: data.showCover !== undefined ? !!data.showCover : true,
            scanSubfolders: !!data.scanSubfolders,
            parseMetadata: data.parseMetadata !== undefined ? !!data.parseMetadata : true,
            sortMode: ["default", "title", "artist", "album", "duration", "recent", "plays"].includes(data.sortMode)
                ? data.sortMode
                : "default",
            sortDirection: data.sortDirection === "desc" ? "desc" : "asc",
            showFloatingMini: !!data.showFloatingMini,
        };
    } catch {
        return { ...DEFAULT_MUSIC_PLAYER_SETTINGS };
    }
}

export function buildLocalAudioFileUrl(fullPath: string): string {
    try {
        const nodeUrl = window.require("url");
        if (nodeUrl?.pathToFileURL) {
            return nodeUrl.pathToFileURL(fullPath).href;
        }
    } catch {
        // fallback to manual encoding
    }
    // Fallback for non-Electron or missing url module: encode each path component.
    const separator = fullPath.includes("/") ? "/" : "\\";
    const parts = fullPath.split(separator).map((part) => encodeURIComponent(part));
    return `file://${parts.join("/")}`;
}

export function normalizeTrackIndex(index: number, total: number): number {
    if (total <= 0) return 0;
    if (!Number.isFinite(index)) return 0;
    if (index < 0 || index >= total) return 0;
    return index;
}

export function formatPlaybackTime(seconds: number, allowZero: boolean = false): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    if (seconds === 0 && !allowZero) return "--:--";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
}

function buildBaseTrack(filePath: string): MusicTrack {
    const pathLib = window.require("path");
    const fs = window.require("fs");

    const fileName = pathLib.basename(filePath);
    const ext = pathLib.extname(filePath).toLowerCase();
    const baseName = ext ? fileName.slice(0, -ext.length) : fileName;
    const stats = fs.statSync(filePath);

    return {
        filePath,
        fileUrl: buildLocalAudioFileUrl(filePath),
        fileName,
        baseName,
        ext,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        title: baseName,
        artist: "",
        album: "",
        duration: 0,
        bitrate: undefined,
        sampleRate: undefined,
        coverObjectUrl: undefined,
        lyricPath: undefined,
        lyrics: [],
        lyricsStatus: "pending",
        metadataStatus: "pending",
    };
}

function scanDirectory(folderPath: string, includeSubfolders: boolean, results: string[]): void {
    if (results.length >= MAX_TRACKS_PER_SCAN) return;

    const fs = window.require("fs");
    const pathLib = window.require("path");

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
        if (results.length >= MAX_TRACKS_PER_SCAN) return;
        const fullPath = pathLib.join(folderPath, entry.name);
        if (entry.isDirectory() && includeSubfolders) {
            scanDirectory(fullPath, includeSubfolders, results);
        } else if (entry.isFile()) {
            const ext = pathLib.extname(entry.name).toLowerCase();
            if (AUDIO_EXTENSIONS.includes(ext)) {
                results.push(fullPath);
            }
        }
    }
}

export interface AudioScanResult {
    tracks: MusicTrack[];
    truncated: boolean;
}

export function getAudioFilesFromDirectory(
    folderPath: string,
    includeSubfolders: boolean = false,
): AudioScanResult {
    const results: string[] = [];
    scanDirectory(folderPath, includeSubfolders, results);
    const truncated = results.length >= MAX_TRACKS_PER_SCAN;

    const tracks = results
        .slice(0, MAX_TRACKS_PER_SCAN)
        .map(buildBaseTrack)
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

    return { tracks, truncated };
}

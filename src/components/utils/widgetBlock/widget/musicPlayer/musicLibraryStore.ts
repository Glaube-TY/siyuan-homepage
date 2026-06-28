import { getTrackKey } from "./musicPlaybackStatsStore";
import type { MusicPlaylist, MusicTrack } from "./musicPlayerTypes";

export interface MusicLibraryData {
    version: number;
    favorites: string[];
    playlists: MusicPlaylist[];
    activeQueue?: { trackKeys: string[]; updatedAt: number };
}

export interface M3uExportResult {
    content: string;
    missingCount: number;
}

export interface M3uImportResult {
    name: string;
    trackKeys: string[];
    missingCount: number;
}

export interface JsonImportResult {
    favoritesCount: number;
    playlistsCount: number;
}

const LIBRARY_VERSION = 1;
const MAX_PLAYLISTS = 100;
const MAX_TRACKS_PER_PLAYLIST = 2000;
const MAX_FAVORITES = 5000;
const MAX_ACTIVE_QUEUE = 5000;

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class MusicLibraryStore {
    private plugin: any;
    private blockId: string;
    private data: MusicLibraryData | null = null;
    private loaded = false;

    constructor(plugin: any, blockId: string) {
        this.plugin = plugin;
        this.blockId = blockId;
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        try {
            const raw = await this.plugin.loadData(this.getFileName());
            if (raw && typeof raw === "object") {
                this.data = {
                    version: typeof raw.version === "number" ? raw.version : LIBRARY_VERSION,
                    favorites: Array.isArray(raw.favorites) ? [...raw.favorites] : [],
                    playlists: Array.isArray(raw.playlists) ? raw.playlists.map(normalizePlaylist) : [],
                    activeQueue: normalizeActiveQueue(raw.activeQueue),
                };
                this.enforceLimits();
            } else {
                this.data = emptyLibrary();
            }
        } catch {
            this.data = emptyLibrary();
        }
        this.loaded = true;
    }

    getData(): MusicLibraryData {
        this.ensureLoaded();
        return this.data!;
    }

    isFavorite(trackKey: string): boolean {
        return this.getData().favorites.includes(trackKey);
    }

    toggleFavorite(trackKey: string): boolean {
        const data = this.getData();
        const index = data.favorites.indexOf(trackKey);
        if (index >= 0) {
            data.favorites.splice(index, 1);
            this.save();
            return false;
        }
        if (data.favorites.length >= MAX_FAVORITES) {
            data.favorites.shift();
        }
        data.favorites.push(trackKey);
        this.save();
        return true;
    }

    getFavorites(): string[] {
        return [...this.getData().favorites];
    }

    createPlaylist(name: string, description?: string): MusicPlaylist | null {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const data = this.getData();
        if (data.playlists.length >= MAX_PLAYLISTS) {
            data.playlists.shift();
        }
        const now = Date.now();
        const playlist: MusicPlaylist = {
            id: generateId(),
            name: trimmed,
            description: description?.trim(),
            createdAt: now,
            updatedAt: now,
            trackKeys: [],
        };
        data.playlists.push(playlist);
        this.save();
        return playlist;
    }

    renamePlaylist(id: string, name: string): boolean {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const playlist = this.getPlaylist(id);
        if (!playlist) return false;
        playlist.name = trimmed;
        playlist.updatedAt = Date.now();
        this.save();
        return true;
    }

    deletePlaylist(id: string): boolean {
        const data = this.getData();
        const before = data.playlists.length;
        data.playlists = data.playlists.filter((p) => p.id !== id);
        if (data.playlists.length === before) return false;
        this.save();
        return true;
    }

    addTrackToPlaylist(playlistId: string, trackKey: string): boolean {
        const playlist = this.getPlaylist(playlistId);
        if (!playlist) return false;
        if (playlist.trackKeys.includes(trackKey)) return false;
        if (playlist.trackKeys.length >= MAX_TRACKS_PER_PLAYLIST) {
            playlist.trackKeys.shift();
        }
        playlist.trackKeys.push(trackKey);
        playlist.updatedAt = Date.now();
        this.save();
        return true;
    }

    removeTrackFromPlaylist(playlistId: string, trackKey: string): boolean {
        const playlist = this.getPlaylist(playlistId);
        if (!playlist) return false;
        const before = playlist.trackKeys.length;
        playlist.trackKeys = playlist.trackKeys.filter((k) => k !== trackKey);
        if (playlist.trackKeys.length === before) return false;
        playlist.updatedAt = Date.now();
        this.save();
        return true;
    }

    getPlaylist(id: string): MusicPlaylist | undefined {
        return this.getData().playlists.find((p) => p.id === id);
    }

    getPlaylists(): MusicPlaylist[] {
        return [...this.getData().playlists];
    }

    exportPlaylistToM3U8(
        playlistId: string,
        musicFiles: MusicTrack[],
        musicFolderPath: string,
        pathMode: "absolute" | "relative",
    ): M3uExportResult | null {
        const playlist = this.getPlaylist(playlistId);
        if (!playlist) return null;
        const trackMap = buildTrackKeyMap(musicFiles);
        const normalizedBase = normalizePlaylistPath(musicFolderPath);
        let content = "#EXTM3U\n#EXTENC:UTF-8\n";
        let missingCount = 0;
        for (const trackKey of playlist.trackKeys) {
            const track = trackMap.get(trackKey);
            if (!track) {
                missingCount += 1;
                continue;
            }
            const duration = Number.isFinite(track.duration) && track.duration > 0 ? Math.round(track.duration) : -1;
            const displayTitle = buildM3uExtinfTitle(track);
            content += `#EXTINF:${duration},${displayTitle}\n`;
            const path =
                pathMode === "relative" && normalizedBase
                    ? makeRelativePath(track.filePath, normalizedBase)
                    : normalizePlaylistPath(track.filePath);
            content += `${path}\n`;
        }
        return { content, missingCount };
    }

    exportLibraryToJSON(): string {
        return JSON.stringify(this.getData(), null, 2);
    }

    importM3U8(text: string, musicFiles: MusicTrack[], musicFolderPath: string): M3uImportResult | null {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        const trackKeySet = new Set<string>();
        const normalizedBase = normalizePlaylistPath(musicFolderPath);
        const fullPathMap = buildFullPathMap(musicFiles);
        const relativePathMap = normalizedBase ? buildRelativePathMap(musicFiles, normalizedBase) : new Map<string, MusicTrack>();
        const fileNameMap = buildFileNameMap(musicFiles);
        const baseNameMap = buildBaseNameMap(musicFiles);
        const baseNameNoExtMap = buildBaseNameNoExtMap(musicFiles);
        let missingCount = 0;
        let pendingTitle: string | null = null;
        let name = "导入的歌单";

        for (const line of lines) {
            if (line.toUpperCase() === "#EXTM3U") continue;
            if (line.toUpperCase().startsWith("#EXTINF:")) {
                const meta = line.slice("#EXTINF:".length);
                const commaIndex = meta.indexOf(",");
                const title = commaIndex >= 0 ? meta.slice(commaIndex + 1).trim() : meta.trim();
                if (title) pendingTitle = title;
                continue;
            }
            if (line.startsWith("#")) continue;

            const resolved = resolvePlaylistPath(line, normalizedBase);
            const normalizedResolved = normalizePlaylistPath(resolved);
            const matched =
                fullPathMap.get(normalizedResolved) ??
                relativePathMap.get(normalizedResolved) ??
                fileNameMap.get(basename(normalizedResolved)) ??
                baseNameMap.get(basename(normalizedResolved)) ??
                baseNameNoExtMap.get(stripExtension(basename(normalizedResolved))) ??
                undefined;

            if (matched === undefined) {
                missingCount += 1;
            } else {
                trackKeySet.add(getTrackKey(matched));
            }
            pendingTitle = null;
        }

        if (pendingTitle && name === "导入的歌单") {
            name = pendingTitle;
        }

        const trackKeys = Array.from(trackKeySet);
        if (trackKeys.length === 0 && missingCount === 0) return null;
        return { name, trackKeys, missingCount };
    }

    importLibraryJSON(text: string): JsonImportResult | null {
        let raw: unknown;
        try {
            raw = JSON.parse(text);
        } catch {
            return null;
        }
        if (!raw || typeof raw !== "object") return null;
        const data = this.getData();
        const parsedFavorites = Array.isArray((raw as any).favorites) ? (raw as any).favorites : [];
        const parsedPlaylists = Array.isArray((raw as any).playlists) ? (raw as any).playlists : [];

        data.favorites = parsedFavorites.filter((k: unknown): k is string => typeof k === "string");
        data.playlists = parsedPlaylists.map(normalizePlaylist);
        data.activeQueue = normalizeActiveQueue((raw as any).activeQueue) ?? data.activeQueue;
        this.enforceLimits();
        this.save();
        return {
            favoritesCount: data.favorites.length,
            playlistsCount: data.playlists.length,
        };
    }

    getActiveQueueTrackKeys(): string[] {
        return [...(this.getData().activeQueue?.trackKeys ?? [])];
    }

    getActiveQueueCount(): number {
        return this.getData().activeQueue?.trackKeys?.length ?? 0;
    }

    isInActiveQueue(trackKey: string): boolean {
        return this.getData().activeQueue?.trackKeys?.includes(trackKey) ?? false;
    }

    replaceActiveQueue(trackKeys: string[]): void {
        const data = this.getData();
        const limited = trackKeys.slice(0, MAX_ACTIVE_QUEUE);
        data.activeQueue = { trackKeys: limited, updatedAt: Date.now() };
        this.save();
    }

    appendToActiveQueue(trackKeys: string[]): boolean {
        const data = this.getData();
        const existing = data.activeQueue?.trackKeys ?? [];
        const existingSet = new Set(existing);
        let changed = false;
        for (const key of trackKeys) {
            if (existingSet.has(key)) continue;
            if (existing.length >= MAX_ACTIVE_QUEUE) break;
            existing.push(key);
            existingSet.add(key);
            changed = true;
        }
        if (changed) {
            data.activeQueue = { trackKeys: existing, updatedAt: Date.now() };
            this.save();
        }
        return changed;
    }

    removeFromActiveQueue(trackKey: string): boolean {
        const data = this.getData();
        const queue = data.activeQueue;
        if (!queue) return false;
        const before = queue.trackKeys.length;
        queue.trackKeys = queue.trackKeys.filter((k) => k !== trackKey);
        if (queue.trackKeys.length === before) return false;
        queue.updatedAt = Date.now();
        this.save();
        return true;
    }

    clearActiveQueue(): void {
        const data = this.getData();
        if (!data.activeQueue || data.activeQueue.trackKeys.length === 0) return;
        data.activeQueue = { trackKeys: [], updatedAt: Date.now() };
        this.save();
    }

    private ensureLoaded(): void {
        if (!this.loaded) {
            this.data = emptyLibrary();
            this.loaded = true;
        }
    }

    private enforceLimits(): void {
        if (!this.data) return;
        if (this.data.favorites.length > MAX_FAVORITES) {
            this.data.favorites = this.data.favorites.slice(-MAX_FAVORITES);
        }
        if (this.data.playlists.length > MAX_PLAYLISTS) {
            this.data.playlists = this.data.playlists.slice(-MAX_PLAYLISTS);
        }
        for (const playlist of this.data.playlists) {
            if (playlist.trackKeys.length > MAX_TRACKS_PER_PLAYLIST) {
                playlist.trackKeys = playlist.trackKeys.slice(-MAX_TRACKS_PER_PLAYLIST);
            }
        }
    }

    private getFileName(): string {
        return `music-player-library-${this.blockId}.json`;
    }

    private async save(): Promise<void> {
        if (!this.data) return;
        try {
            await this.plugin.saveData(this.getFileName(), this.data);
        } catch {
            // 静默降级，不影响播放
        }
    }
}

function emptyLibrary(): MusicLibraryData {
    return { version: LIBRARY_VERSION, favorites: [], playlists: [], activeQueue: { trackKeys: [], updatedAt: 0 } };
}

function normalizeActiveQueue(raw: unknown): { trackKeys: string[]; updatedAt: number } | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const q = raw as any;
    const trackKeys = Array.isArray(q.trackKeys) ? q.trackKeys.filter((k: unknown): k is string => typeof k === "string") : [];
    const updatedAt = typeof q.updatedAt === "number" ? q.updatedAt : 0;
    return { trackKeys, updatedAt };
}

function normalizePlaylist(raw: any): MusicPlaylist {
    const now = Date.now();
    return {
        id: typeof raw?.id === "string" ? raw.id : generateId(),
        name: typeof raw?.name === "string" ? raw.name : "未命名歌单",
        description: typeof raw?.description === "string" ? raw.description : undefined,
        createdAt: typeof raw?.createdAt === "number" ? raw.createdAt : now,
        updatedAt: typeof raw?.updatedAt === "number" ? raw.updatedAt : now,
        trackKeys: Array.isArray(raw?.trackKeys) ? raw.trackKeys.filter((k: unknown): k is string => typeof k === "string") : [],
    };
}

function normalizePath(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function basename(p: string): string {
    const normalized = normalizePlaylistPath(p);
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function normalizePlaylistPath(p: string): string {
    const trimmed = p.trim();
    if (/^file:\/\//i.test(trimmed)) {
        return decodeFileUrl(trimmed);
    }
    if (/^\\\\/.test(trimmed)) {
        return "//" + normalizePath(trimmed.slice(2));
    }
    if (/^\/\//.test(trimmed)) {
        return "//" + normalizePath(trimmed.slice(2));
    }
    if (/^[a-zA-Z]:[\/\\]/.test(trimmed)) {
        return trimmed[0].toUpperCase() + ":/" + normalizePath(trimmed.slice(3));
    }
    return normalizePath(trimmed);
}

function decodeFileUrl(url: string): string {
    try {
        let rest = url.slice("file://".length);
        if (rest.startsWith("/")) {
            rest = rest.slice(1);
            if (/^[a-zA-Z]:[\/\\]/.test(rest)) {
                return normalizePlaylistPath(rest);
            }
            return "/" + normalizePath(decodeURIComponent(rest));
        }
        return "//" + normalizePath(decodeURIComponent(rest));
    } catch {
        return normalizePath(url);
    }
}

function isAbsolutePlaylistPath(p: string): boolean {
    const trimmed = p.trim();
    if (/^[a-zA-Z]:[\/\\]/.test(trimmed)) return true;
    if (/^\\\\/.test(trimmed)) return true;
    if (/^\/\//.test(trimmed)) return true;
    if (/^\//.test(trimmed)) return true;
    if (/^file:\/\//i.test(trimmed)) return true;
    return false;
}

function makeRelativePath(filePath: string, basePath: string): string {
    const normalizedFile = normalizePlaylistPath(filePath);
    const normalizedBase = normalizePlaylistPath(basePath);
    const prefix = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;
    if (normalizedFile.startsWith(prefix)) {
        return normalizedFile.slice(prefix.length);
    }
    return normalizedFile;
}

function resolvePlaylistPath(pathLine: string, basePath: string): string {
    const trimmed = pathLine.trim();
    if (isAbsolutePlaylistPath(trimmed)) {
        return normalizePlaylistPath(trimmed);
    }
    if (basePath) {
        const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
        return prefix + normalizePath(trimmed);
    }
    return normalizePath(trimmed);
}

function buildTrackKeyMap(musicFiles: MusicTrack[]): Map<string, MusicTrack> {
    const map = new Map<string, MusicTrack>();
    for (const track of musicFiles) {
        map.set(getTrackKey(track), track);
    }
    return map;
}

function isValidMetadataValue(value: string | undefined | null): value is string {
    if (value == null) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    const invalidMarkers = [
        "unknown artist",
        "unknown album",
        "未知艺术家",
        "未知专辑",
        "??",
        "???",
        "????",
    ];
    if (invalidMarkers.includes(lower)) return false;
    if (/^[?？\s]+$/.test(trimmed)) return false;
    if (/\?{2,}/.test(trimmed)) return false;
    return true;
}

function parseArtistTitleFromFileName(fileName: string): { artist?: string; title?: string } {
    const base = stripExtension(fileName).trim();
    const match = base.match(/^(.+?)\s*-\s*(.+)$/);
    if (match) {
        return { artist: match[1].trim(), title: match[2].trim() };
    }
    return { title: base };
}

function buildM3uExtinfTitle(track: MusicTrack): string {
    let artist = isValidMetadataValue(track.artist) ? track.artist.trim() : "";
    let title = isValidMetadataValue(track.title) ? track.title.trim() : "";

    if (!artist || !title) {
        const parsed = parseArtistTitleFromFileName(track.baseName || basename(track.filePath));
        if (!artist && isValidMetadataValue(parsed.artist)) {
            artist = parsed.artist;
        }
        if (!title && isValidMetadataValue(parsed.title)) {
            title = parsed.title;
        }
    }

    if (artist && title) {
        const prefix = `${artist} - `;
        return title.startsWith(prefix) ? title : `${prefix}${title}`;
    }
    if (title) return title;

    const fallback = stripExtension(track.baseName || basename(track.filePath));
    return fallback || "未知歌曲";
}

function buildFullPathMap(musicFiles: MusicTrack[]): Map<string, MusicTrack> {
    const map = new Map<string, MusicTrack>();
    for (const track of musicFiles) {
        map.set(normalizePlaylistPath(track.filePath), track);
    }
    return map;
}

function buildFileNameMap(musicFiles: MusicTrack[]): Map<string, MusicTrack> {
    const map = new Map<string, MusicTrack>();
    for (const track of musicFiles) {
        const key = basename(track.filePath);
        if (!map.has(key)) {
            map.set(key, track);
        }
    }
    return map;
}

function buildRelativePathMap(musicFiles: MusicTrack[], basePath: string): Map<string, MusicTrack> {
    const map = new Map<string, MusicTrack>();
    for (const track of musicFiles) {
        const relative = makeRelativePath(track.filePath, basePath);
        if (!map.has(relative)) {
            map.set(relative, track);
        }
    }
    return map;
}

function buildBaseNameMap(musicFiles: MusicTrack[]): Map<string, MusicTrack> {
    const map = new Map<string, MusicTrack>();
    for (const track of musicFiles) {
        const key = track.baseName || basename(track.filePath);
        if (!map.has(key)) {
            map.set(key, track);
        }
    }
    return map;
}

function buildBaseNameNoExtMap(musicFiles: MusicTrack[]): Map<string, MusicTrack> {
    const map = new Map<string, MusicTrack>();
    for (const track of musicFiles) {
        const key = stripExtension(track.baseName || basename(track.filePath));
        if (!map.has(key)) {
            map.set(key, track);
        }
    }
    return map;
}

function stripExtension(name: string): string {
    const idx = name.lastIndexOf(".");
    return idx > 0 ? name.slice(0, idx) : name;
}

export { getTrackKey };
export type { MusicTrack };

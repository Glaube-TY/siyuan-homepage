import type { MusicTrack, MusicMetadataIndexProgress } from "./musicPlayerTypes";
import { getTrackKey } from "./musicPlaybackStatsStore";

export interface MusicMetadataIndexEntry {
    trackKey: string;
    filePath: string;
    fileName: string;
    baseName: string;
    ext: string;
    size: number;
    mtimeMs: number;
    title: string;
    artist: string;
    album: string;
    duration: number;
    bitrate?: number;
    sampleRate?: number;
    hasTextMetadata?: boolean;
    hasDuration?: boolean;
    attempted?: boolean;
    indexStatus?: "text" | "basic" | "noTag" | "failed";
    updatedAt: number;
}

export interface MusicMetadataIndexLibrary {
    libraryId: string;
    folderPathHash: string;
    scanSubfolders: boolean;
    updatedAt: number;
    entries: Record<string, MusicMetadataIndexEntry>;
}

export interface MusicMetadataIndexData {
    version: number;
    libraries: Record<string, MusicMetadataIndexLibrary>;
}

const INDEX_VERSION = 1;
const DEFAULT_LIBRARY_LIMIT = 10000;
const SAVE_DEBOUNCE_MS = 1000;

function stableHash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function emptyData(): MusicMetadataIndexData {
    return { version: INDEX_VERSION, libraries: {} };
}

export class MusicMetadataIndexStore {
    private plugin: any;
    private data: MusicMetadataIndexData | null = null;
    private loaded = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly fileName: string;

    constructor(plugin: any) {
        this.plugin = plugin;
        this.fileName = "music-metadata-index.json";
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        try {
            const raw = await this.plugin.loadData(this.fileName);
            if (raw && typeof raw === "object") {
                this.data = {
                    version: typeof raw.version === "number" ? raw.version : INDEX_VERSION,
                    libraries: raw.libraries && typeof raw.libraries === "object"
                        ? { ...raw.libraries }
                        : {},
                };
                this.migrateEntries();
            } else {
                this.data = emptyData();
            }
        } catch {
            this.data = emptyData();
        }
        this.loaded = true;
    }

    getLibraryId(folderPath: string, scanSubfolders: boolean): string {
        return stableHash(`${folderPath}|${scanSubfolders}`);
    }

    applyIndexToTracks(folderPath: string, scanSubfolders: boolean, tracks: MusicTrack[]): void {
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return;
        for (const track of tracks) {
            const key = getTrackKey(track);
            const entry = lib.entries[key];
            if (!entry) continue;
            if (entry.size !== track.size || entry.mtimeMs !== track.mtimeMs) continue;
            track.title = entry.title || track.baseName;
            track.artist = entry.artist || "";
            track.album = entry.album || "";
            track.duration = entry.duration || 0;
            track.bitrate = entry.bitrate;
            track.sampleRate = entry.sampleRate;
            track.metadataStatus = "loaded";
            track.metadataLoadLevel = "light";
        }
    }

    hasFreshEntry(folderPath: string, scanSubfolders: boolean, track: MusicTrack): boolean {
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return false;
        const key = getTrackKey(track);
        const entry = lib.entries[key];
        if (!entry) return false;
        return entry.size === track.size && entry.mtimeMs === track.mtimeMs;
    }

    hasUsableFreshEntry(folderPath: string, scanSubfolders: boolean, track: MusicTrack): boolean {
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return false;
        const key = getTrackKey(track);
        const entry = lib.entries[key];
        if (!entry) return false;
        if (entry.size !== track.size || entry.mtimeMs !== track.mtimeMs) return false;
        if (entry.attempted !== true) return false;
        return entry.hasTextMetadata !== undefined && entry.hasDuration !== undefined;
    }

    getFreshEntry(folderPath: string, scanSubfolders: boolean, track: MusicTrack): MusicMetadataIndexEntry | null {
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return null;
        const key = getTrackKey(track);
        const entry = lib.entries[key];
        if (!entry) return null;
        if (entry.size !== track.size || entry.mtimeMs !== track.mtimeMs) return null;
        return entry;
    }

    getLibrarySummary(
        folderPath: string,
        scanSubfolders: boolean,
        tracks: MusicTrack[],
    ): MusicMetadataIndexProgress | null {
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return null;

        let indexed = 0;
        let basic = 0;
        let noTag = 0;
        let failed = 0;
        let fresh = 0;

        for (const track of tracks) {
            const entry = this.getFreshEntry(folderPath, scanSubfolders, track);
            if (!entry) continue;
            fresh++;
            switch (entry.indexStatus) {
                case "text":
                    indexed++;
                    break;
                case "basic":
                    basic++;
                    break;
                case "failed":
                    failed++;
                    break;
                default:
                    noTag++;
                    break;
            }
        }

        return {
            running: false,
            total: tracks.length,
            queued: 0,
            processed: fresh,
            indexed,
            basic,
            noTag,
            failed,
            skipped: 0,
            fresh,
            updatedAt: lib.updatedAt,
            completedAt: lib.updatedAt,
            lastMessage: "当前音乐索引已加载",
        };
    }

    async getStoredLibraryProgress(
        folderPath: string,
        scanSubfolders: boolean,
    ): Promise<MusicMetadataIndexProgress | null> {
        await this.load();
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return null;
        const entries = Object.values(lib.entries);
        if (entries.length === 0) return null;

        let indexed = 0;
        let basic = 0;
        let noTag = 0;
        let failed = 0;

        for (const entry of entries) {
            switch (entry.indexStatus) {
                case "text":
                    indexed++;
                    break;
                case "basic":
                    basic++;
                    break;
                case "failed":
                    failed++;
                    break;
                default:
                    noTag++;
                    break;
            }
        }

        return {
            running: false,
            total: entries.length,
            queued: 0,
            processed: entries.length,
            indexed,
            basic,
            noTag,
            failed,
            skipped: 0,
            fresh: entries.length,
            updatedAt: lib.updatedAt,
            completedAt: lib.updatedAt,
            lastMessage: "当前音乐索引已加载",
        };
    }

    upsertEntry(folderPath: string, scanSubfolders: boolean, entry: MusicMetadataIndexEntry): void {
        const lib = this.getOrCreateLibrary(folderPath, scanSubfolders);
        const key = entry.trackKey;

        // 清除同一路径下的旧 key，避免 size/mtime 变化后产生堆积
        for (const [existingKey, existing] of Object.entries(lib.entries)) {
            if (existing.filePath === entry.filePath && existingKey !== key) {
                delete lib.entries[existingKey];
            }
        }

        lib.entries[key] = entry;
        lib.updatedAt = Date.now();
        this.enforceLibraryLimit(lib);
        this.scheduleSave();
    }

    upsertTrack(folderPath: string, scanSubfolders: boolean, track: MusicTrack): void {
        const lib = this.getOrCreateLibrary(folderPath, scanSubfolders);
        const key = getTrackKey(track);

        // 清除同一路径下的旧 key，避免 size/mtime 变化后产生堆积
        for (const [existingKey, entry] of Object.entries(lib.entries)) {
            if (entry.filePath === track.filePath && existingKey !== key) {
                delete lib.entries[existingKey];
            }
        }

        const hasTextMetadata =
            !!track.artist ||
            !!track.album ||
            Boolean(track.title && track.title !== track.baseName);
        const hasDuration = track.duration > 0;
        const indexStatus: MusicMetadataIndexEntry["indexStatus"] = hasTextMetadata
            ? "text"
            : hasDuration
              ? "basic"
              : "noTag";

        lib.entries[key] = {
            trackKey: key,
            filePath: track.filePath,
            fileName: track.fileName,
            baseName: track.baseName,
            ext: track.ext,
            size: track.size,
            mtimeMs: track.mtimeMs,
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            bitrate: track.bitrate,
            sampleRate: track.sampleRate,
            hasTextMetadata,
            hasDuration,
            attempted: true,
            indexStatus,
            updatedAt: Date.now(),
        };
        lib.updatedAt = Date.now();
        this.enforceLibraryLimit(lib);
        this.scheduleSave();
    }

    removeMissingTracks(folderPath: string, scanSubfolders: boolean, tracks: MusicTrack[]): void {
        const lib = this.getLibrary(folderPath, scanSubfolders);
        if (!lib) return;
        const currentPaths = new Set(tracks.map((t) => t.filePath));
        let changed = false;
        for (const key of Object.keys(lib.entries)) {
            if (!currentPaths.has(lib.entries[key].filePath)) {
                delete lib.entries[key];
                changed = true;
            }
        }
        if (changed) {
            lib.updatedAt = Date.now();
            this.scheduleSave();
        }
    }

    clearLibrary(folderPath: string, scanSubfolders: boolean): void {
        const id = this.getLibraryId(folderPath, scanSubfolders);
        if (this.data?.libraries[id]) {
            this.data.libraries[id].entries = {};
            this.data.libraries[id].updatedAt = Date.now();
            this.scheduleSave();
        }
    }

    private getLibrary(folderPath: string, scanSubfolders: boolean): MusicMetadataIndexLibrary | undefined {
        if (!this.data) return undefined;
        return this.data.libraries[this.getLibraryId(folderPath, scanSubfolders)];
    }

    private getOrCreateLibrary(folderPath: string, scanSubfolders: boolean): MusicMetadataIndexLibrary {
        this.ensureLoaded();
        const id = this.getLibraryId(folderPath, scanSubfolders);
        if (!this.data!.libraries[id]) {
            this.data!.libraries[id] = {
                libraryId: id,
                folderPathHash: id,
                scanSubfolders,
                updatedAt: Date.now(),
                entries: {},
            };
        }
        return this.data!.libraries[id];
    }

    private enforceLibraryLimit(lib: MusicMetadataIndexLibrary, limit = DEFAULT_LIBRARY_LIMIT): void {
        const entries = Object.entries(lib.entries);
        if (entries.length <= limit) return;
        entries.sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
        const keep = entries.slice(entries.length - limit);
        lib.entries = Object.fromEntries(keep);
    }

    async flush(): Promise<void> {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.save();
    }

    private scheduleSave(): void {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.save();
        }, SAVE_DEBOUNCE_MS);
    }

    private async save(): Promise<void> {
        if (!this.data) return;
        try {
            await this.plugin.saveData(this.fileName, this.data);
        } catch {
            // 静默降级，不影响播放
        }
    }

    private ensureLoaded(): void {
        if (!this.loaded) {
            void this.load();
        }
    }

    private migrateEntries(): void {
        if (!this.data) return;
        for (const lib of Object.values(this.data.libraries)) {
            if (!lib || typeof lib !== "object") continue;
            if (!lib.entries) lib.entries = {};
            for (const entry of Object.values(lib.entries)) {
                if (!entry || typeof entry !== "object") continue;
                const inferredText =
                    !!entry.artist ||
                    !!entry.album ||
                    Boolean(entry.title && entry.title !== entry.baseName);
                if (entry.hasTextMetadata === undefined) {
                    entry.hasTextMetadata = inferredText;
                }
                if (entry.hasDuration === undefined) {
                    entry.hasDuration = entry.duration > 0;
                }
                if (entry.attempted === undefined) {
                    entry.attempted = inferredText || entry.duration > 0;
                }
                if (entry.indexStatus === undefined) {
                    if (entry.hasTextMetadata) entry.indexStatus = "text";
                    else if (entry.hasDuration) entry.indexStatus = "basic";
                    else if (entry.attempted) entry.indexStatus = "noTag";
                    else entry.indexStatus = "noTag";
                }
            }
        }
    }
}

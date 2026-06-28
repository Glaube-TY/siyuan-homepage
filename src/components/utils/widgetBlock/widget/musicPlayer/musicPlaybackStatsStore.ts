import type { MusicTrack } from "./musicPlayerTypes";

export interface PlaybackRecentPlay {
    startedAt: number;
    endedAt: number;
    playedSeconds: number;
    completed: boolean;
}

export interface PlaybackStatsTrackEntry {
    trackKey: string;
    title: string;
    artist: string;
    album: string;
    fileName: string;
    baseName: string;
    ext: string;
    playCount: number;
    totalPlayedSeconds: number;
    lastPlayedAt: number;
    recentPlays: PlaybackRecentPlay[];
}

export interface PlaybackStats {
    version: number;
    tracks: Record<string, PlaybackStatsTrackEntry>;
}

interface CurrentSession {
    trackKey: string;
    track: MusicTrack;
    startedAt: number;
    lastPosition: number;
    accumulatedSeconds: number;
}

const STATS_VERSION = 1;
const MAX_TRACK_ENTRIES = 1000;
const MAX_RECENT_PLAYS_PER_TRACK = 50;
const MIN_RECORD_SECONDS = 5;

export function getTrackKey(track: MusicTrack): string {
    return stableHash(`${track.filePath}|${track.size}|${track.mtimeMs}`);
}

function stableHash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) + hash + input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

export class MusicPlaybackStatsStore {
    private plugin: any;
    private blockId: string;
    private data: PlaybackStats | null = null;
    private loaded = false;
    private currentSession: CurrentSession | null = null;

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
                    version: typeof raw.version === "number" ? raw.version : STATS_VERSION,
                    tracks: raw.tracks && typeof raw.tracks === "object" ? { ...raw.tracks } : {},
                };
                this.enforceLimits();
            } else {
                this.data = { version: STATS_VERSION, tracks: {} };
            }
        } catch {
            this.data = { version: STATS_VERSION, tracks: {} };
        }
        this.loaded = true;
    }

    startSession(track: MusicTrack, initialPosition = 0): void {
        this.endSession(false);
        this.ensureLoaded();
        const trackKey = getTrackKey(track);
        this.currentSession = {
            trackKey,
            track,
            startedAt: Date.now(),
            lastPosition: initialPosition,
            accumulatedSeconds: 0,
        };
    }

    tick(position: number): void {
        if (!this.currentSession) return;
        const delta = position - this.currentSession.lastPosition;
        if (delta > 0 && delta < 10) {
            this.currentSession.accumulatedSeconds += delta;
        }
        this.currentSession.lastPosition = position;
    }

    endSession(completed: boolean): boolean {
        const session = this.currentSession;
        this.currentSession = null;
        if (!session || !this.data) return false;

        const playedSeconds = session.accumulatedSeconds;
        if (playedSeconds < MIN_RECORD_SECONDS) return false;

        const entry = this.getOrCreateEntry(session.trackKey, session.track);
        entry.totalPlayedSeconds += playedSeconds;
        entry.lastPlayedAt = Date.now();
        entry.recentPlays.unshift({
            startedAt: session.startedAt,
            endedAt: Date.now(),
            playedSeconds,
            completed,
        });
        if (entry.recentPlays.length > MAX_RECENT_PLAYS_PER_TRACK) {
            entry.recentPlays.length = MAX_RECENT_PLAYS_PER_TRACK;
        }

        this.save();
        return true;
    }

    recordPlaybackStart(track: MusicTrack): boolean {
        this.ensureLoaded();
        const entry = this.getOrCreateEntry(getTrackKey(track), track);
        entry.playCount += 1;
        entry.lastPlayedAt = Date.now();
        this.save();
        return true;
    }

    getStatsForTrack(trackKey: string): PlaybackStatsTrackEntry | undefined {
        this.ensureLoaded();
        return this.data?.tracks[trackKey];
    }

    getCurrentSessionAccumulatedSeconds(): number {
        return this.currentSession?.accumulatedSeconds ?? 0;
    }

    getAllStats(): PlaybackStats {
        this.ensureLoaded();
        return this.data || { version: STATS_VERSION, tracks: {} };
    }

    private ensureLoaded(): void {
        if (!this.loaded) {
            this.data = { version: STATS_VERSION, tracks: {} };
            this.loaded = true;
        }
    }

    private getOrCreateEntry(trackKey: string, track: MusicTrack): PlaybackStatsTrackEntry {
        if (!this.data) {
            this.data = { version: STATS_VERSION, tracks: {} };
        }
        let entry = this.data.tracks[trackKey];
        if (!entry) {
            entry = {
                trackKey,
                title: track.title || track.baseName || track.fileName,
                artist: track.artist || "",
                album: track.album || "",
                fileName: track.fileName,
                baseName: track.baseName,
                ext: track.ext,
                playCount: 0,
                totalPlayedSeconds: 0,
                lastPlayedAt: 0,
                recentPlays: [],
            };
            this.data.tracks[trackKey] = entry;
        }
        return entry;
    }

    private enforceLimits(): void {
        if (!this.data) return;
        const keys = Object.keys(this.data.tracks);
        if (keys.length <= MAX_TRACK_ENTRIES) return;
        const sorted = keys
            .map((k) => this.data!.tracks[k])
            .filter((entry): entry is PlaybackStatsTrackEntry => !!entry)
            .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
        const next: Record<string, PlaybackStatsTrackEntry> = {};
        for (const entry of sorted.slice(0, MAX_TRACK_ENTRIES)) {
            next[entry.trackKey] = entry;
        }
        this.data.tracks = next;
    }

    private getFileName(): string {
        return `music-player-playback-stats-${this.blockId}.json`;
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

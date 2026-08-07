import { getTrackKey } from "./musicTrackIdentity";
import type { MusicTrack } from "./musicPlayerTypes";

export class MusicTrackRegistry {
    private readonly tracks = new Map<string, MusicTrack>();
    private readonly touchedAt = new Map<string, number>();
    private protectedKeys = new Set<string>();

    constructor(private readonly maxEntries = 5000) {}

    register(track: MusicTrack): string {
        const key = getTrackKey(track);
        this.tracks.set(key, track);
        this.touchedAt.set(key, Date.now());
        this.evictIfNeeded();
        return key;
    }

    registerMany(tracks: MusicTrack[]): string[] { return tracks.map((track) => this.register(track)); }

    resolve(key: string): MusicTrack | undefined {
        const track = this.tracks.get(key);
        if (track) this.touchedAt.set(key, Date.now());
        return track;
    }

    setProtectedKeys(keys: Iterable<string>): void { this.protectedKeys = new Set(keys); this.evictIfNeeded(); }
    values(): MusicTrack[] { return [...this.tracks.values()]; }
    clear(): void { this.tracks.clear(); this.touchedAt.clear(); this.protectedKeys.clear(); }

    private evictIfNeeded(): void {
        if (this.tracks.size <= this.maxEntries) return;
        const candidates = [...this.touchedAt.entries()]
            .filter(([key]) => !this.protectedKeys.has(key))
            .sort((a, b) => a[1] - b[1]);
        for (const [key] of candidates) {
            if (this.tracks.size <= this.maxEntries) break;
            this.tracks.delete(key);
            this.touchedAt.delete(key);
        }
    }
}

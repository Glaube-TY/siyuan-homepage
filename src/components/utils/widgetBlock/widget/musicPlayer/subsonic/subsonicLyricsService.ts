import type { MusicLyricLine, MusicTrack } from "../musicPlayerTypes";
import type { SubsonicEndpointManager } from "./subsonicEndpointManager";
import type { SubsonicClient } from "./subsonicClient";
import { asArray } from "./subsonicResponse";

function record(value: unknown): Record<string, any> { return value && typeof value === "object" ? value as Record<string, any> : {}; }

function normalizeStructuredLyrics(envelope: any): { lines: MusicLyricLine[]; unsyncedText?: string } {
    const candidates = asArray(record(envelope.lyricsList).structuredLyrics).map(record);
    const selected = candidates.find((item) => item.synced === true) || candidates[0];
    if (!selected) return { lines: [], unsyncedText: undefined };
    const normalizedLines = asArray(selected.line).map((raw) => {
        const item = record(raw);
        const startMs = Number(item.start ?? item.startTime ?? 0);
        const values = asArray(item.value ?? item.text)
            .filter((value) => typeof value === "string" || typeof value === "number")
            .map(String)
            .filter(Boolean);
        return { time: Number.isFinite(startMs) ? startMs / 1000 : 0, primary: values.join(" ") };
    }).filter((line) => line.primary);
    if (selected.synced !== true) {
        return { lines: [], unsyncedText: normalizedLines.map((line) => line.primary).join("\n") || undefined };
    }
    return { lines: normalizedLines, unsyncedText: undefined };
}

export class SubsonicLyricsService {
    constructor(
        private readonly endpoints: SubsonicEndpointManager,
        private readonly client: SubsonicClient,
        private readonly extensions: Set<string>,
    ) {}

    async load(track: MusicTrack): Promise<{ lines: MusicLyricLine[]; unsyncedText?: string }> {
        if (this.extensions.has("songLyrics") && track.sourceTrackId) {
            try {
                return await this.endpoints.executeRead(async (ctx) => normalizeStructuredLyrics(
                    await this.client.request(ctx.baseUrl, ctx.kind, "getLyricsBySongId", { id: track.sourceTrackId }, { signal: ctx.signal }),
                ));
            } catch { /* Core fallback */ }
        }
        if (!track.artist || !track.title) return { lines: [] };
        try {
            return await this.endpoints.executeRead(async (ctx) => {
                const envelope = await this.client.request(ctx.baseUrl, ctx.kind, "getLyrics", { artist: track.artist, title: track.title }, { signal: ctx.signal });
                const rawValue = record(envelope.lyrics).value;
                const value = typeof rawValue === "string" ? rawValue.trim() : "";
                return { lines: [], unsyncedText: value || undefined };
            });
        } catch { return { lines: [] }; }
    }
}

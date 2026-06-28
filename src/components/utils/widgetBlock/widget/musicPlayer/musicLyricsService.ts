import type { MusicLyricLine, MusicTrack } from "./musicPlayerTypes";

function decodeLyricBuffer(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return buffer.toString("utf-8", 3);
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return buffer.toString("utf-16le", 2);
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        // UTF-16BE
        const bytes = buffer.slice(2);
        const arr = new Uint16Array(bytes.length / 2);
        for (let i = 0; i < arr.length; i++) {
            arr[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
        }
        return String.fromCharCode(...arr);
    }

    // No BOM: try UTF-8 first
    const utf8 = buffer.toString("utf-8");
    if (!utf8.includes("\uFFFD")) return utf8;

    // Fallback: gb18030 / gbk
    try {
        return new TextDecoder("gb18030", { fatal: true }).decode(new Uint8Array(buffer));
    } catch {
        try {
            return new TextDecoder("gbk", { fatal: true }).decode(new Uint8Array(buffer));
        } catch {
            return utf8;
        }
    }
}

function parseLrc(text: string): MusicLyricLine[] {
    const lines = text.split(/\r?\n/);
    const entries: Array<{ time: number; text: string }> = [];
    let offsetMs = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
        if (offsetMatch) {
            offsetMs = parseInt(offsetMatch[1], 10) || 0;
            continue;
        }

        const timeMatches = Array.from(line.matchAll(/\[(\d+):(\d+)([.:])(\d+)\]/g));
        if (timeMatches.length === 0) continue;

        const textPart = line.replace(/\[(\d+):(\d+)([.:])(\d+)\]/g, "").trim();
        for (const m of timeMatches) {
            const min = parseInt(m[1], 10);
            const sec = parseInt(m[2], 10);
            const fracStr = m[4];
            const frac = parseInt(fracStr.padEnd(3, "0").slice(0, 3), 10);
            const time = min * 60 + sec + frac / 1000 + offsetMs / 1000;
            if (Number.isFinite(time) && time >= 0) {
                entries.push({ time, text: textPart });
            }
        }
    }

    entries.sort((a, b) => a.time - b.time);

    const result: MusicLyricLine[] = [];
    for (const entry of entries) {
        const existing = result.find((r) => Math.abs(r.time - entry.time) < 0.01);
        if (existing) {
            if (!existing.translation && existing.primary !== entry.text) {
                existing.translation = entry.text;
            }
        } else {
            result.push({ time: entry.time, primary: entry.text });
        }
    }

    return result;
}

function findLyricPath(filePath: string, title?: string, artist?: string): string | undefined {
    const fs = window.require("fs");
    const pathLib = window.require("path");
    const dir = pathLib.dirname(filePath);
    const base = pathLib.basename(filePath, pathLib.extname(filePath));

    // 读取同目录文件列表，用于大小写不敏感匹配
    let dirFiles: string[];
    try {
        dirFiles = fs.readdirSync(dir) as string[];
    } catch {
        return undefined;
    }
    const lowerMap = new Map(dirFiles.map((f) => [f.toLowerCase(), f]));

    const candidates: string[] = [base];
    if (title?.trim()) candidates.push(title.trim());
    if (artist?.trim() && title?.trim()) {
        const t = title.trim();
        const a = artist.trim();
        candidates.push(`${a} - ${t}`, `${a}-${t}`);
    }

    // 去重候选名
    const seen = new Set<string>();
    for (const name of candidates) {
        const lowerName = name.toLowerCase();
        if (seen.has(lowerName)) continue;
        seen.add(lowerName);

        // .lrc / .LRC / 大小写混合
        for (const ext of [".lrc"]) {
            const key = (name + ext).toLowerCase();
            const realName = lowerMap.get(key);
            if (realName) {
                return pathLib.join(dir, realName);
            }
        }
    }
    return undefined;
}

export function findLyricPathForTrack(track: MusicTrack): string | undefined {
    return findLyricPath(track.filePath, track.title, track.artist);
}

export async function loadLyricsForTrack(track: MusicTrack): Promise<void> {
    if (track.lyricsStatus !== "pending") return;
    track.lyricsStatus = "loading";

    // 内嵌歌词优先
    if (track.lyrics.length > 0) {
        track.lyricsStatus = "loaded";
        return;
    }
    if (track.unsyncedLyricsText && track.unsyncedLyricsText.trim()) {
        track.lyricsStatus = "loaded";
        return;
    }

    // 没有内嵌歌词时，尝试同目录外置 .lrc
    const lyricPath = findLyricPath(track.filePath, track.title, track.artist);
    if (!lyricPath) {
        track.lyricsStatus = "none";
        return;
    }

    try {
        const fs = window.require("fs");
        const buffer: Buffer = await fs.promises.readFile(lyricPath);
        const text = decodeLyricBuffer(buffer);
        track.lyrics = parseLrc(text);
        track.lyricPath = lyricPath;
        track.lyricsStatus = track.lyrics.length > 0 ? "loaded" : "none";
    } catch {
        track.lyricsStatus = "failed";
        track.lyrics = [];
    }
}

export function getCurrentLyricLine(lyrics: MusicLyricLine[], currentTime: number): MusicLyricLine | undefined {
    if (!lyrics.length) return undefined;
    let currentLine = lyrics[0];
    for (const line of lyrics) {
        if (line.time <= currentTime) {
            currentLine = line;
        } else {
            break;
        }
    }
    return currentLine;
}

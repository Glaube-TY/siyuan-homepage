import { parseBuffer, parseFile } from "music-metadata";
import type { MetadataCacheEntry, MusicTrack, MusicLyricLine, MusicMetadataLoadMode } from "./musicPlayerTypes";
import { buildLocalAudioFileUrl } from "./musicPlayerUtils";

type AudioMetadata = Awaited<ReturnType<typeof parseBuffer>>;

const LIGHT_MODE_MAX_READ_SIZE = 50 * 1024 * 1024;

const metadataCache = new Map<string, MetadataCacheEntry>();
const coverObjectUrls = new Set<string>();

function getCacheKey(filePath: string, size: number, mtimeMs: number): string {
    // key 只内部使用，不输出到日志
    return `${size}:${mtimeMs}:${filePath}`;
}

function revokeCoverObjectUrl(url: string | undefined) {
    if (!url) return;
    try {
        URL.revokeObjectURL(url);
    } catch {
        // ignore
    }
    coverObjectUrls.delete(url);
}

export function revokeAllCoverObjectUrls() {
    for (const url of coverObjectUrls) {
        try {
            URL.revokeObjectURL(url);
        } catch {
            // ignore
        }
    }
    coverObjectUrls.clear();
}

export function buildTrackFromPath(filePath: string): MusicTrack {
    const pathLib = window.require("path");
    const fs = window.require("fs");

    const fileName = pathLib.basename(filePath);
    const ext = pathLib.extname(filePath).toLowerCase();
    const baseName = fileName.slice(0, -ext.length) || fileName;
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
        unsyncedLyricsText: undefined,
        lyricsStatus: "pending",
        metadataStatus: "pending",
        metadataLoadLevel: "none",
    };
}

function getMimeTypeFromExt(ext: string): string {
    switch (ext.toLowerCase()) {
        case ".mp3":
            return "audio/mpeg";
        case ".flac":
            return "audio/flac";
        case ".m4a":
        case ".mp4":
            return "audio/mp4";
        case ".wav":
        case ".wave":
            return "audio/wav";
        case ".ogg":
        case ".oga":
            return "audio/ogg";
        case ".aac":
            return "audio/aac";
        case ".wma":
            return "audio/x-ms-wma";
        default:
            return "audio/mpeg";
    }
}

async function readAudioBuffer(filePath: string): Promise<Buffer> {
    const fs = window.require("fs").promises;
    return fs.readFile(filePath);
}
type LyricsTagItem = { text?: string } | { value?: unknown } | string | undefined;

function extractLyricsText(item: LyricsTagItem): string | undefined {
    if (!item) return undefined;
    if (typeof item === "string") return item.trim() || undefined;
    if (typeof item === "object") {
        if ("text" in item && typeof item.text === "string") {
            return item.text.trim() || undefined;
        }
        if ("value" in item && typeof item.value === "string") {
            return item.value.trim() || undefined;
        }
    }
    return undefined;
}

function parseEmbeddedLyricsText(metadata: AudioMetadata): string | undefined {
    const common = metadata.common;
    if (Array.isArray(common.lyrics) && common.lyrics.length > 0) {
        const texts = common.lyrics.map(extractLyricsText).filter((t): t is string => !!t);
        if (texts.length > 0) return texts.join("\n");
    }

    const native = metadata.native as Record<string, Array<{ id: string; value: unknown }>> | undefined;
    if (!native) return undefined;

    const lyricTagIds = new Set([
        "USLT",
        "ULT",
        "SYLT",
        "LYRICS",
        "©lyr",
        "lyr",
        "Lyrics",
        "UNSYNCEDLYRICS",
        "UnsyncedLyrics",
    ]);

    for (const tagType of Object.keys(native)) {
        const tags = native[tagType];
        if (!Array.isArray(tags)) continue;
        for (const tag of tags) {
            if (lyricTagIds.has(tag.id)) {
                const text = extractLyricsText(tag as LyricsTagItem);
                if (text) return text;
            }
        }
    }

    return undefined;
}

function looksLikeLrc(text: string): boolean {
    return /\[\d+:\d+([.:]\d+)?\]/.test(text);
}

function parseEmbeddedLyrics(embeddedText: string): MusicLyricLine[] {
    if (!looksLikeLrc(embeddedText)) return [];
    // 复用 musicLyricsService 的 parseLrc，但这里为避免循环依赖，内联最小实现
    const lines = embeddedText.split(/\r?\n/);
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

function applyCoverToTrack(track: MusicTrack, metadata: AudioMetadata) {
    const pictures = metadata.common.picture;
    if (!pictures || pictures.length === 0) return;

    // 取第一张封面；music-metadata 的 IPicture 不包含尺寸信息
    const picture = pictures[0];

    try {
        const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format || "image/jpeg" });
        const objectUrl = URL.createObjectURL(blob);
        if (track.coverObjectUrl && track.coverObjectUrl !== objectUrl) {
            revokeCoverObjectUrl(track.coverObjectUrl);
        }
        track.coverObjectUrl = objectUrl;
        coverObjectUrls.add(objectUrl);
    } catch {
        track.coverObjectUrl = undefined;
    }
}

async function loadExternalCoverForTrack(track: MusicTrack): Promise<void> {
    if (track.coverObjectUrl) return;

    const pathLib = window.require("path");
    const fs = window.require("fs");
    const fsPromises = window.require("fs").promises;
    const dir = pathLib.dirname(track.filePath);
    const base = pathLib.basename(track.filePath, track.ext);

    // 读取同目录文件列表，用于大小写不敏感匹配
    let dirFiles: string[];
    try {
        dirFiles = fs.readdirSync(dir) as string[];
    } catch {
        return;
    }
    const lowerMap = new Map(dirFiles.map((f) => [f.toLowerCase(), f]));

    const picExts = [".jpg", ".jpeg", ".png", ".webp"];
    const candidateBases: string[] = [base, "cover", "folder", "front", "album"];

    for (const name of candidateBases) {
        for (const ext of picExts) {
            const key = (name + ext).toLowerCase();
            const realName = lowerMap.get(key);
            if (!realName) continue;
            const coverPath = pathLib.join(dir, realName);
            try {
                const buffer: Buffer = await fsPromises.readFile(coverPath);
                const mimeType =
                    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
                const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
                const objectUrl = URL.createObjectURL(blob);
                if (track.coverObjectUrl) {
                    revokeCoverObjectUrl(track.coverObjectUrl);
                }
                track.coverObjectUrl = objectUrl;
                coverObjectUrls.add(objectUrl);
                return;
            } catch {
                // 继续下一个候选
            }
        }
    }
}

export { loadExternalCoverForTrack };

function applyBaseMetadataToTrack(
    track: MusicTrack,
    metadata: AudioMetadata,
    extra: NativeExtraMetadata | undefined,
    preserve: boolean,
) {
    const common = metadata.common;
    const format = metadata.format;

    if (!preserve || !track.title || track.title === track.baseName) {
        track.title = common.title?.trim() || track.baseName;
    }
    if (!preserve || !track.artist) {
        track.artist = common.artist?.trim() || "";
    }
    if (!preserve || !track.album) {
        track.album = common.album?.trim() || "";
    }
    if (!preserve || track.duration === 0) {
        track.duration = format.duration || 0;
    }
    if (!preserve || track.bitrate === undefined) {
        track.bitrate = format.bitrate;
    }
    if (!preserve || track.sampleRate === undefined) {
        track.sampleRate = format.sampleRate;
    }

    if (extra) {
        if (extra.title && (!track.title || track.title === track.baseName)) {
            track.title = extra.title;
        }
        if (extra.artist && !track.artist) {
            track.artist = extra.artist;
        }
        if (extra.album && !track.album) {
            track.album = extra.album;
        }
    }
}

async function applyFullMetadataToTrack(track: MusicTrack, metadata: AudioMetadata, extra?: NativeExtraMetadata) {
    applyBaseMetadataToTrack(track, metadata, extra, false);
    applyCoverToTrack(track, metadata);

    const embeddedLyricsText = parseEmbeddedLyricsText(metadata);
    if (embeddedLyricsText) {
        track.unsyncedLyricsText = embeddedLyricsText;
        const parsed = parseEmbeddedLyrics(embeddedLyricsText);
        if (parsed.length > 0) {
            track.lyrics = parsed;
        }
    }
    if (extra?.picture && !track.coverObjectUrl) {
        try {
            const blob = new Blob([new Uint8Array(extra.picture.data)], { type: extra.picture.format || "image/jpeg" });
            const objectUrl = URL.createObjectURL(blob);
            track.coverObjectUrl = objectUrl;
            coverObjectUrls.add(objectUrl);
        } catch {
            // ignore
        }
    }

    // 无内嵌封面时尝试同目录封面兜底
    if (!track.coverObjectUrl) {
        await loadExternalCoverForTrack(track);
    }
}

function applyLightMetadataToTrack(track: MusicTrack, metadata: AudioMetadata, extra?: NativeExtraMetadata) {
    applyBaseMetadataToTrack(track, metadata, extra, false);
    // light 模式不读取封面、不读取内嵌歌词
}

function applyMetadataToTrack(track: MusicTrack, metadata: AudioMetadata, preserve = false) {
    applyBaseMetadataToTrack(track, metadata, undefined, preserve);
    if (!preserve || !track.coverObjectUrl) {
        applyCoverToTrack(track, metadata);
    }
    if (!preserve || (!track.unsyncedLyricsText && track.lyrics.length === 0)) {
        const embeddedLyricsText = parseEmbeddedLyricsText(metadata);
        if (embeddedLyricsText) {
            track.unsyncedLyricsText = embeddedLyricsText;
            const parsed = parseEmbeddedLyrics(embeddedLyricsText);
            if (parsed.length > 0) {
                track.lyrics = parsed;
            }
        }
    }
}

type Picture = NonNullable<AudioMetadata["common"]["picture"]>[number];

interface NativeExtraMetadata {
    title?: string;
    artist?: string;
    album?: string;
    lyrics?: string;
    comment?: string;
    picture?: Picture;
}

function applyNativeExtraToTrack(track: MusicTrack, extra: NativeExtraMetadata) {
    if (extra.title && (!track.title || track.title === track.baseName)) {
        track.title = extra.title;
    }
    if (extra.artist && !track.artist) {
        track.artist = extra.artist;
    }
    if (extra.album && !track.album) {
        track.album = extra.album;
    }
    if (extra.lyrics && !track.unsyncedLyricsText && track.lyrics.length === 0) {
        track.unsyncedLyricsText = extra.lyrics;
        const parsed = parseEmbeddedLyrics(extra.lyrics);
        if (parsed.length > 0) {
            track.lyrics = parsed;
        }
    }
    if (extra.picture && !track.coverObjectUrl) {
        try {
            const blob = new Blob([new Uint8Array(extra.picture.data)], { type: extra.picture.format || "image/jpeg" });
            const objectUrl = URL.createObjectURL(blob);
            track.coverObjectUrl = objectUrl;
            coverObjectUrls.add(objectUrl);
        } catch {
            // ignore
        }
    }
}

async function parseId3Chunk(id3Data: Buffer): Promise<AudioMetadata | undefined> {
    if (id3Data.length < 10 || id3Data.toString("ascii", 0, 3) !== "ID3") return undefined;
    try {
        return await parseBuffer(id3Data, { mimeType: "audio/mpeg", size: id3Data.length });
    } catch {
        return undefined;
    }
}

function parseWavInfoChunk(buffer: Buffer, start: number, end: number): Partial<NativeExtraMetadata> {
    const info: Partial<NativeExtraMetadata> = {};
    let offset = start;

    while (offset + 8 <= end) {
        const subId = buffer.toString("ascii", offset, offset + 4);
        const subSize = buffer.readUInt32LE(offset + 4);
        const dataOffset = offset + 8;
        const dataEnd = Math.min(dataOffset + subSize, end);

        const text = buffer.toString("utf-8", dataOffset, dataEnd).replace(/\0+$/, "").trim();
        switch (subId) {
            case "INAM":
                info.title = text;
                break;
            case "IART":
                info.artist = text;
                break;
            case "IPRD":
                info.album = text;
                break;
            case "ICMT":
                info.comment = text;
                break;
        }

        offset = dataEnd + (subSize % 2);
    }

    return info;
}

async function scanWavChunks(buffer: Buffer): Promise<NativeExtraMetadata | undefined> {
    if (
        buffer.length < 12 ||
        buffer.toString("ascii", 0, 4) !== "RIFF" ||
        buffer.toString("ascii", 8, 12) !== "WAVE"
    ) {
        return undefined;
    }

    const extra: NativeExtraMetadata = {};
    let offset = 12;

    while (offset + 8 <= buffer.length) {
        const chunkId = buffer.toString("ascii", offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        const dataOffset = offset + 8;
        const dataEnd = Math.min(dataOffset + chunkSize, buffer.length);

        if (chunkId === "ID3 " || chunkId === "id3 ") {
            const id3Data = buffer.subarray(dataOffset, dataEnd);
            const id3Metadata = await parseId3Chunk(id3Data);
            if (id3Metadata) {
                if (id3Metadata.common.title && !extra.title) extra.title = id3Metadata.common.title;
                if (id3Metadata.common.artist && !extra.artist) extra.artist = id3Metadata.common.artist;
                if (id3Metadata.common.album && !extra.album) extra.album = id3Metadata.common.album;
                const lyricText = parseEmbeddedLyricsText(id3Metadata);
                if (lyricText && !extra.lyrics) extra.lyrics = lyricText;
                if (id3Metadata.common.picture && id3Metadata.common.picture.length > 0 && !extra.picture) {
                    extra.picture = id3Metadata.common.picture[0];
                }
            }
        } else if (chunkId === "LIST") {
            const listType = buffer.toString("ascii", dataOffset, dataOffset + 4);
            if (listType === "INFO") {
                const info = parseWavInfoChunk(buffer, dataOffset + 4, dataEnd);
                if (info.title && !extra.title) extra.title = info.title;
                if (info.artist && !extra.artist) extra.artist = info.artist;
                if (info.album && !extra.album) extra.album = info.album;
                if (info.comment && !extra.lyrics) extra.lyrics = info.comment;
            }
        }

        offset = dataEnd + (chunkSize % 2);
    }

    return Object.keys(extra).length > 0 ? extra : undefined;
}

function isTextValue(value: unknown): value is string {
    return typeof value === "string";
}

function extractNativeTagFallback(metadata: AudioMetadata): NativeExtraMetadata | undefined {
    const native = metadata.native as Record<string, Array<{ id: string; value: unknown }>> | undefined;
    if (!native) return undefined;

    const titleTags = new Set(["TIT2", "TIT1", "TITLE", "©nam", "INAM"]);
    const artistTags = new Set(["TPE1", "TPE2", "TPE3", "ARTIST", "©ART", "IART", "Author"]);
    const albumTags = new Set(["TALB", "ALBUM", "©alb", "IPRD"]);
    const lyricsTags = new Set(["USLT", "SYLT", "LYRICS", "UNSYNCEDLYRICS", "©lyr", "ICMT", "Comment"]);
    const pictureTags = new Set(["APIC", "METADATA_BLOCK_PICTURE", "covr", "Cover Art"]);

    const extra: NativeExtraMetadata = {};

    for (const tagType of Object.keys(native)) {
        const tags = native[tagType];
        if (!Array.isArray(tags)) continue;

        for (const tag of tags) {
            const id = tag.id;
            const value = tag.value;

            if (!extra.title && isTextValue(value) && titleTags.has(id)) {
                extra.title = value.trim();
            }
            if (!extra.artist && isTextValue(value) && artistTags.has(id)) {
                extra.artist = value.trim();
            }
            if (!extra.album && isTextValue(value) && albumTags.has(id)) {
                extra.album = value.trim();
            }
            if (!extra.lyrics && isTextValue(value) && lyricsTags.has(id)) {
                extra.lyrics = value.trim();
            }
            if (!extra.picture && pictureTags.has(id) && isPictureValue(value)) {
                extra.picture = value as Picture;
            }
        }
    }

    return Object.keys(extra).length > 0 ? extra : undefined;
}

function isPictureValue(value: unknown): boolean {
    return value !== null && typeof value === "object" && "data" in value && "format" in value;
}

async function parseLocalAudioMetadataFull(
    track: MusicTrack,
): Promise<{ metadata: AudioMetadata; extra?: NativeExtraMetadata }> {
    const buffer = await readAudioBuffer(track.filePath);
    const mimeType = getMimeTypeFromExt(track.ext);
    const metadata = await parseBuffer(buffer, { mimeType, size: track.size });

    let extra: NativeExtraMetadata | undefined;
    if (track.ext === ".wav" || track.ext === ".wave") {
        extra = await scanWavChunks(buffer);
    }

    if (!extra) {
        extra = extractNativeTagFallback(metadata);
    }

    return { metadata, extra };
}

async function parseLocalAudioMetadataLight(
    track: MusicTrack,
): Promise<{ metadata?: AudioMetadata; extra?: NativeExtraMetadata }> {
    // light 模式优先尝试 parseFile，避免把整文件读进内存
    try {
        const metadata = await parseFile(track.filePath, {
            duration: true,
            skipCovers: true,
            skipPostHeaders: true,
        });
        const extra = extractNativeTagFallback(metadata);
        return { metadata, extra };
    } catch {
        // parseFile 在部分环境不可用，继续 fallback
    }

    // 大文件不再整文件读取，只保留文件名和未知时长
    if (track.size > LIGHT_MODE_MAX_READ_SIZE) {
        return {};
    }

    const buffer = await readAudioBuffer(track.filePath);
    const mimeType = getMimeTypeFromExt(track.ext);
    const metadata = await parseBuffer(buffer, { mimeType, size: track.size });
    let extra: NativeExtraMetadata | undefined;
    if (track.ext === ".wav" || track.ext === ".wave") {
        extra = await scanWavChunks(buffer);
    }
    if (!extra) {
        extra = extractNativeTagFallback(metadata);
    }
    return { metadata, extra };
}

async function parseLocalAudioMetadata(
    track: MusicTrack,
    mode: MusicMetadataLoadMode,
): Promise<{ metadata?: AudioMetadata; extra?: NativeExtraMetadata }> {
    if (mode === "light") {
        return parseLocalAudioMetadataLight(track);
    }
    return parseLocalAudioMetadataFull(track);
}

export async function loadMetadataForTrack(
    track: MusicTrack,
    parseMetadata: boolean,
    mode: MusicMetadataLoadMode = "full",
): Promise<void> {
    if (!parseMetadata) {
        track.metadataStatus = "loaded";
        track.metadataLoadLevel = "none";
        track.title = track.baseName;
        return;
    }

    const currentLevel = track.metadataLoadLevel || "none";
    if (mode === "light" && (currentLevel === "light" || currentLevel === "full")) return;
    if (mode === "full" && currentLevel === "full") return;

    const cacheKey = getCacheKey(track.filePath, track.size, track.mtimeMs);
    const cached = metadataCache.get(cacheKey);
    if (cached) {
        const cachedLevel = cached.metadataLoadLevel || "none";
        if (mode === "light" && (cachedLevel === "light" || cachedLevel === "full")) {
            await applyCachedToTrack(track, cached, mode);
            return;
        }
        if (mode === "full" && cachedLevel === "full") {
            await applyCachedToTrack(track, cached, mode);
            return;
        }
        // 缓存级别低于所需级别，继续重新解析
    }

    track.metadataStatus = "loading";
    try {
        const { metadata, extra } = await parseLocalAudioMetadata(track, mode);
        if (metadata) {
            if (mode === "full") {
                await applyFullMetadataToTrack(track, metadata, extra);
            } else {
                applyLightMetadataToTrack(track, metadata, extra);
            }
            track.metadataStatus = "loaded";
            track.metadataLoadLevel = mode;

            metadataCache.set(cacheKey, {
                filePath: track.filePath,
                size: track.size,
                mtimeMs: track.mtimeMs,
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration,
                bitrate: track.bitrate,
                sampleRate: track.sampleRate,
                unsyncedLyricsText: mode === "full" ? track.unsyncedLyricsText : undefined,
                lyrics: mode === "full" && track.lyrics.length > 0 ? track.lyrics : undefined,
                metadataLoadLevel: mode,
            });
        } else {
            // light 模式下 metadata 可能为空（大文件跳过或 parseFile 失败）
            if (mode === "full") {
                track.metadataStatus = "failed";
                track.metadataError = "metadata_parse_failed";
            } else {
                // light 模式即使没拿到元数据也要标记为已尝试，避免被列表可见请求反复入队
                track.metadataStatus = "loaded";
                track.metadataLoadLevel = "light";
                track.metadataError = "metadata_light_skipped";
            }
        }
    } catch {
        if (mode === "full") {
            track.metadataStatus = "failed";
            track.metadataError = "metadata_parse_failed";
        } else {
            // light 模式解析失败也视为已尝试，避免列表可见请求反复入队
            track.metadataStatus = "loaded";
            track.metadataLoadLevel = "light";
            track.metadataError = "metadata_parse_failed_light";
        }
    }
}

async function applyCachedToTrack(track: MusicTrack, cached: MetadataCacheEntry, mode: MusicMetadataLoadMode) {
    track.title = cached.title || track.baseName;
    track.artist = cached.artist || "";
    track.album = cached.album || "";
    track.duration = cached.duration || 0;
    track.bitrate = cached.bitrate;
    track.sampleRate = cached.sampleRate;
    track.metadataStatus = "loaded";
    track.metadataLoadLevel = cached.metadataLoadLevel || "none";
    if (mode === "full") {
        track.unsyncedLyricsText = cached.unsyncedLyricsText;
        track.lyrics = cached.lyrics && cached.lyrics.length > 0 ? cached.lyrics : [];
        if (!track.coverObjectUrl) {
            await loadCoverForTrack(track);
        }
    }
}

export function updateTrackCoverObjectUrl(track: MusicTrack, objectUrl: string | undefined) {
    if (track.coverObjectUrl && track.coverObjectUrl !== objectUrl) {
        revokeCoverObjectUrl(track.coverObjectUrl);
    }
    track.coverObjectUrl = objectUrl;
    if (objectUrl) coverObjectUrls.add(objectUrl);
}

async function loadCoverForTrack(track: MusicTrack): Promise<void> {
    try {
        const { metadata, extra } = await parseLocalAudioMetadata(track, "full");
        if (metadata) {
            applyMetadataToTrack(track, metadata, true);
            if (extra) {
                applyNativeExtraToTrack(track, extra);
            }
        }
    } catch {
        // 封面读取失败不影响文字元数据和播放
    }
}

export function revokeTrackCoverObjectUrls(tracks: MusicTrack[]) {
    for (const track of tracks) {
        revokeCoverObjectUrl(track.coverObjectUrl);
        track.coverObjectUrl = undefined;
    }
}

export function releaseTrackResources(track: MusicTrack) {
    revokeCoverObjectUrl(track.coverObjectUrl);
    track.coverObjectUrl = undefined;
}

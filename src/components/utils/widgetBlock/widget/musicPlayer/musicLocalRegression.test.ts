import assert from "node:assert/strict";
import test from "node:test";
import { MusicLibraryStore } from "./musicLibraryStore";
import { MusicPlaybackStatsStore } from "./musicPlaybackStatsStore";
import { getTrackKey } from "./musicTrackIdentity";
import type { MusicTrack } from "./musicPlayerTypes";

function localTrack(filePath: string, size: number, mtimeMs: number, title: string, artist: string): MusicTrack {
    const fileName = filePath.replace(/\\/g, "/").split("/").pop() || title;
    const dot = fileName.lastIndexOf(".");
    return {
        sourceKind: "local",
        filePath,
        fileUrl: `file:///${filePath.replace(/\\/g, "/")}`,
        fileName,
        baseName: dot > 0 ? fileName.slice(0, dot) : fileName,
        ext: dot > 0 ? fileName.slice(dot).toLowerCase() : "",
        size,
        mtimeMs,
        title,
        artist,
        album: "本地专辑",
        duration: 180,
        lyrics: [],
        lyricsStatus: "pending",
        metadataStatus: "loaded",
    };
}

function memoryPlugin(initial: Record<string, unknown> = {}) {
    const files = new Map(Object.entries(initial));
    const savedNames: string[] = [];
    return {
        files,
        savedNames,
        loadData: async (name: string) => files.get(name),
        saveData: async (name: string, value: unknown) => {
            files.set(name, structuredClone(value));
            savedNames.push(name);
        },
    };
}

test("旧版本地收藏、播放列表与活动队列原样加载", async () => {
    const plugin = memoryPlugin({
        "music-player-library-legacy.json": {
            version: 1,
            favorites: ["old-favorite"],
            playlists: [{
                id: "old-playlist",
                name: "旧歌单",
                createdAt: 1,
                updatedAt: 2,
                trackKeys: ["old-track"],
            }],
            activeQueue: { trackKeys: ["queue-a", "queue-b"], updatedAt: 3 },
        },
    });
    const store = new MusicLibraryStore(plugin, "legacy");
    await store.load();
    assert.deepEqual(store.getFavorites(), ["old-favorite"]);
    assert.deepEqual(store.getPlaylists().map((item) => ({ id: item.id, name: item.name, trackKeys: item.trackKeys })), [{
        id: "old-playlist",
        name: "旧歌单",
        trackKeys: ["old-track"],
    }]);
    assert.deepEqual(store.getActiveQueueTrackKeys(), ["queue-a", "queue-b"]);
});

test("本地收藏、歌单、M3U8、JSON 与活动队列完整回归", async () => {
    const plugin = memoryPlugin();
    const store = new MusicLibraryStore(plugin, "local");
    await store.load();
    const first = localTrack("C:\\Music\\Artist\\Song A.mp3", 101, 1001, "Song A", "Artist");
    const second = localTrack("C:\\Music\\Song B.flac", 202, 2002, "Song B", "Singer");
    const firstKey = getTrackKey(first);
    const secondKey = getTrackKey(second);

    assert.equal(store.toggleFavorite(firstKey), true);
    assert.equal(store.isFavorite(firstKey), true);
    const playlist = store.createPlaylist("  本地歌单  ");
    assert.ok(playlist);
    assert.equal(store.addTrackToPlaylist(playlist.id, firstKey), true);
    assert.equal(store.addTrackToPlaylist(playlist.id, secondKey), true);
    assert.equal(store.renamePlaylist(playlist.id, "重命名歌单"), true);

    const exported = store.exportPlaylistToM3U8(playlist.id, [first, second], "C:\\Music", "relative");
    assert.ok(exported);
    assert.equal(exported.missingCount, 0);
    assert.match(exported.content, /^#EXTM3U\n#EXTENC:UTF-8\n/);
    assert.match(exported.content, /Artist\/Song A\.mp3/);
    assert.match(exported.content, /Song B\.flac/);
    const imported = store.importM3U8(exported.content, [first, second], "C:\\Music");
    assert.deepEqual(imported?.trackKeys, [firstKey, secondKey]);
    assert.equal(imported?.missingCount, 0);

    store.replaceActiveQueue([firstKey]);
    assert.equal(store.appendToActiveQueue([firstKey, secondKey]), true);
    assert.deepEqual(store.getActiveQueueTrackKeys(), [firstKey, secondKey]);
    assert.equal(store.removeFromActiveQueue(firstKey), true);
    assert.deepEqual(store.getActiveQueueTrackKeys(), [secondKey]);
    store.clearActiveQueue();
    assert.deepEqual(store.getActiveQueueTrackKeys(), []);

    const json = store.exportLibraryToJSON();
    const targetPlugin = memoryPlugin();
    const target = new MusicLibraryStore(targetPlugin, "imported");
    await target.load();
    assert.deepEqual(target.importLibraryJSON(json), { favoritesCount: 1, playlistsCount: 1 });
    assert.equal(target.getPlaylists()[0].name, "重命名歌单");
    assert.deepEqual(target.getPlaylists()[0].trackKeys, [firstKey, secondKey]);
    assert.ok(plugin.savedNames.every((name) => name === "music-player-library-local.json"));
});

test("本地播放统计继续使用旧 track key 并记录有效会话", async () => {
    const plugin = memoryPlugin();
    const stats = new MusicPlaybackStatsStore(plugin, "local");
    await stats.load();
    const track = localTrack("D:\\Audio\\Legacy.wav", 4096, 123456, "Legacy", "Local");
    const expectedKey = getTrackKey(track);
    stats.recordPlaybackStart(track);
    stats.startSession(track, 0);
    for (let position = 1; position <= 8; position += 1) stats.tick(position);
    assert.equal(stats.endSession(true), true);
    const entry = stats.getStatsForTrack(expectedKey);
    assert.equal(entry?.playCount, 1);
    assert.equal(entry?.totalPlayedSeconds, 8);
    assert.equal(entry?.recentPlays[0].completed, true);
    assert.ok(plugin.savedNames.every((name) => name === "music-player-playback-stats-local.json"));
});

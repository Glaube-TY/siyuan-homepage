import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { MusicTrackRegistry } from "./musicTrackRegistry";
import { MusicRemoteScrobbleTracker } from "./musicRemoteScrobbleTracker";
import { SubsonicLibraryService } from "./subsonic/subsonicLibraryService";
import { SubsonicLyricsService } from "./subsonic/subsonicLyricsService";
import { normalizePlayQueueByIndex } from "./subsonic/subsonicResponse";
import { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
import { MusicMetadataIndexStore } from "./musicMetadataIndexStore";
import { SubsonicCoverService } from "./subsonic/subsonicCoverService";
import { MusicCloudQueueSaveScheduler } from "./musicCloudQueueSaveScheduler";
import { DesktopMusicStreamRelay } from "./musicStreamRelay";
import {
    normalizeCloudQueueAfterMutation,
    resolveCloudQueueSaveCursor,
    resolveInitialCloudPlaybackState,
} from "./subsonic/subsonicQueueState";
import type { MusicTrack } from "./musicPlayerTypes";

function track(id: string): MusicTrack {
    return { sourceKind: "subsonic", sourceProfileId: "p", sourceTrackId: id, fileName: `${id}.mp3`, baseName: id, ext: ".mp3", size: 0, mtimeMs: 0, title: id, artist: "a", album: "b", duration: 100, lyrics: [], lyricsStatus: "pending", metadataStatus: "loaded" };
}

function envelope(extra: Record<string, any> = {}) { return { status: "ok", version: "1.16.1", ...extra }; }

test("TrackRegistry 保护队列项并淘汰最旧非保护项", () => {
    const registry = new MusicTrackRegistry(2);
    const one = track("1"); const two = track("2"); const three = track("3");
    const oneKey = registry.register(one);
    registry.setProtectedKeys([oneKey]);
    registry.register(two); registry.register(three);
    assert.equal(registry.resolve(oneKey)?.sourceTrackId, "1");
    assert.equal(registry.values().length, 2);
});

test("TrackRegistry 在 active queue 超过软上限时仍不淘汰受保护歌曲", () => {
    const registry = new MusicTrackRegistry(2);
    const tracks = [track("1"), track("2"), track("3")];
    const keys = tracks.map((item) => `subsonic:p:${item.sourceTrackId}`);
    registry.setProtectedKeys(keys);
    registry.registerMany(tracks);
    assert.equal(registry.values().length, 3);
    assert.deepEqual(keys.map((key) => registry.resolve(key)?.sourceTrackId), ["1", "2", "3"]);
});

test("本地 metadata 索引在 store 边界拒绝云端歌曲", async () => {
    let saved: any;
    const store = new MusicMetadataIndexStore({
        loadData: async () => null,
        saveData: async (_fileName: string, value: any) => { saved = value; },
    });
    await store.load();
    const cloudTrack = track("cloud-only");
    store.upsertTrack("C:\\Music", true, cloudTrack);
    assert.equal(store.hasFreshEntry("C:\\Music", true, cloudTrack), false);
    assert.equal(store.getFreshEntry("C:\\Music", true, cloudTrack), null);
    await store.flush();
    assert.deepEqual(saved.libraries, {});
});

test("Scrobble 仅在累计 50% 且至少 30 秒后提交一次，failover 不重置", () => {
    const tracker = new MusicRemoteScrobbleTracker();
    tracker.begin("song", 0);
    assert.equal(tracker.markNowPlaying("song"), true);
    assert.equal(tracker.markNowPlaying("song"), false);
    for (let position = 1; position <= 50; position += 1) tracker.tick("song", position);
    assert.equal(tracker.shouldSubmit("song", 100), true);
    assert.equal(tracker.shouldSubmit("song", 100), false);
    tracker.begin("song", 0);
    assert.equal(tracker.markNowPlaying("song"), true);
});

test("Scrobble now-playing 可安全回退，完成提交不自动跨地址重试", async () => {
    let idempotentCalls = 0;
    let nonIdempotentCalls = 0;
    const provider = new SubsonicMusicProvider({
        id: "p", provider: "subsonic", name: "NAS", localBaseUrl: "http://local", remoteBaseUrl: "https://remote",
        username: "u", encryptedPassword: "enc:v1:test", createdAt: 1, updatedAt: 1,
    }, "pw", "original");
    (provider.endpointManager as any).executeIdempotentWrite = async () => { idempotentCalls += 1; };
    (provider.endpointManager as any).executeNonIdempotentWrite = async () => { nonIdempotentCalls += 1; };
    await provider.scrobbleNowPlaying(track("1"));
    await provider.scrobbleCompleted(track("1"));
    assert.equal(idempotentCalls, 1);
    assert.equal(nonIdempotentCalls, 1);
    provider.destroy();
});

test("结构化歌词优先，失败时回退 legacy lyrics", async () => {
    const endpoints = { executeRead: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1 }) } as any;
    const structuredClient = { request: async () => envelope({ lyricsList: { structuredLyrics: [{ synced: true, line: [{ start: 1000, value: "第一行" }] }] } }) } as any;
    const structured = new SubsonicLyricsService(endpoints, structuredClient, new Set(["songLyrics"]));
    assert.deepEqual((await structured.load(track("1"))).lines, [{ time: 1, primary: "第一行" }]);

    let calls = 0;
    const fallbackClient = { request: async (_base: string, _kind: string, endpoint: string) => { calls += 1; if (endpoint === "getLyricsBySongId") throw new Error("unsupported"); return envelope({ lyrics: { value: "纯文本歌词" } }); } } as any;
    const fallback = new SubsonicLyricsService(endpoints, fallbackClient, new Set(["songLyrics"]));
    assert.equal((await fallback.load(track("2"))).unsyncedText, "纯文本歌词");
    assert.equal(calls, 2);
});

test("非同步 structured lyrics 使用完整文本而不是把所有行压到零秒", async () => {
    const endpoints = { executeRead: async (operation: any) => operation({ baseUrl: "x", kind: "local", generation: 1 }) } as any;
    const client = {
        request: async () => envelope({
            lyricsList: {
                structuredLyrics: {
                    synced: false,
                    line: [{ value: ["第一行"] }, { value: "第二行" }],
                },
            },
        }),
    } as any;
    const service = new SubsonicLyricsService(endpoints, client, new Set(["songLyrics"]));
    assert.deepEqual(await service.load(track("unsynced")), {
        lines: [],
        unsyncedText: "第一行\n第二行",
    });
});

test("无歌词或畸形歌词响应不会显示对象字符串", async () => {
    const endpoints = { executeRead: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1, signal: new AbortController().signal }) } as any;
    const noLyrics = new SubsonicLyricsService(endpoints, { request: async () => envelope({ lyrics: {} }) } as any, new Set());
    assert.deepEqual(await noLyrics.load(track("none")), { lines: [], unsyncedText: undefined });
    const malformed = new SubsonicLyricsService(endpoints, {
        request: async () => envelope({ lyricsList: { structuredLyrics: [{ synced: true, line: [{ start: "bad", value: { text: "invalid" } }] }] } }),
    } as any, new Set(["songLyrics"]));
    assert.deepEqual(await malformed.load(track("bad")), { lines: [], unsyncedText: undefined });
});

test("LibraryService 使用空 search3 分页并将歌曲 ID 字符串化", async () => {
    let captured: any;
    const endpoints = { executeRead: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1 }) } as any;
    const client = { request: async (_base: string, _kind: string, endpoint: string, params: any) => { captured = { endpoint, params }; return envelope({ searchResult3: { song: { id: 123, title: "Song" } } }); } } as any;
    const service = new SubsonicLibraryService("profile", endpoints, client);
    const songs = await service.getAllSongsPage(50, 25);
    assert.deepEqual(captured, { endpoint: "search3", params: { query: "", artistCount: 0, albumCount: 0, songCount: 25, songOffset: 50 } });
    assert.equal(songs[0].sourceTrackId, "123");
});

test("五千首云端曲库始终按 50 首分页，Registry 有界且跨页队列歌曲不被淘汰", async () => {
    const requests: Array<{ songOffset: number; songCount: number }> = [];
    const endpoints = { executeRead: async (operation: any) => operation({ baseUrl: "x", kind: "local", generation: 1 }) } as any;
    const client = {
        request: async (_base: string, _kind: string, endpoint: string, params: any) => {
            assert.equal(endpoint, "search3");
            requests.push({ songOffset: params.songOffset, songCount: params.songCount });
            return envelope({
                searchResult3: {
                    song: Array.from({ length: params.songCount }, (_, index) => ({
                        id: params.songOffset + index,
                        title: `Song ${params.songOffset + index}`,
                    })),
                },
            });
        },
    } as any;
    const service = new SubsonicLibraryService("large", endpoints, client);
    const registry = new MusicTrackRegistry(3000);
    let protectedQueueKey = "";
    for (let offset = 0; offset < 5000; offset += 50) {
        const page = await service.getAllSongsPage(offset, 50);
        assert.equal(page.length, 50);
        const keys = registry.registerMany(page);
        if (offset === 0) {
            protectedQueueKey = keys[0];
            registry.setProtectedKeys([protectedQueueKey]);
        }
    }
    assert.equal(requests.length, 100);
    assert.equal(Math.max(...requests.map((item) => item.songCount)), 50);
    assert.deepEqual(requests.map((item) => item.songOffset), Array.from({ length: 100 }, (_, index) => index * 50));
    assert.equal(registry.values().length, 3000);
    assert.equal(registry.resolve(protectedQueueKey)?.sourceTrackId, "0");
    assert.equal(registry.resolve("subsonic:large:4999")?.sourceTrackId, "4999");
});

test("LibraryService 覆盖关键词搜索、艺术家、专辑、收藏与播放列表浏览", async () => {
    const requests: Array<{ endpoint: string; params: any }> = [];
    const endpoints = { executeRead: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1, signal: new AbortController().signal }) } as any;
    const client = { request: async (_base: string, _kind: string, endpoint: string, params: any) => {
        requests.push({ endpoint, params });
        if (endpoint === "search3") return envelope({ searchResult3: { artist: { id: "ar", name: "歌手" }, album: { id: "al", name: "专辑" }, song: { id: "s", title: "歌曲" } } });
        if (endpoint === "getArtists") return envelope({ artists: { index: { artist: { id: "ar", name: "歌手" } } } });
        if (endpoint === "getArtist") return envelope({ artist: { id: "ar", name: "歌手", album: { id: "al", name: "专辑" } } });
        if (endpoint === "getAlbum") return envelope({ album: { id: "al", name: "专辑", song: { id: "s", title: "歌曲" } } });
        if (endpoint === "getAlbumList2") return envelope({ albumList2: { album: { id: "al", name: "专辑" } } });
        if (endpoint === "getStarred2") return envelope({ starred2: { song: { id: "s", title: "歌曲", starred: "2026-08-07T00:00:00Z" } } });
        if (endpoint === "getPlaylists") return envelope({ playlists: { playlist: { id: "pl", name: "歌单" } } });
        if (endpoint === "getPlaylist") return envelope({ playlist: { id: "pl", name: "歌单", entry: { id: "s", title: "歌曲" } } });
        throw new Error(`unexpected endpoint ${endpoint}`);
    } } as any;
    const service = new SubsonicLibraryService("p", endpoints, client);
    const found = await service.search("关键词", 10, 5);
    assert.equal(found.songs[0].id, "s");
    assert.deepEqual(requests[0], { endpoint: "search3", params: { query: "关键词", artistCount: 20, albumCount: 20, songCount: 5, songOffset: 10 } });
    assert.equal((await service.getArtists())[0].id, "ar");
    assert.equal((await service.getArtist("ar")).album[0].id, "al");
    assert.equal((await service.getAlbum("al")).song[0].id, "s");
    assert.equal((await service.getAlbumList("recent", 50, 25))[0].id, "al");
    assert.equal((await service.getStarredSongs())[0].serverStarredAt, Date.parse("2026-08-07T00:00:00Z"));
    assert.equal((await service.getPlaylists())[0].id, "pl");
    assert.equal((await service.getPlaylist("pl")).entry[0].id, "s");
});

test("迟到的旧搜索响应会被丢弃", async () => {
    let releaseOld!: (value: any) => void;
    const endpoints = { executeRead: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1, signal: new AbortController().signal }) } as any;
    const client = { request: async (_base: string, _kind: string, _endpoint: string, params: any) => {
        if (params.query === "旧词") return new Promise((resolve) => { releaseOld = resolve; });
        return envelope({ searchResult3: { song: { id: "new", title: "新结果" } } });
    } } as any;
    const service = new SubsonicLibraryService("p", endpoints, client);
    const oldRequest = service.search("旧词");
    const newResult = await service.search("新词");
    releaseOld(envelope({ searchResult3: { song: { id: "old", title: "旧结果" } } }));
    const oldResult = await oldRequest;
    assert.equal(newResult.songs[0].id, "new");
    assert.deepEqual(oldResult, { artists: [], albums: [], songs: [] });
});

test("云端收藏仅在服务器成功后更新歌曲状态", async () => {
    const provider = new SubsonicMusicProvider({
        id: "p", provider: "subsonic", name: "NAS", localBaseUrl: "http://local", remoteBaseUrl: "",
        username: "u", encryptedPassword: "enc:v1:test", createdAt: 1, updatedAt: 1,
    }, "pw", "original");
    let shouldFail = false;
    (provider.client as any).request = async () => {
        if (shouldFail) throw new Error("server rejected");
        return envelope();
    };
    (provider.endpointManager as any).executeIdempotentWrite = async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1, signal: new AbortController().signal });
    const song = track("favorite");
    assert.equal(await provider.toggleFavorite(song), true);
    assert.ok(song.serverStarredAt);
    shouldFail = true;
    await assert.rejects(provider.toggleFavorite(song), /server rejected/);
    assert.ok(song.serverStarredAt);
    provider.destroy();
});

test("云端播放列表 CRUD 使用服务器结果，失败时不假成功", async () => {
    const calls: string[] = [];
    let rejectDelete = false;
    const context = { baseUrl: "x", kind: "local", generation: 1, signal: new AbortController().signal };
    const endpoints = {
        executeRead: async (op: any) => op(context),
        executeNonIdempotentWrite: async (op: any) => op(context),
    } as any;
    const client = { request: async (_base: string, _kind: string, endpoint: string) => {
        calls.push(endpoint);
        if (endpoint === "createPlaylist") return envelope({ playlist: { id: "pl", name: "新歌单" } });
        if (endpoint === "updatePlaylist") return envelope();
        if (endpoint === "getPlaylist") return envelope({ playlist: { id: "pl", name: "已重命名", entry: [] } });
        if (endpoint === "deletePlaylist" && rejectDelete) throw new Error("delete rejected");
        return envelope();
    } } as any;
    const service = new SubsonicLibraryService("p", endpoints, client);
    assert.equal((await service.createPlaylist("新歌单")).id, "pl");
    assert.equal((await service.updatePlaylist("pl", { name: "已重命名" })).name, "已重命名");
    rejectDelete = true;
    await assert.rejects(service.deletePlaylist("pl"), /delete rejected/);
    assert.deepEqual(calls, ["createPlaylist", "updatePlaylist", "getPlaylist", "deletePlaylist"]);
});

test("封面失败返回空占位，销毁时撤销缓存 Object URL", async () => {
    const context = { baseUrl: "x", kind: "local", generation: 1, signal: new AbortController().signal };
    const endpoints = { executeRead: async (op: any) => op(context) } as any;
    const client = { buildUrl: () => "http://cover" } as any;
    const unavailable = new SubsonicCoverService(endpoints, client, 2, async () => ({ status: 404, body: "", contentType: "", elapsed: 1, headers: {}, url: "" }) as any);
    assert.equal(await unavailable.load("missing", 256), undefined);

    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = ((url: string) => { revoked.push(url); originalRevoke(url); }) as typeof URL.revokeObjectURL;
    try {
        const cached = new SubsonicCoverService(endpoints, client, 2, async () => ({ status: 200, body: "AQID", contentType: "image/png", elapsed: 1, headers: {}, url: "" }) as any);
        const objectUrl = await cached.load("cover", 256);
        cached.destroy();
        assert.ok(objectUrl);
        assert.deepEqual(revoked, [objectUrl]);
    } finally {
        URL.revokeObjectURL = originalRevoke;
    }
});

test("indexBasedQueue 使用 currentIndex 保存并按索引恢复", async () => {
    const requests: Array<{ endpoint: string; params: any }> = [];
    const endpoints = {
        executeRead: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1 }),
        executeIdempotentWrite: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1 }),
    } as any;
    const client = { request: async (_base: string, _kind: string, endpoint: string, params: any) => { requests.push({ endpoint, params }); return envelope({ playQueueByIndex: { currentIndex: 1, position: 1200, entry: [{ id: "a", title: "A" }, { id: "b", title: "B" }] } }); } } as any;
    const service = new SubsonicLibraryService("p", endpoints, client);
    service.setIndexBasedQueueEnabled(true);
    const restored = await service.getPlayQueue();
    assert.equal(restored.current, "b");
    await service.savePlayQueue(["a", "b"], "b", 1200);
    assert.equal(requests[1].endpoint, "savePlayQueueByIndex");
    assert.equal(requests[1].params.currentIndex, 1);
    assert.equal(normalizePlayQueueByIndex(envelope({ playQueueByIndex: { currentIndex: 0, entry: { id: 9, title: "N" } } }) as any).current, "9");
});

test("标准播放队列整队替换并保留当前歌曲与毫秒进度", async () => {
    let captured: { endpoint: string; params: any } | undefined;
    const endpoints = {
        executeIdempotentWrite: async (op: any) => op({ baseUrl: "x", kind: "local", generation: 1 }),
    } as any;
    const client = { request: async (_base: string, _kind: string, endpoint: string, params: any) => { captured = { endpoint, params }; return envelope(); } } as any;
    const service = new SubsonicLibraryService("p", endpoints, client);
    await service.savePlayQueue(["a", "b"], "b", 3456);
    assert.deepEqual(captured, { endpoint: "savePlayQueue", params: { id: ["a", "b"], current: "b", position: 3456 } });
});

test("云端初始化以服务器队列为权威，旧组件歌曲不得套用服务器进度", () => {
    assert.deepEqual(resolveInitialCloudPlaybackState({
        currentTrackKey: "subsonic:p:server-song",
        positionMs: 45_678,
    }, "subsonic:p:stale-widget-song"), {
        currentTrackKey: "subsonic:p:server-song",
        positionSeconds: 45.678,
        restoredFromServer: true,
    });
    assert.deepEqual(resolveInitialCloudPlaybackState(undefined, "subsonic:p:widget-song"), {
        currentTrackKey: "subsonic:p:widget-song",
        positionSeconds: 0,
        restoredFromServer: false,
    });
    assert.deepEqual(resolveInitialCloudPlaybackState({ positionMs: 99_000 }, "subsonic:p:widget-song"), {
        currentTrackKey: "subsonic:p:widget-song",
        positionSeconds: 0,
        restoredFromServer: false,
    });
});

test("云端队列清空与移除只在播放存活时保留当前歌曲", () => {
    assert.deepEqual(normalizeCloudQueueAfterMutation(["a", "a", "b"], undefined, false), ["a", "b"]);
    assert.deepEqual(normalizeCloudQueueAfterMutation([], "current", false), []);
    assert.deepEqual(normalizeCloudQueueAfterMutation([], "current", true), ["current"]);
    assert.deepEqual(normalizeCloudQueueAfterMutation(["next", "next"], "current", true), ["next", "current"]);
    assert.deepEqual(normalizeCloudQueueAfterMutation(["next"], "current", false), ["next"]);
});

test("云端队列保存游标只能指向队列成员", () => {
    assert.deepEqual(resolveCloudQueueSaveCursor(["a", "b"], "b", "song-b", 12.3456), {
        currentId: "song-b",
        positionMs: 12_346,
    });
    assert.deepEqual(resolveCloudQueueSaveCursor(["a"], "b", "song-b", 12), {});
    assert.deepEqual(resolveCloudQueueSaveCursor([], "b", "song-b", 12), {});
});

test("播放队列同步采用 debounce，取消后不会迟到写入", async () => {
    const calls: string[] = [];
    const scheduler = new MusicCloudQueueSaveScheduler(10);
    scheduler.schedule(async () => { calls.push("old"); }, () => {});
    scheduler.schedule(async () => { calls.push("latest"); }, () => {});
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(calls, ["latest"]);
    scheduler.schedule(async () => { calls.push("cancelled"); }, () => {});
    scheduler.cancel();
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(calls, ["latest"]);
});

test("播放队列慢请求严格串行，并在重连取消后保留最新保存", async () => {
    const calls: string[] = [];
    let releaseOld!: () => void;
    let running = 0;
    let maxRunning = 0;
    const scheduler = new MusicCloudQueueSaveScheduler(1);
    scheduler.schedule(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        calls.push("old:start");
        await new Promise<void>((resolve) => { releaseOld = resolve; });
        calls.push("old:end");
        running -= 1;
    }, () => {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    scheduler.schedule(async () => { calls.push("superseded"); }, () => {});
    scheduler.cancel();
    scheduler.schedule(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        calls.push("fresh");
        running -= 1;
    }, () => {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(calls, ["old:start"]);
    releaseOld();
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.deepEqual(calls, ["old:start", "old:end", "fresh"]);
    assert.equal(maxRunning, 1);
});

test("桌面 HTTP 音频中继真实转发 Range、状态与字节流", async () => {
    const upstream = createServer((request, response) => {
        assert.equal(request.headers.range, "bytes=2-5");
        response.writeHead(206, {
            "accept-ranges": "bytes",
            "content-range": "bytes 2-5/10",
            "content-type": "audio/mpeg",
        });
        response.end("cdef");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address();
    assert.ok(address && typeof address === "object");
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "https:" } });
    const relay = new DesktopMusicStreamRelay(createRequire(import.meta.url));
    try {
        const wrapped = await relay.wrap({
            url: `http://127.0.0.1:${address.port}/audio`,
            format: "mp3",
            html5: true,
        }, true);
        assert.match(wrapped.url, /^http:\/\/127\.0\.0\.1:\d+\/stream\//);
        assert.doesNotMatch(wrapped.url, /\/audio/);
        const response = await fetch(wrapped.url, { headers: { range: "bytes=2-5" } });
        assert.equal(response.status, 206);
        assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
        assert.equal(await response.text(), "cdef");
        wrapped.dispose?.();
        assert.equal((await fetch(wrapped.url)).status, 404);
    } finally {
        relay.destroy();
        await new Promise<void>((resolve) => upstream.close(() => resolve()));
        if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
        else Reflect.deleteProperty(globalThis, "location");
    }
});

test("非幂等播放列表创建不会在未知结果时自动重试", async () => {
    let calls = 0;
    const endpoints = { executeNonIdempotentWrite: async (op: any) => { calls += 1; return op({ baseUrl: "x", kind: "local", generation: 1 }); } } as any;
    const client = { request: async () => { throw new Error("network lost"); } } as any;
    const service = new SubsonicLibraryService("p", endpoints, client);
    await assert.rejects(service.createPlaylist("P"));
    assert.equal(calls, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { safeParseMusicPlayerConfig } from "./musicPlayerUtils";
import { getTrackKey } from "./musicTrackIdentity";
import { MusicCloudSettingsStore, normalizeCloudBaseUrl } from "./musicCloudSettingsStore";
import { createSubsonicAuthParams, createSubsonicToken } from "./subsonic/subsonicAuth";
import { buildSubsonicUrl, redactSubsonicUrl } from "./subsonic/subsonicUrl";
import { areLikelySameSubsonicServer, asArray, normalizeExtensions, normalizeMusicFolderSignature, normalizeSearchResult, parseSubsonicEnvelope } from "./subsonic/subsonicResponse";
import { SubsonicError } from "./subsonic/subsonicErrors";
import { SubsonicEndpointManager } from "./subsonic/subsonicEndpointManager";
import type { MusicTrack } from "./musicPlayerTypes";
import { setKbSensitiveSecretCryptoPlugin } from "../../../../../features/kb/services/settings/kb-sensitive-secret-crypto";
import { resolveSubsonicPlaybackSource } from "./subsonic/subsonicPlayback";
import { SubsonicClient } from "./subsonic/subsonicClient";
import { SubsonicCoverService } from "./subsonic/subsonicCoverService";
import { getMusicSourceRuntimePolicy, isAudioUnlockRequired, resolveLocalPlaybackSource, resolveMusicSourceKindForRuntime, resolveReliablePlaybackDuration } from "./musicSourceTypes";
import { MusicStreamFailoverGuard } from "./musicStreamFailoverGuard";
import { assertMusicStreamTransportAllowed, needsDesktopMusicStreamRelay } from "./musicStreamRelay";
import { MOBILE_QUICK_ACTION_DEFINITIONS, normalizeMobileQuickActionItems } from "../../../../../homepage/mobileQuickActions/mobileQuickActionsConfig";
import { registerPersistentMobileMusicPlayer, requestOpenMobileMusicPlayer } from "./musicMobilePlayerBridge";
import { clearMusicPlaybackPresence, publishMusicPlaybackPresence, subscribeMusicPlaybackPresence } from "./musicPlaybackPresence";

function localTrack(): MusicTrack {
    return {
        sourceKind: "local", filePath: "C:\\Music\\歌.mp3", fileUrl: "file:///C:/Music/song.mp3",
        fileName: "歌.mp3", baseName: "歌", ext: ".mp3", size: 123, mtimeMs: 456,
        title: "歌", artist: "", album: "", duration: 0, lyrics: [], lyricsStatus: "pending", metadataStatus: "pending",
    };
}

test("旧播放器配置保持 local 默认值", () => {
    const parsed = safeParseMusicPlayerConfig(JSON.stringify({ data: { musicFolderPath: "x" } }));
    assert.equal(parsed.sourceMode, "local");
    assert.equal(parsed.cloudStreamQuality, "original");
});

test("云端配置与移动质量可以解析", () => {
    const parsed = safeParseMusicPlayerConfig(JSON.stringify({ data: { sourceMode: "subsonic", cloudStreamQuality: "192", cloudTranscodeFormat: "mp3" } }));
    assert.equal(parsed.sourceMode, "subsonic");
    assert.equal(parsed.cloudStreamQuality, "192");
});

test("移动端云端来源不启用 Electron 文件系统，本地来源给出不可初始化策略", () => {
    assert.equal(resolveMusicSourceKindForRuntime("local", true), "subsonic");
    assert.equal(resolveMusicSourceKindForRuntime("local", false), "local");
    assert.deepEqual(getMusicSourceRuntimePolicy("subsonic", false), {
        canInitialize: true,
        useElectronLocalFileSystem: false,
    });
    assert.deepEqual(getMusicSourceRuntimePolicy("local", false), {
        canInitialize: false,
        useElectronLocalFileSystem: false,
    });
    assert.deepEqual(getMusicSourceRuntimePolicy("local", true), {
        canInitialize: true,
        useElectronLocalFileSystem: true,
    });
});

test("移动悬浮快捷按钮包含可排序开关的 NAS 音乐播放器入口", () => {
    const normalized = normalizeMobileQuickActionItems([
        { id: "mobile-homepage", enabled: true, order: 0 },
    ]);
    const music = normalized.find((item) => item.id === "music-player");
    assert.ok(music);
    assert.equal(music.enabled, true);
    assert.ok(music.order > 0);
    assert.equal(MOBILE_QUICK_ACTION_DEFINITIONS.find((item) => item.id === "music-player")?.icon, "headphones");
});

test("移动音乐快捷请求优先交给插件级常驻播放器", () => {
    let calls = 0;
    const unregister = registerPersistentMobileMusicPlayer((request) => {
        calls += 1;
        request.handled = true;
    });
    try {
        const request = requestOpenMobileMusicPlayer();
        assert.equal(request.handled, true);
        assert.equal(calls, 1);
    } finally {
        unregister();
    }
});

test("插件级播放状态可驱动悬浮按钮动效并在销毁时清除", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeMusicPlaybackPresence((presence) => seen.push(presence.isPlaying));
    publishMusicPlaybackPresence({ isPlaying: true });
    clearMusicPlaybackPresence();
    unsubscribe();
    assert.deepEqual(seen.slice(-3), [false, true, false]);
});

test("移动音频手势限制可单独识别，不进入流地址故障重试", () => {
    assert.equal(isAudioUnlockRequired("NotAllowedError: play() failed because the user didn't interact"), true);
    assert.equal(isAudioUnlockRequired("network timeout"), false);
});

test("NAS 流媒体总时长无效时使用曲库元数据，保证进度条可拖动", () => {
    assert.equal(resolveReliablePlaybackDuration(Number.POSITIVE_INFINITY, 272), 272);
    assert.equal(resolveReliablePlaybackDuration(Number.NaN, 272), 272);
    assert.equal(resolveReliablePlaybackDuration(0, 272), 272);
    assert.equal(resolveReliablePlaybackDuration(271.8, 272), 271.8);
    assert.equal(resolveReliablePlaybackDuration(Number.POSITIVE_INFINITY, 0), 0);
});

test("本地播放源保持 file URL 且不启用 HTML5 流模式", () => {
    assert.deepEqual(resolveLocalPlaybackSource(localTrack()), {
        url: "file:///C:/Music/song.mp3",
        html5: false,
    });
    assert.throws(() => resolveLocalPlaybackSource({ ...localTrack(), fileUrl: undefined }), /文件地址无效/);
});

test("流中断只允许每首歌切换一次地址并保留 seek 位置", () => {
    const guard = new MusicStreamFailoverGuard();
    assert.deepEqual(guard.begin("song", 42.5, 40), { allowed: true, resumeAt: 42.5 });
    assert.deepEqual(guard.begin("song", 43, 40), { allowed: false, resumeAt: 43 });
    guard.reset();
    assert.deepEqual(guard.begin("song", Number.NaN, 41), { allowed: true, resumeAt: 41 });
});

test("HTTPS 页面上的桌面 HTTP 音频使用 loopback 流转发，移动端要求 HTTPS", () => {
    assert.equal(needsDesktopMusicStreamRelay("https:", "http://nas/stream", true), true);
    assert.equal(needsDesktopMusicStreamRelay("http:", "http://nas/stream", true), false);
    assert.equal(needsDesktopMusicStreamRelay("https:", "https://nas/stream", true), false);
    assert.doesNotThrow(() => assertMusicStreamTransportAllowed("https:", "http://nas/stream", true));
    assert.throws(() => assertMusicStreamTransportAllowed("https:", "http://nas/stream", false), /配置 HTTPS/);
});

test("URL 规范化保留 base path、IPv6 并拒绝危险协议", () => {
    assert.equal(normalizeCloudBaseUrl(" 192.168.1.2:4533/navidrome/ ", "local", { addLocalHttpScheme: true }).url, "http://192.168.1.2:4533/navidrome");
    assert.equal(normalizeCloudBaseUrl("http://[::1]:4533/", "local").url, "http://[::1]:4533");
    assert.equal(normalizeCloudBaseUrl("http://music.example.com", "remote").warning, "remote_http");
    assert.throws(() => normalizeCloudBaseUrl("file:///tmp/music", "remote"));
    assert.throws(() => normalizeCloudBaseUrl("https://user:pass@example.com", "remote"));
});

test("本地 track key 字节级沿用旧 DJB2，云端 key 不依赖地址", () => {
    assert.equal(getTrackKey(localTrack()), "f3769a32");
    const cloud = { ...localTrack(), sourceKind: "subsonic" as const, sourceProfileId: "p1", sourceTrackId: String(123) };
    assert.equal(getTrackKey(cloud), "subsonic:p1:123");
});

test("token auth 使用 UTF-8 MD5、小写 hex 与不同 salt", () => {
    assert.equal(createSubsonicToken("密码", "abcdef"), "46edd57737f88c51b4cd70f2299bd16b");
    const one = createSubsonicAuthParams("用户", "密码");
    const two = createSubsonicAuthParams("用户", "密码");
    assert.ok(one.s.length >= 6);
    assert.notEqual(one.s, two.s);
    assert.match(one.t, /^[a-f\d]{32}$/);
});

test("认证 URL 不含明文密码且可安全脱敏", () => {
    const url = buildSubsonicUrl("https://music.example.com/navidrome", "ping", {}, { username: "user", password: "secret" });
    assert.equal(url.includes("secret"), false);
    const redacted = redactSubsonicUrl(url);
    for (const key of ["u=", "t=", "s=", "p="]) assert.equal(redacted.includes(key), false);
    assert.match(redacted, /\/navidrome\/rest\/ping\.view/);
});

test("响应校验、singleton 数组和 ID 字符串化", () => {
    assert.deepEqual(asArray({ id: 1 }), [{ id: 1 }]);
    const envelope = parseSubsonicEnvelope({ "subsonic-response": { status: "ok", searchResult3: { song: { id: 42, title: "A" } } } });
    const result = normalizeSearchResult(envelope);
    assert.equal(result.songs[0].id, "42");
    assert.deepEqual(result.albums, []);
    assert.throws(() => normalizeSearchResult({ status: "ok", version: "1.16.1", searchResult3: { song: { title: "missing id" } } } as any), (error: any) => error.category === "server_response_invalid");
    assert.throws(() => parseSubsonicEnvelope("not-json"), SubsonicError);
    assert.throws(() => parseSubsonicEnvelope({ "subsonic-response": { status: "failed", error: { code: 40 } } }), /用户名或密码/);
});

test("SubsonicClient 同时检查 HTTP 与协议错误", async () => {
    const response = (status: number, body: string) => async () => ({ status, body, bodyEncoding: "text", contentType: "application/json", elapsed: 1, headers: {}, url: "x" });
    const ok = new SubsonicClient({ username: "u", password: "p" }, response(200, JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1" } })) as any);
    assert.equal((await ok.request("http://server", "local", "ping")).status, "ok");
    const auth = new SubsonicClient({ username: "u", password: "p" }, response(200, JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 40 } } })) as any);
    await assert.rejects(auth.request("http://server", "local", "ping"), /用户名或密码/);
    const transient = new SubsonicClient({ username: "u", password: "p" }, response(503, "") as any);
    await assert.rejects(transient.request("http://server", "local", "ping"), (error: any) => error.category === "server_transient");
});

test("OpenSubsonic 扩展按官方数组响应解析", () => {
    const envelope = parseSubsonicEnvelope({ "subsonic-response": { status: "ok", openSubsonicExtensions: [{ name: "songLyrics", versions: [1, 2] }] } });
    assert.deepEqual(normalizeExtensions(envelope), [{ name: "songLyrics", versions: [1, 2] }]);
});

test("同服务器判断忽略音乐文件夹顺序，并识别类型、版本或目录差异", () => {
    const local = { apiVersion: "1.16.1", type: "navidrome", serverVersion: "0.63.2", openSubsonic: true };
    const remote = { ...local };
    const first = normalizeMusicFolderSignature({ status: "ok", version: "1.16.1", musicFolders: { musicFolder: [{ id: 2, name: "B" }, { id: 1, name: "A" }] } } as any);
    const second = normalizeMusicFolderSignature({ status: "ok", version: "1.16.1", musicFolders: { musicFolder: [{ id: 1, name: "A" }, { id: 2, name: "B" }] } } as any);
    assert.equal(first, second);
    assert.equal(areLikelySameSubsonicServer(local, remote, first, second), true);
    assert.equal(areLikelySameSubsonicServer(local, { ...remote, serverVersion: "0.64.0" }, first, second), false);
    assert.equal(areLikelySameSubsonicServer(local, remote, first, "9:Other"), false);
    assert.equal(areLikelySameSubsonicServer({ apiVersion: "1.16.1", openSubsonic: false }, { apiVersion: "1.16.1", openSubsonic: false }), true);
});

test("共享配置加密落盘、空密码保留且 profile id 稳定", async () => {
    const files = new Map<string, any>();
    const plugin = { loadData: async (key: string) => files.get(key), saveData: async (key: string, value: any) => { files.set(key, value); } };
    setKbSensitiveSecretCryptoPlugin(plugin);
    const store = new MusicCloudSettingsStore(plugin);
    await store.load();
    const first = await store.saveProfile({ localBaseUrl: "192.168.1.2:4533", username: "user", password: "秘密" });
    assert.equal(JSON.stringify(files.get("music-player-cloud-settings-v1.json")).includes("秘密"), false);
    assert.match(first.encryptedPassword, /^enc:v1:/);
    const second = await store.saveProfile({ localBaseUrl: first.localBaseUrl, username: "user", password: "" });
    assert.equal(second.id, first.id);
    assert.equal(second.encryptedPassword, first.encryptedPassword);
    assert.equal(await store.getPassword(), "秘密");
    const cleared = await store.saveProfile({ localBaseUrl: first.localBaseUrl, username: "user", clearPassword: true });
    assert.equal(cleared.encryptedPassword, "");
    assert.equal(await store.getPassword(), "");
});

test("读取共享配置时再次拒绝危险 URL 与明文密码", async () => {
    const badUrlPlugin = { loadData: async () => ({ profile: { id: "p", localBaseUrl: "file:///tmp/music", username: "u", encryptedPassword: "enc:v1:x:y" } }) };
    assert.equal((await new MusicCloudSettingsStore(badUrlPlugin).load()).profile, null);
    const plainPlugin = { loadData: async () => ({ profile: { id: "p", localBaseUrl: "http://server", username: "u", encryptedPassword: "plaintext" } }) };
    assert.equal((await new MusicCloudSettingsStore(plainPlugin).load()).profile, null);
    const passwordFieldPlugin = { loadData: async () => ({ profile: { id: "p", localBaseUrl: "http://server", username: "u", password: "plaintext" } }) };
    assert.equal((await new MusicCloudSettingsStore(passwordFieldPlugin).load()).profile, null);
});

test("EndpointManager 本地失败后远程接管，认证失败不用于读请求切换", async () => {
    const calls: string[] = [];
    const fakeClient = {
        async request(baseUrl: string) {
            calls.push(baseUrl);
            if (baseUrl.includes("local")) throw new SubsonicError("network_timeout", "timeout");
            return { status: "ok", version: "1.16.1", type: "navidrome", serverVersion: "1" };
        },
    };
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, fakeClient as any);
    const state = await manager.initialize();
    assert.equal(state.activeKind, "remote");
    assert.deepEqual(calls, ["http://local", "https://remote"]);
    await assert.rejects(
        manager.executeRead(async () => { throw new SubsonicError("auth_failed", "bad auth"); }),
        /bad auth/,
    );
    assert.equal(manager.getState().activeKind, "remote");
    manager.destroy();
});

test("EndpointManager 本地认证失败不会探测远程", async () => {
    const calls: string[] = [];
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request(baseUrl: string) { calls.push(baseUrl); throw new SubsonicError("auth_failed", "bad auth"); },
    } as any);
    await assert.rejects(manager.initialize(), /不会继续自动切换/);
    assert.deepEqual(calls, ["http://local"]);
    manager.destroy();
});

test("EndpointManager 仅远程配置认证失败时保留明确错误", async () => {
    const manager = new SubsonicEndpointManager({ remoteBaseUrl: "https://remote" }, {
        async request() { throw new SubsonicError("auth_failed", "bad auth"); },
    } as any);
    await assert.rejects(manager.initialize(), (error: any) => error.category === "auth_failed" && /用户名或密码/.test(error.message));
    assert.equal(manager.getState().remote.status, "auth_error");
    manager.destroy();
});

test("EndpointManager 本地成功立即返回，不等待后台远程探测", async () => {
    let releaseRemote!: () => void;
    let remoteStarted = false;
    const remoteGate = new Promise<void>((resolve) => { releaseRemote = resolve; });
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request(baseUrl: string) {
            if (baseUrl.includes("remote")) { remoteStarted = true; await remoteGate; }
            return { status: "ok", version: "1.16.1", type: "server", serverVersion: "1" };
        },
    } as any);
    const state = await manager.initialize();
    assert.equal(state.activeKind, "local");
    assert.equal(remoteStarted, true);
    releaseRemote();
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.destroy();
});

test("EndpointManager 5xx 读取只回退一次，第二个地址失败后直接返回错误", async () => {
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request() { return { status: "ok", version: "1.16.1" }; },
    } as any);
    await manager.initialize();
    const attempted: string[] = [];
    await assert.rejects(manager.executeRead(async (ctx) => {
        attempted.push(ctx.kind);
        throw new SubsonicError("server_transient", `${ctx.kind} 503`);
    }), /remote 503/);
    assert.deepEqual(attempted, ["local", "remote"]);
    assert.equal(manager.getState().activeKind, "remote");
    manager.destroy();
});

test("EndpointManager 支持仅本地、仅远程，并在双离线时结束加载", async () => {
    const onlineClient = { async request() { return { status: "ok", version: "1.16.1" }; } } as any;
    const localOnly = new SubsonicEndpointManager({ localBaseUrl: "http://local" }, onlineClient);
    assert.equal((await localOnly.initialize()).activeKind, "local");
    localOnly.destroy();
    const remoteOnly = new SubsonicEndpointManager({ remoteBaseUrl: "https://remote" }, onlineClient);
    assert.equal((await remoteOnly.initialize()).activeKind, "remote");
    remoteOnly.destroy();

    const calls: string[] = [];
    const offline = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request(baseUrl: string) { calls.push(baseUrl); throw new SubsonicError("network_error", "offline"); },
    } as any);
    await assert.rejects(offline.initialize(), /均连接失败/);
    assert.deepEqual(calls, ["http://local", "https://remote"]);
    assert.equal(offline.getState().local.status, "offline");
    assert.equal(offline.getState().remote.status, "offline");
    offline.destroy();
});

test("EndpointManager 远程激活后可在网络恢复检查中切回本地", async () => {
    let localOnline = false;
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request(baseUrl: string) {
            if (baseUrl.includes("local") && !localOnline) throw new SubsonicError("network_error", "offline");
            return { status: "ok", version: "1.16.1" };
        },
    } as any);
    assert.equal((await manager.initialize()).activeKind, "remote");
    localOnline = true;
    await manager.refreshConnection();
    assert.equal(manager.getState().activeKind, "local");
    manager.destroy();
});

test("EndpointManager 销毁时取消活动请求并丢弃迟到响应", async () => {
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local" }, {
        async request() { return { status: "ok", version: "1.16.1" }; },
    } as any);
    await manager.initialize();
    let release!: () => void;
    const pending = manager.executeRead(async (ctx) => {
        await new Promise<void>((resolve) => { release = resolve; });
        return ctx.signal.aborted ? "aborted" : "late";
    });
    manager.destroy();
    release();
    await assert.rejects(pending, (error: any) => error.category === "request_aborted");
});

test("EndpointManager 切换地址后不接受旧 generation 的迟到响应", async () => {
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request() { return { status: "ok", version: "1.16.1" }; },
    } as any);
    await manager.initialize();
    let release!: () => void;
    const pending = manager.executeRead(async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        return "stale";
    });
    await manager.forceAlternate();
    release();
    await assert.rejects(pending, (error: any) => error.category === "request_aborted");
    assert.equal(manager.getState().activeKind, "remote");
    manager.destroy();
});

test("流故障按实际流来源选择备用地址，不受后台 API 已切换影响", async () => {
    const calls: string[] = [];
    const manager = new SubsonicEndpointManager({ localBaseUrl: "http://local", remoteBaseUrl: "https://remote" }, {
        async request(baseUrl: string) { calls.push(baseUrl); return { status: "ok", version: "1.16.1" }; },
    } as any);
    await manager.initialize();
    await manager.forceAlternate();
    assert.equal(manager.getState().activeKind, "remote");
    const callsBeforeStreamRecovery = calls.length;
    const recovered = await manager.forceAlternate("local");
    assert.equal(recovered.kind, "remote");
    assert.equal(manager.getState().activeKind, "remote");
    assert.equal(calls.length, callsBeforeStreamRecovery);
    manager.destroy();
});

test("云端播放解析原始质量与 192 kbps，认证 URL 每次刷新", async () => {
    const track = { ...localTrack(), sourceKind: "subsonic" as const, sourceProfileId: "p1", sourceTrackId: "song", ext: ".flac" };
    const context = { baseUrl: "http://local", kind: "local" as const, generation: 1, signal: new AbortController().signal };
    const builder = (params: Record<string, string | number>) => buildSubsonicUrl("http://local", "stream", params, { username: "u", password: "pw" });
    const first = resolveSubsonicPlaybackSource(builder, context, track, "original");
    const second = resolveSubsonicPlaybackSource(builder, context, track, "original");
    assert.equal(first.html5, true); assert.equal(first.format, "flac"); assert.match(first.url, /format=raw/); assert.notEqual(first.url, second.url);
    const source = resolveSubsonicPlaybackSource(builder, { ...context, generation: 2 }, track, "192");
    assert.equal(source.format, "mp3"); assert.match(source.url, /maxBitRate=192/);
});

test("封面服务命中缓存、执行 LRU 并且不暴露认证 URL", async () => {
    let calls = 0;
    const manager = { executeRead: async (operation: any) => operation({ baseUrl: "http://local", kind: "local", generation: 1 }) } as any;
    const client = { buildUrl: (_base: string, _endpoint: string, params: any) => `http://cover/${params.id}?u=secret&t=token` } as any;
    const proxy = async () => { calls += 1; return { status: 200, body: "AQID", bodyEncoding: "base64", contentType: "image/png", elapsed: 1, headers: {}, url: "" }; };
    const service = new SubsonicCoverService(manager, client, 1, proxy as any);
    const first = await service.load("a", 256);
    assert.equal(await service.load("a", 256), first);
    assert.equal(calls, 1);
    await service.load("b", 256);
    await service.load("a", 256);
    assert.equal(calls, 3);
    assert.equal(String(first).includes("secret"), false);
    service.destroy();
});

test("封面 503 会按读取请求策略切换地址一次", async () => {
    let calls = 0;
    const manager = { executeRead: async (operation: any) => { try { return await operation({ baseUrl: "http://local", kind: "local", generation: 1 }); } catch (error: any) { assert.equal(error.category, "server_transient"); return operation({ baseUrl: "https://remote", kind: "remote", generation: 2 }); } } } as any;
    const client = { buildUrl: (base: string) => `${base}/cover` } as any;
    const proxy = async () => { calls += 1; return { status: calls === 1 ? 503 : 200, body: calls === 1 ? "" : "AQID", contentType: "image/png", elapsed: 1, headers: {}, url: "" }; };
    const service = new SubsonicCoverService(manager, client, 2, proxy as any);
    assert.ok(await service.load("cover", 256));
    assert.equal(calls, 2);
    service.destroy();
});

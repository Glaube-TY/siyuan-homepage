<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { MusicCloudSettingsStore, normalizeCloudBaseUrl, type MusicCloudProfile } from "./musicCloudSettingsStore";
    import { SubsonicClient } from "./subsonic/subsonicClient";
    import { areLikelySameSubsonicServer, normalizeExtensions, normalizeMusicFolderSignature, normalizeServerInfo } from "./subsonic/subsonicResponse";
    import { publishMusicCloudConnectionStatus } from "./musicCloudConnectionStatus";

    interface Props { plugin: any; onClose: () => void; onSaved?: (profile: MusicCloudProfile) => void; }
    let { plugin, onClose, onSaved = () => {} }: Props = $props();

    let store: MusicCloudSettingsStore;
    let localBaseUrl = $state("");
    let remoteBaseUrl = $state("");
    let username = $state("");
    let password = $state("");
    let hasSavedPassword = $state(false);
    let clearSavedPassword = $state(false);
    let loading = $state(true);
    let testing = $state(false);
    let saving = $state(false);
    let remoteHttpWarning = $state(false);
    let sameServerWarning = $state("");
    let localStatus = $state("尚未测试");
    let remoteStatus = $state("尚未测试");
    let activeStatus = $state("尚未选择");
    let serverSummary = $state("");

    onMount(async () => {
        store = new MusicCloudSettingsStore(plugin);
        const data = await store.load();
        const profile = data.profile;
        if (profile) {
            localBaseUrl = profile.localBaseUrl;
            remoteBaseUrl = profile.remoteBaseUrl;
            username = profile.username;
            hasSavedPassword = !!profile.encryptedPassword;
            remoteHttpWarning = /^http:/i.test(profile.remoteBaseUrl);
        }
        loading = false;
    });

    async function credentials(): Promise<{ username: string; password: string }> {
        const effectivePassword = password || (hasSavedPassword ? await store.getPassword() : "");
        if (!username.trim() || !effectivePassword) throw new Error("请输入用户名和密码。" );
        return { username: username.trim(), password: effectivePassword };
    }

    function normalized(kind: "local" | "remote"): string {
        const raw = kind === "local" ? localBaseUrl : remoteBaseUrl;
        return normalizeCloudBaseUrl(raw, kind, { addLocalHttpScheme: kind === "local" }).url;
    }

    async function probe(kind: "local" | "remote") {
        const baseUrl = normalized(kind);
        if (!baseUrl) throw new Error(kind === "local" ? "未配置本地地址。" : "未配置远程地址。" );
        const client = new SubsonicClient(await credentials());
        const startedAt = Date.now();
        const envelope = await client.request(baseUrl, kind, "ping", {}, { timeoutMs: kind === "local" ? 1500 : 5000 });
        const latency = Date.now() - startedAt;
        const info = normalizeServerInfo(envelope);
        let extensionCount = 0;
        try {
            extensionCount = normalizeExtensions(await client.request(baseUrl, kind, "getOpenSubsonicExtensions", {}, { timeoutMs: 5000 })).length;
        } catch { /* Core Subsonic 仍可用 */ }
        return { baseUrl, info, extensionCount, latency, client };
    }

    function safeFailure(error: unknown): string {
        return error instanceof Error ? error.message : "连接失败";
    }

    function publishStatus() {
        publishMusicCloudConnectionStatus({
            activeLabel: activeStatus,
            localStatus,
            remoteStatus,
            serverSummary,
            checkedAt: Date.now(),
        });
    }

    async function testOne(kind: "local" | "remote") {
        if (testing) return;
        testing = true;
        try {
            const result = await probe(kind);
            const text = `在线 · ${result.latency} ms`;
            if (kind === "local") localStatus = text; else remoteStatus = text;
            activeStatus = kind === "local" ? "本地地址" : "远程地址";
            serverSummary = `${result.info.type || "Subsonic"} ${result.info.serverVersion || ""} · API ${result.info.apiVersion || "未知"} · OpenSubsonic 扩展 ${result.extensionCount}`;
        } catch (error) {
            if (kind === "local") localStatus = safeFailure(error); else remoteStatus = safeFailure(error);
        } finally { testing = false; publishStatus(); }
    }

    async function musicFolderSignature(result: Awaited<ReturnType<typeof probe>>): Promise<string> {
        try {
            const envelope = await result.client.request(result.baseUrl, result.baseUrl === normalized("local") ? "local" : "remote", "getMusicFolders");
            return normalizeMusicFolderSignature(envelope);
        } catch { return ""; }
    }

    async function smartTest() {
        if (testing) return;
        testing = true;
        sameServerWarning = "";
        let localResult: Awaited<ReturnType<typeof probe>> | null = null;
        let remoteResult: Awaited<ReturnType<typeof probe>> | null = null;
        try {
            if (localBaseUrl.trim()) {
                try { localResult = await probe("local"); localStatus = `在线 · ${localResult.latency} ms`; }
                catch (error) { localStatus = safeFailure(error); }
            }
            if (!localResult && remoteBaseUrl.trim()) {
                try { remoteResult = await probe("remote"); remoteStatus = `在线 · ${remoteResult.latency} ms`; }
                catch (error) { remoteStatus = safeFailure(error); }
            } else if (localResult && remoteBaseUrl.trim()) {
                try { remoteResult = await probe("remote"); remoteStatus = `在线 · ${remoteResult.latency} ms`; }
                catch (error) { remoteStatus = safeFailure(error); }
            }
            const active = localResult || remoteResult;
            if (!active) throw new Error("NAS 音乐服务当前不可用。本地地址与远程地址均连接失败。" );
            activeStatus = localResult ? "本地地址" : "远程地址";
            serverSummary = `${active.info.type || "Subsonic"} ${active.info.serverVersion || ""} · API ${active.info.apiVersion || "未知"} · OpenSubsonic 扩展 ${active.extensionCount}`;
            if (localResult && remoteResult) {
                const [localFolders, remoteFolders] = await Promise.all([musicFolderSignature(localResult), musicFolderSignature(remoteResult)]);
                if (!areLikelySameSubsonicServer(localResult.info, remoteResult.info, localFolders, remoteFolders)) {
                    sameServerWarning = "本地地址与远程地址可能不是同一音乐服务器，自动切换后歌曲 ID 可能无法对应。";
                }
            }
        } catch (error) { showMessage(safeFailure(error), 5000); }
        finally { testing = false; publishStatus(); }
    }

    async function save() {
        if (saving) return;
        saving = true;
        try {
            localBaseUrl = normalized("local");
            remoteBaseUrl = normalized("remote");
            const profile = await store.saveProfile({ localBaseUrl, remoteBaseUrl, username, password, clearPassword: clearSavedPassword && !password });
            onSaved(profile);
            showMessage("NAS 音乐服务配置已保存");
            onClose();
        } catch (error) { showMessage(safeFailure(error), 5000); }
        finally { saving = false; }
    }

    $effect(() => {
        try { remoteHttpWarning = normalizeCloudBaseUrl(remoteBaseUrl, "remote").warning === "remote_http"; }
        catch { remoteHttpWarning = false; }
    });
</script>

<div class="cloud-dialog">
    {#if loading}
        <p class="loading-text">正在读取配置…</p>
    {:else}
        <section class="connection-card" aria-label="服务器地址与账号">
            <label class="form-field">
                <span>本地地址</span>
                <input bind:value={localBaseUrl} onblur={() => { try { localBaseUrl = normalized("local"); } catch { /* 保存/测试时显示具体错误 */ } }} placeholder="http://192.168.1.20:4533" />
            </label>
            <label class="form-field">
                <span>远程地址</span>
                <input bind:value={remoteBaseUrl} onblur={() => { try { remoteBaseUrl = normalized("remote"); } catch { /* 保存/测试时显示具体错误 */ } }} placeholder="https://music.example.com" />
            </label>
            {#if remoteHttpWarning}<p class="warning field-message">远程访问建议使用 HTTPS。HTTP 仅适合受信任的 VPN/内网环境。</p>{/if}
            <label class="form-field">
                <span>用户名</span>
                <input bind:value={username} autocomplete="username" />
            </label>
            <label class="form-field">
                <span>密码</span>
                <input type="password" bind:value={password} autocomplete="new-password" placeholder={hasSavedPassword ? "已保存密码；留空则保持不变" : "请输入密码"} />
            </label>
            {#if hasSavedPassword}
                <div class="password-state">
                    <p class="hint">密码已安全保存，留空不会修改。</p>
                    <button class="clear-password" onclick={() => { clearSavedPassword = true; hasSavedPassword = false; password = ""; }}>清除密码</button>
                </div>
            {/if}
        </section>

        <div class="test-actions" aria-label="连接测试">
            <button class="b3-button b3-button--outline" disabled={testing} onclick={() => testOne("local")}>测试本地</button>
            <button class="b3-button b3-button--outline" disabled={testing} onclick={() => testOne("remote")}>测试远程</button>
            <button class="b3-button" disabled={testing} onclick={smartTest}>智能测试</button>
        </div>

        <section class="connection-result" aria-label="连接状态">
            <div><span>本地</span><strong>{localStatus}</strong></div>
            <div><span>远程</span><strong>{remoteStatus}</strong></div>
            <div><span>当前使用</span><strong>{activeStatus}</strong></div>
            {#if serverSummary}<p>服务器：{serverSummary}</p>{/if}
            {#if sameServerWarning}<p class="warning">{sameServerWarning}</p>{/if}
        </section>

        <div class="dialog-footer">
            <button class="b3-button b3-button--outline" onclick={onClose}>取消</button>
            <button class="b3-button" disabled={saving} onclick={save}>{saving ? "保存中…" : "保存"}</button>
        </div>
    {/if}
</div>

<style lang="scss">
    .cloud-dialog {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        min-width: 0;
        min-height: 100%;
        padding: 16px;
        box-sizing: border-box;
        overflow: auto;
        color: var(--b3-theme-on-background);
    }

    .loading-text { margin: auto; color: var(--b3-theme-on-surface-light); }

    .connection-card,
    .connection-result {
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: color-mix(in srgb, var(--b3-theme-surface) 72%, transparent);
        box-sizing: border-box;
    }

    .connection-card { display: grid; gap: 12px; }

    .form-field {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        min-width: 0;
    }

    .form-field > span {
        color: var(--b3-theme-on-surface);
        font-size: .88rem;
        white-space: nowrap;
    }

    input {
        width: 100%;
        min-width: 0;
        height: 36px;
        padding: 6px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-sizing: border-box;
    }

    input:focus {
        border-color: var(--b3-theme-primary);
        outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
    }

    .hint,
    .warning,
    .connection-result p {
        margin: 0;
        font-size: .8rem;
        line-height: 1.5;
    }

    .field-message { margin-left: 84px; }
    .hint { color: var(--b3-theme-on-surface-light); }
    .warning { color: var(--b3-card-warning-color, #d97706); }

    .password-state {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-left: 84px;
    }

    .clear-password {
        flex: none;
        padding: 3px 6px;
        border: 0;
        background: transparent;
        color: var(--b3-theme-error);
        cursor: pointer;
    }

    .test-actions,
    .dialog-footer {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .test-actions .b3-button { min-width: 92px; justify-content: center; }

    .connection-result {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
    }

    .connection-result > div {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        padding: 9px 10px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--b3-theme-background) 76%, transparent);
    }

    .connection-result span { color: var(--b3-theme-on-surface-light); font-size: .72rem; }
    .connection-result strong { overflow: hidden; text-overflow: ellipsis; font-size: .82rem; white-space: nowrap; }
    .connection-result p { grid-column: 1 / -1; overflow-wrap: anywhere; }

    .dialog-footer {
        justify-content: flex-end;
        margin-top: auto;
        padding-top: 2px;
    }

    .dialog-footer .b3-button { min-width: 78px; justify-content: center; }

    @media (max-width: 520px) {
        .cloud-dialog { padding: 12px; }
        .form-field { grid-template-columns: 1fr; gap: 5px; }
        .field-message,
        .password-state { margin-left: 0; }
        .connection-result { grid-template-columns: 1fr; }
        .test-actions .b3-button { flex: 1 1 calc(50% - 4px); }
        .dialog-footer { position: sticky; bottom: 0; padding: 10px 0 0; background: var(--b3-theme-background); }
    }
</style>

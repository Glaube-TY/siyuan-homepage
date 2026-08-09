<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import QRCode from "qrcode";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import RemoteAgentSessionsDialog from "../dialogs/RemoteAgentSessionsDialog.svelte";
    import RobotMessageLogDialog from "../dialogs/RobotMessageLogDialog.svelte";
    import { RobotKernelBridge, type KernelBridgeStatus } from "@/features/robot-assistant/runtime/robot-kernel-bridge";
    import { RobotSettingsClient, type RobotStatusSnapshot } from "@/features/robot-assistant/settings/robot-settings-client";
    import { createDefaultRobotAssistantSettings, type RobotAssistantSettings, type RobotRuntimeOwner } from "@/features/robot-assistant/settings/robot-settings-types";
    import type { RobotProviderId } from "@/features/robot-assistant/contracts/robot-provider";
    import type { RobotAssistantSubTab } from "../robotAssistantTabs";

    interface Props {
        plugin: any;
        advancedEnabled: boolean;
        activeSubTab: RobotAssistantSubTab;
    }
    let { plugin, advancedEnabled, activeSubTab }: Props = $props();

    let client = $state<RobotSettingsClient | null>(null);
    let kernelBridge: RobotKernelBridge | null = null;
    let settings = $state<RobotAssistantSettings>(structuredClone(createDefaultRobotAssistantSettings()));
    let statusText = $state("未连接");
    let modelText = $state("未配置");
    let runtimeDevice = $state<RobotRuntimeOwner | null>(null);
    let kernelStatus = $state<KernelBridgeStatus>("unavailable");
    let bootstrapState = $state<string>("idle");
    let loading = $state(true);
    let saving = $state(false);
    let isElectron = $state(false);
    let errorText = $state<string | null>(null);

    // 飞书 / QQ 凭证草稿（仅新输入时加密保存）
    let feishuSecretDraft = $state("");
    let qqSecretDraft = $state("");

    // 配对捕获
    let pairingEnabled = $state(false);
    let pairingProvider = $state<RobotProviderId | null>(null);
    let pairingCaptured = $state(false);
    let pairingSenderId = $state("");
    let pairingSenderName = $state("");
    let pairingChatId = $state("");

    // 白名单草稿
    let whitelistDraft = $state<Record<RobotProviderId, { senderIds: string; chatIds: string }>>({
        wechat: { senderIds: "", chatIds: "" },
        feishu: { senderIds: "", chatIds: "" },
        qq: { senderIds: "", chatIds: "" },
    });

    // 微信登录
    let wechatLogin = $state<{ status: string; qrcodeUrl: string; qrcodeContent: string; verifyCodeHint: boolean }>({
        status: "idle", qrcodeUrl: "", qrcodeContent: "", verifyCodeHint: false,
    });
    let wechatVerifyCodeDraft = $state("");
    let wechatQrDataUrl = $state("");
    let wechatQrError = $state("");
    let wechatLoginInitiated = $state(false);
    let wechatPollTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyFns: Array<() => void> = [];
    let kernelErrorLogged = false;

    const disabled = $derived(!advancedEnabled || loading || saving);

    function detectElectron(): boolean {
        try {
            return typeof (window as unknown as { require?: unknown }).require === "function";
        } catch {
            return false;
        }
    }

    function providerStatusText(provider: RobotProviderId): string {
        const status = providerStatusValue(provider);
        if (provider === "wechat" && status === "waiting_qr" && !wechatLoginInitiated) return "未绑定";
        return statusLabel(status);
    }

    function providerStatusValue(provider: RobotProviderId): string {
        const providers = (statusSnapshot?.providers ?? []) as Array<{ provider: RobotProviderId; status: string }>;
        return providers.find((item) => item.provider === provider)?.status ?? "offline";
    }

    function statusLabel(status: string): string {
        const labels: Record<string, string> = {
            ready: "已就绪", running: "运行中", standby: "其他设备运行中", stopped: "已停止", disabled: "已停用",
            offline: "离线", disconnected: "未连接", connecting: "连接中", connected: "已连接",
            reconnecting: "重连中", waiting_qr: "等待扫码", waiting_scan: "等待确认",
            waiting_verify_code: "等待验证码", reauth_required: "需要重新登录", error: "异常",
        };
        return labels[status] ?? status;
    }

    function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
        if (["ready", "running", "connected"].includes(status)) return "success";
        if (["standby", "connecting", "reconnecting", "waiting_qr", "waiting_scan", "waiting_verify_code"].includes(status)) return "warning";
        if (["error", "reauth_required"].includes(status)) return "danger";
        return "neutral";
    }

    async function renderWechatQr(content: string): Promise<void> {
        wechatQrDataUrl = "";
        wechatQrError = "";
        const normalized = content.trim();
        if (!normalized) {
            wechatQrError = "微信登录服务没有返回二维码内容，请重新登录。";
            return;
        }
        try {
            wechatQrDataUrl = await QRCode.toDataURL(normalized, {
                width: 256,
                margin: 2,
                errorCorrectionLevel: "M",
                color: { dark: "#142b27", light: "#ffffff" },
            });
        } catch {
            wechatQrError = "二维码生成失败，请重新登录。";
        }
    }
    let statusSnapshot = $state<RobotStatusSnapshot | null>(null);
    const wechatConnected = $derived(providerStatusValue("wechat") === "connected" || wechatLogin.status === "confirmed");
    const showWechatLoginPanel = $derived(wechatLoginInitiated && !wechatConnected && wechatLogin.status !== "idle");

    async function refreshStatus(): Promise<void> {
        if (!client) return;
        const snapshot = await client.getStatus();
        if (snapshot) {
            statusSnapshot = snapshot;
            runtimeDevice = snapshot.runtimeDevice ?? null;
            statusText = statusLabel(snapshot.status ?? "unknown");
            modelText = snapshot.model?.configured
                ? `${snapshot.model.providerId ?? snapshot.model.providerType ?? ""} / ${snapshot.model.modelId ?? ""}`
                : "未同步模型";
        }
    }

    async function refreshPairing(): Promise<void> {
        if (!client) return;
        const result = await client.getPairing();
        const pairing = result?.pairing as { enabled?: boolean; provider?: RobotProviderId; senderId?: string; senderName?: string; chatId?: string } | null;
        if (pairing && pairing.enabled) {
            pairingEnabled = true;
            pairingProvider = pairing.provider ?? null;
            pairingCaptured = Boolean(pairing.senderId);
            pairingSenderId = pairing.senderId ?? "";
            pairingSenderName = pairing.senderName ?? "";
            pairingChatId = pairing.chatId ?? "";
        } else {
            pairingEnabled = false;
            pairingProvider = null;
            pairingCaptured = false;
            pairingSenderId = "";
            pairingSenderName = "";
            pairingChatId = "";
        }
    }

    function syncWhitelistDraft(): void {
        const keys: RobotProviderId[] = ["wechat", "feishu", "qq"];
        for (const key of keys) {
            const admission = settings[key]?.admission;
            if (admission) {
                whitelistDraft[key].senderIds = admission.allowedSenderIds.join("\n");
                whitelistDraft[key].chatIds = admission.allowedChatIds.join("\n");
            }
        }
    }

    async function loadAll(): Promise<void> {
        if (!client) return;
        const loaded = await client.getSettings();
        settings = loaded;
        syncWhitelistDraft();
        await refreshStatus();
        await refreshPairing();
        await refreshWechatLoginState();
        const bootstrap = await client.getBootstrapStatus();
        bootstrapState = bootstrap?.state ?? "idle";
    }

    async function refreshWechatLoginState(): Promise<void> {
        if (!client) return;
        try {
            const state = await client.wechatGetLoginState();
            await applyWechatLoginState(state);
            if (String(state?.status ?? "") === "confirmed") {
                settings = await client.getSettings();
                syncWhitelistDraft();
                await refreshStatus();
            }
        } catch {
            // 未开始登录时忽略
        }
    }

    async function applyWechatLoginState(state: Record<string, unknown> | null | undefined): Promise<void> {
        const previousStatus = wechatLogin.status;
        const wasLoginInitiated = wechatLoginInitiated;
        const status = String(state?.status ?? "");
        const qrcodeContent = typeof state?.qrcodeContent === "string" ? state.qrcodeContent : "";
        if (qrcodeContent) {
            wechatLoginInitiated = true;
            if (qrcodeContent !== wechatLogin.qrcodeContent) await renderWechatQr(qrcodeContent);
        }
        if (status === "confirmed") {
            stopWechatPolling();
            wechatLoginInitiated = false;
            wechatQrDataUrl = "";
            wechatQrError = "";
            if (wasLoginInitiated && previousStatus !== "confirmed") showMessage("微信绑定成功，消息监听已启动", 2500);
        } else if (status === "expired") {
            stopWechatPolling();
            wechatQrDataUrl = "";
            wechatQrError = "二维码已过期，请重新扫码。";
        }
        wechatLogin = {
            status,
            qrcodeUrl: wechatLogin.qrcodeUrl,
            qrcodeContent: qrcodeContent || wechatLogin.qrcodeContent,
            verifyCodeHint: status === "need_verifycode" || status === "verify_code_blocked",
        };
    }

    function stopWechatPolling(): void {
        if (wechatPollTimer !== null) {
            clearTimeout(wechatPollTimer);
            wechatPollTimer = null;
        }
    }

    function startWechatPolling(): void {
        stopWechatPolling();
        const poll = async () => {
            await refreshWechatLoginState();
            if (wechatPollTimer !== null) wechatPollTimer = setTimeout(() => void poll(), 1000);
        };
        wechatPollTimer = setTimeout(() => void poll(), 0);
    }

    async function connectWechat(): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            const replacingBinding = wechatConnected;
            if (replacingBinding) {
                stopWechatPolling();
                await client.wechatLogout();
                wechatLogin = { status: "idle", qrcodeUrl: "", qrcodeContent: "", verifyCodeHint: false };
                wechatQrDataUrl = "";
                wechatQrError = "";
                await refreshStatus();
            }
            if (!settings.wechat.enabled) {
                settings.wechat.enabled = true;
                await client.saveSettings(settings);
            }
            wechatLoginInitiated = true;
            const result = await client.wechatStartLogin();
            if (result?.ok === false) {
                showMessage(String(result?.message ?? "微信登录启动失败"), 3000, "error");
                return;
            }
            wechatLogin = {
                status: String(result?.status ?? "wait"),
                qrcodeUrl: typeof result?.qrcodeUrl === "string" ? result.qrcodeUrl : "",
                qrcodeContent: typeof result?.qrcodeContent === "string" ? result.qrcodeContent : "",
                verifyCodeHint: result?.status === "need_verifycode",
            };
            await renderWechatQr(wechatLogin.qrcodeContent || wechatLogin.qrcodeUrl);
            if (wechatLogin.status !== "confirmed") {
                startWechatPolling();
            }
            await refreshStatus();
            if (replacingBinding) showMessage("原微信绑定已清除，请扫描新二维码", 2500);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "微信登录启动失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    async function submitWechatVerifyCode(): Promise<void> {
        if (!client || !wechatVerifyCodeDraft.trim()) return;
        saving = true;
        try {
            const result = await client.wechatSubmitVerifyCode(wechatVerifyCodeDraft.trim());
            if (result?.ok === false) {
                showMessage(String(result?.message ?? "验证码提交失败"), 3000, "error");
                return;
            }
            wechatVerifyCodeDraft = "";
            await refreshWechatLoginState();
        } finally {
            saving = false;
        }
    }

    async function disconnectWechat(): Promise<void> {
        if (!client) return;
        stopWechatPolling();
        wechatLoginInitiated = false;
        wechatLogin = { status: "idle", qrcodeUrl: "", qrcodeContent: "", verifyCodeHint: false };
        wechatQrDataUrl = "";
        wechatQrError = "";
        try {
            await client.wechatLogout();
        } catch {
            // 忽略
        }
        settings = await client.getSettings();
        syncWhitelistDraft();
        await refreshStatus();
    }

    async function toggleGlobalEnabled(): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            settings.enabled = !settings.enabled;
            if (settings.enabled && !settings.runtimeOwner && runtimeDevice) {
                settings.runtimeOwner = { ...runtimeDevice };
            }
            await client.saveSettings(settings);
            if (settings.enabled) {
                await client.start();
            } else {
                await client.stop();
            }
            await refreshStatus();
            showMessage(settings.enabled ? "机器人助手已启用" : "机器人助手已停用", 2000);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "保存失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    async function selectActiveProvider(value: RobotAssistantSettings["activeProvider"]): Promise<void> {
        if (!client || saving || settings.activeProvider === value) return;
        saving = true;
        try {
            settings.activeProvider = value;
            if (value !== "none") settings[value].enabled = true;
            settings = await client.saveSettings(settings);
            await refreshStatus();
            const label = value === "wechat" ? "微信" : value === "qq" ? "QQ" : value === "feishu" ? "飞书" : "无";
            showMessage(value === "none" ? "已停止所有机器人渠道" : `已切换为 ${label} 机器人`, 2000);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "机器人切换失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    async function saveProviderSettings(provider: RobotProviderId): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            const section = settings[provider] as { appId?: string; encryptedAppSecret?: string; admission: RobotAssistantSettings["wechat"]["admission"] } | undefined;
            if (!section) return;
            // 白名单落盘
            const admission = settings[provider].admission;
            admission.allowedSenderIds = whitelistDraft[provider].senderIds
                .split("\n").map((s) => s.trim()).filter(Boolean);
            admission.allowedChatIds = whitelistDraft[provider].chatIds
                .split("\n").map((s) => s.trim()).filter(Boolean);
            // 新输入的 Secret 加密
            const secretDraft = provider === "feishu" ? feishuSecretDraft : provider === "qq" ? qqSecretDraft : "";
            if (provider !== "wechat" && secretDraft.trim()) {
                const encrypted = await client.encryptSecret(secretDraft);
                if (!encrypted) {
                    showMessage("App Secret 加密失败", 3000, "error");
                    return;
                }
                section.encryptedAppSecret = encrypted;
                if (provider === "feishu") feishuSecretDraft = "";
                else qqSecretDraft = "";
            }
            settings[provider] = { ...section, admission } as never;
            await client.saveSettings(settings);
            showMessage("已保存", 1500);
            await refreshStatus();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "保存失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    async function startPairing(provider: RobotProviderId): Promise<void> {
        if (!client) return;
        try {
            const result = await client.startPairing(provider);
            if (result?.ok === false) {
                showMessage(String(result?.message ?? "配对启动失败"), 3000, "error");
                return;
            }
            await refreshPairing();
            showMessage(`已开启「捕获下一条 ${provider === "feishu" ? "飞书" : provider === "qq" ? "QQ" : "微信"} 私聊」，请向机器人发送一条文本消息`, 4000);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "配对启动失败", 3000, "error");
        }
    }

    async function approvePairing(): Promise<void> {
        if (!client || !pairingProvider) return;
        try {
            await client.approvePairing(pairingProvider, pairingSenderId || undefined, pairingChatId || undefined);
            await refreshPairing();
            await loadAll();
            showMessage("已允许该账号", 2000);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "允许失败", 3000, "error");
        }
    }

    async function cancelPairing(): Promise<void> {
        if (!client) return;
        try {
            await client.cancelPairing();
            await refreshPairing();
        } catch {
            // 忽略
        }
    }

    async function toggleToolRemoteAllowed(toolName: string): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            const policy = settings.robotToolPolicy.tools[toolName] ?? { remoteAllowed: false };
            policy.remoteAllowed = !policy.remoteAllowed;
            settings.robotToolPolicy.tools[toolName] = policy;
            await client.saveSettings(settings);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "保存失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    async function setDefaultWriteAction(value: "ask" | "deny"): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            settings.robotToolPolicy.defaultWriteAction = value;
            await client.saveSettings(settings);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "保存失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    async function setToolWriteAction(toolName: string, value: "ask" | "deny"): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            const policy = settings.robotToolPolicy.tools[toolName] ?? { remoteAllowed: false };
            policy.writeAction = value;
            settings.robotToolPolicy.tools[toolName] = policy;
            await client.saveSettings(settings);
        } finally {
            saving = false;
        }
    }

    async function saveRuntimeLimits(): Promise<void> {
        if (!client || saving) return;
        saving = true;
        try {
            settings.maxMessageLength = Math.max(1, Number(settings.maxMessageLength) || 4000);
            settings.maxReplyChars = Math.max(100, Number(settings.maxReplyChars) || 4000);
            settings.maxConcurrentTurns = Math.max(1, Number(settings.maxConcurrentTurns) || 2);
            settings.modelTimeoutMs = Math.max(1000, Number(settings.modelTimeoutMs) || 50000);
            settings.turnTimeoutMs = Math.max(settings.modelTimeoutMs, Number(settings.turnTimeoutMs) || 180000);
            await client.saveSettings(settings);
            showMessage("运行限制已保存", 1500);
        } finally {
            saving = false;
        }
    }

    async function claimCurrentRuntime(): Promise<void> {
        if (!client || !runtimeDevice || saving) return;
        saving = true;
        try {
            settings.runtimeOwner = { ...runtimeDevice };
            settings = await client.saveSettings(settings);
            if (settings.enabled) await client.start();
            await refreshStatus();
            showMessage("已将当前设备设为机器人唯一运行设备", 2500);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "运行设备切换失败", 3000, "error");
        } finally {
            saving = false;
        }
    }

    function handleStatusChanged(): void {
        void refreshStatus();
        void refreshPairing();
    }
    function handlePairingChanged(): void {
        void refreshPairing();
    }
    function handleWechatLoginChanged(payload: unknown): void {
        const state = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
        void applyWechatLoginState(state).then(async () => {
            if (state?.status === "confirmed") await refreshWechatLoginState();
            else await refreshStatus();
        });
    }
    onMount(() => {
        isElectron = detectElectron();
        kernelBridge = new RobotKernelBridge(plugin);
        kernelStatus = kernelBridge.status;
        client = new RobotSettingsClient(kernelBridge.client, {
            loadData: (name) => plugin.loadData(name),
            saveData: (name, value) => plugin.saveData(name, value),
        });
        destroyFns.push(kernelBridge.subscribe(() => {
            const next = kernelBridge!.status;
            kernelStatus = next;
            if (next === "error" && !kernelErrorLogged) {
                kernelErrorLogged = true;
                console.warn("[RobotKernel] kernel state=error");
            } else if (next === "running") {
                kernelErrorLogged = false;
            }
            // Kernel 进入 running 后无需重开页面，自动刷新设置与状态。
            if (next === "running") {
                loading = true;
                void loadAll().catch((error) => {
                    errorText = error instanceof Error ? error.message : "加载失败";
                }).finally(() => {
                    loading = false;
                });
            }
        }));
        destroyFns.push(client.subscribe("robot.statusChanged", handleStatusChanged));
        destroyFns.push(client.subscribe("robot.providerStatusChanged", handleStatusChanged));
        destroyFns.push(client.subscribe("robot.wechat.loginChanged", handleWechatLoginChanged));
        destroyFns.push(client.subscribe("robot.pairingChanged", handlePairingChanged));
        if (kernelStatus === "running") {
            loading = true;
            void loadAll().catch((error) => {
                errorText = error instanceof Error ? error.message : "加载失败";
            }).finally(() => {
                loading = false;
            });
        } else {
            loading = false;
        }
    });

    onDestroy(() => {
        stopWechatPolling();
        for (const fn of destroyFns.splice(0)) {
            try { fn(); } catch { /* 忽略 */ }
        }
        kernelBridge?.dispose();
        kernelBridge = null;
    });

    const knownTools = ["siyuan_kb", "diary_task", "siyuan_database", "siyuan_doc_edit", "siyuan_tree", "siyuan_meta", "siyuan_asset", "siyuan_riff", "homepage_quick_note", "homepage_focus", "homepage_accounting", "homepage_fixed_assets", "homepage_anniversary", "homepage_favorites", "homepage_review"];

    function toolLabel(name: string): string {
        const map: Record<string, string> = {
            siyuan_kb: "知识库查询", diary_task: "日记任务", siyuan_database: "数据库", siyuan_doc_edit: "文档编辑",
            siyuan_tree: "目录结构", siyuan_meta: "文档属性", siyuan_asset: "资源文件", siyuan_riff: "Riff 卡片",
            homepage_quick_note: "快速笔记", homepage_focus: "专注清单", homepage_accounting: "记账",
            homepage_fixed_assets: "固定资产", homepage_anniversary: "纪念日", homepage_favorites: "收藏", homepage_review: "复习",
        };
        return map[name] ?? name;
    }
</script>

<div class="robot-settings">
    {#if !advancedEnabled}
        <div class="robot-notice">机器人助手为高级能力，当前不可用。</div>
    {:else if kernelStatus === "loading"}
        <div class="robot-notice">机器人内核正在启动……</div>
    {:else if kernelStatus === "error"}
        <div class="robot-notice robot-notice--error">机器人内核启动失败，请查看思源内核日志。</div>
    {:else if kernelStatus === "stopped" || kernelStatus === "unavailable"}
        <div class="robot-notice">机器人内核未运行。</div>
    {:else if bootstrapState === "initializing"}
        <div class="robot-notice">机器人服务正在初始化……</div>
    {:else if bootstrapState === "error"}
        <div class="robot-notice robot-notice--error">机器人服务初始化失败。</div>
    {:else if loading}
        <div class="robot-notice">正在加载…</div>
    {:else if errorText}
        <div class="robot-notice robot-notice--error">加载失败：{errorText}</div>
    {:else}
        {#if activeSubTab === "general"}
        <SettingSection title="机器人助手">
            <SettingRow title="启用机器人助手">
                <div class="robot-switch-control">
                    <span>{settings.enabled ? "已启用" : "已停用"}</span>
                    <input class="b3-switch fn__flex-center" type="checkbox" checked={settings.enabled}
                        onchange={() => toggleGlobalEnabled()} disabled={disabled} aria-label="启用机器人助手" />
                </div>
            </SettingRow>
            <SettingRow title="当前使用的机器人" description="同一时间只运行一个渠道，其他渠道仅保留配置。">
                <select
                    class="b3-select robot-provider-select"
                    value={settings.activeProvider}
                    onchange={(event) => selectActiveProvider((event.currentTarget as HTMLSelectElement).value as RobotAssistantSettings["activeProvider"])}
                    disabled={disabled}
                    aria-label="当前使用的机器人"
                >
                    <option value="none">不使用机器人</option>
                    <option value="wechat">微信机器人</option>
                    <option value="qq" disabled={!isElectron}>QQ 机器人（桌面端）</option>
                    <option value="feishu" disabled={!isElectron}>飞书机器人（桌面端）</option>
                </select>
            </SettingRow>
            <SettingRow title="Robot Core 状态">
                <span class="robot-status-pill robot-status-pill--{statusTone(statusSnapshot?.status ?? 'stopped')}">{statusText}</span>
            </SettingRow>
            <SettingRow title="运行设备" description="只有指定设备会连接当前机器人，其他设备保持待机。">
                <div class="robot-runtime-owner">
                    <span class="robot-status-pill robot-status-pill--{settings.runtimeOwner?.deviceId === runtimeDevice?.deviceId ? 'success' : 'warning'}">
                        {settings.runtimeOwner?.deviceName || settings.runtimeOwner?.deviceId || "尚未指定"}
                    </span>
                    <button
                        class="b3-button b3-button--text"
                        disabled={disabled || !runtimeDevice || settings.runtimeOwner?.deviceId === runtimeDevice?.deviceId}
                        onclick={claimCurrentRuntime}
                    >{settings.runtimeOwner?.deviceId === runtimeDevice?.deviceId ? "当前设备" : "设为当前设备"}</button>
                </div>
            </SettingRow>
            <SettingRow title="当前 Agent 模型">
                <span class="robot-status-pill">{modelText}</span>
            </SettingRow>
        </SettingSection>

        <SettingSection title="运行限制">
            <SettingRow title="消息 / 回复长度">
                <input class="b3-text-field fn__size150" type="number" min="1" bind:value={settings.maxMessageLength} disabled={disabled} />
                <input class="b3-text-field fn__size150" type="number" min="100" bind:value={settings.maxReplyChars} disabled={disabled} />
            </SettingRow>
            <SettingRow title="并发与超时" description="依次为全局 Agent 并发、单次模型超时(ms)、整轮超时(ms)。">
                <input class="b3-text-field fn__size100" type="number" min="1" bind:value={settings.maxConcurrentTurns} disabled={disabled} />
                <input class="b3-text-field fn__size150" type="number" min="1000" bind:value={settings.modelTimeoutMs} disabled={disabled} />
                <input class="b3-text-field fn__size150" type="number" min="1000" bind:value={settings.turnTimeoutMs} disabled={disabled} />
                <button class="b3-button b3-button--text" disabled={disabled} onclick={() => saveRuntimeLimits()}>保存限制</button>
            </SettingRow>
            <SettingRow title="远程对话上下文">
                <span class="robot-status-pill robot-status-pill--success">持续保留</span>
            </SettingRow>
        </SettingSection>

        {:else if activeSubTab === "wechat"}
        <SettingSection title="微信机器人">
            <div class="robot-provider-card">
                <div class="robot-provider-card__head">
                    <div class="robot-provider-intro">
                        <span class="robot-provider-icon"><SiyuanIcon name="wechatRobot" size={32} title="微信" /></span>
                        <p class="robot-provider-desc">Kernel 常驻运行</p>
                    </div>
                    <span class="robot-status-pill robot-status-pill--{statusTone(providerStatusValue('wechat'))}">{providerStatusText("wechat")}</span>
                </div>

                <SettingRow title="运行状态">
                    <span class="robot-status-pill robot-status-pill--{settings.activeProvider === 'wechat' ? 'success' : 'neutral'}">
                        {settings.activeProvider === "wechat" ? "当前使用" : "仅保留配置"}
                    </span>
                </SettingRow>
                <SettingRow title="私聊 / 群聊">
                    <div class="robot-toggle-group">
                        <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.wechat.admission.privateChatAllowed} disabled={disabled} /> 允许私聊</label>
                        <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.wechat.admission.groupChatAllowed} disabled={disabled} /> 允许群聊</label>
                        <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.wechat.admission.groupRequireMention} disabled={disabled} /> 群聊需 @ 机器人</label>
                    </div>
                </SettingRow>
                <SettingRow title="允许的用户 ID / 聊天 ID" description="默认不开放；请先捕获并批准账号，或每行填写一个 ID。">
                    <div class="robot-whitelist">
                        <textarea class="b3-text-field robot-whitelist__area" bind:value={whitelistDraft.wechat.senderIds}
                            placeholder="用户 ID（每行一个）" disabled={disabled}></textarea>
                        <textarea class="b3-text-field robot-whitelist__area" bind:value={whitelistDraft.wechat.chatIds}
                            placeholder="聊天 ID（每行一个）" disabled={disabled}></textarea>
                    </div>
                </SettingRow>

                {#if wechatConnected}
                    <div class="robot-wechat-connected">
                        <div class="robot-wechat-connected__icon">✓</div>
                        <div class="robot-wechat-connected__content">
                            <strong>微信已绑定，消息监听运行中</strong>
                            <span>{settings.wechat.displayName || "当前微信机器人"}</span>
                        </div>
                        <span class="robot-live-dot"><i></i> 在线</span>
                    </div>
                {/if}

                {#if pairingEnabled && pairingProvider === "wechat"}
                    <div class="robot-wechat-pairing robot-wechat-pairing--{pairingCaptured ? 'captured' : 'waiting'}">
                        <div class="robot-wechat-pairing__icon">{pairingCaptured ? "✓" : "…"}</div>
                        <div class="robot-wechat-pairing__content">
                            {#if pairingCaptured}
                                <strong>已捕获微信账号</strong>
                                <span>{pairingSenderName || pairingSenderId}</span>
                                <small>用户 ID：{pairingSenderId}<br />聊天 ID：{pairingChatId}</small>
                            {:else}
                                <strong>正在等待下一条微信私聊</strong>
                                <span>请向机器人发送一条私聊消息。</span>
                            {/if}
                        </div>
                        <div class="robot-wechat-pairing__actions">
                            {#if pairingCaptured}
                                <button class="b3-button robot-action robot-action--primary" disabled={disabled}
                                    onclick={() => approvePairing()}>允许这个账号</button>
                            {/if}
                            <button class="b3-button robot-action robot-action--secondary" disabled={disabled}
                                onclick={() => cancelPairing()}>取消捕获</button>
                        </div>
                    </div>
                {/if}

                {#if showWechatLoginPanel}
                    <div class="robot-wechat-login">
                        {#if wechatLogin.status !== "expired"}
                            <div class="robot-qr-shell">
                                {#if wechatQrDataUrl}
                                    <img class="robot-qr" src={wechatQrDataUrl} alt="微信登录二维码" />
                                {:else if wechatQrError}
                                    <div class="robot-qr-placeholder robot-qr-placeholder--error">{wechatQrError}</div>
                                {:else}
                                    <div class="robot-qr-placeholder">正在生成二维码…</div>
                                {/if}
                            </div>
                        {/if}
                        <div class="robot-wechat-login__status">
                            {#if wechatLogin.status === "wait"}等待扫码…
                            {:else if wechatLogin.status === "scaned"}已扫码，请在手机上确认
                            {:else if wechatLogin.status === "scaned_but_redirect"}已扫码，正在切换登录节点…
                            {:else if wechatLogin.status === "expired"}二维码已过期，请点击下方按钮重新扫码
                            {:else if wechatLogin.verifyCodeHint}
                                请输入手机微信上显示的数字：
                                <input class="b3-text-field fn__size200" bind:value={wechatVerifyCodeDraft}
                                    placeholder="配对数字" disabled={disabled} />
                                <button class="b3-button fn__size150" disabled={disabled}
                                    onclick={() => submitWechatVerifyCode()}>提交</button>
                            {:else}{wechatLogin.status}{/if}
                        </div>
                        {#if wechatLogin.status === "wait" || wechatLogin.status === "scaned"}
                            <div class="robot-wechat-login__hint">请使用手机微信扫码，并在手机上确认登录。</div>
                        {/if}
                    </div>
                {/if}

                <div class="robot-provider-actions">
                    <button class="b3-button robot-action robot-action--primary" disabled={disabled}
                        onclick={() => connectWechat()}>
                        {wechatConnected ? "重新扫码绑定" : showWechatLoginPanel ? "刷新二维码" : "扫码绑定微信"}
                    </button>
                    <button class="b3-button robot-action robot-action--danger" disabled={disabled || (!wechatConnected && !showWechatLoginPanel)}
                        onclick={() => disconnectWechat()}>{wechatConnected ? "解除绑定" : "取消扫码"}</button>
                    <button class="b3-button robot-action robot-action--secondary" disabled={disabled}
                        onclick={() => saveProviderSettings("wechat")}>保存设置</button>
                    <button class="b3-button robot-action robot-action--secondary"
                        disabled={disabled || settings.activeProvider !== "wechat" || !wechatConnected || (pairingEnabled && pairingProvider === "wechat")}
                        onclick={() => startPairing("wechat")}>{pairingEnabled && pairingProvider === "wechat" ? "正在捕获…" : "捕获下一条私聊"}</button>
                </div>
            </div>
        </SettingSection>

        {:else if activeSubTab === "feishu"}
        <SettingSection title="飞书机器人">
            <div class="robot-provider-card">
                <div class="robot-provider-card__head">
                    <div class="robot-provider-intro">
                        <span class="robot-provider-icon"><SiyuanIcon name="feishuRobot" size={32} title="飞书" /></span>
                        <p class="robot-provider-desc">使用飞书官方长连接 SDK，仅在思源桌面客户端运行。</p>
                    </div>
                    <span class="robot-status-pill robot-status-pill--{statusTone(providerStatusValue('feishu'))}">{providerStatusText("feishu")}</span>
                </div>
                {#if !isElectron}
                    <div class="robot-notice">飞书机器人仅支持思源桌面客户端。</div>
                {:else}
                    <SettingRow title="运行状态">
                        <span class="robot-status-pill robot-status-pill--{settings.activeProvider === 'feishu' ? 'success' : 'neutral'}">
                            {settings.activeProvider === "feishu" ? "当前使用" : "仅保留配置"}
                        </span>
                    </SettingRow>
                    <SettingRow title="App ID">
                        <input class="b3-text-field fn__size200" bind:value={settings.feishu.appId} disabled={disabled} />
                    </SettingRow>
                    <SettingRow title="App Secret" description="留空则保持已保存的密钥不变。">
                        <input class="b3-text-field fn__size200" type="password" bind:value={feishuSecretDraft}
                            placeholder="新的 App Secret（可选）" disabled={disabled} />
                    </SettingRow>
                    <SettingRow title="私聊 / 群聊">
                        <div class="robot-toggle-group">
                            <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.feishu.admission.privateChatAllowed} disabled={disabled} /> 允许私聊</label>
                            <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.feishu.admission.groupChatAllowed} disabled={disabled} /> 允许群聊</label>
                            <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.feishu.admission.groupRequireMention} disabled={disabled} /> 群聊需 @ 机器人</label>
                        </div>
                    </SettingRow>
                    <SettingRow title="允许的用户 ID / 群 ID" description="每行一个。">
                        <div class="robot-whitelist">
                            <textarea class="b3-text-field robot-whitelist__area" bind:value={whitelistDraft.feishu.senderIds}
                                placeholder="用户 ID（每行一个）" disabled={disabled}></textarea>
                            <textarea class="b3-text-field robot-whitelist__area" bind:value={whitelistDraft.feishu.chatIds}
                                placeholder="群 ID（每行一个）" disabled={disabled}></textarea>
                        </div>
                    </SettingRow>
                    <div class="robot-provider-actions">
                        <button class="b3-button robot-action robot-action--primary" disabled={disabled}
                            onclick={() => saveProviderSettings("feishu")}>保存飞书设置</button>
                        <button class="b3-button robot-action robot-action--secondary"
                            onclick={() => startPairing("feishu")} disabled={disabled || settings.activeProvider !== "feishu"}>捕获下一条私聊</button>
                    </div>
                {/if}
            </div>
        </SettingSection>

        {#if pairingEnabled && pairingProvider === "feishu"}
            <SettingSection title="账号捕获">
                {#if pairingCaptured}
                    <SettingRow title="已捕获账号">
                        <div class="robot-pairing-captured">
                            <div>{pairingSenderName || pairingSenderId}</div>
                            <div>ID：{pairingSenderId}</div>
                            <div>聊天：{pairingChatId}</div>
                            <div class="robot-inline-actions">
                                <button class="b3-button b3-button--text" disabled={disabled} onclick={() => approvePairing()}>允许</button>
                                <button class="b3-button b3-button--text" disabled={disabled} onclick={() => cancelPairing()}>取消</button>
                            </div>
                        </div>
                    </SettingRow>
                {:else}
                    <SettingRow title="等待下一条私聊">
                        <button class="b3-button b3-button--text" disabled={disabled} onclick={() => cancelPairing()}>取消捕获</button>
                    </SettingRow>
                {/if}
            </SettingSection>
        {/if}

        {:else if activeSubTab === "qq"}
        <SettingSection title="QQ 机器人">
            <div class="robot-provider-card">
                <div class="robot-provider-card__head">
                    <div class="robot-provider-intro">
                        <span class="robot-provider-icon"><SiyuanIcon name="qqRobot" size={32} title="QQ" /></span>
                        <p class="robot-provider-desc">使用 QQ 官方机器人 SDK，仅在思源桌面客户端运行。</p>
                    </div>
                    <span class="robot-status-pill robot-status-pill--{statusTone(providerStatusValue('qq'))}">{providerStatusText("qq")}</span>
                </div>
                <SettingRow title="开放平台" description="创建机器人并获取 AppID、AppSecret。">
                    <div class="robot-platform-links">
                        <a
                            class="b3-button robot-action robot-action--primary"
                            href="https://q.qq.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >打开 QQ 开放平台</a>
                        <a
                            class="b3-button robot-action robot-action--secondary"
                            href="https://bot.q.qq.com/wiki/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >接入文档</a>
                    </div>
                </SettingRow>
                {#if !isElectron}
                    <div class="robot-notice">QQ 机器人仅支持思源桌面客户端。</div>
                {:else}
                    <SettingRow title="运行状态">
                        <span class="robot-status-pill robot-status-pill--{settings.activeProvider === 'qq' ? 'success' : 'neutral'}">
                            {settings.activeProvider === "qq" ? "当前使用" : "仅保留配置"}
                        </span>
                    </SettingRow>
                    <SettingRow title="App ID">
                        <input class="b3-text-field fn__size200" bind:value={settings.qq.appId} disabled={disabled} />
                    </SettingRow>
                    <SettingRow title="App Secret" description="留空则保持已保存的密钥不变。">
                        <input class="b3-text-field fn__size200" type="password" bind:value={qqSecretDraft}
                            placeholder="新的 App Secret（可选）" disabled={disabled} />
                    </SettingRow>
                    <SettingRow title="私聊 / 群聊">
                        <div class="robot-toggle-group">
                            <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.qq.admission.privateChatAllowed} disabled={disabled} /> 允许私聊</label>
                            <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.qq.admission.groupChatAllowed} disabled={disabled} /> 允许群聊</label>
                            <label class="robot-check-label"><input class="b3-switch" type="checkbox" bind:checked={settings.qq.admission.groupRequireMention} disabled={disabled} /> 群聊需 @ 机器人</label>
                        </div>
                    </SettingRow>
                    <SettingRow title="允许的用户 ID / 群 ID" description="每行一个。">
                        <div class="robot-whitelist">
                            <textarea class="b3-text-field robot-whitelist__area" bind:value={whitelistDraft.qq.senderIds}
                                placeholder="用户 ID（每行一个）" disabled={disabled}></textarea>
                            <textarea class="b3-text-field robot-whitelist__area" bind:value={whitelistDraft.qq.chatIds}
                                placeholder="群 ID（每行一个）" disabled={disabled}></textarea>
                        </div>
                    </SettingRow>
                    <div class="robot-provider-actions">
                        <button class="b3-button robot-action robot-action--primary" disabled={disabled}
                            onclick={() => saveProviderSettings("qq")}>保存 QQ 设置</button>
                        <button class="b3-button robot-action robot-action--secondary"
                            onclick={() => startPairing("qq")} disabled={disabled || settings.activeProvider !== "qq"}>捕获下一条私聊</button>
                    </div>
                {/if}
            </div>
        </SettingSection>

        {#if pairingEnabled && pairingProvider === "qq"}
            <SettingSection title="账号捕获">
                {#if pairingCaptured}
                    <SettingRow title="已捕获账号">
                        <div class="robot-pairing-captured">
                            <div>{pairingSenderName || pairingSenderId}</div>
                            <div>ID：{pairingSenderId}</div>
                            <div>聊天：{pairingChatId}</div>
                            <div class="robot-inline-actions">
                                <button class="b3-button b3-button--text" disabled={disabled} onclick={() => approvePairing()}>允许</button>
                                <button class="b3-button b3-button--text" disabled={disabled} onclick={() => cancelPairing()}>取消</button>
                            </div>
                        </div>
                    </SettingRow>
                {:else}
                    <SettingRow title="等待下一条私聊">
                        <button class="b3-button b3-button--text" disabled={disabled}
                            onclick={() => cancelPairing()}>取消捕获</button>
                    </SettingRow>
                {/if}
            </SettingSection>
        {/if}

        {:else if activeSubTab === "agent"}
        <SettingSection title="机器人可使用的 AI 工具">
            <SettingRow title="默认写操作策略">
                <select class="b3-select fn__size150" value={settings.robotToolPolicy.defaultWriteAction}
                    onchange={(e) => setDefaultWriteAction((e.currentTarget as HTMLSelectElement).value as "ask" | "deny")}
                    disabled={disabled}>
                    <option value="ask">写操作需确认</option>
                    <option value="deny">写操作默认拒绝</option>
                </select>
            </SettingRow>
            {#each knownTools as toolName}
                {@const entry = settings.robotToolPolicy.tools[toolName] ?? { remoteAllowed: false }}
                <SettingRow title={toolLabel(toolName)}>
                    <label class="robot-check-label">
                        <input class="b3-switch" type="checkbox" checked={entry.remoteAllowed}
                            onchange={() => toggleToolRemoteAllowed(toolName)} disabled={disabled} />
                        允许远程使用
                    </label>
                    <select class="b3-select fn__size150" value={entry.writeAction ?? settings.robotToolPolicy.defaultWriteAction}
                        onchange={(e) => setToolWriteAction(toolName, (e.currentTarget as HTMLSelectElement).value as "ask" | "deny")}
                        disabled={disabled || !entry.remoteAllowed}>
                        <option value="ask">写操作需确认</option>
                        <option value="deny">写操作拒绝</option>
                    </select>
                </SettingRow>
            {/each}
        </SettingSection>

        {:else if activeSubTab === "sessions"}
            {#if client}
                <div class="robot-settings-workspace">
                    <RemoteAgentSessionsDialog {client} />
                </div>
            {/if}
        {:else if activeSubTab === "logs"}
            {#if client}
                <div class="robot-settings-workspace">
                    <RobotMessageLogDialog {client} provider="all" />
                </div>
            {/if}
        {/if}

    {/if}
</div>

<style>
    .robot-settings {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    }

    .robot-settings-workspace {
        height: min(680px, calc(100vh - 230px));
        min-height: 500px;
        overflow: hidden;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
    }

    .robot-inline-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
    }

    .robot-notice {
        padding: 1rem;
        border-radius: 8px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-surface);
    }
    .robot-notice--error {
        color: var(--b3-theme-error);
    }

    .robot-switch-control {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .robot-provider-select {
        width: min(220px, 100%);
        min-height: 32px;
        text-align: center;
        text-align-last: center;
    }

    .robot-runtime-owner {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 0.5rem;
        min-width: 0;
    }

    .robot-status-pill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0.1rem 0.7rem;
        box-sizing: border-box;
        border-radius: 999px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
    }

    .robot-status-pill--success {
        color: var(--b3-theme-primary);
        border-color: var(--b3-theme-primary-light, var(--b3-theme-primary));
    }

    .robot-status-pill--warning {
        color: #c77800;
        border-color: rgba(199, 120, 0, 0.45);
    }

    .robot-status-pill--danger {
        color: var(--b3-theme-error);
        border-color: var(--b3-theme-error);
    }

    .robot-status-pill--neutral {
        color: var(--b3-theme-on-surface-light);
    }

    .robot-provider-card {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .robot-provider-card__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.25rem 0 0.85rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .robot-provider-intro {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
    }

    .robot-provider-icon {
        display: inline-grid;
        place-items: center;
        flex: 0 0 36px;
        width: 36px;
        height: 36px;
        color: var(--b3-theme-on-surface);
    }

    .robot-provider-icon :global(.siyuan-icon) {
        display: block;
        vertical-align: middle;
    }

    .robot-provider-desc {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface-light);
    }

    .robot-provider-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 0.75rem;
        padding-top: 1rem;
        border-top: 1px solid var(--b3-border-color);
    }

    .robot-platform-links {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    .robot-platform-links .robot-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        text-decoration: none;
    }

    .robot-action {
        min-width: 96px;
        height: 32px;
        padding: 0 1rem;
        border-radius: 8px;
        border: 1px solid transparent;
        box-shadow: none;
        transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
    }

    .robot-action:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
    }

    .robot-action--primary {
        color: var(--b3-theme-on-primary);
        background: var(--b3-theme-primary);
    }

    .robot-action--secondary {
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-background);
        border-color: var(--b3-border-color);
    }

    .robot-action--danger {
        color: var(--b3-theme-error);
        background: transparent;
        border-color: var(--b3-theme-error);
    }

    .robot-toggle-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.6rem 1rem;
    }

    .robot-whitelist {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        width: 100%;
    }
    .robot-whitelist__area {
        flex: 1 1 200px;
        min-height: 84px;
        resize: vertical;
    }

    .robot-check-label {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin: 0;
        padding: 0.25rem 0.4rem;
        border-radius: 6px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .robot-check-label:hover {
        background: var(--b3-list-hover, var(--b3-theme-background));
    }

    .robot-wechat-connected {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        margin: 0.8rem 0 0.25rem;
        padding: 0.95rem 1rem;
        background: rgba(34, 173, 89, 0.08);
        border: 1px solid rgba(34, 173, 89, 0.35);
        border-radius: 10px;
    }

    .robot-wechat-connected__icon,
    .robot-wechat-pairing__icon {
        display: grid;
        place-items: center;
        flex: 0 0 34px;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        color: #fff;
        background: #22ad59;
        font-weight: 700;
    }

    .robot-wechat-connected__content,
    .robot-wechat-pairing__content {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
    }

    .robot-wechat-connected__content strong,
    .robot-wechat-pairing__content strong {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .robot-wechat-connected__content span,
    .robot-wechat-pairing__content span,
    .robot-wechat-pairing__content small {
        font-size: 12px;
        line-height: 1.55;
        color: var(--b3-theme-on-surface-light);
        word-break: break-all;
    }

    .robot-live-dot {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        flex: 0 0 auto;
        font-size: 12px;
        color: #178847;
    }

    .robot-live-dot i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #22ad59;
        box-shadow: 0 0 0 4px rgba(34, 173, 89, 0.12);
    }

    .robot-wechat-pairing {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        margin: 0.75rem 0 0.25rem;
        padding: 1rem;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
    }

    .robot-wechat-pairing--waiting .robot-wechat-pairing__icon {
        background: #d38a19;
        animation: robot-pairing-pulse 1.5s ease-in-out infinite;
    }

    .robot-wechat-pairing__actions {
        display: flex;
        flex: 0 0 auto;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.45rem;
    }

    @keyframes robot-pairing-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(211, 138, 25, 0.18); }
        50% { box-shadow: 0 0 0 7px rgba(211, 138, 25, 0); }
    }

    .robot-wechat-login {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.7rem;
        width: min(100%, 460px);
        margin: 0.85rem auto 0.25rem;
        padding: 1.25rem;
        box-sizing: border-box;
        text-align: center;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
    }

    .robot-qr-shell {
        display: grid;
        place-items: center;
        width: 224px;
        height: 224px;
        padding: 10px;
        box-sizing: border-box;
        overflow: hidden;
        background: #fff;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    }

    .robot-qr {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #fff;
    }

    .robot-qr-placeholder {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        padding: 1rem;
        box-sizing: border-box;
        font-size: 12px;
        line-height: 1.6;
        color: #65736f;
    }

    .robot-qr-placeholder--error {
        color: var(--b3-theme-error);
    }

    .robot-wechat-login__status {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .robot-wechat-login__hint {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .robot-pairing-captured {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    @media (max-width: 680px) {
        .robot-settings-workspace {
            height: min(720px, calc(100vh - 190px));
            min-height: 520px;
        }

        .robot-provider-card__head {
            align-items: flex-start;
        }

        .robot-toggle-group {
            justify-content: flex-start;
        }

        .robot-platform-links {
            width: 100%;
            justify-content: flex-start;
        }

        .robot-wechat-login {
            padding: 1rem;
        }

        .robot-wechat-connected,
        .robot-wechat-pairing {
            align-items: flex-start;
            flex-wrap: wrap;
        }

        .robot-wechat-pairing__actions {
            width: 100%;
            padding-left: 2.9rem;
            justify-content: flex-start;
        }

        .robot-qr-shell {
            width: 196px;
            height: 196px;
        }

        .robot-provider-actions > .robot-action {
            flex: 1 1 132px;
        }
    }
</style>

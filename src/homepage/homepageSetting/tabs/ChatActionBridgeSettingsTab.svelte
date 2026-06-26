<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
    import {
        DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS,
        getChatActionBridgeRuntimeStatus,
        loadChatActionBridgeSettings,
        loadChatActionHistory,
        clearChatActionHistory,
        saveChatActionBridgeSettings,
        setChatActionBridgePlugin,
        startChatActionBridgeIfNeeded,
        startLocalFeishuGateway,
        startCapturePairing,
        stopChatActionBridge,
        loadPairingCaptureState,
        clearCaptureResult,
        getCaptureRemainingSeconds,
        buildFeishuLocalGatewayManualCommand,
        isFeishuLocalGatewaySpawnSupported,
        type ChatActionBridgeSettings,
        type ChatActionHistoryItem,
        type ChatActionPairingCaptureState,
        type ChatActionRuntimeStatus,
    } from "@/features/chat-action-bridge";

    interface Props {
        advancedEnabled: boolean;
        plugin: any;
    }

    let { advancedEnabled, plugin }: Props = $props();

    let settings = $state<ChatActionBridgeSettings>({ ...DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS });
    let loading = $state(true);
    let saving = $state(false);
    let appSecretDraft = $state("");
    let allowedOpenIdsText = $state("");
    let allowedUserIdsText = $state("");
    let allowedChatIdsText = $state("");
    let history = $state<ChatActionHistoryItem[]>([]);
    let runtimeStatus = $state<ChatActionRuntimeStatus>(getChatActionBridgeRuntimeStatus());
    let pairingCapture = $state<ChatActionPairingCaptureState>({ enabled: false, expiresAt: 0 });
    let captureRemaining = $state(0);
    let captureTimer: ReturnType<typeof setInterval> | null = null;
    let showCapturedIds = $state(false);

    const bridgeEditable = $derived(advancedEnabled);
    const hasSavedSecret = $derived(Boolean(settings.feishu.encryptedAppSecret));
    const hasSecretForConfig = $derived(hasSavedSecret || Boolean(appSecretDraft.trim()));
    const hasWhitelistConfigured = $derived(
        settings.feishu.allowedOpenIds.length > 0
        || settings.feishu.allowedUserIds.length > 0
        || settings.feishu.allowedChatIds.length > 0
    );
    const gatewayAutoStartSupported = $derived(isFeishuLocalGatewaySpawnSupported());
    const gatewayConnected = $derived(runtimeStatus.code === "connected");
    const manualGatewayCommand = $derived(buildFeishuLocalGatewayManualCommand(plugin, settings));
    const feishuConfigStatusText = $derived(
        settings.feishu.appId && hasSecretForConfig ? "飞书后台配置已完成" : "飞书后台配置未完成"
    );
    const localGatewayStatusText = $derived(
        pairingCapture.capturedAt
            ? "捕获成功"
            : pairingCapture.enabled && captureRemaining > 0 && gatewayConnected
                ? "网关已连接，等待飞书私聊绑定"
                : runtimeStatus.code === "connecting"
                    ? "正在连接本地网关"
                    : gatewayConnected
                        ? "本地网关已连接"
                        : runtimeStatus.message.includes("本地飞书网关已")
                            ? "本地网关已连接"
                        : "本地网关未启动"
    );

    function splitList(text: string): string[] {
        return Array.from(new Set(text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)));
    }

    function syncDraftText(next: ChatActionBridgeSettings): void {
        allowedOpenIdsText = next.feishu.allowedOpenIds.join("\n");
        allowedUserIdsText = next.feishu.allowedUserIds.join("\n");
        allowedChatIdsText = next.feishu.allowedChatIds.join("\n");
        appSecretDraft = "";
    }

    async function refreshHistory(): Promise<void> {
        history = await loadChatActionHistory(settings.keepHistoryLimit);
    }

    async function refreshPairingCapture(): Promise<void> {
        pairingCapture = await loadPairingCaptureState();
        captureRemaining = getCaptureRemainingSeconds(pairingCapture);
        if (pairingCapture.enabled && captureRemaining > 0) {
            if (!captureTimer) {
                captureTimer = setInterval(() => {
                    captureRemaining = getCaptureRemainingSeconds(pairingCapture);
                    if (captureRemaining <= 0) {
                        if (captureTimer) clearInterval(captureTimer);
                        captureTimer = null;
                        void refreshPairingCapture();
                    }
                }, 1000);
            }
        } else {
            if (captureTimer) {
                clearInterval(captureTimer);
                captureTimer = null;
            }
        }
    }

    async function handleStartCapture(): Promise<void> {
        if (!bridgeEditable) return;
        await persist("机器助手设置已保存，正在开启配对捕获。");
        const status = await startCapturePairing(true);
        showMessage(status.message, 3000);
        await refreshPairingCapture();
    }

    async function handleAddToWhitelist(field: "openId" | "userId" | "chatId"): Promise<void> {
        const id = field === "openId" ? pairingCapture.openId
            : field === "userId" ? pairingCapture.userId
            : pairingCapture.chatId;
        if (!id) return;
        if (field === "openId") {
            const list = splitList(allowedOpenIdsText);
            if (!list.includes(id)) {
                allowedOpenIdsText = [...list, id].join("\n");
            }
        } else if (field === "userId") {
            const list = splitList(allowedUserIdsText);
            if (!list.includes(id)) {
                allowedUserIdsText = [...list, id].join("\n");
            }
        } else {
            const list = splitList(allowedChatIdsText);
            if (!list.includes(id)) {
                allowedChatIdsText = [...list, id].join("\n");
            }
        }
        await persist("白名单已更新。");
        await refreshPairingCapture();
    }

    async function handleClearCapture(): Promise<void> {
        await clearCaptureResult();
        await refreshPairingCapture();
    }

    async function load(): Promise<void> {
        loading = true;
        try {
            setChatActionBridgePlugin(plugin);
            settings = await loadChatActionBridgeSettings();
            syncDraftText(settings);
            runtimeStatus = getChatActionBridgeRuntimeStatus();
            await refreshHistory();
            await refreshPairingCapture();
        } finally {
            loading = false;
        }
    }

    function buildDraftSettings(): ChatActionBridgeSettings {
        return {
            ...settings,
            maxMessageLength: Number(settings.maxMessageLength) || DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS.maxMessageLength,
            sessionTtlMs: Number(settings.sessionTtlMs) || DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS.sessionTtlMs,
            keepHistoryLimit: Number(settings.keepHistoryLimit) || DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS.keepHistoryLimit,
            feishu: {
                ...settings.feishu,
                encryptedAppSecret: appSecretDraft.trim() || settings.feishu.encryptedAppSecret,
                allowedOpenIds: splitList(allowedOpenIdsText),
                allowedUserIds: splitList(allowedUserIdsText),
                allowedChatIds: splitList(allowedChatIdsText),
            },
        };
    }

    async function persist(successMessage = "机器助手设置已保存。"): Promise<void> {
        if (!advancedEnabled) {
            showMessage("机器助手为高级会员专属功能，请在会员服务中开通后使用。", 3500);
            return;
        }
        saving = true;
        try {
            settings = await saveChatActionBridgeSettings(buildDraftSettings());
            syncDraftText(settings);
            runtimeStatus = getChatActionBridgeRuntimeStatus();
            await refreshHistory();
            showMessage(successMessage);
        } finally {
            saving = false;
        }
    }

    async function startBridge(): Promise<void> {
        await persist("机器助手设置已保存，正在尝试连接。");
        runtimeStatus = await startChatActionBridgeIfNeeded({ restart: true });
        showMessage(runtimeStatus.message, 3000);
    }

    async function startGateway(): Promise<void> {
        await persist("机器助手设置已保存，正在启动本地网关。");
        runtimeStatus = await startLocalFeishuGateway();
        showMessage(runtimeStatus.message, 3000);
    }

    async function stopBridge(): Promise<void> {
        await stopChatActionBridge();
        runtimeStatus = getChatActionBridgeRuntimeStatus();
        showMessage("机器助手已停止。");
    }

    async function copyGatewayCommand(): Promise<void> {
        if (!navigator.clipboard) {
            showMessage("当前环境不支持自动复制，请手动选中命令复制。", 3000);
            return;
        }
        await navigator.clipboard.writeText(manualGatewayCommand);
        showMessage("本地网关启动命令已复制。");
    }

    async function handleClearSecret(): Promise<void> {
        const confirmed = await confirmDialogBoolean({
            title: "清除 App Secret",
            content: safeConfirmContent("确定清除已保存的 App Secret 吗？清除后需要重新填写才能连接飞书。"),
            width: "520px",
        });
        if (!confirmed) return;
        appSecretDraft = "";
        settings.feishu.encryptedAppSecret = "";
        await persist("App Secret 已清除。");
    }

    async function handleClearHistory(): Promise<void> {
        const confirmed = await confirmDialogBoolean({
            title: "清空最近处理记录",
            content: safeConfirmContent("确定清空机器助手最近处理记录吗？不会影响白名单、飞书配置和已写入的笔记。"),
            width: "560px",
        });
        if (!confirmed) return;
        await clearChatActionHistory();
        await refreshHistory();
    }

    function handleStatusChanged(event: Event): void {
        runtimeStatus = (event as CustomEvent<ChatActionRuntimeStatus>).detail ?? getChatActionBridgeRuntimeStatus();
    }

    function handlePairingCaptured(): void {
        void refreshPairingCapture();
    }

    onMount(() => {
        void load();
        window.addEventListener("chat-action-bridge-status-changed", handleStatusChanged);
        window.addEventListener("chat-action-bridge-pairing-captured", handlePairingCaptured);
        window.addEventListener("chat-action-bridge-history-changed", refreshHistory);
    });

    onDestroy(() => {
        window.removeEventListener("chat-action-bridge-status-changed", handleStatusChanged);
        window.removeEventListener("chat-action-bridge-pairing-captured", handlePairingCaptured);
        window.removeEventListener("chat-action-bridge-history-changed", refreshHistory);
        if (captureTimer) clearInterval(captureTimer);
    });
</script>

<div class="chat-action-bridge-settings">
    {#if loading}
        <div class="cab-empty">正在加载机器助手设置...</div>
    {:else}
        <section class="cab-section">
            <div class="cab-section__header">
                <div>
                    <h3>机器助手</h3>
                    <p>当前状态：{runtimeStatus.message}</p>
                    {#if runtimeStatus.detail}
                        <p class="cab-muted">{runtimeStatus.detail}</p>
                    {/if}
                </div>
                <div class="cab-actions">
                    <button type="button" disabled={!bridgeEditable || saving} onclick={() => persist()}>保存设置</button>
                    {#if gatewayAutoStartSupported}
                        <button type="button" disabled={!bridgeEditable || saving} onclick={startGateway}>启动本地网关</button>
                    {/if}
                    <button type="button" disabled={!bridgeEditable || saving} onclick={startBridge}>连接 / 测试本地网关</button>
                    <button type="button" disabled={!bridgeEditable} onclick={stopBridge}>停止连接</button>
                </div>
            </div>
            {#if !advancedEnabled}
                <div class="cab-warning">机器助手需要高级功能可用后才会启动。</div>
            {/if}
            {#if runtimeStatus.code === "missing_whitelist"}
                <div class="cab-warning cab-whitelist-hint">
                    这是安全拦截，不是飞书权限错误。请先使用下方"快速绑定当前飞书账号"捕获 open_id 后加入白名单。
                </div>
            {/if}
            {#if runtimeStatus.code === "gateway_unavailable"}
                <div class="cab-warning">
                    飞书 Node SDK 不能在思源前端环境中直接运行，请启动本地飞书网关。
                </div>
            {/if}
            <div class="cab-status-grid">
                <span>{feishuConfigStatusText}</span>
                <span>{localGatewayStatusText}</span>
            </div>
            <label class="cab-row">
                <span>启用机器助手</span>
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.enabled} disabled={!bridgeEditable} />
            </label>
            <label class="cab-row">
                <span>启用飞书聊天助手</span>
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.feishu.enabled} disabled={!bridgeEditable} />
            </label>
        </section>

        <section class="cab-section">
            <h3>飞书应用机器人</h3>
            <label class="cab-field">
                <span>App ID</span>
                <input type="text" bind:value={settings.feishu.appId} disabled={!bridgeEditable} placeholder="cli_xxx" />
            </label>
            <label class="cab-field">
                <span>App Secret</span>
                <input
                    type="password"
                    bind:value={appSecretDraft}
                    disabled={!bridgeEditable}
                    placeholder={hasSavedSecret ? "已保存，留空表示不修改" : "请输入 App Secret"}
                />
            </label>
            <label class="cab-field">
                <span>本地网关端口</span>
                <input type="number" min="1024" max="65535" bind:value={settings.localGateway.port} disabled={!bridgeEditable} />
            </label>
            <div class="cab-actions" style="margin-top:6px;">
                <button type="button" disabled={!hasSavedSecret || !bridgeEditable} onclick={handleClearSecret}>
                    清除已保存的 App Secret
                </button>
            </div>
            <div class="cab-help">
                <p>本地网关只监听 127.0.0.1，插件与网关通信会携带本地 token。token 不会写入控制台。</p>
                {#if !gatewayAutoStartSupported}
                    <p>当前环境不支持自动启动本地进程，请复制命令到终端运行。</p>
                {/if}
                <textarea class="cab-command" readonly rows="3" value={manualGatewayCommand}></textarea>
                <button type="button" onclick={copyGatewayCommand}>复制手动启动命令</button>
            </div>
            <div class="cab-help">
                使用飞书开放平台企业自建应用机器人，不是群聊自定义机器人 Webhook。需要开启机器人能力、长连接事件、接收消息事件和机器人发消息权限。
            </div>
        </section>

        <section class="cab-section">
            <h3>安全白名单</h3>
            <div class="cab-help">首次使用建议先点击快速绑定，然后在飞书私聊机器人发送任意文本。</div>
            <div class="cab-grid">
                <label class="cab-field">
                    <span>允许的 open_id</span>
                    <textarea bind:value={allowedOpenIdsText} disabled={!bridgeEditable} rows="5" placeholder="每行一个 open_id"></textarea>
                </label>
                <label class="cab-field">
                    <span>允许的 user_id</span>
                    <textarea bind:value={allowedUserIdsText} disabled={!bridgeEditable} rows="5" placeholder="每行一个 user_id"></textarea>
                </label>
                <label class="cab-field">
                    <span>允许的 chat_id</span>
                    <textarea bind:value={allowedChatIdsText} disabled={!bridgeEditable} rows="5" placeholder="每行一个 chat_id"></textarea>
                </label>
            </div>
            <div class="cab-checks">
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.feishu.allowPrivateChat} disabled={!bridgeEditable} />
                    <span>允许私聊</span>
                </label>
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.feishu.allowGroupChat} disabled={!bridgeEditable} />
                    <span>允许群聊</span>
                </label>
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.feishu.requireMentionInGroup} disabled={!bridgeEditable} />
                    <span>群聊中只响应内置命令</span>
                </label>
            </div>
        </section>

        <section class="cab-section">
            <h3>快速绑定当前飞书账号</h3>
            <div class="cab-help">
                {#if !pairingCapture.capturedAt && !pairingCapture.enabled && !hasWhitelistConfigured}
                    <p>首次使用请先点击下方按钮，然后在飞书中私聊机器人发送任意文本，例如：绑定。</p>
                {:else if pairingCapture.enabled && captureRemaining > 0 && gatewayConnected}
                    <p>请在飞书中私聊机器人发送：绑定。</p>
                {:else if pairingCapture.enabled && captureRemaining > 0}
                    <p>本地网关未启动，请先启动本地飞书网关。</p>
                {:else if pairingCapture.capturedAt && (pairingCapture.openId || pairingCapture.userId || pairingCapture.chatId)}
                    <p>建议点击加入 open_id 白名单，然后保存设置，再启动连接。</p>
                {:else if hasWhitelistConfigured}
                    <p>可以点击连接 / 测试本地网关，然后发送：菜单。</p>
                {:else}
                    <p>首次使用请先点击下方按钮，然后在飞书中私聊机器人发送任意文本，例如：绑定。</p>
                {/if}
            </div>
            {#if pairingCapture.enabled && captureRemaining > 0 && gatewayConnected}
                <div class="cab-capture-status">
                    <p>捕获中，剩余 {captureRemaining} 秒</p>
                    <p class="cab-muted">请向机器人发送一条私聊文本消息。</p>
                </div>
                <button type="button" disabled={!bridgeEditable} onclick={handleStartCapture}>重新开始捕获</button>
            {:else if pairingCapture.enabled && captureRemaining > 0}
                <div class="cab-capture-status">
                    <p>本地网关未启动</p>
                    <p class="cab-muted">飞书 Node SDK 不能在思源前端环境中直接运行，请启动本地飞书网关。</p>
                </div>
                <button type="button" disabled={!bridgeEditable} onclick={handleStartCapture}>重新开始捕获</button>
            {:else if pairingCapture.capturedAt && (pairingCapture.openId || pairingCapture.userId || pairingCapture.chatId)}
                <div class="cab-capture-status">
                    <p>已捕获：{pairingCapture.senderName || "未知用户"}</p>
                    {#if showCapturedIds}
                        <div class="cab-capture-ids">
                            {#if pairingCapture.openId}<p>open_id: {pairingCapture.openId}</p>{/if}
                            {#if pairingCapture.userId}<p>user_id: {pairingCapture.userId}</p>{/if}
                            {#if pairingCapture.chatId}<p>chat_id: {pairingCapture.chatId}</p>{/if}
                        </div>
                        <button type="button" onclick={() => showCapturedIds = false}>隐藏 ID</button>
                    {:else}
                        <button type="button" onclick={() => showCapturedIds = true}>显示 ID</button>
                    {/if}
                </div>
                <div class="cab-actions">
                    {#if pairingCapture.openId}
                        <button type="button" disabled={!bridgeEditable} onclick={() => handleAddToWhitelist("openId")}>
                            加入 open_id 白名单
                        </button>
                    {/if}
                    {#if pairingCapture.userId}
                        <button type="button" disabled={!bridgeEditable} onclick={() => handleAddToWhitelist("userId")}>
                            加入 user_id 白名单
                        </button>
                    {/if}
                    {#if pairingCapture.chatId}
                        <button type="button" disabled={!bridgeEditable} onclick={() => handleAddToWhitelist("chatId")}>
                            加入 chat_id 白名单
                        </button>
                    {/if}
                    <button type="button" onclick={handleClearCapture}>清除捕获结果</button>
                </div>
            {:else if pairingCapture.enabled && captureRemaining <= 0}
                <div class="cab-capture-status">
                    <p>捕获已过期</p>
                </div>
                <button type="button" disabled={!bridgeEditable} onclick={handleStartCapture}>开始捕获下一条私聊消息</button>
                <button type="button" onclick={handleClearCapture}>清除捕获结果</button>
            {:else}
                <button type="button" disabled={!bridgeEditable} onclick={handleStartCapture}>开始捕获下一条私聊消息</button>
            {/if}
        </section>

        <section class="cab-section">
            <h3>消息设置</h3>
            <div class="cab-help">私聊中发送任意文字，会返回操作菜单；回复数字后才会写入或创建任务。</div>
            <div class="cab-grid">
                <label class="cab-field">
                    <span>最大消息长度</span>
                    <input type="number" min="1" max="10000" bind:value={settings.maxMessageLength} disabled={!bridgeEditable} />
                </label>
                <label class="cab-field">
                    <span>菜单有效期（毫秒）</span>
                    <input type="number" min="60000" bind:value={settings.sessionTtlMs} disabled={!bridgeEditable} />
                </label>
                <label class="cab-field">
                    <span>最近记录保留条数（默认 200，范围 20～1000）</span>
                    <input type="number" min="20" max="1000" bind:value={settings.keepHistoryLimit} disabled={!bridgeEditable} />
                </label>
            </div>
            <div class="cab-checks">
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.replyAfterAction} disabled={!bridgeEditable} />
                    <span>操作成功后回复确认</span>
                </label>
            </div>
        </section>

        <section class="cab-section">
            <h3>动作开关</h3>
            <div class="cab-checks">
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.actions.quickNote} disabled={!bridgeEditable} />
                    <span>允许记录快速笔记</span>
                </label>
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.actions.createTodayTask} disabled={!bridgeEditable} />
                    <span>允许创建今日任务</span>
                </label>
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.actions.viewTodayTasks} disabled={!bridgeEditable} />
                    <span>允许查看今日任务</span>
                </label>
                <label>
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.actions.viewOverdueTasks} disabled={!bridgeEditable} />
                    <span>允许查看逾期任务</span>
                </label>
            </div>
        </section>

        <section class="cab-section">
            <div class="cab-section__header">
                <h3>最近处理记录</h3>
                <div class="cab-actions">
                    <button type="button" onclick={refreshHistory}>刷新</button>
                    <button type="button" onclick={handleClearHistory}>清空记录</button>
                </div>
            </div>
            {#if history.length === 0}
                <div class="cab-empty">暂无处理记录。</div>
            {:else}
                <div class="cab-history">
                    <div class="cab-history__head">
                        <span>时间</span>
                        <span>方向</span>
                        <span>状态</span>
                        <span>动作</span>
                        <span>内容预览</span>
                        <span>结果摘要</span>
                    </div>
                    {#each history as item}
                        <div class="cab-history__row">
                            <span>{new Date(item.createdAt).toLocaleString()}</span>
                            <span>{item.direction}</span>
                            <span>{item.status}</span>
                            <span>{item.action || "-"}</span>
                            <span>{item.contentPreview || "-"}</span>
                            <span>{item.resultSummary || "-"}</span>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>
    {/if}
</div>

<style lang="scss">
    .chat-action-bridge-settings {
        display: flex;
        flex-direction: column;
        gap: 16px;
        color: var(--b3-theme-on-background, #202124);

        .cab-section {
            border: 1px solid var(--b3-border-color, #d9d9d9);
            border-radius: 8px;
            padding: 16px;
            background: var(--b3-theme-surface, #fff);
        }

        .cab-section__header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 12px;
        }

        h3 {
            margin: 0 0 8px;
            font-size: 16px;
            font-weight: 600;
        }

        p {
            margin: 0;
            color: var(--b3-theme-on-surface-light, #666);
            font-size: 13px;
        }

        button {
            min-height: 30px;
            padding: 0 12px;
            border: 1px solid var(--b3-border-color, #d9d9d9);
            border-radius: 6px;
            background: var(--b3-theme-background, #fff);
            color: var(--b3-theme-on-background, #202124);
            cursor: pointer;

            &:disabled {
                opacity: 0.55;
                cursor: not-allowed;
            }
        }

        input:not([type="checkbox"]),
        textarea {
            width: 100%;
            min-height: 32px;
            box-sizing: border-box;
            border: 1px solid var(--b3-border-color, #d9d9d9);
            border-radius: 6px;
            padding: 6px 8px;
            background: var(--b3-theme-background, #fff);
            color: var(--b3-theme-on-background, #202124);
        }

        textarea {
            resize: vertical;
            font-family: inherit;
        }

        .cab-actions,
        .cab-checks {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .cab-row,
        .cab-checks label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }

        .cab-row {
            justify-content: space-between;
            margin-top: 10px;
        }

        .cab-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 13px;
        }

        .cab-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-bottom: 12px;
        }

        .cab-help,
        .cab-warning,
        .cab-empty,
        .cab-muted {
            color: var(--b3-theme-on-surface-light, #666);
            font-size: 13px;
            line-height: 1.6;
        }

        .cab-status-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 10px;

            span {
                display: inline-flex;
                align-items: center;
                min-height: 26px;
                padding: 0 8px;
                border: 1px solid var(--b3-border-color, #d9d9d9);
                border-radius: 6px;
                background: var(--b3-theme-background, #fafafa);
                color: var(--b3-theme-on-surface-light, #666);
                font-size: 12px;
            }
        }

        .cab-command {
            margin: 8px 0;
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
        }

        .cab-warning {
            margin-bottom: 10px;
            color: var(--b3-theme-error, #d93025);
        }

        .cab-history {
            overflow-x: auto;
            border: 1px solid var(--b3-border-color, #d9d9d9);
            border-radius: 6px;
        }

        .cab-history__head,
        .cab-history__row {
            display: grid;
            grid-template-columns: 160px 70px 90px 130px minmax(180px, 1fr) minmax(180px, 1fr);
            gap: 8px;
            min-width: 880px;
            padding: 8px 10px;
            font-size: 12px;
            border-bottom: 1px solid var(--b3-border-color, #d9d9d9);
        }

        .cab-history__head {
            font-weight: 600;
            background: var(--b3-theme-background, #fafafa);
        }

        .cab-history__row:last-child {
            border-bottom: 0;
        }

        .cab-capture-status {
            margin: 10px 0;
            padding: 10px;
            background: var(--b3-theme-background, #fafafa);
            border: 1px solid var(--b3-border-color, #d9d9d9);
            border-radius: 6px;
            font-size: 13px;
            line-height: 1.6;
        }

        .cab-capture-ids {
            margin: 6px 0;
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
        }
    }
</style>

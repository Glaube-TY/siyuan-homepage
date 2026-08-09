<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
    import type { RobotSettingsClient } from "@/features/robot-assistant/settings/robot-settings-client";

    interface Props {
        client: RobotSettingsClient;
        initialProvider?: string;
    }

    interface RemoteSession {
        key: { provider: string; accountId: string; chatId: string; senderId?: string };
        conversationId: string;
        title: string;
        active: boolean;
        messages: Array<{ role: "user" | "assistant"; content: string; createdAt: number }>;
        toolCalls: Array<{ toolName: string; action?: string; summary?: string; createdAt: number }>;
        lastActivityAt: number;
    }

    let { client, initialProvider = "all" }: Props = $props();
    let sessions = $state<RemoteSession[]>([]);
    let selectedId = $state("");
    let providerFilter = $state("all");
    let accountFilter = $state("all");
    let loading = $state(true);
    let busy = $state(false);
    let currentSession = $derived(selectedSession());

    onMount(() => {
        providerFilter = initialProvider;
        void refresh();
        return client.subscribe("robot.historyChanged", () => { void refresh(); });
    });

    function parseSession(item: Record<string, unknown>): RemoteSession {
        return {
            key: item.key && typeof item.key === "object"
                ? item.key as RemoteSession["key"]
                : { provider: "unknown", accountId: "", chatId: "" },
            conversationId: String(item.conversationId ?? ""),
            title: typeof item.title === "string" && item.title.trim() ? item.title : "远程对话",
            active: item.active === true,
            messages: Array.isArray(item.messages)
                ? item.messages.filter((entry): entry is RemoteSession["messages"][number] => (
                    Boolean(entry) && typeof entry === "object"
                    && ((entry as Record<string, unknown>).role === "user" || (entry as Record<string, unknown>).role === "assistant")
                    && typeof (entry as Record<string, unknown>).content === "string"
                ))
                : [],
            toolCalls: Array.isArray(item.toolCalls)
                ? item.toolCalls.filter((entry): entry is RemoteSession["toolCalls"][number] => (
                    Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, unknown>).toolName === "string"
                ))
                : [],
            lastActivityAt: typeof item.lastActivityAt === "number" ? item.lastActivityAt : 0,
        };
    }

    async function refresh(preferActive = false): Promise<void> {
        loading = true;
        try {
            sessions = (await client.getSessions()).map(parseSession);
            ensureSelection(preferActive);
        } finally {
            loading = false;
        }
    }

    function providerOptions(): string[] {
        return [...new Set(sessions.map((session) => session.key.provider).filter(Boolean))];
    }

    function accountOptions(): string[] {
        return [...new Set(sessions
            .filter((session) => providerFilter === "all" || session.key.provider === providerFilter)
            .map((session) => session.key.accountId)
            .filter(Boolean))];
    }

    function visibleSessions(): RemoteSession[] {
        return sessions.filter((session) => (
            (providerFilter === "all" || session.key.provider === providerFilter)
            && (accountFilter === "all" || session.key.accountId === accountFilter)
        ));
    }

    function selectedSession(): RemoteSession | undefined {
        return sessions.find((session) => session.conversationId === selectedId);
    }

    function ensureSelection(preferActive = false): void {
        const visible = visibleSessions();
        const currentVisible = visible.some((session) => session.conversationId === selectedId);
        if (!currentVisible || preferActive) {
            selectedId = (visible.find((session) => session.active) ?? visible[0])?.conversationId ?? "";
        }
    }

    function handleProviderChanged(): void {
        accountFilter = "all";
        ensureSelection(true);
    }

    function handleAccountChanged(): void {
        ensureSelection(true);
    }

    async function createConversation(session: RemoteSession): Promise<void> {
        if (busy) return;
        busy = true;
        try {
            await client.resetSession(session.key);
            await refresh(true);
            showMessage("已新建默认对话", 1600);
        } finally {
            busy = false;
        }
    }

    async function activateConversation(session: RemoteSession): Promise<void> {
        if (busy || session.active) return;
        busy = true;
        try {
            await client.activateSession(session.key, session.conversationId);
            await refresh(true);
            showMessage("默认对话已切换", 1600);
        } finally {
            busy = false;
        }
    }

    async function renameConversation(session: RemoteSession, title: string): Promise<void> {
        const normalized = title.trim().slice(0, 80);
        if (busy || !normalized || normalized === session.title) return;
        busy = true;
        try {
            await client.renameSession(session.conversationId, normalized);
            await refresh();
        } finally {
            busy = false;
        }
    }

    async function deleteConversation(session: RemoteSession): Promise<void> {
        if (busy) return;
        const confirmed = await confirmDialogBoolean({
            title: "删除远程对话",
            content: safeConfirmContent(
                "确认删除“", session.title, "”？\n聊天记录和该对话上下文将无法恢复。",
            ),
            width: "min(520px, calc(100vw - 32px))",
        });
        if (!confirmed) return;
        busy = true;
        try {
            await client.deleteSession(session.conversationId);
            await refresh(true);
            showMessage("远程对话已删除", 1600);
        } finally {
            busy = false;
        }
    }

    function providerLabel(provider: string): string {
        return provider === "wechat" ? "微信" : provider === "feishu" ? "飞书" : provider === "qq" ? "QQ" : provider;
    }

    function maskIdentity(value: string): string {
        const normalized = value.trim();
        if (!normalized) return "未知";
        if (normalized.length <= 12) return normalized;
        return `${normalized.slice(0, 5)}…${normalized.slice(-6)}`;
    }

    function formatTime(timestamp: number): string {
        if (!timestamp) return "";
        return new Intl.DateTimeFormat("zh-CN", {
            month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(timestamp);
    }
</script>

<div class="remote-agent-manager">
    <div class="remote-agent-toolbar">
        <label>
            <span>渠道</span>
            <select class="b3-select fn__flex-center" bind:value={providerFilter} onchange={handleProviderChanged}>
                <option value="all">全部渠道</option>
                {#each providerOptions() as provider}
                    <option value={provider}>{providerLabel(provider)}</option>
                {/each}
            </select>
        </label>
        <label>
            <span>机器人账号</span>
            <select class="b3-select fn__flex-center" bind:value={accountFilter} onchange={handleAccountChanged}>
                <option value="all">全部机器人账号</option>
                {#each accountOptions() as accountId}
                    <option value={accountId}>{maskIdentity(accountId)}</option>
                {/each}
            </select>
        </label>
        <span class="remote-agent-count">{visibleSessions().length} 个对话</span>
        <button class="b3-button b3-button--text" disabled={loading} onclick={() => refresh()}>刷新</button>
    </div>

    <div class="remote-agent-layout">
        <aside class="remote-agent-sidebar">
            {#if loading}
                <div class="remote-agent-empty">加载中…</div>
            {:else if visibleSessions().length === 0}
                <div class="remote-agent-empty">暂无对话</div>
            {:else}
                {#each visibleSessions() as session (session.conversationId)}
                    <button class:remote-agent-conversation--selected={session.conversationId === selectedId}
                        class="remote-agent-conversation" onclick={() => selectedId = session.conversationId}>
                        <span class="remote-agent-conversation__title">{session.title}</span>
                        <span class="remote-agent-conversation__meta">
                            {formatTime(session.lastActivityAt)}
                            {#if session.active}<i>默认</i>{/if}
                        </span>
                    </button>
                {/each}
            {/if}
        </aside>

        <main class="remote-agent-detail">
            {#if currentSession}
                <header class="remote-agent-detail__header">
                    <div class="remote-agent-title-row">
                        <input class="b3-text-field" value={currentSession.title} aria-label="对话名称" disabled={busy}
                            onchange={(event) => renameConversation(currentSession, event.currentTarget.value)} />
                        {#if currentSession.active}<span class="remote-agent-default">默认对话</span>{/if}
                    </div>
                    <div class="remote-agent-actions">
                        {#if !currentSession.active}
                            <button class="b3-button b3-button--text" disabled={busy}
                                onclick={() => activateConversation(currentSession)}>设为默认</button>
                        {/if}
                        <button class="b3-button" disabled={busy} onclick={() => createConversation(currentSession)}>新建对话</button>
                        <button class="b3-button b3-button--cancel" disabled={busy}
                            onclick={() => deleteConversation(currentSession)}>删除</button>
                    </div>
                    <small>{providerLabel(currentSession.key.provider)} · {maskIdentity(currentSession.key.accountId)} · {formatTime(currentSession.lastActivityAt)}</small>
                </header>

                <div class="remote-agent-messages">
                    {#if currentSession.messages.length === 0}
                        <div class="remote-agent-empty">空白对话</div>
                    {:else}
                        {#each currentSession.messages as message, index (`${message.createdAt}-${index}`)}
                            <article class="remote-agent-message remote-agent-message--{message.role}">
                                <small>{message.role === "user" ? "用户" : "Agent"} · {formatTime(message.createdAt)}</small>
                                <p>{message.content}</p>
                            </article>
                        {/each}
                    {/if}
                </div>

                {#if currentSession.toolCalls.length > 0}
                    <details class="remote-agent-tools">
                        <summary>执行记录（{currentSession.toolCalls.length}）</summary>
                        {#each currentSession.toolCalls as tool, index (`${tool.createdAt}-${tool.toolName}-${index}`)}
                            <span>{tool.toolName}{tool.action ? `.${tool.action}` : ""}{tool.summary ? `：${tool.summary}` : ""}</span>
                        {/each}
                    </details>
                {/if}
            {:else}
                <div class="remote-agent-empty remote-agent-empty--detail">选择一个对话</div>
            {/if}
        </main>
    </div>
</div>

<style>
    .remote-agent-manager {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        height: 100%;
        flex-direction: column;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .remote-agent-toolbar {
        display: grid;
        grid-template-columns: minmax(150px, 180px) minmax(220px, 280px) 1fr auto;
        align-items: end;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .remote-agent-toolbar label {
        display: grid;
        min-width: 0;
        gap: 5px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .remote-agent-toolbar .b3-select {
        width: 100%;
        max-width: none;
        min-width: 0;
        height: auto;
        min-height: 38px;
        margin: 0;
        padding: 0.55rem 2.5rem 0.55rem 0.75rem;
        box-sizing: border-box;
        color: var(--b3-theme-on-surface) !important;
        background-color: var(--b3-theme-background);
        background-position: right 10px center;
        font-size: 13px;
        line-height: 1.25;
        text-indent: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .remote-agent-toolbar .b3-select option {
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .remote-agent-count {
        align-self: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .remote-agent-layout {
        display: grid;
        grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);
        flex: 1;
        min-width: 0;
        min-height: 0;
    }

    .remote-agent-sidebar {
        min-width: 0;
        overflow: auto;
        padding: 8px;
        border-right: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
    }

    .remote-agent-conversation {
        display: flex;
        width: 100%;
        min-width: 0;
        padding: 10px 11px;
        border: 0;
        border-radius: 8px;
        flex-direction: column;
        gap: 6px;
        color: var(--b3-theme-on-background);
        background: transparent;
        text-align: left;
        cursor: pointer;
    }

    .remote-agent-conversation:hover,
    .remote-agent-conversation--selected {
        background: var(--b3-list-hover);
    }

    .remote-agent-conversation--selected {
        box-shadow: inset 3px 0 0 var(--b3-theme-primary);
    }

    .remote-agent-conversation__title {
        overflow: hidden;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .remote-agent-conversation__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
    }

    .remote-agent-conversation__meta i,
    .remote-agent-default {
        padding: 2px 7px;
        border-radius: 999px;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 14%, transparent);
        font-style: normal;
        font-size: 11px;
    }

    .remote-agent-detail {
        display: flex;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        flex-direction: column;
    }

    .remote-agent-detail__header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .remote-agent-title-row,
    .remote-agent-actions {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 8px;
    }

    .remote-agent-title-row .b3-text-field {
        width: min(420px, 100%);
        min-width: 0;
        font-weight: 600;
    }

    .remote-agent-detail__header > small {
        grid-column: 1 / -1;
        color: var(--b3-theme-on-surface-light);
    }

    .remote-agent-messages {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 18px;
        flex-direction: column;
        gap: 12px;
    }

    .remote-agent-message {
        align-self: flex-start;
        max-width: min(78%, 720px);
        padding: 10px 13px;
        border-radius: 10px;
        background: var(--b3-list-hover);
    }

    .remote-agent-message--user {
        align-self: flex-end;
        background: color-mix(in srgb, var(--b3-theme-primary) 13%, var(--b3-theme-background));
    }

    .remote-agent-message small {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
    }

    .remote-agent-message p {
        margin: 5px 0 0;
        line-height: 1.65;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    .remote-agent-tools {
        flex: none;
        max-height: 150px;
        overflow: auto;
        padding: 9px 16px 12px;
        border-top: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .remote-agent-tools summary {
        color: var(--b3-theme-on-background);
        cursor: pointer;
    }

    .remote-agent-tools span {
        display: block;
        margin-top: 6px;
    }

    .remote-agent-empty {
        padding: 20px 10px;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    .remote-agent-empty--detail {
        display: grid;
        flex: 1;
        place-items: center;
    }

    @media (max-width: 720px) {
        .remote-agent-toolbar {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
        }

        .remote-agent-count {
            display: none;
        }

        .remote-agent-layout {
            grid-template-columns: minmax(150px, 38%) minmax(0, 1fr);
        }

        .remote-agent-detail__header {
            grid-template-columns: 1fr;
        }

        .remote-agent-actions {
            overflow-x: auto;
        }

        .remote-agent-message {
            max-width: 92%;
        }
    }
</style>

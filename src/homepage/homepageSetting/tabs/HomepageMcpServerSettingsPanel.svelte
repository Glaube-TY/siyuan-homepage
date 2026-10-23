<script lang="ts">
    import { onMount } from "svelte";
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
        type HomepageEntitlementSnapshot,
    } from "@/features/entitlement/homepage-entitlement";
    import {
        getHomepageMcpServerState,
        isHomepageMcpUnsupportedError,
        setHomepageMcpServerEnabled,
        setHomepageMcpWriteEnabled,
        getHomepageMcpPendingWrites,
        decideHomepageMcpWrite,
        type HomepageMcpWriteRequest,
        type HomepageMcpServerSnapshot,
    } from "@/features/agent-platform/mcp-server/homepage-mcp-server-client";

    interface Props {
        plugin: unknown;
    }

    let { plugin }: Props = $props();

    let snapshot = $state<HomepageMcpServerSnapshot | null>(null);
    let entitlement = $state<HomepageEntitlementSnapshot>(getHomepageEntitlementSnapshot());
    let loading = $state(true);
    let saving = $state(false);
    let refreshing = $state(false);
    let unsupported = $state(false);
    let errorMessage = $state("");
    let disposed = false;
    let requests = $state<HomepageMcpWriteRequest[]>([]);
    let now = $state(Date.now());

    let statusLabel = $derived(resolveStatusLabel(snapshot, loading, unsupported, entitlement.advanced));
    let toggleDisabled = $derived(loading || saving || refreshing || unsupported || !entitlement.advanced);
    let writeToggleDisabled = $derived(toggleDisabled || !snapshot?.active || !snapshot?.entitlementAvailable || snapshot?.status !== "enabled");

    onMount(() => {
        const unsubscribe = subscribeHomepageEntitlement((next) => {
            entitlement = next;
            void refresh();
        });
        const timer = setInterval(() => {
            now = Date.now();
            if (!loading && !saving && document.visibilityState !== "hidden") void refresh(true);
        }, 5_000);
        return () => {
            clearInterval(timer);
            disposed = true;
            unsubscribe();
        };
    });

    async function refresh(background = false): Promise<void> {
        if (refreshing) return;
        refreshing = true;
        if (!background) {
            loading = true;
            errorMessage = "";
        }
        try {
            const pending = await getHomepageMcpPendingWrites(plugin);
            const next = await getHomepageMcpServerState(plugin);
            if (disposed) return;
            snapshot = next;
            requests = pending;
            now = Date.now();
            unsupported = false;
        } catch (error) {
            if (disposed) return;
            if (isHomepageMcpUnsupportedError(error)) {
                snapshot = null;
                unsupported = true;
                errorMessage = "";
            } else {
                unsupported = false;
                snapshot = null;
                requests = [];
                errorMessage = "对外 MCP 服务状态暂时不可用，请稍后重试。";
            }
        } finally {
            if (!disposed) loading = false;
            refreshing = false;
        }
    }

    async function handleEnabledChange(event: Event): Promise<void> {
        const control = event.currentTarget as HTMLInputElement;
        const enabled = control.checked;
        control.checked = snapshot?.enabled === true;
        if (toggleDisabled) return;
        saving = true;
        errorMessage = "";
        try {
            snapshot = await setHomepageMcpServerEnabled(plugin, enabled);
            unsupported = false;
            await refresh(true);
        } catch (error) {
            if (isHomepageMcpUnsupportedError(error)) {
                snapshot = null;
                unsupported = true;
            } else {
                errorMessage = "对外 MCP 服务设置暂时无法保存，请稍后重试。";
            }
        } finally {
            saving = false;
            control.checked = snapshot?.enabled === true;
        }
    }

    async function handleWriteEnabledChange(event: Event): Promise<void> {
        const control = event.currentTarget as HTMLInputElement;
        const enabled = control.checked;
        control.checked = snapshot?.writeEnabled === true;
        if (writeToggleDisabled) return;
        saving = true;
        errorMessage = "";
        try {
            snapshot = await setHomepageMcpWriteEnabled(plugin, enabled);
            if (enabled && !snapshot.writeActive) errorMessage = "写入授权未开启，已保持或恢复只读服务。";
            await refresh(true);
        } catch {
            errorMessage = "写入授权操作失败，请刷新状态后重试。";
        } finally {
            saving = false;
            control.checked = snapshot?.writeEnabled === true;
        }
    }

    async function handleDecision(confirmationId: string, approved: boolean): Promise<void> {
        if (saving || refreshing || !snapshot?.writeActive) return;
        saving = true;
        errorMessage = "";
        try {
            snapshot = await decideHomepageMcpWrite(plugin, confirmationId, approved);
            await refresh(true);
        } catch {
            errorMessage = "请求可能已过期或授权已失效，请刷新状态后重试。";
        } finally {
            saving = false;
        }
    }

    function requestDescription(request: HomepageMcpWriteRequest): string {
        const state = request.expiresAt <= now ? "已过期"
            : request.status === "approved" ? "已同意，等待客户端重试" : "等待确认";
        return request.targetSummary + " · " + new Date(request.requestedAt).toLocaleString()
            + " · " + state + "（" + Math.max(0, Math.ceil((request.expiresAt - now) / 1000)) + " 秒后过期）";
    }

    function resolveStatusLabel(
        current: HomepageMcpServerSnapshot | null,
        isLoading: boolean,
        isUnsupported: boolean,
        hasEntitlement: boolean,
    ): string {
        if (isUnsupported) return "当前环境不支持对外 MCP 服务";
        if (isLoading && !current) return "正在初始化";
        if (!current) return "状态未知";
        if (current.status === "initializing") return "正在初始化";
        if (current.status === "error") return "服务异常";
        if (current.status === "locked") {
            return current.enabled && !hasEntitlement
                ? "会员不可用 · 已保留开启设置"
                : "会员不可用";
        }
        if (current.status === "enabled") {
            return `已开启 · ${current.capabilityCount}/${current.expectedCapabilityCount}`;
        }
        return "已关闭";
    }
</script>

<section class="mcp-server-center" aria-labelledby="homepage-mcp-heading">
    <header class="center-header">
        <div>
            <h3 id="homepage-mcp-heading">对外 MCP 服务 <PremiumMark size={13} /></h3>
            <p>外部 MCP 默认只读；本次运行授权并逐次确认后，可新增收藏。</p>
        </div>
    </header>

    <SettingSection title="服务设置">
        <SettingRow
            title="启用 MCP 服务"
            description="默认开放经过审核的只读能力；仅收藏新增可单独授权写入。外部 Agent 连接时需携带有效的思源 API Token 进行鉴权，请先在「思源设置 → 鉴权」中获取，并在对应 MCP 客户端中配置。"
        >
            <input
                class="b3-switch"
                type="checkbox"
                checked={snapshot?.enabled === true}
                disabled={toggleDisabled}
                aria-label="启用对外 MCP 服务"
                onchange={handleEnabledChange}
            />
        </SettingRow>

        <SettingRow
            title="允许本次运行 MCP 写入"
            description="仅允许已审核的写入操作，每次执行前还需在插件中确认。关闭服务或重启插件后会自动关闭写入权限。"
        >
            <div class="status-control">
                <span aria-live="polite">{snapshot ? snapshot.writeActive ? "已开启写入授权" : "只读" : "状态未知"}</span>
                <input
                    class="b3-switch"
                    type="checkbox"
                    checked={snapshot?.writeEnabled === true}
                    disabled={writeToggleDisabled}
                    aria-label="允许本次运行 MCP 写入"
                    onchange={handleWriteEnabledChange}
                />
            </div>
        </SettingRow>

        <SettingRow title="服务状态" description="状态由 Kernel Runtime 负责控制和持久化。">
            <div class="status-control" aria-live="polite" aria-busy={loading || saving}>
                <span class:error={snapshot?.status === "error" || unsupported}>{statusLabel}</span>
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline"
                    onclick={() => void refresh()}
                    disabled={loading || saving}
                >
                    刷新状态
                </button>
            </div>
        </SettingRow>

        {#if errorMessage}
            <div class="state error" role="alert">{errorMessage}</div>
        {/if}
    </SettingSection>

    <SettingSection title="待确认写入">
        {#each requests as request (request.confirmationId)}
            <SettingRow title="新增收藏" description={requestDescription(request)}>
                <div class="status-control">
                    <button
                        type="button"
                        class="b3-button b3-button--small"
                        disabled={saving || refreshing || !snapshot?.writeActive || request.status === "approved" || request.expiresAt <= now}
                        onclick={() => void handleDecision(request.confirmationId, true)}
                    >同意</button>
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline"
                        disabled={saving || refreshing || !snapshot?.writeActive || request.expiresAt <= now}
                        onclick={() => void handleDecision(request.confirmationId, false)}
                    >拒绝</button>
                </div>
            </SettingRow>
        {:else}
            <p class="state" role="status">暂无待处理的写入请求。</p>
        {/each}
    </SettingSection>
</section>

<style>
    .mcp-server-center {
        display: grid;
        gap: 14px;
    }

    .center-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .center-header h3 {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin: 0 0 5px;
        color: var(--b3-theme-on-surface);
        font-size: 15px;
    }

    .center-header p {
        max-width: 680px;
        margin: 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.55;
    }

    .status-control {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
    }

    .status-control span {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        text-align: right;
    }

    .status-control span.error,
    .state.error {
        color: var(--b3-theme-error);
    }

    .state.error {
        padding: 8px 0 0;
        font-size: 12px;
    }

    @media (max-width: 640px) {
        .status-control {
            justify-content: flex-start;
            flex-wrap: wrap;
        }

        .status-control span {
            text-align: left;
        }
    }
    @media (max-width: 480px) {
        .mcp-server-center :global(.setting-row__info) {
            flex-basis: auto;
        }
    }
</style>

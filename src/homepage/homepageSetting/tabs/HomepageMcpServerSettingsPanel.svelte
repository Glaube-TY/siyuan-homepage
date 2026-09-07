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
    let unsupported = $state(false);
    let errorMessage = $state("");
    let disposed = false;

    let statusLabel = $derived(resolveStatusLabel(snapshot, loading, unsupported, entitlement.advanced));
    let toggleDisabled = $derived(loading || saving || unsupported || !entitlement.advanced);

    onMount(() => {
        const unsubscribe = subscribeHomepageEntitlement((next) => {
            entitlement = next;
            void refresh();
        });
        return () => {
            disposed = true;
            unsubscribe();
        };
    });

    async function refresh(): Promise<void> {
        loading = true;
        errorMessage = "";
        try {
            const next = await getHomepageMcpServerState(plugin);
            if (disposed) return;
            snapshot = next;
            unsupported = false;
        } catch (error) {
            if (disposed) return;
            if (isHomepageMcpUnsupportedError(error)) {
                snapshot = null;
                unsupported = true;
                errorMessage = "";
            } else {
                unsupported = false;
                errorMessage = "对外 MCP 服务状态暂时不可用，请稍后重试。";
            }
        } finally {
            if (!disposed) loading = false;
        }
    }

    async function handleEnabledChange(event: Event): Promise<void> {
        const enabled = (event.currentTarget as HTMLInputElement).checked;
        if (toggleDisabled) return;
        saving = true;
        errorMessage = "";
        try {
            snapshot = await setHomepageMcpServerEnabled(plugin, enabled);
            unsupported = false;
        } catch (error) {
            if (isHomepageMcpUnsupportedError(error)) {
                snapshot = null;
                unsupported = true;
            } else {
                errorMessage = "对外 MCP 服务设置暂时无法保存，请稍后重试。";
            }
        } finally {
            saving = false;
        }
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
            <p>允许外部 MCP 客户端读取主页插件开放的部分业务数据。</p>
        </div>
    </header>

    <SettingSection title="服务设置">
        <SettingRow
            title="启用 MCP 服务"
            description="当前仅开放经过审核的只读能力。外部 Agent 连接时需携带有效的思源 API Token 进行鉴权，请先在「思源设置 → 鉴权」中获取，并在对应 MCP 客户端中配置。"
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
</style>

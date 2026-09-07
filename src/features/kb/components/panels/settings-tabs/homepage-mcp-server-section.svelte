<script lang="ts">
  import { onMount } from "svelte";
  import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";
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
  } from "@/features/kb/services/mcp-server/homepage-mcp-server-client";

  export let plugin: unknown = undefined;
  export let mobile = false;

  let snapshot: HomepageMcpServerSnapshot | null = null;
  let entitlement: HomepageEntitlementSnapshot = getHomepageEntitlementSnapshot();
  let loading = true;
  let saving = false;
  let unsupported = false;
  let errorMessage = "";
  let disposed = false;

  $: statusLabel = resolveStatusLabel(snapshot, loading, unsupported, entitlement.advanced);
  $: toggleDisabled = loading || saving || unsupported || !entitlement.advanced;

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
        errorMessage = "主页 MCP 服务状态暂时不可用，请稍后重试。";
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
        errorMessage = "主页 MCP 服务设置暂时无法保存，请稍后重试。";
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
    if (isUnsupported) return "当前环境不支持主页 MCP 服务";
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

<section class="settings-section homepage-mcp-server-section" class:mobile>
  <div class="section-header">
    <h2 class="section-title">主页对外 MCP 服务 <PremiumMark size={13} /></h2>
    <p class="section-description">将主页的只读能力注册为外部 MCP 服务，供 WorkBuddy、Claude、Codex 等可信 MCP 客户端使用。</p>
  </div>

  <div class="setting-row master-row">
    <div class="setting-text">
      <span class="setting-title">启用主页对外 MCP 服务</span>
      <span class="setting-desc">仅注册允许范围内的只读能力，不创建额外 HTTP、SSE 或 stdio 服务。</span>
    </div>
    <label class="switch" aria-label="启用主页对外 MCP 服务">
      <input
        type="checkbox"
        checked={snapshot?.enabled === true}
        disabled={toggleDisabled}
        on:change={handleEnabledChange}
      />
      <span class="slider"></span>
    </label>
  </div>

  <div class="homepage-mcp-helper">
    <p>当前仅开放只读能力。开启后，已连接的可信 MCP 客户端可读取允许范围内的数据。</p>
    {#if !entitlement.advanced && !unsupported}
      <p class="field-hint">高级会员可用；当前仅展示状态，不会保存开启操作。</p>
    {/if}
    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}
    <div class="homepage-mcp-status" aria-live="polite" aria-busy={loading || saving}>
      <span>{statusLabel}</span>
      <button type="button" class="secondary-btn" on:click={refresh} disabled={loading || saving}>重试</button>
    </div>
  </div>
</section>

<style lang="scss">
  .homepage-mcp-server-section {
    .section-title {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .homepage-mcp-helper {
      display: grid;
      gap: 0.35rem;
      margin-top: 0.75rem;
      color: var(--b3-theme-on-surface-light);
      font-size: 0.82rem;

      p {
        margin: 0;
      }
    }

    .homepage-mcp-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 0.25rem;
      color: var(--b3-theme-on-surface);
      font-size: 0.82rem;
    }

    .secondary-btn {
      flex: 0 0 auto;
    }
  }
</style>

<script lang="ts">
  import type { KbChatProviderConfig } from "../../../types/settings";
  import { MODEL_PROVIDER_PRESETS } from "../../../constants/model-provider-presets";
  import { normalizeId, getProviderModelCount } from "../../../services/settings/chat-provider-config";

  export let providers: KbChatProviderConfig[] = [];
  export let editingProviderId: string = "";
  export let selectedProviderId: string = "";
  export let selectedPresetId: string = "";

  export let onSelectProvider: (providerId: string) => void = () => {};
  export let onSelectPreset: (presetId: string) => void = () => {};
  export let isPresetAdded: (presetId: string) => boolean = () => false;

  function handlePresetChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const presetId = select.value;
    selectedPresetId = presetId;
    onSelectPreset(presetId);
  }

  function isCurrentProvider(providerId: string): boolean {
    return normalizeId(providerId) === normalizeId(selectedProviderId);
  }
</script>

<div class="provider-list">
  <div class="list-header">
    <span class="list-title">供应商列表</span>
  </div>

  <div class="provider-items">
    {#if providers.length === 0}
      <div class="empty-state">
        还没有模型供应商，请从下方预设添加。
      </div>
    {:else}
      {#each providers as provider, providerIndex (`${providerIndex}-${normalizeId(provider.id)}`)}
        <button
          type="button"
          class="provider-item"
          class:active={normalizeId(editingProviderId) === normalizeId(provider.id)}
          class:disabled={provider.enabled === false}
          on:click={() => onSelectProvider(provider.id)}
        >
          <div class="provider-info">
            <span class="provider-name">{provider.name}</span>
            <span class="model-count">{getProviderModelCount(provider)} 个模型</span>
          </div>
          <div class="provider-badges">
            {#if isCurrentProvider(provider.id)}
              <span class="badge current">当前使用</span>
            {/if}
            {#if provider.enabled === false}
              <span class="badge disabled">已禁用</span>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>

  <div class="add-provider">
    <select bind:value={selectedPresetId} on:change={handlePresetChange} class="preset-select">
      <option value="">选择供应商模板...</option>
      {#each MODEL_PROVIDER_PRESETS as preset}
        <option value={preset.id} disabled={isPresetAdded(preset.id)}>
          {preset.label}{isPresetAdded(preset.id) ? "（已添加）" : ""}
        </option>
      {/each}
    </select>
  </div>
</div>

<style lang="scss">
  .provider-list {
    width: 240px;
    min-width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;

    @media (max-width: 768px) {
      width: 100%;
    }
  }

  .list-header {
    padding: 8px 0;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .list-title {
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .provider-items {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .empty-state {
    padding: 16px 12px;
    color: var(--b3-theme-on-surface-light);
    font-size: 13px;
    text-align: center;
  }

  .provider-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
    min-width: 0;

    &:hover {
      background: var(--b3-theme-background-light);
    }

    &.active {
      border-color: var(--b3-theme-primary);
      background: var(--b3-theme-background-light);
    }

    &.disabled {
      opacity: 0.6;
    }
  }

  .provider-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .provider-name {
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .model-count {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .provider-badges {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;

    &.current {
      background: var(--b3-theme-primary);
      color: white;
    }

    &.disabled {
      background: var(--b3-theme-surface-light);
      color: var(--b3-theme-on-surface-light);
    }
  }

  .add-provider {
    padding-top: 8px;
    border-top: 1px solid var(--b3-border-color);
  }

  .preset-select {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 14px;
  }
</style>

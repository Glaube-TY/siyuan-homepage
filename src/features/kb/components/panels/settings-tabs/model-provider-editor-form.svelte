<script lang="ts">
  import type { KbChatProviderConfig, KbChatProviderType } from "../../../types/settings";

  export let provider: KbChatProviderConfig;
  export let shouldShowApiKeyField: (provider: KbChatProviderConfig) => boolean;
  export let getBaseUrlHint: (providerType: KbChatProviderType) => string;
  export let getApiKeyPlaceholder: (providerType: KbChatProviderType) => string;
  export let onUpdateProvider: (providerId: string, patch: Partial<KbChatProviderConfig>) => void;
</script>

<div class="form-section">
  <div class="form-row">
    <label class="form-label">
      <span>名称</span>
      <input
        type="text"
        value={provider.name}
        on:input={(e) =>
          onUpdateProvider(provider.id, { name: e.currentTarget.value })}
        class="form-input"
      />
    </label>
  </div>

  <div class="form-row">
    <label class="form-label">
      <span>Base URL</span>
      <input
        type="text"
        value={provider.baseUrl}
        on:input={(e) =>
          onUpdateProvider(provider.id, { baseUrl: e.currentTarget.value })}
        class="form-input"
        placeholder={getBaseUrlHint(provider.type)}
      />
    </label>
    <span class="input-hint">{getBaseUrlHint(provider.type)}</span>
  </div>

  {#if shouldShowApiKeyField(provider)}
  <div class="form-row">
    <label class="form-label">
      <span>API Key</span>
      <input
        type="password"
        value={provider.apiKey || ""}
        on:input={(e) =>
          onUpdateProvider(provider.id, { apiKey: e.currentTarget.value })}
        class="form-input"
        placeholder={getApiKeyPlaceholder(provider.type)}
      />
    </label>
    {#if provider.type === "openai-compatible"}
    <span class="input-hint">OpenAI 兼容接口的 API Key 可留空；本地或内网服务通常不需要，远程平台通常需要。</span>
    {/if}
  </div>
  {/if}

  <div class="form-row checkbox-row">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={provider.enabled !== false}
        on:change={(e) =>
          onUpdateProvider(provider.id, { enabled: e.currentTarget.checked })}
      />
      <span>启用此提供商</span>
    </label>
  </div>
</div>

<style lang="scss">
  .form-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;

    &.checkbox-row {
      flex-direction: row;
      align-items: center;
    }
  }

  .form-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    cursor: auto;
    width: 100%;
  }

  .form-input {
    padding: 8px 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 14px;
    min-width: 0;
    width: 100%;

    &:focus {
      outline: none;
      border-color: var(--b3-theme-primary);
    }
  }

  .input-hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: left;
    width: 100%;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--b3-theme-on-surface);

    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;

      &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
    }
  }
</style>

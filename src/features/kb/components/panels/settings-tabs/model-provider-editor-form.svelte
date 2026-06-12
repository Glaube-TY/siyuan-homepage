<script lang="ts">
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import type { KbChatProviderConfig, KbChatProviderType } from "../../../types/settings";

  export let provider: KbChatProviderConfig;
  export let shouldShowApiKeyField: (provider: KbChatProviderConfig) => boolean;
  export let getBaseUrlHint: (providerType: KbChatProviderType) => string;
  export let getApiKeyPlaceholder: (providerType: KbChatProviderType) => string;
  export let onUpdateProvider: (providerId: string, patch: Partial<KbChatProviderConfig>) => void;

  let showApiKey = false;
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
      <div class="api-key-input-wrap">
        <input
          type={showApiKey ? "text" : "password"}
          value={provider.apiKey || ""}
          on:input={(e) =>
            onUpdateProvider(provider.id, { apiKey: e.currentTarget.value })}
          class="form-input api-key-input"
          placeholder={getApiKeyPlaceholder(provider.type)}
        />
        <button
          type="button"
          class="api-key-visibility-button"
          title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
          aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
          on:click={() => (showApiKey = !showApiKey)}
        >
          <SiyuanIcon name={showApiKey ? "iconEye" : "iconEyeoff"} size={16} />
        </button>
      </div>
    </label>
    <span class="input-hint">API Key 会在本地加密保存，用于避免配置文件中明文暴露。</span>
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
    width: 100%;
    min-width: 0;

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
    min-width: 0;
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
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: var(--b3-theme-primary);
    }
  }

  .api-key-input-wrap {
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .api-key-input {
    padding-right: 40px;
    max-width: 100%;
  }

  .api-key-visibility-button {
    position: absolute;
    top: 50%;
    right: 6px;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--b3-theme-on-surface-light);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      background: var(--b3-list-hover);
      color: var(--b3-theme-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--b3-theme-primary);
      outline-offset: 1px;
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

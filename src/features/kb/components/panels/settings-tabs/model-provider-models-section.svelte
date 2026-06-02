<script lang="ts">
  import type { KbChatProviderConfig, KbChatModelConfig } from "../../../types/settings";
  import type { ModelConnectionTestResult } from "../../../services/qa/model-connection-test";
  import {
    normalizeId,
    hasUsableChatModel,
  } from "../../../services/settings/chat-provider-config";

  export let provider: KbChatProviderConfig;
  export let refreshMessage: string = "";
  export let modelActionMessage: string = "";
  export let modelActionMessageType: "success" | "error" = "success";
  export let testingModelKey: string = "";

  export let canRefreshModels: (provider: KbChatProviderConfig) => boolean;
  export let getRefreshButtonTitle: (provider: KbChatProviderConfig) => string;
  export let onRefreshModels: (provider: KbChatProviderConfig) => void | Promise<void>;
  export let onAddModel: (providerId: string) => void;
  export let onUpdateModel: (providerId: string, modelIndex: number, patch: Partial<KbChatModelConfig>) => void;
  export let onRemoveModel: (providerId: string, modelIndex: number) => void;
  export let onSelectModel: (providerId: string, modelId: string) => void;
  export let onTestModel: (providerId: string, modelId: string) => void | Promise<void>;
  export let isCurrentModel: (providerId: string, modelId: string) => boolean;
  export let canUseModel: (provider: KbChatProviderConfig, model: KbChatModelConfig) => boolean;
  export let getSelectModelTitle: (provider: KbChatProviderConfig, model: KbChatModelConfig) => string;
  export let getTestModelTitle: (provider: KbChatProviderConfig, model: KbChatModelConfig) => string;
  export let isTestingModel: (providerId: string, modelId: string) => boolean;
  export let getModelTestResult: (providerId: string, modelId: string) => ModelConnectionTestResult | undefined;
</script>

<div class="models-section">
  <div class="section-header">
    <h4>模型列表</h4>
    <div class="section-header-actions">
      <button
        type="button"
        class="settings-btn secondary"
        on:click={() => onRefreshModels(provider)}
        disabled={!canRefreshModels(provider)}
        title={getRefreshButtonTitle(provider)}
      >
        刷新模型列表
      </button>
      <button type="button" class="settings-btn primary" on:click={() => onAddModel(provider.id)}>
        添加模型
      </button>
    </div>
  </div>
  <div class="models-hint">
    测试连接会向对应模型发送一次简短请求，远程模型可能产生少量调用费用。
  </div>
  <div class="models-hint">
    模型更新较快，可点击刷新从服务商拉取当前账号可用模型；也可以手动填写模型 ID。
  </div>
  {#if refreshMessage}
    <div class="refresh-message">{refreshMessage}</div>
  {/if}
  {#if modelActionMessage}
    <div class="model-action-message" class:success={modelActionMessageType === "success"} class:error={modelActionMessageType === "error"}>
      {modelActionMessage}
    </div>
  {/if}
  {#if provider.models.length === 0}
    <div class="models-empty-state">
      <p>暂无模型，请点击"添加模型"或"刷新模型列表"。</p>
    </div>
  {:else if !hasUsableChatModel(provider)}
    <div class="no-models-warning">
      当前提供商还没有可用聊天模型，请刷新模型列表或手动填写模型 ID。
    </div>
  {/if}

  <div class="models-list">
    {#each provider.models as model, modelIndex (modelIndex)}
      <div class="model-item">
        <div class="model-fields">
          <div class="model-field">
            <label>
              <span>模型 ID</span>
              <input
                type="text"
                value={model.id}
                on:input={(e) =>
                  onUpdateModel(provider.id, modelIndex, {
                    id: e.currentTarget.value,
                  })}
                class="form-input"
              />
            </label>
          </div>
          <div class="model-field">
            <label>
              <span>显示名称</span>
              <input
                type="text"
                value={model.name}
                on:input={(e) =>
                  onUpdateModel(provider.id, modelIndex, {
                    name: e.currentTarget.value,
                  })}
                class="form-input"
              />
            </label>
          </div>
          <div class="model-field small">
            <label>
              <span>Temperature</span>
              <input
                type="number"
                value={model.temperature}
                min="0"
                max="2"
                step="0.1"
                on:input={(e) =>
                  onUpdateModel(provider.id, modelIndex, {
                    temperature: parseFloat(e.currentTarget.value) || 0,
                  })}
                class="form-input"
              />
            </label>
          </div>
          <div class="model-field small">
            <label>
              <span>Max Tokens</span>
              <input
                type="number"
                value={model.maxTokens || ""}
                min="1"
                on:input={(e) =>
                  onUpdateModel(provider.id, modelIndex, {
                    maxTokens: e.currentTarget.value
                      ? parseInt(e.currentTarget.value, 10)
                      : undefined,
                  })}
                class="form-input"
                placeholder="无限制"
              />
            </label>
          </div>
        </div>

        <div class="model-actions">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={model.enabled !== false}
              on:change={(e) =>
                onUpdateModel(provider.id, modelIndex, {
                  enabled: e.currentTarget.checked,
                })}
            />
            <span>启用</span>
          </label>

          <button
            type="button"
            class="settings-btn primary"
            disabled={!normalizeId(model.id) || isCurrentModel(provider.id, model.id) || !canUseModel(provider, model)}
            title={getSelectModelTitle(provider, model)}
            on:click={() => onSelectModel(provider.id, model.id)}
          >
            {isCurrentModel(provider.id, model.id) ? "当前使用" : "设为当前"}
          </button>

          <button
            type="button"
            class="settings-btn secondary"
            disabled={
              Boolean(testingModelKey) ||
              !canUseModel(provider, model)
            }
            title={getTestModelTitle(provider, model)}
            on:click={() => onTestModel(provider.id, model.id)}
          >
            {isTestingModel(provider.id, model.id) ? "测试中..." : "测试连接"}
          </button>

          <button
            type="button"
            class="settings-btn danger"
            on:click={() => onRemoveModel(provider.id, modelIndex)}
          >
            删除
          </button>
        </div>

        <!-- 测试结果 -->
        {#if getModelTestResult(provider.id, model.id)}
          {@const result = getModelTestResult(provider.id, model.id)}
          <div class="test-result" class:success={result.success} class:error={!result.success}>
            {result.message}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .models-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;

    h4 {
      margin: 0;
      font-size: 16px;
      color: var(--b3-theme-on-surface);
    }
  }

  .section-header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .refresh-message {
    margin-top: 4px;
    padding: 8px 10px;
    background: var(--b3-theme-surface);
    border-radius: 6px;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    line-height: 1.4;
  }

  .model-action-message {
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;

    &.success {
      background: var(--b3-theme-success-light, rgba(76, 175, 80, 0.1));
      color: var(--b3-theme-success, #2e7d32);
    }

    &.error {
      background: var(--b3-theme-error-light, rgba(244, 67, 54, 0.1));
      color: var(--b3-theme-error, #c62828);
    }
  }

  .no-models-warning {
    margin-top: 4px;
    padding: 8px 10px;
    background: var(--b3-theme-warning, #fff3e0);
    border-radius: 6px;
    font-size: 12px;
    color: var(--b3-theme-warning-text, #e65100);
    line-height: 1.4;
  }

  .models-hint {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.5;
  }

  .models-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .models-empty-state {
    padding: 24px 16px;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
    font-size: 13px;
    line-height: 1.5;
    border: 1px dashed var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface, rgba(0, 0, 0, 0.02));

    p {
      margin: 0;
    }
  }

  .model-item {
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background-light);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .model-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;

    .model-field.small {
      max-width: 120px;
    }
  }

  .model-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;

    &.small {
      max-width: 100px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--b3-theme-on-surface-light);
      cursor: auto;
    }
  }

  .model-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--b3-border-color);
    flex-wrap: wrap;
  }

  .test-result {
    margin-top: 4px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;

    &.success {
      border: 1px solid #4caf50;
      background: rgba(76, 175, 80, 0.1);
      color: #2e7d32;
    }

    &.error {
      border: 1px solid #f44336;
      background: rgba(244, 67, 54, 0.1);
      color: #c62828;
    }
  }

  :global(.settings-btn) {
    padding: 6px 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font-size: 13px;
    line-height: 1.4;
    transition: all 0.2s;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: var(--b3-theme-primary);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.primary {
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-primary);

      &:hover:not(:disabled) {
        background: var(--b3-theme-primary);
        color: white;
      }
    }

    &.secondary {
      &:hover:not(:disabled) {
        background: var(--b3-theme-background-light);
        border-color: var(--b3-theme-primary);
      }
    }

    &.danger {
      &:hover:not(:disabled) {
        border-color: #f44336;
        color: #f44336;
      }
    }
  }

  :global(.form-input) {
    padding: 8px 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 14px;
    min-width: 0;

    &:focus {
      outline: none;
      border-color: var(--b3-theme-primary);
    }
  }

  :global(.checkbox-label) {
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

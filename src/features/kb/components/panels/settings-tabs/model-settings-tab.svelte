<script lang="ts">
  import type { KbSettings } from "../../../types/settings";
  import ModelProviderManager from "./model-provider-manager.svelte";
  import { resolveProviderProfile } from "../../../services/qa/provider-profile";

  export let settings: KbSettings;

  function toggleControlPlaneThinking() {
    settings = {
      ...settings,
      controlPlaneThinkingEnabled: !settings.controlPlaneThinkingEnabled,
    };
  }

  $: selectedProvider = settings.chatProviders.find(p => p.id === settings.selectedChatProviderId);
  $: selectedProviderType = selectedProvider?.type ?? "openai-compatible";
  $: selectedModel = selectedProvider?.models?.find(m => m.id === settings.selectedChatModelId);
  $: profile = resolveProviderProfile(selectedProviderType, {
    providerControlPlaneCompatibility: selectedProvider?.controlPlaneCompatibility,
    modelControlPlaneCompatibility: selectedModel?.controlPlaneCompatibility,
    finalComposeMode: selectedModel?.finalComposeMode,
  });

  $: needsExplicitDisable = profile.thinkingControl?.disableRequiresExplicitParam === true;
</script>

<div class="model-settings-tab">
  <!-- 规划阶段思考 -->
  <section class="settings-group">
    <h3 class="group-title">规划阶段思考</h3>

    {#if needsExplicitDisable}
    <div class="thinking-mode-note">
      关闭后，自动操作的规划阶段会减少深度思考，通常响应更快。
    </div>
    {/if}

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">自动操作规划思考</div>
        <div class="setting-desc">
          开启后，系统在选择工具和规划步骤时可能更谨慎，但响应会变慢。日常建议关闭。
        </div>
      </div>

      <label class="switch">
        <input
          type="checkbox"
          checked={settings.controlPlaneThinkingEnabled}
          on:change={toggleControlPlaneThinking}
        />
        <span class="slider"></span>
      </label>
    </div>
  </section>

  <!-- 聊天模型配置 -->
  <div class="section">
    <ModelProviderManager bind:settings />
  </div>
</div>

<style lang="scss">
  .model-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-title {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
  }

  .setting-copy {
    min-width: 0;
  }

  .setting-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-primary);
    line-height: 1.5;
  }

  .setting-desc {
    margin-top: 4px;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }

  .thinking-mode-note {
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #92400e;
    background-color: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 6px;
    line-height: 1.5;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: var(--b3-theme-surface-lighter);
    border-radius: 24px;
    transition: 0.2s;
  }

  .slider::before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    border-radius: 50%;
    transition: 0.2s;
  }

  .switch input:checked + .slider {
    background-color: var(--b3-theme-primary);
  }

  .switch input:checked + .slider::before {
    transform: translateX(20px);
  }

</style>

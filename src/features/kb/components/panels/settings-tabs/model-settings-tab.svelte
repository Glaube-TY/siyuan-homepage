<script lang="ts">
  import type { KbSettings } from "../../../types/settings";
  import ModelProviderManager from "./model-provider-manager.svelte";

  export let settings: KbSettings;

  function toggleControlPlaneThinking() {
    settings = {
      ...settings,
      controlPlaneThinkingEnabled: !settings.controlPlaneThinkingEnabled,
    };
  }
</script>

<div class="model-settings-tab">
  <!-- 控制面思考 -->
  <section class="settings-group">
    <h3 class="group-title">控制面思考</h3>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">启用控制面思考</div>
        <div class="setting-desc">
          仅当输入框思考模式已开启时生效，用于控制 Agent 规划与工具选择阶段是否请求模型思考。默认关闭，不影响最终回答的思考按钮。
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

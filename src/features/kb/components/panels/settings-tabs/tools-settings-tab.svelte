<script lang="ts">
  import type { KbSettings, KbGlobalToolName } from "../../../types/settings";
  import { globalToolCatalog } from "../../../services/agent-workbench/tools/global-tool-catalog";

  export let settings: KbSettings;

  function isToolEnabled(name: KbGlobalToolName): boolean {
    return !(settings.toolSettings?.disabledGlobalToolNames ?? []).includes(name);
  }

  function toggleTool(name: KbGlobalToolName) {
    const disabled = new Set(settings.toolSettings?.disabledGlobalToolNames ?? []);
    if (disabled.has(name)) {
      disabled.delete(name);
    } else {
      disabled.add(name);
    }
    settings = {
      ...settings,
      toolSettings: {
        ...(settings.toolSettings ?? { disabledGlobalToolNames: [] }),
        disabledGlobalToolNames: [...disabled],
      },
    };
  }
</script>

<div class="tools-settings-tab">
  <div class="section">
    <div class="section-header">
      <h2 class="section-title">全局工具</h2>
      <p class="section-description">控制全局工具是否对 AI 可用。</p>
    </div>
    <div class="tools-list">
      {#each globalToolCatalog as tool}
        <div class="tool-card">
          <div class="tool-main">
            <div class="tool-info">
              <div class="tool-title-row">
                <span class="tool-title">{tool.title}</span>
              </div>
              <span class="tool-description">{tool.description}</span>
              <span class="tool-name">{tool.name}</span>
            </div>
            <div class="toggle-wrap">
              <span class="toggle-label">{isToolEnabled(tool.name) ? "已启用" : "已停用"}</span>
              <label class="switch">
                <input
                  type="checkbox"
                  checked={isToolEnabled(tool.name)}
                  on:change={() => toggleTool(tool.name)}
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  .tools-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .section-description {
    margin: 0;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tool-card {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tool-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .tool-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .tool-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tool-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .tool-description {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    line-height: 1.4;
  }

  .tool-name {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
    font-family: monospace;
  }

  .toggle-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .toggle-label {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;

    input {
      opacity: 0;
      width: 0;
      height: 0;
    }
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--b3-theme-surface-lighter);
    transition: 0.2s;
    border-radius: 20px;

    &:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.2s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: var(--b3-theme-primary);
  }

  input:checked + .slider:before {
    transform: translateX(16px);
  }

  input:disabled + .slider {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>

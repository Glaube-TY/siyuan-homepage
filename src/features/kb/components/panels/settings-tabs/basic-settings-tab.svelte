<script lang="ts">
  import type { KbAssistantActionAlignment, KbSettings } from "../../../types/settings";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  export let settings: KbSettings;

  const alignmentOptions: Array<{
    value: KbAssistantActionAlignment;
    label: string;
    icon: string;
  }> = [
    { value: "left", label: "左对齐", icon: "iconAlignLeft" },
    { value: "center", label: "居中", icon: "iconAlignCenter" },
    { value: "right", label: "右对齐", icon: "iconAlignRight" },
  ];

  function setAlignment(value: KbAssistantActionAlignment) {
    settings = {
      ...settings,
      assistantActionAlignment: value,
    };
  }
</script>

<div class="basic-settings-tab">
  <section class="settings-group">
    <h3 class="group-title">聊天界面</h3>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">AI 回答操作按钮位置</div>
        <div class="setting-desc">控制 AI 回答气泡底部图标按钮的对齐方式。</div>
      </div>

      <div class="segmented-control" role="group" aria-label="AI 回答操作按钮位置">
        {#each alignmentOptions as option}
          <button
            type="button"
            class:active={settings.assistantActionAlignment === option.value}
            on:click={() => setAlignment(option.value)}
            title={option.label}
          >
            <SiyuanIcon name={option.icon} size={14} />
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>
</div>

<style lang="scss">
  .basic-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
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

  .segmented-control {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
    flex-shrink: 0;
  }

  .segmented-control button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 72px;
    height: 30px;
    padding: 0 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    cursor: pointer;
  }

  .segmented-control button:hover {
    background: var(--b3-theme-background-light);
  }

  .segmented-control button.active {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
  }
</style>

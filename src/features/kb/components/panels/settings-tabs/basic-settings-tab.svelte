<script lang="ts">
  import type { KbAssistantActionAlignment, KbProcessDisplayMode, KbSettings } from "../../../types/settings";
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

  const processModeOptions: Array<{ value: KbProcessDisplayMode; label: string }> = [
    { value: "collapsed", label: "折叠" },
    { value: "expanded", label: "展开" },
    { value: "auto", label: "自动" },
  ];

  const toolCallLimitOptions: Array<{ value: number; label: string }> = [
    { value: 20, label: "20" },
    { value: 50, label: "50" },
    { value: 0, label: "无限制" },
  ];

  function getAgentMaxToolCallsPerTurn(): number {
    const value = settings.agentMaxToolCallsPerTurn;
    return value === 0 || value === 50 ? value : 20;
  }

  function setWorkbenchProcessMode(value: KbProcessDisplayMode) {
    settings = { ...settings, workbenchProcessDisplayMode: value };
  }

  function setReasoningProcessMode(value: KbProcessDisplayMode) {
    settings = { ...settings, reasoningProcessDisplayMode: value };
  }

  function setAgentMaxToolCallsPerTurn(value: number) {
    settings = { ...settings, agentMaxToolCallsPerTurn: value };
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

      <div class="setting-action">
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
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">处理过程折叠</div>
        <div class="setting-desc">控制工具执行过程中工作台事件的折叠状态。自动模式下生成时展开，完成后折叠。</div>
      </div>

      <div class="setting-action">
        <div class="segmented-control" role="group" aria-label="处理过程折叠">
          {#each processModeOptions as option}
            <button
              type="button"
              class:active={settings.workbenchProcessDisplayMode === option.value}
              on:click={() => setWorkbenchProcessMode(option.value)}
            >
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">思考过程折叠</div>
        <div class="setting-desc">控制 AI 推理思考过程的折叠状态。自动模式下生成时展开，完成后折叠。</div>
      </div>

      <div class="setting-action">
        <div class="segmented-control" role="group" aria-label="思考过程折叠">
          {#each processModeOptions as option}
            <button
              type="button"
              class:active={settings.reasoningProcessDisplayMode === option.value}
              on:click={() => setReasoningProcessMode(option.value)}
            >
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">Agent 每轮最大工具调用次数</div>
        <div class="setting-desc">
          控制一次提问中 Agent 最多能调用多少次工具；无限制仍保留权限确认和重复写防护。
        </div>
      </div>
      <div class="setting-action">
        <div class="segmented-control" role="group" aria-label="Agent 每轮最大工具调用次数">
          {#each toolCallLimitOptions as option}
            <button
              type="button"
              class:active={getAgentMaxToolCallsPerTurn() === option.value}
              on:click={() => setAgentMaxToolCallsPerTurn(option.value)}
            >
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </section>
</div>

<style lang="scss">
  @use '../_kb-tokens' as *;

  .basic-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .group-title {
    margin: 0 0 $kb-space-sm 0;
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: $kb-space-sm;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $kb-space-lg;
    padding: $kb-space-md 0;
    flex-wrap: wrap;
  }

  .setting-copy {
    min-width: 0;
    flex: 1;
  }

  .setting-action {
    width: min(250px, 35vw);
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;

    @media (max-width: 480px) {
      width: 100%;
    }
  }

  .setting-action .segmented-control {
    width: 100%;
  }

  .setting-title {
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-primary);
    line-height: 1.5;
  }

  .setting-desc {
    margin-top: $kb-space-xs;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }

  .segmented-control {
    display: inline-flex;
    align-items: center;
    gap: $kb-space-xs;
    padding: 3px;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-surface);
    box-shadow: $kb-shadow-card;
    box-sizing: border-box;
  }

  .segmented-control button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: 1;
    height: 30px;
    padding: 0 10px;
    border: none;
    border-radius: $kb-radius-sm;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font-size: $kb-fs-sm;
    cursor: pointer;
    transition:
      background $kb-dur-fast $kb-ease-out,
      color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;
  }

  .segmented-control button:hover {
    background: var(--b3-theme-background-light);
  }

  .segmented-control button.active {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
    box-shadow: $kb-shadow-card;
  }
</style>

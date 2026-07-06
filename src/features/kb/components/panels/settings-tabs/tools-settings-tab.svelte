<script lang="ts">
  import type { KbSettings, KbGlobalToolName } from "../../../types/settings";
  import {
    AGGREGATE_TOOL_CATALOG,
    type AggregateToolMeta,
    type AggregateActionMeta,
  } from "../../../services/agent-workbench/tools/aggregate/aggregate-tool-metadata";

  export let settings: KbSettings;

  const SYSTEM_REQUIRED_TOOL_NAMES = new Set<string>(["agent_tool_help"]);

  type ToolEntry = AggregateToolMeta & {
    hasActions: boolean;
    summary: { total: number; readOnly: number; write: number };
  };

  const tools: ToolEntry[] = AGGREGATE_TOOL_CATALOG.map((tool) => {
    const total = tool.actions.length;
    const readOnly = tool.actions.filter((a) => a.readOnly).length;
    return {
      ...tool,
      hasActions: total > 0,
      summary: { total, readOnly, write: total - readOnly },
    };
  });

  // ── expand state ──
  let expandedTools: Set<string> = new Set();

  function toggleExpand(name: string): void {
    const next = new Set(expandedTools);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    expandedTools = next; // reassign to trigger Svelte reactivity
  }

  // ── enabled ──
  function isToolEnabled(name: KbGlobalToolName): boolean {
    return !(settings.toolSettings?.disabledGlobalToolNames ?? []).includes(name);
  }

  function isSystemRequired(name: string): boolean {
    return SYSTEM_REQUIRED_TOOL_NAMES.has(name);
  }

  function toggleTool(name: KbGlobalToolName): void {
    // System-required tools can never be disabled.
    if (isSystemRequired(name)) return;
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

  // ── direct-tool confirmation (no actions, e.g. edit_global_memory) ──
  function isDirectToolTrusted(toolName: string): boolean {
    return (settings.toolSettings?.disabledWriteToolConfirmationNames ?? []).includes(toolName);
  }

  function toggleDirectToolConfirmation(toolName: string): void {
    const disabled = new Set(settings.toolSettings?.disabledWriteToolConfirmationNames ?? []);
    if (disabled.has(toolName)) {
      disabled.delete(toolName);
    } else {
      disabled.add(toolName);
    }
    const currentToolSettings = settings.toolSettings ?? { disabledGlobalToolNames: [] };
    settings = {
      ...settings,
      toolSettings: {
        ...currentToolSettings,
        disabledWriteToolConfirmationNames: [...disabled],
      },
    };
  }

  // ── action-level confirmation (aggregate tools) ──
  function getActionConfirmOverride(toolName: string, actionName: string): boolean {
    // false (trusted) if explicitly set to false; otherwise default (true = needs confirmation)
    const map = settings.toolSettings?.toolActionConfirmOverrides?.[toolName];
    const flag = map?.[actionName];
    return flag !== false; // undefined or true → needs confirmation
  }

  function toggleActionConfirmation(toolName: string, actionName: string): void {
    const overrides = (settings.toolSettings?.toolActionConfirmOverrides ?? {}) as Record<string, Record<string, boolean>>;
    const toolMap = { ...(overrides[toolName] ?? {}) };
    const current = toolMap[actionName] !== false; // undefined or true → needs confirmation
    toolMap[actionName] = !current; // toggle
    const newOverrides = { ...overrides, [toolName]: toolMap };
    const currentToolSettings = settings.toolSettings ?? { disabledGlobalToolNames: [] };
    settings = {
      ...settings,
      toolSettings: {
        ...currentToolSettings,
        toolActionConfirmOverrides: newOverrides,
      },
    };
  }

  function isHighRiskAction(action: AggregateActionMeta): boolean {
    const HIGH_RISK_ACTIONS = new Set<string>([
      "delete_doc",
      "delete_blocks",
      "replace_doc_content",
      "transfer_ref",
      "swap_ref",
      "doc_to_heading",
      "heading_to_doc",
      "list_item_to_doc",
      "remove",
      "remove_unused_batch",
      "remove_unused_one",
      "remove_file",
      "rename_file",
      "move",
      "move_by_id",
      "sort",
      "reset",
      "remove_cards",
      "delete",
    ]);
    return HIGH_RISK_ACTIONS.has(action.name);
  }
</script>

<div class="tools-settings-tab">
  <div class="section">
    <div class="tools-list">
      {#each tools as tool (tool.name)}
        {#if isSystemRequired(tool.name)}
          <!-- A. agent_tool_help fixed card -->
          <div class="tool-card tool-card-fixed">
            <div class="tool-main">
              <div class="tool-info">
                <div class="tool-title-row">
                  <span class="tool-title">{tool.title}</span>
                  <span class="tag tag-system">系统必需</span>
                  <span class="tag tag-readonly">只读</span>
                  <span class="tag tag-fixed">固定启用</span>
                </div>
                <span class="tool-description">{tool.description}</span>
              </div>
              <div class="toggle-group">
                <div class="toggle-item toggle-item-static">
                  <span class="toggle-label-static">固定启用</span>
                </div>
              </div>
            </div>
          </div>
        {:else if tool.hasActions}
          <!-- C. aggregate tool with expandable actions -->
          <div class="tool-card">
            <div class="tool-main">
              <div class="tool-info">
                <div class="tool-title-row">
                  <span class="tool-title">{tool.title}</span>
                  {#if tool.readOnly}
                    <span class="tag tag-readonly">只读</span>
                  {/if}
                </div>
                <span class="tool-description">{tool.description}</span>
                <button
                  type="button"
                  class="action-summary-toggle"
                  aria-expanded={expandedTools.has(tool.name)}
                  aria-controls="actions-{tool.name}"
                  aria-label={expandedTools.has(tool.name)
                    ? `收起 ${tool.title} 的 action 列表`
                    : `展开 ${tool.title} 的 action 列表`}
                  on:click={() => toggleExpand(tool.name)}
                >
                  <span class="expand-arrow" class:expanded={expandedTools.has(tool.name)}>▾</span>
                  <span class="summary-text">共 {tool.summary.total} 个 action</span>
                  <span class="summary-dot" aria-hidden="true">·</span>
                  <span class="summary-text summary-readonly">只读 {tool.summary.readOnly}</span>
                  <span class="summary-dot" aria-hidden="true">·</span>
                  <span class="summary-text summary-write">写入 {tool.summary.write}</span>
                </button>
              </div>
              <div class="toggle-group">
                <div class="toggle-item">
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

            {#if expandedTools.has(tool.name)}
              <div id="actions-{tool.name}" class="actions-list">
                {#if !isToolEnabled(tool.name)}
                  <div class="actions-disabled-hint">
                    工具已停用，下面 action 列表仅作说明，不会进入 manifest。
                  </div>
                {/if}
                {#each tool.actions as action (action.name)}
                  <div class="action-row">
                    <div class="action-left">
                      <span class="action-name">{action.name}</span>
                      {#if action.readOnly}
                        <span class="tag tag-readonly">只读</span>
                      {:else if isHighRiskAction(action)}
                        <span class="tag tag-highrisk">高风险</span>
                        <span class="tag tag-safety">安全拦截</span>
                      {:else}
                        <span class="tag tag-write">写入</span>
                      {/if}
                    </div>
                    <div class="action-mid">
                      <span class="action-title">{action.title}</span>
                      <span class="action-desc">{action.description}</span>
                    </div>
                    <div class="action-right">
                      {#if action.readOnly}
                        <span class="confirm-static">无需确认</span>
                      {:else}
                        <div class="toggle-item">
                          <span class="toggle-label">
                            {getActionConfirmOverride(tool.name, action.name) ? "需要确认" : "已免确认"}
                          </span>
                          <label class="switch switch-small">
                            <input
                              type="checkbox"
                              checked={getActionConfirmOverride(tool.name, action.name)}
                              on:change={() => toggleActionConfirmation(tool.name, action.name)}
                            />
                            <span class="slider"></span>
                          </label>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <!-- B. direct tool without actions (e.g. edit_global_memory): keep tool-level confirmation -->
          <div class="tool-card">
            <div class="tool-main">
              <div class="tool-info">
                <div class="tool-title-row">
                  <span class="tool-title">{tool.title}</span>
                  {#if tool.readOnly}
                    <span class="tag tag-readonly">只读</span>
                  {:else if tool.requiresConfirmation}
                    <span class="tag tag-confirm">需要确认</span>
                    {#if isDirectToolTrusted(tool.name)}
                      <span class="tag tag-trusted">已免确认</span>
                    {/if}
                  {/if}
                </div>
                <span class="tool-description">{tool.description}</span>
                <div class="tool-hint">
                  单工具确认（无子 action）。关闭确认仍会经过预览、安全校验和参数校验。
                </div>
              </div>
              <div class="toggle-group">
                {#if !tool.readOnly && isToolEnabled(tool.name)}
                  <div class="toggle-item">
                    <span class="toggle-label">确认</span>
                    <label class="switch switch-small">
                      <input
                        type="checkbox"
                        checked={!isDirectToolTrusted(tool.name)}
                        on:change={() => toggleDirectToolConfirmation(tool.name)}
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                {/if}
                <div class="toggle-item">
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
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  @use '../_kb-tokens' as *;

  .tools-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tool-card {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: $kb-space-sm;
  }

  .tool-card-fixed {
    background: var(--b3-theme-surface-lighter);
    border-style: dashed;
    border-color: var(--b3-theme-primary);
  }

  .tool-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $kb-space-lg;
  }

  .tool-info {
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
    min-width: 0;
    flex: 1;
  }

  .tool-title-row {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    flex-wrap: wrap;
  }

  .tool-title {
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .tool-description {
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    line-height: 1.4;
  }

  .tool-hint {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
    line-height: 1.4;
    margin-top: 2px;
  }

  .action-summary-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    color: var(--b3-theme-on-surface);
    font-size: $kb-fs-xs;
    line-height: 1.4;
    cursor: pointer;
    transition: background $kb-dur-fast $kb-ease-out, border-color $kb-dur-fast $kb-ease-out;
    width: fit-content;

    &:hover {
      background: var(--b3-theme-surface-lighter);
      border-color: var(--b3-theme-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--b3-theme-primary);
      outline-offset: 1px;
    }
  }

  .summary-text {
    white-space: nowrap;
  }

  .summary-dot {
    opacity: 0.5;
    user-select: none;
  }

  .summary-readonly {
    opacity: 0.75;
  }

  .summary-write {
    color: var(--b3-theme-primary);
    font-weight: 500;
  }

  .toggle-group {
    display: flex;
    align-items: center;
    gap: $kb-space-md;
    flex-shrink: 0;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .toggle-item-static {
    pointer-events: none;
  }

  .toggle-label {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
  }

  .toggle-label-static {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-primary);
    font-weight: 600;
    opacity: 0.9;
  }

  .expand-arrow {
    display: inline-block;
    transition: transform $kb-dur-fast $kb-ease-out;
    transform: rotate(-90deg);
    font-size: $kb-fs-xs;

    &.expanded {
      transform: rotate(0deg);
    }
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
    transition: $kb-dur-fast $kb-ease-out;
    border-radius: 20px;

    &:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: $kb-dur-fast $kb-ease-out;
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

  .switch-small {
    width: 30px;
    height: 16px;

    .slider:before {
      height: 10px;
      width: 10px;
      left: 3px;
      bottom: 3px;
    }

    input:checked + .slider:before {
      transform: translateX(14px);
    }
  }

  .tag {
    font-size: $kb-fs-xs;
    padding: 2px 6px;
    border-radius: $kb-radius-sm;
    white-space: nowrap;
    line-height: 1.3;
  }

  .tag-readonly {
    background: var(--b3-theme-surface-lighter);
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .tag-confirm {
    background: var(--b3-theme-primary-lightest);
    color: var(--b3-theme-primary);
  }

  .tag-trusted {
    background: var(--b3-theme-success-lightest, #e8f5e9);
    color: var(--b3-theme-success, #2e7d32);
  }

  .tag-write {
    background: var(--b3-theme-primary-lightest);
    color: var(--b3-theme-primary);
    opacity: 0.85;
  }

  .tag-highrisk {
    background: rgba(220, 53, 69, 0.12);
    color: #c0392b;
  }

  .tag-safety {
    background: rgba(255, 193, 7, 0.15);
    color: #b8860b;
  }

  .tag-system {
    background: var(--b3-theme-primary);
    color: #fff;
    opacity: 0.9;
  }

  .tag-fixed {
    background: var(--b3-theme-surface-lighter);
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
  }

  .actions-list {
    border-top: 1px solid var(--b3-border-color);
    padding-top: $kb-space-sm;
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .actions-disabled-hint {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
    padding: $kb-space-xs $kb-space-sm;
    background: var(--b3-theme-surface-lighter);
    border-radius: $kb-radius-md;
  }

  .action-row {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    padding: $kb-space-xs $kb-space-sm;
    border-radius: $kb-radius-md;
    background: var(--b3-theme-surface-lighter);
    min-height: 36px;

    &:hover {
      background: var(--b3-theme-surface);
    }
  }

  .action-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 140px;
    flex: 0 0 200px;
  }

  .action-name {
    font-size: $kb-fs-sm;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    font-family: var(--b3-font-family-code, monospace);
  }

  .action-mid {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .action-title {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    font-weight: 500;
  }

  .action-desc {
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .confirm-static {
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface);
    opacity: 0.5;
    white-space: nowrap;
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import type { KbSettings } from "../../types/settings";
  import { DEFAULT_KB_SETTINGS } from "../../constants/default-settings";
  import { getKbSettings, saveKbSettings } from "../../services/settings/kb-settings-service";
  import BasicSettingsTab from "./settings-tabs/basic-settings-tab.svelte";
  import ChatStyleSettingsTab from "./settings-tabs/chat-style-settings-tab.svelte";
  import ModelSettingsTab from "./settings-tabs/model-settings-tab.svelte";
  import RetrievalSettingsTab from "./settings-tabs/retrieval-settings-tab.svelte";
  import SkillsSettingsTab from "./settings-tabs/skills-settings-tab.svelte";
  import ToolsSettingsTab from "./settings-tabs/tools-settings-tab.svelte";
  import AgentWorkspaceSettingsTab from "./settings-tabs/agent-workspace-settings-tab.svelte";
  import McpSettingsTab from "./settings-tabs/mcp-settings-tab.svelte";
  import WebSearchSettingsTab from "./settings-tabs/web-search-settings-tab.svelte";
  import MemorySettingsTab from "./settings-tabs/memory-settings-tab.svelte";
  import QuickPromptsSettingsTab from "./settings-tabs/quick-prompts-settings-tab.svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  export let close: (() => void) | undefined = undefined;
  export let mobile = false;

  // 页签定义
  const TABS = [
    { id: "basic", label: "基础设置", icon: "iconSettings" },
    { id: "style", label: "样式", icon: "iconTheme" },
    { id: "model", label: "大模型配置", icon: "iconSparkles" },
    { id: "retrieval", label: "检索与上下文", icon: "iconSearch" },
    { id: "skills", label: "技能", icon: "iconPlugin" },
    { id: "tools", label: "工具", icon: "iconKey" },
    { id: "agentWorkspace", label: "沙箱环境", icon: "iconFolder" },
    { id: "mcp", label: "MCP", icon: "iconCloud" },
    { id: "webSearch", label: "联网搜索", icon: "iconLanguage" },
    { id: "memory", label: "记忆", icon: "iconHistory" },
    { id: "quickPrompts", label: "快捷提示语", icon: "iconQuote" },
  ] as const;

  type TabId = typeof TABS[number]["id"];

  // 设置表单状态
  let settings: KbSettings = { ...DEFAULT_KB_SETTINGS };
  let loading = true;
  let saving = false;
  let saveMessage = "";
  let saveMessageType: "success" | "error" = "success";
  let activeTab: TabId = "basic";
  let mobileView: "list" | "detail" = "list";
  const MOBILE_HIDDEN_TAB_IDS = new Set<TabId>(["agentWorkspace"]);

  $: visibleTabs = mobile
    ? TABS.filter((tab) => !MOBILE_HIDDEN_TAB_IDS.has(tab.id))
    : TABS;
  $: if (mobile && !visibleTabs.some((tab) => tab.id === activeTab)) {
    activeTab = visibleTabs[0]?.id ?? "basic";
  }

  onMount(async () => {
    try {
      settings = await getKbSettings();
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    saving = true;
    saveMessage = "";
    try {
      const mergedSettings = await saveKbSettings(settings);
      settings = mergedSettings;
      saveMessage = "保存成功";
      saveMessageType = "success";
    } catch (e: any) {
      saveMessage = `保存失败: ${e.message}`;
      saveMessageType = "error";
    } finally {
      saving = false;
    }
  }

  function switchTab(tabId: TabId) {
    activeTab = tabId;
    if (mobile) {
      mobileView = "detail";
      saveMessage = "";
    }
  }

  function backToMobileList() {
    mobileView = "list";
    saveMessage = "";
  }

  function getMobileTabDescription(tabId: TabId): string {
    switch (tabId) {
      case "basic":
        return "聊天显示、工具调用次数和过程展示。";
      case "style":
        return "对话外观、头像和输入框风格。";
      case "model":
        return "模型供应商、API Key 和 Agent 兼容性。";
      case "retrieval":
        return "检索数量、上下文窗口和文档读取限制。";
      case "skills":
        return "外部与自定义 Skill 说明包。";
      case "tools":
        return "控制 AI 可用工具和写入确认。";
      case "mcp":
        return "移动端支持 HTTP/SSE，stdio 仅桌面端可用。";
      case "webSearch":
        return "联网搜索供应商和搜索策略。";
      case "memory":
        return "全局记忆文档和 AI 更新权限。";
      case "quickPrompts":
        return "快捷提示语文档和输入栏入口。";
      default:
        return "";
    }
  }
</script>

<div class="kb-settings-panel" class:mobile={mobile}>
  {#if loading}
    <div class="loading">加载中...</div>
  {:else}
    <div class="settings-layout" class:mobile-list={mobile && mobileView === "list"} class:mobile-detail={mobile && mobileView === "detail"}>
      <!-- 左侧导航 -->
      <div class="settings-sidebar" class:mobile-hidden={mobile && mobileView !== "list"}>
        {#if mobile}
          <div class="mobile-settings-heading">
            <div>
              <div class="mobile-settings-title">AI 知识库设置</div>
              <div class="mobile-settings-subtitle">选择一个分类继续设置。</div>
            </div>
            <button type="button" class="mobile-icon-btn" on:click={() => close?.()} aria-label="关闭设置">
              <SiyuanIcon name="iconClose" size={16} />
            </button>
          </div>
        {/if}
        <div class="sidebar-nav">
          {#each visibleTabs as tab}
            <button
              class="sidebar-button"
              class:active={activeTab === tab.id}
              on:click={() => switchTab(tab.id)}
            >
              <span class="sidebar-icon"><SiyuanIcon name={tab.icon} size={16} /></span>
              <span class="sidebar-copy">
                <span class="sidebar-label">{tab.label}</span>
                {#if mobile}
                  <span class="sidebar-desc">{getMobileTabDescription(tab.id)}</span>
                {/if}
              </span>
              {#if mobile}
                <span class="sidebar-arrow">›</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if mobile}
          <div class="mobile-desktop-note">沙箱环境、本地命令和运行时检测仅在 PC/Electron 桌面端配置与执行。</div>
        {/if}
      </div>

      <!-- 右侧内容 -->
      <div class="settings-main" class:mobile-hidden={mobile && mobileView !== "detail"}>
        <!-- 顶部操作栏 -->
        <div class="settings-header">
          {#if mobile}
            <button type="button" class="mobile-back-btn" on:click={backToMobileList} aria-label="返回设置分类">
              <SiyuanIcon name="iconLeft" size={16} />
            </button>
          {/if}
          <div class="header-title">{TABS.find((t) => t.id === activeTab)?.label ?? ""}</div>
          <div class="header-actions">
            {#if saveMessage}
              <span class="save-message" class:success={saveMessageType === "success"} class:error={saveMessageType === "error"}>{saveMessage}</span>
            {/if}
            <button
              type="button"
              class="save-btn"
              disabled={saving}
              on:click={handleSave}
            >
              {saving ? "保存中..." : "保存设置"}
            </button>
            {#if mobile}
              <button type="button" class="mobile-close-btn" on:click={() => close?.()} aria-label="关闭设置">
                <SiyuanIcon name="iconClose" size={14} />
              </button>
            {/if}
          </div>
        </div>

        <div class="main-content">
          <div class="tab-container">
            {#if activeTab === "basic"}
              <BasicSettingsTab bind:settings />
            {:else if activeTab === "style"}
              <ChatStyleSettingsTab bind:settings />
            {:else if activeTab === "model"}
              <ModelSettingsTab bind:settings />
            {:else if activeTab === "retrieval"}
              <RetrievalSettingsTab bind:settings />
            {:else if activeTab === "skills"}
              <SkillsSettingsTab bind:settings />
            {:else if activeTab === "tools"}
              <ToolsSettingsTab bind:settings />
            {:else if activeTab === "agentWorkspace"}
              <AgentWorkspaceSettingsTab bind:settings />
            {:else if activeTab === "mcp"}
              <McpSettingsTab bind:settings mobile={mobile} />
            {:else if activeTab === "webSearch"}
              <WebSearchSettingsTab bind:settings />
            {:else if activeTab === "memory"}
              <MemorySettingsTab bind:settings />
            {:else if activeTab === "quickPrompts"}
              <QuickPromptsSettingsTab bind:settings />
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  @use './_kb-tokens' as *;

  .kb-settings-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--b3-theme-background);
  }

  .loading {
    padding: 40px;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
  }

  // 左右布局容器
  .settings-layout {
    flex: 1;
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  // 左侧导航栏
  .settings-sidebar {
    width: 172px;
    flex-shrink: 0;
    border-right: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    padding: $kb-space-lg $kb-space-sm;
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .sidebar-button {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    padding: $kb-space-sm $kb-space-md;
    background: transparent;
    border: none;
    border-radius: $kb-radius-md;
    cursor: pointer;
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    text-align: left;
    transition:
      background $kb-dur-fast $kb-ease-out,
      color $kb-dur-fast $kb-ease-out;
    position: relative;

    // Left accent bar — invisible by default, visible on active
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 18px;
      border-radius: 0 2px 2px 0;
      background: var(--b3-theme-primary);
      opacity: 0;
      transition: opacity $kb-dur-normal $kb-ease-out;
    }

    &:hover {
      color: var(--b3-theme-on-surface);
      background: var(--b3-theme-background-light);
    }

    &.active {
      color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
      font-weight: 500;

      &::before {
        opacity: 1;
      }

      .sidebar-icon,
      .sidebar-label {
        color: var(--b3-theme-primary);
      }
    }
  }

  .sidebar-icon {
    font-size: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }

  .sidebar-copy {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .sidebar-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
  }

  // 右侧内容区
  .settings-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--b3-theme-background);
  }

  .main-content {
    flex: 1;
    padding: $kb-space-xl $kb-space-2xl;
    overflow-y: auto;
    min-height: 0;
    min-width: 0;
  }

  // tab 容器
  .tab-container {
    width: 100%;
    min-width: 0;
    min-height: 0;

    :global(> *) {
      width: 100%;
      min-width: 0;
    }
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $kb-space-md $kb-space-2xl;
    border-bottom: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    flex-shrink: 0;
    min-height: 0;
  }

  .header-title {
    font-size: $kb-fs-xxl;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: $kb-space-md;
  }

  .save-btn {
    padding: $kb-space-xs 14px;
    border: none;
    border-radius: $kb-radius-md;
    background: var(--b3-theme-primary);
    color: #ffffff;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.5;
    font-family: inherit;
    transition:
      background $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      background: var(--b3-theme-primary);
      box-shadow: $kb-shadow-raised;
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: $kb-shadow-card;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .save-message {
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface-light);

    &.success {
      color: var(--b3-theme-success);
    }

    &.error {
      color: var(--b3-theme-error);
    }
  }

  .mobile-hidden {
    display: none !important;
  }

  .mobile-settings-heading,
  .mobile-settings-title,
  .mobile-settings-subtitle,
  .sidebar-desc,
  .sidebar-arrow,
  .mobile-desktop-note,
  .mobile-back-btn,
  .mobile-close-btn,
  .mobile-icon-btn {
    display: none;
  }

  .kb-settings-panel.mobile {
    height: 100%;
    overflow: hidden;

    .settings-layout {
      width: 100%;
      height: 100%;
      display: flex;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--b3-theme-background);
    }

    .settings-sidebar {
      width: 100%;
      min-width: 0;
      padding: 14px 14px max(18px, env(safe-area-inset-bottom));
      border-right: none;
      overflow: auto;
      box-sizing: border-box;
    }

    .mobile-settings-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 2px 0 14px;
    }

    .mobile-settings-title {
      display: block;
      font-size: 20px;
      font-weight: 700;
      color: var(--b3-theme-on-surface);
      line-height: 1.3;
    }

    .mobile-settings-subtitle {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: var(--b3-theme-on-surface-light);
    }

    .mobile-icon-btn,
    .mobile-close-btn,
    .mobile-back-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background-light);
      color: var(--b3-theme-on-surface-light);
      cursor: pointer;
    }

    .mobile-icon-btn,
    .mobile-close-btn {
      width: 38px;
      height: 38px;
      border-radius: 12px;
    }

    .mobile-back-btn {
      width: 36px;
      height: 36px;
      border-radius: 12px;
    }

    .sidebar-nav {
      gap: 8px;
    }

    .sidebar-button {
      width: 100%;
      min-height: 64px;
      padding: 12px;
      gap: 12px;
      border: 1px solid var(--b3-border-color);
      border-radius: 14px;
      background: var(--b3-theme-background);
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.04);

      &::before {
        display: none;
      }

      &.active {
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
        border-color: color-mix(in srgb, var(--b3-theme-primary) 35%, var(--b3-border-color));
      }
    }

    .sidebar-icon {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: var(--b3-theme-background-light);
      color: var(--b3-theme-primary);
    }

    .sidebar-copy {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .sidebar-label {
      font-size: 15px;
      font-weight: 650;
      color: var(--b3-theme-on-surface);
    }

    .sidebar-desc {
      display: block;
      width: 100%;
      font-size: 12px;
      line-height: 1.45;
      color: var(--b3-theme-on-surface-light);
      white-space: normal;
    }

    .sidebar-arrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      color: var(--b3-theme-on-surface-light);
      font-size: 22px;
      line-height: 1;
    }

    .mobile-desktop-note {
      display: block;
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--b3-card-warning-background, #fff7e6) 75%, var(--b3-theme-background));
      color: var(--b3-theme-on-surface-light);
      font-size: 12px;
      line-height: 1.55;
    }

    .settings-main {
      width: 100%;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    .settings-header {
      min-height: 54px;
      padding: 8px 10px;
      gap: 8px;
      box-sizing: border-box;
    }

    .header-title {
      flex: 1;
      min-width: 0;
      font-size: 17px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-actions {
      gap: 6px;
      flex-shrink: 0;
    }

    .save-message {
      display: none;
    }

    .save-btn {
      min-height: 36px;
      padding: 0 12px;
      border-radius: 12px;
      font-size: 13px;
      white-space: nowrap;
    }

    .main-content {
      padding: 14px 14px max(18px, env(safe-area-inset-bottom));
      overflow-y: auto;
      box-sizing: border-box;
    }

    .tab-container {
      :global(.settings-section),
      :global(.section-card),
      :global(.provider-card),
      :global(.model-card),
      :global(.server-card),
      :global(.skill-card) {
        max-width: 100%;
      }

      :global(.setting-row),
      :global(.field-row),
      :global(.auth-row) {
        align-items: stretch;
      }

      :global(input:not([type="checkbox"])),
      :global(select),
      :global(textarea) {
        max-width: 100%;
        min-height: 38px;
        font-size: 14px;
      }
    }
  }
</style>

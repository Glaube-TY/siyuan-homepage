<script lang="ts">
  import { onMount } from "svelte";
  import type { KbSettings } from "../../types/settings";
  import { DEFAULT_KB_SETTINGS } from "../../constants/default-settings";
  import { getKbSettings, saveKbSettings } from "../../services/settings/kb-settings-service";
  import BasicSettingsTab from "./settings-tabs/basic-settings-tab.svelte";
  import ModelSettingsTab from "./settings-tabs/model-settings-tab.svelte";
  import RetrievalSettingsTab from "./settings-tabs/retrieval-settings-tab.svelte";
  import SkillsSettingsTab from "./settings-tabs/skills-settings-tab.svelte";
  import ToolsSettingsTab from "./settings-tabs/tools-settings-tab.svelte";
  import WebSearchSettingsTab from "./settings-tabs/web-search-settings-tab.svelte";
  import MemorySettingsTab from "./settings-tabs/memory-settings-tab.svelte";
  import QuickPromptsSettingsTab from "./settings-tabs/quick-prompts-settings-tab.svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  // 页签定义
  const TABS = [
    { id: "basic", label: "基础设置", icon: "iconSettings" },
    { id: "model", label: "大模型配置", icon: "iconSparkles" },
    { id: "retrieval", label: "检索与上下文", icon: "iconSearch" },
    { id: "skills", label: "技能", icon: "iconPlugin" },
    { id: "tools", label: "工具", icon: "iconKey" },
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
  }
</script>

<div class="kb-settings-panel">
  {#if loading}
    <div class="loading">加载中...</div>
  {:else}
    <div class="settings-layout">
      <!-- 左侧导航 -->
      <div class="settings-sidebar">
        <div class="sidebar-nav">
          {#each TABS as tab}
            <button
              class="sidebar-button"
              class:active={activeTab === tab.id}
              on:click={() => switchTab(tab.id)}
            >
              <span class="sidebar-icon"><SiyuanIcon name={tab.icon} size={16} /></span>
              <span class="sidebar-label">{tab.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- 右侧内容 -->
      <div class="settings-main">
        <!-- 顶部操作栏 -->
        <div class="settings-header">
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
          </div>
        </div>

        <div class="main-content">
          <div class="tab-container">
            {#if activeTab === "basic"}
              <BasicSettingsTab bind:settings />
            {:else if activeTab === "model"}
              <ModelSettingsTab bind:settings />
            {:else if activeTab === "retrieval"}
              <RetrievalSettingsTab bind:settings />
            {:else if activeTab === "skills"}
              <SkillsSettingsTab bind:settings />
            {:else if activeTab === "tools"}
              <ToolsSettingsTab bind:settings />
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
    width: 160px;
    flex-shrink: 0;
    border-right: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    padding: 20px 0;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 12px;
  }

  .sidebar-button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: var(--b3-theme-on-surface-light);
    text-align: left;
    transition: all 0.15s ease;

    &:hover {
      color: var(--b3-theme-on-surface);
      background: var(--b3-theme-background-light);
    }

    &.active {
      color: #ffffff;
      background: var(--b3-theme-primary);
      font-weight: 500;

      .sidebar-icon,
      .sidebar-label {
        color: #ffffff;
      }
    }
  }

  .sidebar-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .sidebar-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    padding: 20px 28px;
    overflow-y: auto;
    min-height: 0;
    min-width: 0;
  }

  // tab 容器：强制撑满并统一约束
  .tab-container {
    width: 100%;
    min-width: 0;
    min-height: 0;

    // 兜底：确保所有直接子 tab 组件撑满
    :global(> *) {
      width: 100%;
      min-width: 0;
    }
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 28px;
    border-bottom: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    flex-shrink: 0;
    min-height: 0;
  }

  .header-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .save-btn {
    padding: 6px 16px;
    border: none;
    border-radius: 6px;
    background: var(--b3-theme-primary);
    color: #ffffff;
    cursor: pointer;
    font-size: 14px;
    line-height: 1.4;
    font-family: inherit;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-primary-dark, var(--b3-theme-primary));
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .save-message {
    font-size: 14px;
    color: var(--b3-theme-on-surface-light);

    &.success {
      color: var(--b3-theme-success);
    }

    &.error {
      color: var(--b3-theme-error);
    }
  }
</style>

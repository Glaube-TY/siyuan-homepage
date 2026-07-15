<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import CountdownIconButton from "@/features/countdown-center/components/CountdownIconButton.svelte";
  import { collectCountdownTags } from "@/components/utils/widgetBlock/widget/countdown/countdownQuery";
  import type {
    CountdownCategoryRecord,
    CountdownEventRecord,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownNotifyRuleEditor from "./CountdownNotifyRuleEditor.svelte";
  import {
    COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT,
    DEFAULT_COUNTDOWN_NOTIFY_SETTINGS,
  } from "../constants";
  import {
    loadCountdownNotifySettings,
    saveCountdownNotifySettings,
  } from "../countdown-notify-settings-store";
  import {
    createCountdownNotifyRule,
    type CountdownNotifyRuleType,
    type CountdownNotifySettings,
  } from "../types";
  interface Props {
    events: CountdownEventRecord[];
    categories: CountdownCategoryRecord[];
    onLoaded?: (settings: CountdownNotifySettings) => void;
  }
  let { events, categories, onLoaded }: Props = $props();
  let settings = $state<CountdownNotifySettings>(
    structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS),
  );
  let selectedType = $state<CountdownNotifyRuleType>("today_events");
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  const tags = $derived(collectCountdownTags(events));
  const todayRuleExists = $derived(
    settings.rules.some((rule) => rule.type === "today_events"),
  );
  function addRule(): void {
    if (selectedType === "today_events" && todayRuleExists) {
      showMessage("今日事件规则已经存在，请编辑现有规则。", 5000, "error");
      return;
    }
    let rule = createCountdownNotifyRule(selectedType);
    while (settings.rules.some((item) => item.id === rule.id))
      rule = createCountdownNotifyRule(selectedType);
    settings.rules = [...settings.rules, rule];
  }
  async function reload() {
    loading = true;
    error = null;
    try {
      settings = await loadCountdownNotifySettings();
      onLoaded?.(settings);
    } catch (value) {
      error = value instanceof Error ? value.message : "纪念日通知设置读取失败";
    } finally {
      loading = false;
    }
  }
  async function save() {
    if (loading || error) return;
    if (
      settings.rules.some(
        (rule) => rule.enabled && !rule.deliveryTargets.length,
      )
    ) {
      showMessage("启用的规则必须至少选择一种通知方式", 5000, "error");
      return;
    }
    saving = true;
    try {
      settings = await saveCountdownNotifySettings(settings);
      onLoaded?.(settings);
      showMessage("纪念日通知设置已保存");
    } catch (value) {
      showMessage(
        value instanceof Error ? value.message : "保存失败",
        5000,
        "error",
      );
    } finally {
      saving = false;
    }
  }
  onMount(() => {
    const handleSettingsChanged = () => {
      if (!saving) void reload();
    };
    void reload();
    window.addEventListener(
      COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT,
      handleSettingsChanged,
    );
    return () =>
      window.removeEventListener(
        COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT,
        handleSettingsChanged,
      );
  });
</script>

<div class="shp-countdown-notify-panel">
  {#if error}<div class="shp-countdown-notify-error">
      <span>通知设置读取失败，未允许覆盖原设置。<br />{error}</span
      ><CountdownIconButton
        name="refresh"
        label="重新加载通知设置"
        onclick={() => void reload()}
      />
    </div>{:else if loading}<p>纪念日通知设置加载中…</p>{:else}<SettingSection
      title="基础设置"
      ><SettingRow title="启用纪念日通知" description="控制全部纪念日规则"
        ><input
          type="checkbox"
          class="b3-switch fn__flex-center"
          bind:checked={settings.enabled}
        /></SettingRow
      ><SettingRow title="扫描间隔" description="毫秒，范围 10000～3600000"
        ><input
          type="number"
          class="b3-text-field"
          min="10000"
          max="3600000"
          bind:value={settings.scanIntervalMs}
        /></SettingRow
      ><SettingRow title="补发窗口" description="错过计划后的允许补发分钟数"
        ><input
          type="number"
          class="b3-text-field"
          min="1"
          max="1440"
          bind:value={settings.catchUpWindowMinutes}
        /></SettingRow
      ><SettingRow title="摘要事件上限" description="单次摘要最多显示数量"
        ><input
          type="number"
          class="b3-text-field"
          min="1"
          max="100"
          bind:value={settings.maxEventsPerMessage}
        /></SettingRow
      ></SettingSection
    ><SettingSection title="通知规则"
      ><SettingRow title="新增规则" description="选择类型后添加"
        ><div class="shp-countdown-notify-add">
          <select class="b3-text-field" bind:value={selectedType}
            ><option value="today_events" disabled={todayRuleExists}
              >今日事件</option
            ><option
              value="advance_events">提前 N 天</option
            ><option value="upcoming_digest">未来 N 天摘要</option></select
          ><CountdownIconButton
            name="add"
            label="添加通知规则"
            disabled={saving ||
              (selectedType === "today_events" && todayRuleExists)}
            onclick={addRule}
          />
        </div></SettingRow
      >
      {#if todayRuleExists}<p class="shp-countdown-notify-singleton-hint">
          今日事件规则已经存在，请编辑现有规则。
        </p>{/if}
      <div class="shp-countdown-notify-rules">
        {#each settings.rules as rule, index (rule.id)}<CountdownNotifyRuleEditor
            bind:rule={settings.rules[index]}
            {categories}
            {tags}
            {events}
            disabled={saving}
            onDelete={() =>
              (settings.rules = settings.rules.filter(
                (item) => item.id !== rule.id,
              ))}
          />{/each}
      </div></SettingSection
    ><SettingSection title="单事件提醒"
      ><p class="shp-countdown-notify-overrides">
        静音 {settings.eventOverrides.filter((item) => item.mode === "mute")
          .length} 项，自定义 {settings.eventOverrides.filter(
          (item) => item.mode === "custom",
        ).length} 项。请在事件编辑器中调整。
      </p></SettingSection
    >
    <div class="shp-countdown-notify-save">
      <CountdownIconButton
        name="save"
        label={saving ? "通知设置保存中" : "保存通知设置"}
        disabled={saving}
        onclick={() => void save()}
      />
    </div>{/if}
</div>

<style>
  .shp-countdown-notify-panel {
    padding: 14px;
    display: grid;
    gap: 12px;
  }
  .shp-countdown-notify-error {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-error);
  }
  .shp-countdown-notify-singleton-hint {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }
  .shp-countdown-notify-add {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .shp-countdown-notify-rules {
    display: grid;
    gap: 10px;
  }
  .shp-countdown-notify-overrides {
    margin: 0;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-notify-save {
    display: flex;
    justify-content: flex-end;
    position: sticky;
    bottom: 0;
    padding: 10px;
    background: var(--b3-theme-background);
    border-top: 1px solid var(--b3-border-color);
  }
  @media (max-width: 600px) {
    .shp-countdown-notify-panel {
      padding: 10px;
    }
    .shp-countdown-notify-add {
      width: 100%;
    }
    .shp-countdown-notify-add select {
      flex: 1;
      min-width: 0;
    }
  }
</style>

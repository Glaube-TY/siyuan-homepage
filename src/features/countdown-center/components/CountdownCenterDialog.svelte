<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import {
    archiveCountdownCategory,
    archiveCountdownEvent,
    bulkUpdateCountdownEvents,
    CountdownEventConflictError,
    createCountdownCategory,
    deleteCountdownCategory,
    deleteCountdownEventPermanently,
    loadCountdownCenterData,
    restoreCountdownCategory,
    restoreCountdownEvent,
    reorderCountdownEvents,
    runCountdownAutoArchiveMaintenance,
    saveCountdownEvent,
    updateCountdownCategory,
    type CountdownCenterLoadResult,
    type CountdownCategoryInput,
    type CountdownCategoryRecord,
    type CountdownEventInput,
    type CountdownEventRecord,
    type CountdownPriority,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
  import {
    createDefaultCountdownCenterSettings,
    loadCountdownCenterSettings,
    subscribeCountdownCenterSettingsChanged,
    type CountdownCenterSettingsFile,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownCenterSettings";
  import { queryCountdownWidgetEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownQuery";
  import { createCountdownDayBoundaryWatcher } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
  import { subscribeSharedWidgetDataUpdated } from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetDataEvents";
  import {
    loadCountdownNotifySettings,
    deleteCountdownNotifyOverrideForCleanup,
    saveCountdownEventNotifyOverride,
  } from "@/features/countdown-notify/countdown-notify-settings-store";
  import type {
    CountdownEventNotifyOverride,
    CountdownNotifySettings,
  } from "@/features/countdown-notify/types";
  import CountdownNotifySettingsPanel from "@/features/countdown-notify/components/CountdownNotifySettingsPanel.svelte";
  import { COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT } from "@/features/countdown-notify/constants";
  import type { CountdownCenterTab } from "../types";
  import CountdownCenterHeader from "./CountdownCenterHeader.svelte";
  import CountdownCenterOverview from "./CountdownCenterOverview.svelte";
  import CountdownEventManager from "./CountdownEventManager.svelte";
  import CountdownEventEditor from "./CountdownEventEditor.svelte";
  import CountdownCalendarView from "./CountdownCalendarView.svelte";
  import CountdownCenterSettings from "./CountdownCenterSettings.svelte";
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    plugin: any;
    mobile: boolean;
    initialTab?: CountdownCenterTab;
    initialEventId?: string;
    createNew?: boolean;
    onClose: () => void;
  }
  let {
    plugin,
    mobile,
    initialTab = "overview",
    initialEventId,
    createNew = false,
    onClose,
  }: Props = $props();
  let tab = $state<CountdownCenterTab>("overview");
  let data = $state<CountdownCenterLoadResult | null>(null);
  let settings = $state<CountdownCenterSettingsFile>(
    createDefaultCountdownCenterSettings(),
  );
  let notificationSettings = $state<CountdownNotifySettings | null>(null);
  let coreDataError = $state<string | null>(null);
  let centerSettingsError = $state<string | null>(null);
  let notificationSettingsError = $state<string | null>(null);
  let loading = $state(true);
  let archived = $state(false);
  let editorEvent = $state<CountdownEventRecord | undefined>(undefined);
  let editorOpen = $state(false);
  let refreshVersion = $state(0);
  const advancedEnabled = $derived(Boolean(plugin?.ADVANCED));
  const models = $derived(
    data
      ? queryCountdownWidgetEvents(
          data.events,
          data.categories,
          {
            sortBy: settings.defaultView.sortBy,
            maxItems: 1000,
            includePast: settings.defaultView.includePast,
            pastDays: settings.defaultView.pastDays,
          },
          new Date(Date.now() + refreshVersion * 0),
          settings.displayDefaults,
        )
      : [],
  );
  async function reloadCore() {
    try {
      data = await loadCountdownCenterData({ includeArchived: true });
      coreDataError = null;
    } catch (error) {
      coreDataError =
        error instanceof Error ? error.message : "纪念日数据读取失败";
    }
  }
  async function reloadSettings() {
    try {
      settings = await loadCountdownCenterSettings();
      centerSettingsError = null;
    } catch (error) {
      centerSettingsError =
        error instanceof Error ? error.message : "显示设置读取失败";
    }
  }
  async function reloadNotify() {
    if (!advancedEnabled) return;
    try {
      notificationSettings = await loadCountdownNotifySettings();
      notificationSettingsError = null;
    } catch (error) {
      notificationSettingsError =
        error instanceof Error ? error.message : "通知设置读取失败";
    }
  }
  async function reloadAll() {
    loading = true;
    await Promise.all([reloadCore(), reloadSettings(), reloadNotify()]);
    loading = false;
  }
  function openEditor(event?: CountdownEventRecord) {
    editorEvent = event;
    editorOpen = true;
    tab = "events";
  }
  async function saveEditor(
    draft: CountdownEventInput,
    override: Omit<CountdownEventNotifyOverride, "eventId">,
  ) {
    let saved: CountdownEventRecord;
    try {
      saved = await saveCountdownEvent(draft);
    } catch (error) {
      showMessage(
        `纪念日保存失败：${error instanceof Error ? error.message : String(error)}`,
        6000,
        "error",
      );
      return;
    }
    editorEvent = saved;
    editorOpen = false;
    await reloadCore();
    await saveReminderAfterCore(saved, override);
  }
  async function saveExisting(
    draft: CountdownEventInput,
    override: Omit<CountdownEventNotifyOverride, "eventId">,
  ) {
    let saved: CountdownEventRecord;
    try {
      try {
        saved = await saveCountdownEvent(draft, {
          baseRevision: data?.revision ?? 0,
          original: editorEvent,
        });
      } catch (error) {
        if (
          error instanceof CountdownEventConflictError &&
          window.confirm("该事件已在其他窗口修改。是否明确覆盖最新版本？")
        )
          saved = await saveCountdownEvent(
            draft,
            { baseRevision: data?.revision ?? 0, original: editorEvent },
            { force: true },
          );
        else throw error;
      }
    } catch (error) {
      showMessage(
        `纪念日保存失败：${error instanceof Error ? error.message : String(error)}`,
        6000,
        "error",
      );
      return;
    }
    editorEvent = saved;
    editorOpen = false;
    await reloadCore();
    await saveReminderAfterCore(saved, override);
  }
  async function saveReminderAfterCore(
    saved: CountdownEventRecord,
    override: Omit<CountdownEventNotifyOverride, "eventId">,
  ): Promise<void> {
    if (!advancedEnabled) {
      showMessage("纪念日已保存");
      return;
    }
    if (notificationSettingsError) {
      showMessage(
        `纪念日已保存，但提醒设置保存失败：${notificationSettingsError}`,
        7000,
        "error",
      );
      return;
    }
    try {
      notificationSettings = await saveCountdownEventNotifyOverride(
        saved.id,
        override,
      );
      showMessage("纪念日已保存");
    } catch (error) {
      showMessage(
        `纪念日已保存，但提醒设置保存失败：${error instanceof Error ? error.message : String(error)}`,
        7000,
        "error",
      );
    }
  }
  async function toggleArchive(event: CountdownEventRecord) {
    try {
      if (event.archived) await restoreCountdownEvent(event.id);
      else await archiveCountdownEvent(event.id);
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "操作失败",
        5000,
        "error",
      );
    }
  }
  async function permanentDelete(event: CountdownEventRecord) {
    if (!window.confirm(`永久删除“${event.name}”？此操作不可恢复。`)) return;
    try {
      await deleteCountdownEventPermanently(event.id);
      try {
        await deleteCountdownNotifyOverrideForCleanup(event.id);
      } catch (error) {
        showMessage(
          `事件已删除，但通知覆盖清理失败：${error instanceof Error ? error.message : String(error)}`,
          7000,
          "error",
        );
      }
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "删除失败",
        5000,
        "error",
      );
    }
  }
  async function copyEvent(event: CountdownEventRecord) {
    openEditor({
      ...event,
      id: "",
      name: `${event.name}（副本）`,
      createdAt: "",
      updatedAt: "",
    });
  }
  async function bulk(
    ids: string[],
    patch: {
      categoryId?: string | null;
      priority?: CountdownPriority;
      addTags?: string[];
      archived?: boolean;
    },
  ) {
    try {
      await bulkUpdateCountdownEvents(ids, patch);
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "批量操作失败",
        5000,
        "error",
      );
    }
  }
  async function reorderVisibleEvents(eventIds: string[]): Promise<void> {
    try {
      await reorderCountdownEvents(eventIds);
    } finally {
      await reloadCore();
    }
  }
  async function createCategory(input: CountdownCategoryInput) {
    try {
      await createCountdownCategory(input);
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "分类创建失败",
        5000,
        "error",
      );
    }
  }
  async function updateCategory(
    id: string,
    input: Partial<CountdownCategoryInput>,
  ) {
    try {
      await updateCountdownCategory(id, input);
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "分类更新失败",
        5000,
        "error",
      );
    }
  }
  async function toggleCategory(category: CountdownCategoryRecord) {
    try {
      if (category.archived) await restoreCountdownCategory(category.id);
      else await archiveCountdownCategory(category.id);
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "分类操作失败",
        5000,
        "error",
      );
    }
  }
  async function removeCategory(category: CountdownCategoryRecord) {
    const target = window.prompt(
      `删除“${category.name}”前，请输入目标分类名称；输入“未分类”移到未分类，取消则不删除。`,
      "未分类",
    );
    if (target === null) return;
    const destination =
      target.trim() === "未分类"
        ? undefined
        : data?.categories.find(
            (item) => item.name === target.trim() && item.id !== category.id,
          )?.id;
    if (target.trim() !== "未分类" && !destination) {
      showMessage("未找到目标分类", 4000, "error");
      return;
    }
    if (!window.confirm("确认删除分类并移动其事件？")) return;
    try {
      await deleteCountdownCategory(category.id, destination);
      await reloadCore();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "分类删除失败",
        5000,
        "error",
      );
    }
  }
  onMount(() => {
    tab = initialTab;
    let unsubData = () => {};
    let unsubSettings = () => {};
    let stopDay = () => {};
    const handleNotifySettingsChanged = () => {
      if (advancedEnabled) void reloadNotify();
    };
    void reloadAll().then(async () => {
      if (!coreDataError) {
        try {
          const count = await runCountdownAutoArchiveMaintenance();
          if (count) await reloadCore();
        } catch (error) {
          console.warn("[countdown-center] 自动归档维护失败", error);
        }
      }
      if (initialEventId && data) {
        const found = data.events.find((item) => item.id === initialEventId);
        if (found) openEditor(found);
      } else if (createNew) openEditor();
    });
    unsubData = subscribeSharedWidgetDataUpdated(
      "countdown",
      () => void reloadCore(),
    );
    unsubSettings = subscribeCountdownCenterSettingsChanged(
      () => void reloadSettings(),
    );
    stopDay = createCountdownDayBoundaryWatcher(() => {
      refreshVersion += 1;
    });
    window.addEventListener(
      COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT,
      handleNotifySettingsChanged,
    );
    return () => {
      unsubData();
      unsubSettings();
      stopDay();
      window.removeEventListener(
        COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT,
        handleNotifySettingsChanged,
      );
    };
  });
  const nav: [CountdownCenterTab, string, string][] = [
    ["overview", "概览", "overview"],
    ["events", "事件", "events"],
    ["calendar", "日历", "calendar"],
    ["notifications", "通知", "bell"],
    ["settings", "设置", "settings"],
  ];
</script>

<div class="shp-countdown-center" class:mobile>
  <CountdownCenterHeader {mobile} onAdd={() => openEditor()} {onClose} />
  <nav class="shp-countdown-center-nav">
    {#each nav as item}<button
        type="button"
        class:active={tab === item[0]}
        onclick={() => (tab = item[0])}><CountdownIcon
          name={item[2]}
          size={18}
        /><span>{item[1]}</span></button
      >{/each}
  </nav>
  <main>
    {#if loading}<div class="shp-countdown-center-state">
        纪念日中心加载中…
      </div>{:else if coreDataError && tab !== "notifications"}<div
        class="shp-countdown-center-error"
      >
        <strong>纪念日数据无法安全读取</strong>
        <p>{coreDataError}</p>
        <p>为避免覆盖原文件，事件、概览和日历已禁用。请先备份插件数据。</p>
        <CountdownIconButton
          name="refresh"
          label="重新加载纪念日数据"
          onclick={() => void reloadCore()}
        />
      </div>{:else if tab === "overview" && data}<CountdownCenterOverview
        {models}
        total={data.events.filter((item) => !item.archived).length}
        onAdd={() => openEditor()}
        onEdit={(id) => {
          const event = data?.events.find((item) => item.id === id);
          if (event) openEditor(event);
        }}
        onOpenEvents={() => (tab = "events")}
      />{:else if tab === "events" && data}<CountdownEventManager
        {plugin}
        displayPreferences={settings.displayDefaults}
        events={data.events}
        categories={data.categories.filter((item) => !item.archived)}
        customNotifyEventIds={advancedEnabled
          ? (notificationSettings?.eventOverrides
              .filter((item) => item.mode === "custom")
              .map((item) => item.eventId) ?? [])
          : []}
        {archived}
        onArchived={(value) => (archived = value)}
        onAdd={() => openEditor()}
        onEdit={openEditor}
        onCopy={(event) => void copyEvent(event)}
        onArchive={(event) => void toggleArchive(event)}
        onDelete={(event) => void permanentDelete(event)}
        onReorder={reorderVisibleEvents}
        onBulk={(ids, patch) => void bulk(ids, patch)}
      />{:else if tab === "calendar" && data}<CountdownCalendarView
        events={data.events}
        displayPreferences={settings.displayDefaults}
        showLunar={settings.displayDefaults.showLunarDate}
        {mobile}
        onEdit={openEditor}
      />{:else if tab === "notifications"}{#if !advancedEnabled}<div
          class="shp-countdown-center-locked"
        >
          <strong>纪念日通知为 VIP 专属</strong>
          <p>
            开通后可使用桌面、手机和外联提醒。已有通知设置会保留，不会被读取或重置。
          </p>
        </div>{:else if notificationSettingsError}<div
          class="shp-countdown-center-error"
        >
          <strong>通知设置读取失败</strong>
          <p>{notificationSettingsError}</p>
          <CountdownIconButton
            name="refresh"
            label="重新加载通知设置"
            onclick={() => void reloadNotify()}
          />
        </div>{:else if data}<CountdownNotifySettingsPanel
          events={data.events.filter((item) => !item.archived)}
          categories={data.categories.filter((item) => !item.archived)}
          onLoaded={(value) => (notificationSettings = value)}
        />{/if}{:else if tab === "settings"}{#if centerSettingsError}<div
          class="shp-countdown-center-error"
        >
          <strong>全局显示设置读取失败</strong>
          <p>{centerSettingsError}</p>
          <p>事件数据仍然安全可用，但此设置区已禁用。</p>
          <CountdownIconButton
            name="refresh"
            label="重新加载全局显示设置"
            onclick={() => void reloadSettings()}
          />
        </div>{:else if data}<CountdownCenterSettings
          {settings}
          eventsFile={data.file}
          categories={data.categories}
          {advancedEnabled}
          onSettingsSaved={(value) => (settings = value)}
          onCreateCategory={createCategory}
          onUpdateCategory={updateCategory}
          onArchiveCategory={toggleCategory}
          onDeleteCategory={removeCategory}
          onDataChanged={reloadAll}
        />{/if}{/if}
  </main>
  {#if editorOpen && data}<CountdownEventEditor
      event={editorEvent}
      categories={data.categories.filter((item) => !item.archived)}
      {mobile}
      {advancedEnabled}
      notifyOverride={advancedEnabled && editorEvent
        ? notificationSettings?.eventOverrides.find(
            (item) => item.eventId === editorEvent?.id,
          )
        : undefined}
      notifyError={notificationSettingsError}
      notifyDisabled={Boolean(notificationSettingsError)}
      onCancel={() => (editorOpen = false)}
      onSave={editorEvent ? saveExisting : saveEditor}
    />{/if}
</div>

<style>
  .shp-countdown-center {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-background);
  }
  .shp-countdown-center-nav {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--b3-border-color);
    background: var(--b3-theme-surface);
  }
  .shp-countdown-center-nav button {
    min-height: 42px;
    padding: 0 16px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .shp-countdown-center-nav button.active {
    color: var(--b3-theme-primary);
    background: var(--b3-theme-background);
    font-weight: 600;
  }
  .shp-countdown-center > main {
    width: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .shp-countdown-center-state,
  .shp-countdown-center-error,
  .shp-countdown-center-locked {
    display: grid;
    gap: 9px;
    max-width: 560px;
    margin: 48px auto;
    padding: 22px;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-surface);
  }
  .shp-countdown-center-error strong {
    color: var(--b3-theme-error);
  }
  .shp-countdown-center-state {
    text-align: center;
  }
  .shp-countdown-center-error p,
  .shp-countdown-center-locked p {
    margin: 0;
    line-height: 1.6;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-center.mobile .shp-countdown-center-nav {
    position: relative;
    z-index: 4;
    justify-content: flex-start;
    gap: 4px;
    padding: 4px max(8px, env(safe-area-inset-right)) 6px
      max(8px, env(safe-area-inset-left));
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .shp-countdown-center.mobile .shp-countdown-center-nav button {
    flex: 0 0 auto;
    min-width: 78px;
    padding: 0 12px;
    font-size: 12px;
  }
  .shp-countdown-center.mobile .shp-countdown-center-nav::-webkit-scrollbar {
    display: none;
  }
  .shp-countdown-center.mobile .shp-countdown-center-error,
  .shp-countdown-center.mobile .shp-countdown-center-locked {
    margin: 20px 10px;
  }
  @media (max-width: 520px) {
    .shp-countdown-center:not(.mobile) .shp-countdown-center-nav button {
      padding: 0 8px;
    }
    .shp-countdown-center:not(.mobile) .shp-countdown-center-nav button span {
      display: none;
    }
  }
  :global(.countdown-center-dialog-host .dialog-content) {
    overflow: hidden !important;
  }
  :global(.countdown-center-dialog-host .b3-dialog__container) {
    width: min(1280px, calc(100vw - 32px)) !important;
    max-width: min(1280px, calc(100vw - 32px)) !important;
    overflow: hidden;
  }
  :global(.countdown-center-dialog-host--mobile .b3-dialog__container) {
    width: 100vw !important;
    height: 100dvh !important;
    border-radius: 0 !important;
    max-width: 100vw !important;
    max-height: 100dvh !important;
  }
</style>

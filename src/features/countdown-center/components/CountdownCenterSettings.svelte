<script lang="ts">
  import { untrack } from "svelte";
  import { showMessage } from "siyuan";
  import {
    createCountdownCenterSettingsSaveQueue,
    saveCountdownCenterSettings,
    type CountdownCenterSettingsFile,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownCenterSettings";
  import type {
    CountdownCategoryInput,
    CountdownCategoryRecord,
    CountdownEventsFile,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownCategoryManager from "./CountdownCategoryManager.svelte";
  import CountdownDataPortPanel from "./CountdownDataPortPanel.svelte";
  import CountdownIcon from "./CountdownIcon.svelte";
  interface Props {
    settings: CountdownCenterSettingsFile;
    eventsFile: CountdownEventsFile;
    categories: CountdownCategoryRecord[];
    advancedEnabled: boolean;
    onSettingsSaved: (settings: CountdownCenterSettingsFile) => void;
    onCreateCategory: (input: CountdownCategoryInput) => Promise<void>;
    onUpdateCategory: (
      id: string,
      input: Partial<CountdownCategoryInput>,
    ) => Promise<void>;
    onArchiveCategory: (category: CountdownCategoryRecord) => Promise<void>;
    onDeleteCategory: (category: CountdownCategoryRecord) => Promise<void>;
    onDataChanged: () => Promise<void>;
  }
  let {
    settings: initialSettings,
    eventsFile,
    categories,
    advancedEnabled,
    onSettingsSaved,
    onCreateCategory,
    onUpdateCategory,
    onArchiveCategory,
    onDeleteCategory,
    onDataChanged,
  }: Props = $props();
  function cloneSettings(
    value: CountdownCenterSettingsFile,
  ): CountdownCenterSettingsFile {
    return {
      ...value,
      displayDefaults: { ...value.displayDefaults },
      defaultView: { ...value.defaultView },
    };
  }
  let saving = $state(false);
  const initialSnapshot = cloneSettings(untrack(() => initialSettings));
  let draftSettings = $state(cloneSettings(initialSnapshot));
  const saveQueue = createCountdownCenterSettingsSaveQueue({
    initial: initialSnapshot,
    persist: saveCountdownCenterSettings,
    onBusyChange: (busy) => (saving = busy),
    onSaved: (saved, hasPending) => {
      onSettingsSaved(saved);
      if (!hasPending) draftSettings = cloneSettings(saved);
    },
    onFailed: (lastSaved, error) => {
      draftSettings = cloneSettings(lastSaved);
      showMessage(
        error instanceof Error
          ? error.message
          : "设置保存失败，已恢复上次成功保存的值",
        5000,
        "error",
      );
    },
  });
  $effect(() => {
    const incoming = initialSettings;
    if (saving) return;
    draftSettings = cloneSettings(incoming);
    saveQueue.syncLastSaved(incoming);
  });
  function save(next: CountdownCenterSettingsFile): void {
    draftSettings = cloneSettings(next);
    saveQueue.enqueue(next);
  }
  function display(
    key: keyof CountdownCenterSettingsFile["displayDefaults"],
    value: boolean | string,
  ) {
    save({
      ...draftSettings,
      displayDefaults: { ...draftSettings.displayDefaults, [key]: value },
    });
  }
  function view(
    key: keyof CountdownCenterSettingsFile["defaultView"],
    value: boolean | string | number,
  ) {
    save({
      ...draftSettings,
      defaultView: { ...draftSettings.defaultView, [key]: value },
    });
  }
</script>

<div class="shp-countdown-settings">
  <section>
    <h3><CountdownIcon name="settings" />全局显示偏好</h3>
    <label
      ><span
        ><strong>日期格式</strong><small>所有跟随中心的组件生效</small></span
      ><select
        class="b3-text-field"
        value={draftSettings.displayDefaults.dateFormat}
        onchange={(e) => display("dateFormat", e.currentTarget.value)}
        ><option value="localized">本地化</option><option value="ymd"
          >年-月-日</option
        ><option value="md">月-日</option></select
      ></label
    >{#each [["showWeekday", "显示星期"], ["showOriginalDate", "显示原始日期"], ["showOccurrenceDate", "显示下一次日期"], ["showLunarDate", "显示农历"], ["showCategory", "显示分类"], ["showTags", "显示标签"], ["showPriority", "显示优先级"], ["showCountLabel", "显示周年次数/年龄"], ["showNotePreview", "显示备注预览"], ["showLinkedNoteAction", "显示关联笔记操作"]] as item}<label
        ><span
          ><strong>{item[1]}</strong><small>跟随全局的纪念日组件自动更新</small
          ></span
        ><input
          type="checkbox"
          class="b3-switch fn__flex-center"
          checked={Boolean(
            draftSettings.displayDefaults[
              item[0] as keyof typeof draftSettings.displayDefaults
            ],
          )}
          onchange={(e) =>
            display(
              item[0] as keyof typeof draftSettings.displayDefaults,
              e.currentTarget.checked,
            )}
        /></label
      >{/each}<label
      ><span><strong>默认排序</strong><small>新组件的初始排序</small></span
      ><select
        class="b3-text-field"
        value={draftSettings.defaultView.sortBy}
        onchange={(e) => view("sortBy", e.currentTarget.value)}
        ><option value="nearest">最近</option><option value="priority"
          >优先级</option
        ><option value="manual">手动</option><option value="name">名称</option
        ></select
      ></label
    ><label
      ><span><strong>默认最大数量</strong><small>范围 1～100</small></span
      ><input
        type="number"
        min="1"
        max="100"
        class="b3-text-field"
        value={draftSettings.defaultView.maxItems}
        onchange={(e) => view("maxItems", Number(e.currentTarget.value))}
      /></label
    ><label
      ><span
        ><strong>默认显示已过事件</strong><small>仅影响一次性事件</small></span
      ><input
        type="checkbox"
        class="b3-switch fn__flex-center"
        checked={draftSettings.defaultView.includePast}
        onchange={(e) => view("includePast", e.currentTarget.checked)}
      /></label
    >
  </section>
  <section>
    <h3><CountdownIcon name="categories" />分类管理</h3>
    <CountdownCategoryManager
      {categories}
      onCreate={onCreateCategory}
      onUpdate={onUpdateCategory}
      onArchive={onArchiveCategory}
      onDelete={onDeleteCategory}
    />
  </section>
  <section>
    <h3><CountdownIcon name="data" />数据管理</h3>
    <CountdownDataPortPanel
      {eventsFile}
      {advancedEnabled}
      onChanged={onDataChanged}
    />
  </section>
</div>

<style>
  .shp-countdown-settings {
    display: grid;
    gap: 14px;
    padding: 14px;
  }
  .shp-countdown-settings > section {
    display: grid;
    gap: 9px;
    padding: 14px;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
  }
  .shp-countdown-settings h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px;
  }
  .shp-countdown-settings > section > label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid
      color-mix(in srgb, var(--b3-border-color) 70%, transparent);
  }
  .shp-countdown-settings > section > label:last-of-type {
    border-bottom: 0;
  }
  .shp-countdown-settings label > span {
    display: grid;
    gap: 2px;
  }
  .shp-countdown-settings label small {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }
  .shp-countdown-settings .b3-text-field {
    max-width: 180px;
  }
  @media (max-width: 520px) {
    .shp-countdown-settings {
      padding: 10px;
    }
    .shp-countdown-settings > section > label {
      align-items: stretch;
      flex-direction: column;
    }
    .shp-countdown-settings .b3-text-field {
      width: 100%;
      max-width: none;
    }
  }
</style>

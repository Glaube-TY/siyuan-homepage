<script lang="ts">
  import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";
  import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import { openCountdownCenterDialog } from "@/features/countdown-center";
  import CountdownIcon from "@/features/countdown-center/components/CountdownIcon.svelte";
  import { collectCountdownTags } from "./countdownQuery";
  import {
    loadCountdownCenterData,
    DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
    type CountdownCategoryRecord,
    type CountdownEventKind,
    type CountdownEventRecord,
    type CountdownPriority,
    type CountdownWidgetDisplaySystem,
    type CountdownWidgetViewConfig,
  } from "./countdownData";
  import { normalizeCountdownWidgetView } from "./countdownCenterSettings";
  interface Props {
    countdownStyle?: string;
    countdownDisplaySystem?: CountdownWidgetDisplaySystem;
    countdownView?: CountdownWidgetViewConfig;
    countdownCard1BgSelect?: string;
    countdownCard1RemoteBg?: string;
    countdownCard1LocalBg?: string;
    countdownCard2BgColor?: string;
    countdownList2BgColor?: string;
    advancedEnabled?: boolean;
    plugin?: any;
  }
  let {
    countdownStyle = $bindable("list1"),
    countdownDisplaySystem = $bindable("center"),
    countdownView = $bindable(normalizeCountdownWidgetView(undefined)),
    countdownCard1BgSelect = $bindable("remote"),
    countdownCard1RemoteBg = $bindable(
      "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664",
    ),
    countdownCard1LocalBg = $bindable(""),
    countdownCard2BgColor = $bindable("#000000"),
    countdownList2BgColor = $bindable("#000000"),
    advancedEnabled = false,
    plugin,
  }: Props = $props();
  let categories = $state<CountdownCategoryRecord[]>([]);
  let events = $state<CountdownEventRecord[]>([]);
  let optionsLoaded = $state(false);
  const centerViewOptions: readonly {
    value: CountdownWidgetViewConfig["viewMode"];
    label: string;
  }[] = [
    { value: "list", label: "列表" },
    { value: "compact", label: "紧凑" },
    { value: "cards", label: "卡片" },
    { value: "timeline", label: "时间线" },
  ];
  const classicStyleOptions = [
    { value: "list1", label: "列表 1" },
    { value: "list2", label: "列表 2" },
    { value: "card1", label: "卡片 1" },
    { value: "card2", label: "卡片 2" },
  ] as const;
  type CountdownStyleChoice =
    | (typeof classicStyleOptions)[number]["value"]
    | "center";
  const selectedStyle: CountdownStyleChoice = $derived(
    countdownDisplaySystem === "center"
      ? "center"
      : classicStyleOptions.some((option) => option.value === countdownStyle)
        ? (countdownStyle as CountdownStyleChoice)
        : "list1",
  );
  const showingCards = $derived(
    countdownDisplaySystem === "classic"
      ? countdownStyle === "card1" || countdownStyle === "card2"
      : countdownView.viewMode === "cards",
  );
  const tags = $derived(collectCountdownTags(events));
  const patch = (next: Partial<CountdownWidgetViewConfig>) =>
    (countdownView = { ...countdownView, ...next });
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  function selectStyle(value: string): void {
    if (value === "center") {
      countdownDisplaySystem = "center";
      return;
    }
    const classicStyle = classicStyleOptions.find(
      (option) => option.value === value,
    )?.value;
    if (!classicStyle) return;
    countdownDisplaySystem = "classic";
    countdownStyle = classicStyle;
  }
  $effect(() => {
    if (!advancedEnabled || optionsLoaded) return;
    optionsLoaded = true;
    void loadCountdownCenterData()
      .then((result) => {
        categories = result.categories;
        events = result.events;
      })
      .catch((error) => console.warn("[countdownSet] 加载筛选选项失败", error));
  });
</script>

{#if advancedEnabled}
<SettingSection title="纪念日中心"
  ><SettingRow
    title="统一事件库"
    description="管理所有纪念日、分类、显示偏好和通知规则。"
    ><button
      type="button"
      class="b3-button b3-button--text shp-countdown-open-center-button"
      onclick={() =>
        void openCountdownCenterDialog(plugin, { initialTab: "overview" })}
      ><CountdownIcon name="calendar" size={17} /><span
        >打开纪念日中心</span
      ></button
    ></SettingRow
  ></SettingSection
>
<SettingSection title="组件样式"
  ><SettingRow title="样式"
    ><select
      class="b3-text-field control-md"
      value={selectedStyle}
      onchange={(event) => selectStyle(event.currentTarget.value)}
      >{#each classicStyleOptions as option}<option value={option.value}
          >{option.label}</option
        >{/each}<option value="center">纪念日中心</option></select
    ></SettingRow
  >{#if selectedStyle === "center"}<SettingRow title="纪念日中心布局"
      ><select
        class="b3-text-field control-md"
        value={countdownView.viewMode}
        onchange={(event) =>
          patch({
            viewMode: event.currentTarget
              .value as CountdownWidgetViewConfig["viewMode"],
          })}
        >{#each centerViewOptions as option}<option value={option.value}
            >{option.label}</option
          >{/each}</select
      ></SettingRow
    >{/if}{#if selectedStyle === "center"}<SettingRow title="显示偏好"
      ><select
        class="b3-text-field control-md"
        value={countdownView.displayMode}
        onchange={(event) =>
          patch(
            event.currentTarget.value === "custom"
              ? {
                  displayMode: "custom",
                  displayOverrides: {
                    ...DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
                    ...countdownView.displayOverrides,
                  },
                }
              : { displayMode: "inherit" },
          )}
        ><option value="inherit">跟随纪念日中心</option><option
          value="custom">当前组件自定义</option></select
      ></SettingRow
    >{#if countdownView.displayMode === "custom"}<div
        class="shp-countdown-set-switches"
      >
        {#each [["showWeekday", "星期"], ["showOriginalDate", "原始日期"], ["showOccurrenceDate", "发生日期"], ["showLunarDate", "农历"], ["showCategory", "分类"], ["showTags", "标签"], ["showPriority", "优先级"], ["showCountLabel", "周年/年龄"], ["showNotePreview", "备注"], ["showLinkedNoteAction", "关联笔记按钮"]] as item}<label
            ><span>{item[1]}</span><input
              type="checkbox"
              class="b3-switch fn__flex-center"
              checked={countdownView.displayOverrides?.[
                item[0] as keyof NonNullable<
                  CountdownWidgetViewConfig["displayOverrides"]
                >
              ] ?? true}
              onchange={(event) =>
                patch({
                  displayOverrides: {
                    ...countdownView.displayOverrides,
                    [item[0]]: event.currentTarget.checked,
                  },
                })}
            /></label
          >{/each}
        <label
          ><span>日期格式</span><select
            class="b3-text-field"
            value={countdownView.displayOverrides?.dateFormat ?? "localized"}
            onchange={(event) =>
              patch({
                displayOverrides: {
                  ...countdownView.displayOverrides,
                  dateFormat: event.currentTarget.value as NonNullable<
                    CountdownWidgetViewConfig["displayOverrides"]
                  >["dateFormat"],
                },
              })}
            ><option value="localized">中文年月日</option><option value="ymd"
              >YYYY-MM-DD</option
            ><option value="md">MM-DD</option></select
          ></label
        >
      </div>{/if}{/if}{#if countdownDisplaySystem === "classic" && countdownStyle === "list2"}<SettingRow
      title="背景颜色"
      ><input type="color" bind:value={countdownList2BgColor} /></SettingRow
    >{:else if countdownDisplaySystem === "classic" && countdownStyle === "card1"}<ImageSourceSetting
      embedded
      title="卡片 1 背景"
      bind:source={countdownCard1BgSelect}
      bind:remoteUrl={countdownCard1RemoteBg}
      bind:localDataUrl={countdownCard1LocalBg}
      remotePlaceholder="输入远程图片URL"
      previewAlt="纪念日卡片背景预览"
    />{:else if countdownDisplaySystem === "classic" && countdownStyle === "card2"}<SettingRow
      title="背景颜色"
      ><input type="color" bind:value={countdownCard2BgColor} /></SettingRow
    >{/if}{#if showingCards}<SettingRow title="自动轮播"
      ><input
        type="checkbox"
        class="b3-switch fn__flex-center"
        checked={countdownView.cardAutoPlay}
        onchange={(event) =>
          patch({ cardAutoPlay: event.currentTarget.checked })}
      /></SettingRow
    >{#if countdownView.cardAutoPlay}<SettingRow title="轮播秒数"
        ><input
          type="number"
          min="2"
          max="60"
          class="b3-text-field control-sm"
          value={countdownView.cardIntervalSeconds}
          onchange={(event) =>
            patch({
              cardIntervalSeconds: Number(event.currentTarget.value),
            })}
        /></SettingRow
      >{/if}{/if}</SettingSection
>
<SettingSection title="组件内容"
  ><SettingRow title="数据范围"
    ><select
      class="b3-text-field control-md"
      value={countdownView.scopeMode}
      onchange={(e) =>
        patch({
          scopeMode: e.currentTarget
            .value as CountdownWidgetViewConfig["scopeMode"],
        })}
      ><option value="all">全部事件</option><option value="filter"
        >按筛选</option
      ><option value="selected">指定事件</option></select
    ></SettingRow
  >{#if countdownView.scopeMode === "filter"}<div
      class="shp-countdown-set-chips"
    >
      <strong>分类</strong>
      <div>
        {#each categories as category}<button
            type="button"
            class:active={countdownView.categoryIds.includes(category.id)}
            aria-pressed={countdownView.categoryIds.includes(category.id)}
            onclick={() =>
              patch({
                categoryIds: toggle(countdownView.categoryIds, category.id),
              })}>{category.name}</button
          >{/each}
      </div>
      <strong>标签</strong>
      <div>
        {#each tags as tag}<button
            type="button"
            class:active={countdownView.tags.includes(tag)}
            aria-pressed={countdownView.tags.includes(tag)}
            onclick={() => patch({ tags: toggle(countdownView.tags, tag) })}
            >#{tag}</button
          >{/each}
      </div>
      <strong>类型</strong>
      <div>
        {#each [["birthday", "生日"], ["anniversary", "周年"], ["deadline", "截止"], ["expiration", "到期"], ["milestone", "里程碑"], ["subscription", "订阅"], ["custom", "自定义"]] as item}<button
            type="button"
            class:active={countdownView.kinds.includes(
              item[0] as CountdownEventKind,
            )}
            aria-pressed={countdownView.kinds.includes(
              item[0] as CountdownEventKind,
            )}
            onclick={() =>
              patch({
                kinds: toggle(
                  countdownView.kinds,
                  item[0] as CountdownEventKind,
                ),
              })}>{item[1]}</button
          >{/each}
      </div>
      <strong>优先级</strong>
      <div>
        {#each [["high", "高"], ["normal", "普通"], ["low", "低"]] as item}<button
            type="button"
            class:active={countdownView.priorities.includes(
              item[0] as CountdownPriority,
            )}
            aria-pressed={countdownView.priorities.includes(
              item[0] as CountdownPriority,
            )}
            onclick={() =>
              patch({
                priorities: toggle(
                  countdownView.priorities,
                  item[0] as CountdownPriority,
                ),
              })}>{item[1]}</button
          >{/each}
      </div>
    </div>{:else if countdownView.scopeMode === "selected"}<div
      class="shp-countdown-set-chips"
    >
      <strong>指定事件</strong>
      <div>
        {#each events as event}<button
            type="button"
            class:active={countdownView.eventIds.includes(event.id)}
            aria-pressed={countdownView.eventIds.includes(event.id)}
            onclick={() =>
              patch({ eventIds: toggle(countdownView.eventIds, event.id) })}
            >{event.name}</button
          >{/each}
      </div>
    </div>{/if}<SettingRow title="时间范围"
    ><select
      class="b3-text-field control-md"
      value={countdownView.dateRange}
      onchange={(e) =>
        patch({
          dateRange: e.currentTarget
            .value as CountdownWidgetViewConfig["dateRange"],
        })}
      ><option value="all">全部</option><option value="today">今天</option
      ><option value="next7">未来 7 天</option><option value="next30"
        >未来 30 天</option
      ><option value="next90">未来 90 天</option><option value="thisMonth"
        >本月</option
      ><option value="thisYear">本年</option></select
    ></SettingRow
  ><SettingRow title="显示已过事件"
    ><input
      type="checkbox"
      class="b3-switch fn__flex-center"
      checked={countdownView.includePast}
      onchange={(e) => patch({ includePast: e.currentTarget.checked })}
    /></SettingRow
  >{#if countdownView.includePast}<SettingRow title="过去天数"
      ><input
        type="number"
        min="0"
        max="3650"
        class="b3-text-field control-sm"
        value={countdownView.pastDays}
        onchange={(e) => patch({ pastDays: Number(e.currentTarget.value) })}
      /></SettingRow
    >{/if}<SettingRow title="排序"
    ><select
      class="b3-text-field control-md"
      value={countdownView.sortBy}
      onchange={(e) =>
        patch({
          sortBy: e.currentTarget.value as CountdownWidgetViewConfig["sortBy"],
        })}
      ><option value="nearest">最近</option><option value="priority"
        >优先级</option
      ><option value="manual">手动</option><option value="name">名称</option
      ></select
    ></SettingRow
  ><SettingRow title="最大数量"
    ><input
      type="number"
      min="1"
      max="100"
      class="b3-text-field control-sm"
      value={countdownView.maxItems}
      onchange={(e) =>
        patch({
          maxItems: Math.max(1, Math.min(100, Number(e.currentTarget.value))),
        })}
    /></SettingRow
  >
  </SettingSection
>
{:else}
  <AdvancedFeatureLock
    title="纪念日组件"
    subtitle="统一管理重要日期，并在主页以五类样式展示。"
    icon="calendar"
    features={[
      "统一纪念日、分类和显示设置",
      "五类组件样式与自动轮播",
      "桌面、移动和外联提醒",
    ]}
    highlights={["纪念日中心", "多样式", "通知提醒"]}
    note="会员到期后已有纪念日、分类和提醒文件会完整保留，续费后可继续使用。"
  />
{/if}

<style>
  .shp-countdown-open-center-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .shp-countdown-set-chips,
  .shp-countdown-set-switches {
    display: grid;
    gap: 7px;
    padding: 8px 0;
  }
  .shp-countdown-set-chips > div {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .shp-countdown-set-chips button {
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 17px;
    background: transparent;
    color: inherit;
  }
  .shp-countdown-set-chips button.active {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
  }
  .shp-countdown-set-switches {
    grid-template-columns: 1fr 1fr;
  }
  .shp-countdown-set-switches label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px;
  }
</style>

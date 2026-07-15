<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import { getImage } from "@/components/tools/getImage";
  import { openDocs } from "@/components/tools/openDocs";
  import { openCountdownCenterDialog } from "@/features/countdown-center";
  import {
    DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
    loadCountdownCenterData,
    COUNTDOWN_PRIORITY_LABELS,
    type CountdownCategoryRecord,
    type CountdownDisplayPreferences,
    type CountdownEventRecord,
    type CountdownEventViewModel,
  } from "./countdownData";
  import {
    loadCountdownCenterSettings,
    normalizeCountdownWidgetView,
    subscribeCountdownCenterSettingsChanged,
    type CountdownCenterSettingsFile,
  } from "./countdownCenterSettings";
  import {
    queryCountdownWidgetEvents,
    resolveCountdownDisplayPreferences,
  } from "./countdownQuery";
  import {
    createCountdownDayBoundaryWatcher,
    formatCountdownDisplayDate,
  } from "./countdownDateEngine";
  import { subscribeSharedWidgetDataUpdated } from "../sharedLocalStorage/sharedWidgetDataEvents";
  import CountdownIcon from "@/features/countdown-center/components/CountdownIcon.svelte";
  import CountdownCardSvg from "./CountdownCardSvg.svelte";
  interface Props {
    plugin: any;
    contentTypeJson?: string;
  }
  let { plugin, contentTypeJson = "{}" }: Props = $props();
  const advancedEnabled = $derived(Boolean(plugin?.ADVANCED));
  function parse(raw: string): any {
    try {
      return JSON.parse(raw || "{}");
    } catch (error) {
      console.warn("[countdown] 组件配置解析失败", error);
      return {};
    }
  }
  const config = $derived(parse(contentTypeJson));
  const legacyStyle = $derived(config.data?.countdownStyle || "list1");
  const displaySystem = $derived(
    config.data?.countdownDisplaySystem === "classic" ||
      config.data?.countdownDisplaySystem === "center"
      ? config.data.countdownDisplaySystem
      : config.data?.countdownView
        ? "center"
        : "classic",
  );
  const normalizedView = $derived(
    normalizeCountdownWidgetView(config.data?.countdownView, legacyStyle),
  );
  const view = $derived({
    ...normalizedView,
    viewMode:
      displaySystem === "classic"
        ? legacyStyle === "list2"
          ? "compact"
          : legacyStyle === "card1" || legacyStyle === "card2"
            ? "cards"
            : "list"
        : normalizedView.viewMode,
  } as typeof normalizedView);
  let events = $state<CountdownEventRecord[]>([]);
  let categories = $state<CountdownCategoryRecord[]>([]);
  let settings = $state<CountdownCenterSettingsFile | null>(null);
  let loading = $state(true);
  let error = $state("");
  let currentId = $state("");
  let cardIndex = $state(0);
  let cardScroller = $state<HTMLElement | null>(null);
  let root = $state<HTMLElement | null>(null);
  let visible = $state(true);
  let touched = $state(false);
  let bg = $state("");
  const CLASSIC_DISPLAY_PREFERENCES: CountdownDisplayPreferences = {
    ...DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
    showWeekday: false,
    showOccurrenceDate: false,
    showLunarDate: false,
    showCategory: false,
    showTags: false,
    showPriority: false,
    showCountLabel: false,
    showNotePreview: false,
    showLinkedNoteAction: false,
  };
  const preferences = $derived(
    displaySystem === "classic" && view.viewMode !== "cards"
      ? CLASSIC_DISPLAY_PREFERENCES
      : resolveCountdownDisplayPreferences(view, settings?.displayDefaults),
  );
  const models = $derived(
    settings
      ? queryCountdownWidgetEvents(
          events,
          categories,
          view,
          new Date(),
          preferences,
        )
      : [],
  );
  const currentIndex = $derived(
    Math.max(
      0,
      models.findIndex((item) => item.event.id === currentId),
    ),
  );
  const timeline = $derived.by(() => {
    const groups = new Map<string, CountdownEventViewModel[]>();
    for (const model of models) {
      const key = model.relativeLabel;
      groups.set(key, [...(groups.get(key) ?? []), model]);
    }
    return [...groups.entries()];
  });
  async function reload() {
    const previous = currentId;
    try {
      const [data, loadedSettings] = await Promise.all([
        loadCountdownCenterData(),
        loadCountdownCenterSettings(),
      ]);
      events = data.events;
      categories = data.categories;
      settings = loadedSettings;
      error = "";
      const refreshed = queryCountdownWidgetEvents(
        data.events,
        data.categories,
        view,
        new Date(),
        resolveCountdownDisplayPreferences(
          view,
          loadedSettings.displayDefaults,
        ),
      );
      currentId = refreshed.some((item) => item.event.id === previous)
        ? previous
        : refreshed[0]?.event.id || "";
      cardIndex = Math.max(
        0,
        refreshed.findIndex((item) => item.event.id === currentId),
      );
    } catch (value) {
      error = value instanceof Error ? value.message : "纪念日数据读取失败";
      showMessage("纪念日数据加载失败，原文件未被覆盖", 4000, "error");
    } finally {
      loading = false;
    }
  }
  function openEvent(model: CountdownEventViewModel) {
    void openCountdownCenterDialog(plugin, {
      initialTab: "events",
      eventId: model.event.id,
    });
  }
  function openLinked(event: MouseEvent, model: CountdownEventViewModel) {
    event.stopPropagation();
    if (model.event.linkedBlockId)
      openDocs(plugin, model.event.linkedBlockId, 0);
  }
  function go(index: number) {
    if (!models.length) return;
    cardIndex = (index + models.length) % models.length;
    currentId = models[cardIndex].event.id;
    cardScroller?.children[cardIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }
  function syncCard() {
    if (!cardScroller) return;
    const width = cardScroller.clientWidth || 1;
    const index = Math.max(
      0,
      Math.min(models.length - 1, Math.round(cardScroller.scrollLeft / width)),
    );
    if (index !== cardIndex) {
      cardIndex = index;
      currentId = models[index]?.event.id || "";
    }
  }
  function formatWidgetDate(model: CountdownEventViewModel): string {
    return formatCountdownDisplayDate(
      model.event,
      model.occurrence,
      preferences,
    );
  }
  function compactDays(model: CountdownEventViewModel): string {
    return model.occurrence.daysDelta === 0
      ? "今天"
      : String(Math.abs(model.occurrence.daysDelta));
  }
  function prioritySuffix(model: CountdownEventViewModel): string {
    return preferences.showPriority
      ? ` · ${COUNTDOWN_PRIORITY_LABELS[model.event.priority]}优先级`
      : "";
  }
  function tagsSuffix(model: CountdownEventViewModel): string {
    return preferences.showTags && model.event.tags.length
      ? ` · ${model.event.tags.join("、")}`
      : "";
  }
  onMount(() => {
    if (!advancedEnabled) {
      loading = false;
      return;
    }
    let unsubscribe = () => {};
    let unsubscribeSettings = () => {};
    let stopDay = () => {};
    let observer: IntersectionObserver | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      const remote =
        config.data?.countdownCard1RemoteBg ||
        "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664";
      bg =
        config.data?.countdownCard1BgSelect === "local"
          ? config.data?.countdownCard1LocalBg || ""
          : await getImage(remote);
      await reload();
    })();
    unsubscribe = subscribeSharedWidgetDataUpdated(
      "countdown",
      () => void reload(),
    );
    unsubscribeSettings = subscribeCountdownCenterSettingsChanged(
      () => void reload(),
    );
    stopDay = createCountdownDayBoundaryWatcher(() => void reload());
    if (root && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => (visible = entries[0]?.isIntersecting !== false),
      );
      observer.observe(root);
    }
    timer = setInterval(
      () => {
        if (
          view.cardAutoPlay &&
          view.viewMode === "cards" &&
          models.length > 1 &&
          visible &&
          !document.hidden &&
          !touched
        )
          go(cardIndex + 1);
      },
      Math.max(2, view.cardIntervalSeconds) * 1000,
    );
    return () => {
      unsubscribe();
      unsubscribeSettings();
      stopDay();
      observer?.disconnect();
      if (timer) clearInterval(timer);
    };
  });
</script>

<div
  class="shp-countdown-widget"
  bind:this={root}
  data-view={view.viewMode}
  data-display-system={displaySystem}
  aria-label="纪念日组件"
>
  {#if advancedEnabled}
  {#if loading}<div class="shp-countdown-widget-state">
      纪念日加载中…
    </div>{:else if error}<div class="shp-countdown-widget-state error">
      <strong>纪念日数据文件异常</strong><small>{error}</small><button
        type="button"
        class="b3-button b3-button--text"
        onclick={() => void reload()}>重新加载</button
      >
    </div>{:else if models.length === 0}<div class="shp-countdown-widget-state">
      <strong>{events.length ? "当前筛选没有结果" : "还没有纪念日"}</strong
      ><small
        >{events.length
          ? "请调整当前组件的数据范围。"
          : "在纪念日中心添加重要日期。"}</small
      ><button
        type="button"
        class="b3-button b3-button--text shp-countdown-widget-state-action"
        onclick={() =>
          void openCountdownCenterDialog(plugin, {
            initialTab: events.length ? "settings" : "overview",
            createNew: !events.length,
          })}><CountdownIcon
          name={events.length ? "calendar" : "add"}
          size={17}
        /><span>{events.length ? "打开纪念日中心" : "新增纪念日"}</span></button
      >
    </div>{:else if view.viewMode === "compact"}<div
      class="shp-countdown-widget-compact"
      class:classic={displaySystem === "classic"}
      style={`--shp-list2-bg:${config.data?.countdownList2BgColor || "var(--b3-theme-primary)"}`}
    >
      {#each models as model (model.event.id)}<article>
          {#if displaySystem === "classic"}<button
              type="button"
              onclick={() => openEvent(model)}><span>{model.displayName}</span
              ><strong>{compactDays(model)}</strong></button
            >{:else}<button type="button" onclick={() => openEvent(model)}
              ><CountdownIcon name={model.icon} /><span>{model.displayName}</span
              >{#if preferences.showCategory && model.categoryLabel}<small
                  >{model.categoryLabel}</small
                >{/if}{#if preferences.showPriority}<small
                  >{COUNTDOWN_PRIORITY_LABELS[model.event.priority]}优先级</small
                >{/if}<strong
                >{model.occurrence.daysDelta === 0
                  ? "今天"
                  : model.occurrence.daysDelta > 0
                    ? `${model.occurrence.daysDelta} 天`
                    : `-${Math.abs(model.occurrence.daysDelta)} 天`}</strong
              ></button
            >{/if}{#if preferences.showLinkedNoteAction && model.event.linkedBlockId}<button
              type="button"
              class="shp-countdown-widget-compact-linked"
              title="打开关联笔记"
              aria-label="打开关联笔记"
              onclick={(event) => openLinked(event, model)}><CountdownIcon
                name="external-link"
                size={17}
              /></button
            >{/if}
        </article>{/each}
    </div>{:else if view.viewMode === "cards"}<div
      class="shp-countdown-widget-cards-wrap"
      style={`--shp-card-bg:var(--b3-theme-surface);--shp-card2-accent:${config.data?.countdownCard2BgColor || "#000000"};--shp-card-image:url("${bg}")`}
    >
      <div
        class="shp-countdown-widget-cards"
        bind:this={cardScroller}
        role="group"
        aria-label="纪念日卡片"
        onscroll={syncCard}
        onpointerdown={() => (touched = true)}
      >
        {#each models as model (model.event.id)}<button
            type="button"
            class:image={displaySystem === "classic" && legacyStyle === "card1"}
            onclick={() => openEvent(model)}
            aria-label={`${model.displayName}，${model.relativeLabel}`}
            onkeydown={(event) => {
              if (event.key === "ArrowLeft") go(cardIndex - 1);
              if (event.key === "ArrowRight") go(cardIndex + 1);
            }}
            ><CountdownCardSvg
              {model}
              {preferences}
              variant={displaySystem === "center"
                ? "center"
                : legacyStyle === "card1"
                  ? "image"
                  : "classic"}
            /></button
          >{/each}
      </div>
      <button
        type="button"
        class="previous"
        title="上一个"
        aria-label="上一个"
        onclick={() => go(cardIndex - 1)}><CountdownIcon
          name="chevron-left"
          size={22}
        /></button
      ><button
        type="button"
        class="next"
        title="下一个"
        aria-label="下一个"
        onclick={() => go(cardIndex + 1)}><CountdownIcon
          name="chevron-right"
          size={22}
        /></button
      >
    </div>{:else if view.viewMode === "timeline"}<div
      class="shp-countdown-widget-timeline"
    >
      {#each timeline as group}<section>
          <header>{group[0]}</header>
          {#each group[1] as model (model.event.id)}<button
              type="button"
              onclick={() => openEvent(model)}
              ><span
                style={`--shp-event-color:${model.color || "var(--b3-theme-primary)"}`}
              ></span><CountdownIcon name={model.icon} />
              <div>
                <strong>{model.displayName}</strong><small
                  >{formatWidgetDate(model)}{preferences.showCategory &&
                  model.categoryLabel
                    ? ` · ${model.categoryLabel}`
                    : ""}{prioritySuffix(model)}{tagsSuffix(
                    model,
                  )}{preferences.showLunarDate &&
                  model.occurrence.lunarDateLabel
                    ? ` · ${model.occurrence.lunarDateLabel}`
                    : ""}{preferences.showCountLabel && model.countLabel
                    ? ` · ${model.countLabel}`
                    : ""}</small
                >
              </div></button
            >{/each}
        </section>{/each}
    </div>{:else}<div
      class="shp-countdown-widget-list"
      class:classic={displaySystem === "classic"}
    >
      {#if displaySystem === "classic"}<h3
          class="shp-countdown-widget-list-title"
        ><CountdownIcon name="calendar" size={16} />倒数日</h3
        >{/if}
      {#each models as model (model.event.id)}<article>
          {#if displaySystem === "classic"}<button
              type="button"
              class="shp-countdown-widget-list-main"
              onclick={() => openEvent(model)}><span
                class="shp-countdown-widget-list-classic-copy"
                ><strong>{model.displayName}</strong><small
                  >{formatWidgetDate(model)}</small
                ></span
              ><em>{compactDays(model)}</em></button
            >{:else}<button
              type="button"
              class="shp-countdown-widget-list-main"
              onclick={() => openEvent(model)}
              ><span
                style={`--shp-event-color:${model.color || "var(--b3-theme-primary)"}`}
                ><CountdownIcon name={model.icon} /></span
              >
              <div>
                <strong>{model.displayName}</strong><small
                  >{formatWidgetDate(model)}{preferences.showCategory &&
                  model.categoryLabel
                    ? ` · ${model.categoryLabel}`
                    : ""}{prioritySuffix(model)}{tagsSuffix(
                    model,
                  )}{preferences.showLunarDate && model.occurrence.lunarDateLabel
                    ? ` · ${model.occurrence.lunarDateLabel}`
                    : ""}</small
                >{#if preferences.showNotePreview && model.event.note}<p>
                    {model.event.note}
                  </p>{/if}
              </div>
              <em
                >{model.relativeLabel}{preferences.showCountLabel &&
                model.countLabel
                  ? ` · ${model.countLabel}`
                  : ""}</em
              ></button
            >{/if}
          >{#if preferences.showLinkedNoteAction && model.event.linkedBlockId}<button
              type="button"
              class="shp-countdown-widget-linked"
              title="打开关联笔记"
              aria-label="打开关联笔记"
              onclick={(event) => openLinked(event, model)}><CountdownIcon
                name="external-link"
                size={17}
              /></button
            >{/if}
        </article>{/each}
    </div>{/if}
  {/if}
</div>

<style>
  .shp-countdown-widget {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
    box-sizing: border-box;
  }
  .shp-countdown-widget-state {
    height: 100%;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 16px;
    text-align: center;
  }
  .shp-countdown-widget-state small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-widget-state.error strong {
    color: var(--b3-theme-error);
  }
  .shp-countdown-widget-state-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .shp-countdown-widget-list {
    display: grid;
    gap: 7px;
    padding: 8px;
  }
  .shp-countdown-widget-list article {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
    overflow: hidden;
  }
  .shp-countdown-widget-list-main {
    flex: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 9px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }
  .shp-countdown-widget-list-main > span {
    width: 38px;
    height: 38px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--shp-event-color);
    background: color-mix(in srgb, var(--shp-event-color) 10%, transparent);
  }
  .shp-countdown-widget-list-main > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .shp-countdown-widget-list-main small {
    color: var(--b3-theme-on-surface);
    white-space: normal;
  }
  .shp-countdown-widget-list-main p {
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .shp-countdown-widget-list-main em {
    font-style: normal;
    color: var(--b3-theme-primary);
    text-align: right;
  }
  .shp-countdown-widget-linked {
    width: 44px;
    border: 0;
    border-left: 1px solid var(--b3-border-color);
    background: transparent;
    color: var(--b3-theme-primary);
  }
  .shp-countdown-widget-list.classic {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }
  .shp-countdown-widget-list-title {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--b3-border-color);
    font-size: 18px;
  }
  .shp-countdown-widget-list.classic article {
    border: 0;
    background: var(--b3-theme-surface);
  }
  .shp-countdown-widget-list.classic .shp-countdown-widget-list-main {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 12px 16px;
  }
  .shp-countdown-widget-list-main
    > .shp-countdown-widget-list-classic-copy {
    width: auto;
    height: auto;
    display: grid;
    justify-content: start;
    gap: 2px;
    border-radius: 0;
    color: inherit;
    background: transparent;
  }
  .shp-countdown-widget-list-classic-copy strong {
    color: var(--b3-theme-primary);
  }
  .shp-countdown-widget-list-classic-copy small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-widget-compact {
    display: grid;
  }
  .shp-countdown-widget-compact > article {
    display: flex;
    border-bottom: 1px solid var(--b3-border-color);
  }
  .shp-countdown-widget-compact > article > button:first-child {
    flex: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    padding: 5px 9px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }
  .shp-countdown-widget-compact small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-widget-compact-linked {
    width: 44px;
    border: 0;
    border-left: 1px solid var(--b3-border-color);
    background: transparent;
    color: var(--b3-theme-primary);
  }
  .shp-countdown-widget-compact.classic {
    gap: 8px;
    padding: 16px;
    overflow-y: auto;
  }
  .shp-countdown-widget-compact.classic > article {
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    background: var(--b3-theme-background);
  }
  .shp-countdown-widget-compact.classic
    > article
    > button:first-child {
    display: flex;
    justify-content: space-between;
    min-height: 44px;
    padding: 0 0 0 12px;
    font-size: 18px;
    font-weight: 600;
  }
  .shp-countdown-widget-compact.classic
    > article
    > button:first-child
    strong {
    align-self: stretch;
    min-width: 72px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    background: var(--shp-list2-bg);
    color: #fff;
  }
  .shp-countdown-widget-cards-wrap {
    height: 100%;
    position: relative;
    overflow: hidden;
  }
  .shp-countdown-widget-cards {
    height: 100%;
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .shp-countdown-widget-cards::-webkit-scrollbar {
    display: none;
  }
  .shp-countdown-widget-cards > button {
    flex: 0 0 100%;
    scroll-snap-align: center;
    display: block;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    background: var(--shp-card-bg);
    color: var(--b3-theme-on-background);
    text-align: center;
    overflow: hidden;
  }
  .shp-countdown-widget-cards > button.image {
    background-image: var(--shp-card-image);
    background-position: center;
    background-size: cover;
    color: #fff;
  }
  .shp-countdown-widget-cards-wrap > .previous,
  .shp-countdown-widget-cards-wrap > .next {
    position: absolute;
    top: calc(50% - 21px);
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--b3-theme-background) 75%, transparent);
    color: inherit;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .shp-countdown-widget-cards-wrap:hover > .previous,
  .shp-countdown-widget-cards-wrap:hover > .next,
  .shp-countdown-widget-cards-wrap:focus-within > .previous,
  .shp-countdown-widget-cards-wrap:focus-within > .next {
    opacity: 1;
  }
  .shp-countdown-widget-cards-wrap > .previous {
    left: 7px;
  }
  .shp-countdown-widget-cards-wrap > .next {
    right: 7px;
  }
  .shp-countdown-widget-timeline {
    display: grid;
    gap: 10px;
    padding: 10px;
  }
  .shp-countdown-widget-timeline section {
    display: grid;
    gap: 5px;
  }
  .shp-countdown-widget-timeline header {
    font-weight: 700;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-widget-timeline section > button {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }
  .shp-countdown-widget-timeline section > button > span {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--shp-event-color);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--shp-event-color) 15%, transparent);
  }
  .shp-countdown-widget-timeline section > button > div {
    display: grid;
  }
  .shp-countdown-widget-timeline small {
    color: var(--b3-theme-on-surface);
  }
  @media (pointer: coarse) {
    .shp-countdown-widget-cards-wrap > .previous,
    .shp-countdown-widget-cards-wrap > .next {
      display: none;
    }
  }
  @media (max-width: 360px) {
    .shp-countdown-widget-list-main {
      grid-template-columns: auto 1fr;
    }
    .shp-countdown-widget-list-main em {
      grid-column: 2;
      text-align: left;
    }
    .shp-countdown-widget-compact small {
      display: none;
    }
  }
</style>

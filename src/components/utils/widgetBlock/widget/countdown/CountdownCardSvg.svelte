<script lang="ts">
  import {
    formatCountdownOccurrenceDate,
    formatCountdownOriginalDate,
  } from "./countdownDateEngine";
  import {
    COUNTDOWN_PRIORITY_LABELS,
    type CountdownDisplayPreferences,
    type CountdownEventViewModel,
  } from "./countdownTypes";
  import {
    truncateCountdownSvgText,
    wrapCountdownSvgText,
  } from "./countdownCardSvgText";

  type CountdownCardVariant = "image" | "classic" | "center";

  interface Props {
    model: CountdownEventViewModel;
    preferences: CountdownDisplayPreferences;
    variant?: CountdownCardVariant;
  }

  let { model, preferences, variant = "center" }: Props = $props();

  const countdownText = $derived(
    model.occurrence.daysDelta === 0
      ? "今天"
      : String(Math.abs(model.occurrence.daysDelta)),
  );
  const relativeSuffix = $derived(
    model.occurrence.daysDelta === 0
      ? ""
      : model.occurrence.daysDelta > 0
        ? "天后"
        : "天前",
  );
  const countdownFontSize = $derived.by(() => {
    const length = Array.from(countdownText).length;
    if (length > 4) return variant === "image" ? 20 : 18;
    const sizes =
      variant === "image"
        ? [40, 40, 32, 28]
        : variant === "classic"
          ? [35, 35, 29, 26]
          : [37, 37, 31, 27];
    return sizes[Math.max(0, length - 1)] ?? 20;
  });
  const textWidth = $derived(
    variant === "center" ? 12 : variant === "image" ? 9 : 11,
  );
  const titleLines = $derived(
    wrapCountdownSvgText(model.displayName, textWidth, 2),
  );
  const originalDate = $derived(
    preferences.showOriginalDate
      ? formatCountdownOriginalDate(model.event, preferences)
      : "",
  );
  const occurrenceDate = $derived(
    preferences.showOccurrenceDate
      ? formatCountdownOccurrenceDate(model.occurrence, preferences)
      : "",
  );
  const primaryDate = $derived(
    occurrenceDate || originalDate,
  );
  const originalDiffersFromOccurrence = $derived(
    model.event.calendar !== "solar" ||
      model.event.date !== model.occurrence.localDate,
  );
  const detailText = $derived.by(() => {
    const details: string[] = [];
    if (
      originalDate &&
      occurrenceDate &&
      originalDiffersFromOccurrence
    )
      details.push(`原始 ${originalDate}`);
    if (preferences.showCountLabel && model.countLabel)
      details.push(model.countLabel);
    if (preferences.showCategory && model.categoryLabel)
      details.push(model.categoryLabel);
    if (preferences.showPriority)
      details.push(`${COUNTDOWN_PRIORITY_LABELS[model.event.priority]}优先级`);
    if (preferences.showLunarDate && model.occurrence.lunarDateLabel)
      details.push(model.occurrence.lunarDateLabel);
    if (preferences.showTags && model.event.tags.length)
      details.push(model.event.tags.map((tag) => `#${tag}`).join(" "));
    return details.join(" · ");
  });
  const metadataLines = $derived.by(() => {
    const limit = variant === "center" ? 3 : 2;
    const lines = primaryDate
      ? [truncateCountdownSvgText(primaryDate, textWidth)]
      : [];
    return [
      ...lines,
      ...wrapCountdownSvgText(
        detailText,
        textWidth,
        Math.max(0, limit - lines.length),
      ),
    ].slice(0, limit);
  });
</script>

<svg
  class="shp-countdown-card-svg"
  class:shp-countdown-card-svg-image={variant === "image"}
  class:shp-countdown-card-svg-classic={variant === "classic"}
  class:shp-countdown-card-svg-center={variant === "center"}
  width="100%"
  height="100%"
  viewBox="0 0 100 100"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label={`${model.displayName}，${model.relativeLabel}`}
>
  <title>{model.displayName}，{model.relativeLabel}</title>
  {#if variant === "image"}
    <rect
      class="shp-countdown-card-svg-overlay"
      x="5"
      y="5"
      width="90"
      height="90"
      rx="5"
      ry="5"
    />
    <line
      class="shp-countdown-card-svg-divider"
      x1="10"
      y1="48"
      x2="90"
      y2="48"
    />
    <text
      class="shp-countdown-card-svg-relative"
      x="50"
      y="25"
      style={`font-size:${countdownFontSize}px`}>{countdownText}</text
    >
    {#if relativeSuffix}<text
        class="shp-countdown-card-svg-relative-suffix"
        x="50"
        y="43">{relativeSuffix}</text
      >{/if}
    {#each titleLines as titleLine, index}<text
        class="shp-countdown-card-svg-title"
        x="50"
        y={58 + index * 8}>{titleLine}</text
      >{/each}
    {#each metadataLines as metadataLine, index}<text
        class="shp-countdown-card-svg-date"
        x="50"
        y={84 + index * 9}>{metadataLine}</text
      >{/each}
  {:else if variant === "classic"}
    <rect
      class="shp-countdown-card-svg-classic-header"
      x="0"
      y="0"
      width="100"
      height="30"
    />
    {#each titleLines as titleLine, index}<text
        class="shp-countdown-card-svg-classic-title"
        x="50"
        y={10 + index * 11}>{titleLine}</text
      >{/each}
    <text
      class="shp-countdown-card-svg-classic-relative"
      x="50"
      y="53"
      style={`font-size:${countdownFontSize}px`}>{countdownText}</text
    >
    {#if relativeSuffix}<text
        class="shp-countdown-card-svg-classic-suffix"
        x="50"
        y="70">{relativeSuffix}</text
      >{/if}
    {#each metadataLines as metadataLine, index}<text
        class="shp-countdown-card-svg-classic-date"
        x="50"
        y={84 + index * 10}>{metadataLine}</text
      >{/each}
  {:else}
    <circle
      class="shp-countdown-card-svg-center-decoration"
      cx="88"
      cy="14"
      r="19"
    />
    <rect
      class="shp-countdown-card-svg-center-accent"
      x="10"
      y="8"
      width="3"
      height={titleLines.length > 1 ? 20 : 13}
      rx="1.5"
    />
    {#each titleLines as titleLine, index}<text
        class="shp-countdown-card-svg-center-title"
        x="17"
        y={14 + index * 9}>{titleLine}</text
      >{/each}
    <text class="shp-countdown-card-svg-center-direction" x="50" y="34"
      >{model.relativeLabel}</text
    >
    <text
      class="shp-countdown-card-svg-center-relative"
      x="50"
      y="51"
      style={`font-size:${countdownFontSize}px`}>{countdownText}</text
    >
    {#if relativeSuffix}<text
        class="shp-countdown-card-svg-center-unit"
        x="50"
        y="65">{relativeSuffix}</text
      >{/if}
    <line
      class="shp-countdown-card-svg-center-divider"
      x1="13"
      y1="70"
      x2="87"
      y2="70"
    />
    {#each metadataLines as metadataLine, index}<text
        class="shp-countdown-card-svg-center-date"
        x="50"
        y={78 + index * 8}>{metadataLine}</text
      >{/each}
  {/if}
</svg>

<style>
  .shp-countdown-card-svg {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: visible;
    color: currentColor;
    font-family: inherit;
    pointer-events: none;
  }
  .shp-countdown-card-svg text {
    font-family: inherit;
    text-anchor: middle;
    dominant-baseline: middle;
  }
  .shp-countdown-card-svg-overlay {
    fill: rgba(0, 0, 0, 0.5);
  }
  .shp-countdown-card-svg-divider {
    stroke: currentColor;
    stroke-width: 1;
    stroke-linecap: round;
    stroke-dasharray: 10 6;
    opacity: 0.8;
  }
  .shp-countdown-card-svg-image text {
    fill: currentColor;
  }
  .shp-countdown-card-svg-title {
    font-size: 9px;
    font-weight: 600;
  }
  .shp-countdown-card-svg-relative {
    font-weight: 600;
  }
  .shp-countdown-card-svg-relative-suffix {
    font-size: 7px;
    opacity: 0.88;
  }
  .shp-countdown-card-svg-date {
    font-size: 6.5px;
    opacity: 0.82;
  }
  .shp-countdown-card-svg-classic-header {
    fill: var(--shp-card2-accent, #000);
  }
  .shp-countdown-card-svg-classic-title {
    fill: #fff;
    font-size: 9px;
    font-weight: 600;
  }
  .shp-countdown-card-svg-classic-relative {
    fill: var(--b3-theme-on-background, #1f2328);
    font-weight: 600;
  }
  .shp-countdown-card-svg-classic-suffix,
  .shp-countdown-card-svg-classic-date {
    fill: var(--b3-theme-on-surface, rgba(0, 0, 0, 0.62));
  }
  .shp-countdown-card-svg-classic-suffix {
    font-size: 7px;
  }
  .shp-countdown-card-svg-classic-date {
    font-size: 6.5px;
  }
  .shp-countdown-card-svg-center-decoration {
    fill: color-mix(
      in srgb,
      var(--b3-theme-primary, #4285f4) 9%,
      transparent
    );
  }
  .shp-countdown-card-svg-center-accent {
    fill: var(--b3-theme-primary, #4285f4);
  }
  .shp-countdown-card-svg-center-title {
    fill: var(--b3-theme-on-background, #1f2328);
    font-size: 8px;
    font-weight: 650;
    text-anchor: start !important;
  }
  .shp-countdown-card-svg-center-direction {
    fill: var(--b3-theme-on-surface, #69707a);
    font-size: 6.5px;
  }
  .shp-countdown-card-svg-center-relative {
    fill: var(--b3-theme-primary, #4285f4);
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .shp-countdown-card-svg-center-unit {
    fill: var(--b3-theme-on-surface, #69707a);
    font-size: 7px;
    font-weight: 500;
  }
  .shp-countdown-card-svg-center-divider {
    stroke: var(--b3-border-color, #d9d9d9);
    stroke-width: 0.65;
  }
  .shp-countdown-card-svg-center-date {
    fill: var(--b3-theme-on-surface, #69707a);
    font-size: 6.5px;
  }
</style>

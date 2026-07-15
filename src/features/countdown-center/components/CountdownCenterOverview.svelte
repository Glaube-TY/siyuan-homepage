<script lang="ts">
  import type { CountdownEventViewModel } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownEmptyState from "./CountdownEmptyState.svelte";
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    models: CountdownEventViewModel[];
    total: number;
    onAdd: () => void;
    onEdit: (id: string) => void;
    onOpenEvents: () => void;
  }
  let { models, total, onAdd, onEdit, onOpenEvents }: Props = $props();
  const stats = $derived([
    {
      label: "今天",
      icon: "today",
      value: models.filter((item) => item.occurrence.daysDelta === 0).length,
    },
    {
      label: "未来 7 天",
      icon: "next-7",
      value: models.filter(
        (item) =>
          item.occurrence.daysDelta >= 0 && item.occurrence.daysDelta <= 7,
      ).length,
    },
    {
      label: "未来 30 天",
      icon: "next-30",
      value: models.filter(
        (item) =>
          item.occurrence.daysDelta >= 0 && item.occurrence.daysDelta <= 30,
      ).length,
    },
    {
      label: "高优先级",
      icon: "high-priority",
      value: models.filter((item) => item.event.priority === "high").length,
    },
    { label: "全部活动", value: total, icon: "all" },
  ]);
</script>

<div class="shp-countdown-overview">
  <section class="shp-countdown-overview-stats">
    {#each stats as stat}<button type="button" onclick={onOpenEvents}
        ><CountdownIcon name={stat.icon} size={19} /><span
          >{stat.value}</span
        ><small>{stat.label}</small></button
      >{/each}
  </section>
  {#if models.length === 0}<CountdownEmptyState
      title="还没有纪念日"
      description="添加生日、周年、截止日期或其他重要日期。"
      actionLabel="新增纪念日"
      onAction={onAdd}
    />{:else}<section class="shp-countdown-overview-hero">
      <div class="shp-countdown-overview-hero-icon">
        <CountdownIcon name={models[0].icon} size={34} />
      </div>
      <div>
        <small>最近事件</small>
        <h2>{models[0].displayName}</h2>
        <p>
          {models[0].relativeLabel} · {models[0].displayDate}{models[0]
            .categoryLabel
            ? ` · ${models[0].categoryLabel}`
            : ""}{models[0].countLabel ? ` · ${models[0].countLabel}` : ""}
        </p>
      </div>
      <CountdownIconButton
        name="edit"
        label={`编辑 ${models[0].displayName}`}
        onclick={() => onEdit(models[0].event.id)}
      />
    </section>
    <section class="shp-countdown-overview-upcoming">
      <header>
        <h3>即将到来</h3>
        <CountdownIconButton
          name="events"
          label="查看全部纪念日"
          onclick={onOpenEvents}
        />
      </header>
      <div>
        {#each models.slice(0, 8) as model (model.event.id)}<button
            type="button"
            onclick={() => onEdit(model.event.id)}
            ><CountdownIcon name={model.icon} /><span
              ><strong>{model.displayName}</strong><small
                >{model.displayDate}{model.categoryLabel
                  ? ` · ${model.categoryLabel}`
                  : ""}</small
              ></span
            ><em>{model.relativeLabel}</em></button
          >{/each}
      </div>
    </section>{/if}
</div>

<style>
  .shp-countdown-overview {
    display: grid;
    gap: 16px;
    padding: 18px;
  }
  .shp-countdown-overview-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(100px, 1fr));
    gap: 10px;
  }
  .shp-countdown-overview-stats button {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
    background: var(--b3-theme-surface);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .shp-countdown-overview-stats span {
    grid-row: 1 / 3;
    grid-column: 2;
    justify-self: end;
    font-size: 24px;
    font-weight: 700;
  }
  .shp-countdown-overview-stats small {
    grid-column: 1;
    grid-row: 2;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-overview-hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--b3-border-color);
    border-radius: 12px;
    background: var(--b3-theme-background);
  }
  .shp-countdown-overview-hero-icon {
    width: 62px;
    height: 62px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
  }
  .shp-countdown-overview-hero h2,
  .shp-countdown-overview-hero p {
    margin: 3px 0;
  }
  .shp-countdown-overview-hero p,
  .shp-countdown-overview-hero small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-overview-upcoming {
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    overflow: hidden;
  }
  .shp-countdown-overview-upcoming header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--b3-border-color);
  }
  .shp-countdown-overview-upcoming h3 {
    margin: 0;
  }
  .shp-countdown-overview-upcoming > div > button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 0;
    border-bottom: 1px solid var(--b3-border-color);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .shp-countdown-overview-upcoming > div > button:last-child {
    border-bottom: 0;
  }
  .shp-countdown-overview-upcoming span {
    display: grid;
  }
  .shp-countdown-overview-upcoming small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-overview-upcoming em {
    font-style: normal;
    color: var(--b3-theme-primary);
  }
  @media (max-width: 700px) {
    .shp-countdown-overview {
      padding: 12px;
    }
    .shp-countdown-overview-stats {
      grid-template-columns: 1fr;
    }
    .shp-countdown-overview-hero {
      grid-template-columns: auto 1fr;
    }
  }
</style>

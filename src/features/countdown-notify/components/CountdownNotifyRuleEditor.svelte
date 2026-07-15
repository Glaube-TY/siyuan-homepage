<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import CountdownIconButton from "@/features/countdown-center/components/CountdownIconButton.svelte";
  import {
    COUNTDOWN_EVENT_KINDS,
    COUNTDOWN_KIND_LABELS,
    type CountdownCategoryRecord,
    type CountdownEventRecord,
    type CountdownPriority,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import type { CountdownNotifyRule } from "../types";
  interface Props {
    rule: CountdownNotifyRule;
    categories?: CountdownCategoryRecord[];
    tags?: string[];
    events?: CountdownEventRecord[];
    disabled?: boolean;
    onDelete: () => void;
  }
  let {
    rule = $bindable(),
    categories = [],
    tags = [],
    events = [],
    disabled = false,
    onDelete,
  }: Props = $props();
  const patch = (next: Partial<CountdownNotifyRule>) => {
    rule = { ...rule, ...next };
  };
  const labels = {
    today_events: "今日事件提醒",
    advance_events: "提前 N 天提醒",
    upcoming_digest: "未来 N 天摘要",
  } as const;
  function setAdvanceDays(value: string): void {
    patch({
      advanceDays: [
        ...new Set(
          value
            .split(/[,，\s]+/)
            .map(Number)
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 365),
        ),
      ].sort((a, b) => a - b),
    });
  }
  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }
  function patchScope(next: Partial<CountdownNotifyRule["scope"]>): void {
    patch({ scope: { ...rule.scope, ...next } });
  }
  const invalidCategoryIds = $derived(
    rule.scope.categoryIds.filter(
      (categoryId) =>
        !categories.some((category) => category.id === categoryId),
    ),
  );
</script>

<div class="shp-notification-rule-card">
  <div class="shp-notification-rule-header">
    <strong>{labels[rule.type]}</strong><label
      ><span>启用</span><input
        type="checkbox"
        class="b3-switch fn__flex-center"
        checked={rule.enabled}
        {disabled}
        onchange={(e) => patch({ enabled: e.currentTarget.checked })}
      /></label
    >
  </div>
  <SettingRow title="标题" description="通知中显示的规则标题"
    ><input
      class="b3-text-field control-lg"
      value={rule.title}
      {disabled}
      onchange={(e) => patch({ title: e.currentTarget.value })}
    /></SettingRow
  >
  <SettingRow title="通知时间" description="每天检查并发送该规则的时间"
    ><input
      type="time"
      class="b3-text-field control-sm"
      value={rule.time ?? "08:00"}
      {disabled}
      onchange={(e) => patch({ time: e.currentTarget.value })}
    /></SettingRow
  >
  {#if rule.type === "advance_events"}<SettingRow
      title="提前天数"
      description="使用逗号或空格分隔多个提前天数"
      ><input
        class="b3-text-field control-md"
        value={(rule.advanceDays ?? []).join(", ")}
        {disabled}
        onchange={(e) => setAdvanceDays(e.currentTarget.value)}
      /></SettingRow
    >{/if}
  {#if rule.type === "upcoming_digest"}<SettingRow
      title="摘要范围"
      description="汇总未来指定天数内的纪念日"
      ><input
        type="number"
        class="b3-text-field control-sm"
        min="1"
        max="365"
        value={rule.upcomingDays ?? 7}
        {disabled}
        onchange={(e) => patch({ upcomingDays: Number(e.currentTarget.value) })}
      /></SettingRow
    >{/if}
  <div class="shp-countdown-rule-scope">
    <strong>提醒范围</strong><small
      >同一维度为“或”，不同维度为“且”；不选择表示全部。</small
    >
    <div>
      {#each COUNTDOWN_EVENT_KINDS as kind}<button
          type="button"
          class:active={rule.scope.kinds.includes(kind)}
          aria-pressed={rule.scope.kinds.includes(kind)}
          {disabled}
          onclick={() => patchScope({ kinds: toggle(rule.scope.kinds, kind) })}
          >{COUNTDOWN_KIND_LABELS[kind]}</button
        >{/each}
    </div>
    {#if categories.length}<div>
        {#each categories as category}<button
            type="button"
            class:active={rule.scope.categoryIds.includes(category.id)}
            aria-pressed={rule.scope.categoryIds.includes(category.id)}
            {disabled}
            onclick={() =>
              patchScope({
                categoryIds: toggle(rule.scope.categoryIds, category.id),
              })}>{category.name}</button
          >{/each}
      </div>{/if}
    {#if invalidCategoryIds.length}<p class="shp-countdown-rule-invalid">
        已失效分类：{invalidCategoryIds.join("、")}，请修复提醒范围。
      </p>{/if}
    {#if tags.length}<div>
        {#each tags as tag}<button
            type="button"
            class:active={rule.scope.tags.includes(tag)}
            aria-pressed={rule.scope.tags.includes(tag)}
            {disabled}
            onclick={() => patchScope({ tags: toggle(rule.scope.tags, tag) })}
            >#{tag}</button
          >{/each}
      </div>{/if}
    <div>
      {#each [["high", "高"], ["normal", "普通"], ["low", "低"]] as priority}<button
          type="button"
          class:active={rule.scope.priorities.includes(
            priority[0] as CountdownPriority,
          )}
          aria-pressed={rule.scope.priorities.includes(
            priority[0] as CountdownPriority,
          )}
          {disabled}
          onclick={() =>
            patchScope({
              priorities: toggle(
                rule.scope.priorities,
                priority[0] as CountdownPriority,
              ),
            })}>{priority[1]}</button
        >{/each}
    </div>
    {#if events.length}<select
        class="b3-text-field"
        multiple
        size="3"
        value={rule.scope.eventIds}
        {disabled}
        onchange={(event) =>
          patchScope({
            eventIds: Array.from(
              event.currentTarget.selectedOptions,
              (option) => option.value,
            ),
          })}
        >{#each events as item}<option value={item.id}>{item.name}</option
          >{/each}</select
      >{/if}
  </div>
  <NotificationTargetSelector bind:value={rule.deliveryTargets} {disabled} />
  {#if rule.deliveryTargets.some((target) => target.kind === "mobile")}<p
      class="shp-notification-rule-hint"
    >
      纪念日时间可提前计算，会注册为当前手机的本地计划；修改事件或规则后自动对账。
    </p>{/if}
  <div class="shp-notification-rule-footer">
    <CountdownIconButton
      name="delete"
      label="删除通知规则"
      danger
      {disabled}
      onclick={onDelete}
    />
  </div>
</div>

<style>
  .shp-notification-rule-card {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: grid;
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
  }
  .shp-notification-rule-card .b3-text-field {
    max-width: 100%;
    box-sizing: border-box;
  }
  .shp-notification-rule-header,
  .shp-notification-rule-header label,
  .shp-notification-rule-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .shp-notification-rule-header label {
    justify-content: flex-end;
  }
  .shp-notification-rule-hint {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    line-height: 1.5;
  }
  .shp-notification-rule-footer {
    justify-content: flex-end;
  }
  .shp-countdown-rule-scope {
    display: grid;
    gap: 7px;
    padding: 8px 0;
  }
  .shp-countdown-rule-scope small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-rule-invalid {
    margin: 0;
    color: var(--b3-theme-error);
    font-size: 12px;
  }
  .shp-countdown-rule-scope > div {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .shp-countdown-rule-scope button {
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 17px;
    background: transparent;
    color: inherit;
  }
  .shp-countdown-rule-scope button.active {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
  }
  .shp-countdown-rule-scope select {
    max-width: 100%;
    width: 100%;
  }
</style>

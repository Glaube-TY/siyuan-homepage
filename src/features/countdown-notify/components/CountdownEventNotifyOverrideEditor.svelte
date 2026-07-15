<script lang="ts">
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import type { CountdownEventNotifyOverride } from "../types";
  interface Props {
    value: Omit<CountdownEventNotifyOverride, "eventId">;
    disabled?: boolean;
    onChange: (value: Omit<CountdownEventNotifyOverride, "eventId">) => void;
  }
  let { value, disabled = false, onChange }: Props = $props();
  let deliveryTargets = $state<typeof value.deliveryTargets>([]);
  let initialized = $state(false);
  function cloneTargets(
    targets: typeof value.deliveryTargets,
  ): typeof value.deliveryTargets {
    return targets.map((target) => ({ ...target }));
  }
  function patch(next: Partial<typeof value>): void {
    onChange({ ...value, ...next });
  }
  function days(text: string): number[] {
    return [
      ...new Set(
        text
          .split(/[,，\s]+/)
          .map(Number)
          .filter((item) => Number.isInteger(item) && item >= 0 && item <= 365),
      ),
    ].sort((a, b) => a - b);
  }
  $effect(() => {
    if (!initialized) {
      // Svelte $state 会产生 Proxy，不能直接传给 structuredClone。
      deliveryTargets = cloneTargets(value.deliveryTargets);
      initialized = true;
      return;
    }
    if (
      JSON.stringify(deliveryTargets) !== JSON.stringify(value.deliveryTargets)
    )
      patch({ deliveryTargets });
  });
</script>

<div class="shp-countdown-event-notify">
  <div class="shp-countdown-event-notify-modes">
    {#each [["inherit", "跟随全局"], ["mute", "静音"], ["custom", "自定义"]] as option}<button
        type="button"
        class:active={value.mode === option[0]}
        {disabled}
        onclick={() => patch({ mode: option[0] as typeof value.mode })}
        >{option[1]}</button
      >{/each}
  </div>
  {#if value.mode === "mute"}<p>
      该事件不会参与今日、提前、摘要和移动通知计划。
    </p>{:else if value.mode === "custom"}<label
      ><span>当天提醒</span><input
        type="checkbox"
        class="b3-switch fn__flex-center"
        checked={value.remindOnDay}
        {disabled}
        onchange={(event) =>
          patch({ remindOnDay: event.currentTarget.checked })}
      /></label
    ><label
      ><span>提前天数</span><input
        class="b3-text-field"
        value={value.advanceDays.join(", ")}
        {disabled}
        onchange={(event) =>
          patch({ advanceDays: days(event.currentTarget.value) })}
      /></label
    ><label
      ><span>提醒时间</span><input
        type="time"
        class="b3-text-field"
        value={value.time}
        {disabled}
        onchange={(event) => patch({ time: event.currentTarget.value })}
      /></label
    ><label
      ><span>参加全局摘要</span><input
        type="checkbox"
        class="b3-switch fn__flex-center"
        checked={value.includeInDigest}
        {disabled}
        onchange={(event) =>
          patch({ includeInDigest: event.currentTarget.checked })}
      /></label
    ><NotificationTargetSelector bind:value={deliveryTargets} {disabled} />{/if}
</div>

<style>
  .shp-countdown-event-notify {
    display: grid;
    gap: 10px;
  }
  .shp-countdown-event-notify-modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    overflow: hidden;
  }
  .shp-countdown-event-notify-modes button {
    min-height: 40px;
    border: 0;
    background: transparent;
    color: inherit;
  }
  .shp-countdown-event-notify-modes button.active {
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
  }
  .shp-countdown-event-notify label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .shp-countdown-event-notify p {
    margin: 0;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }
</style>

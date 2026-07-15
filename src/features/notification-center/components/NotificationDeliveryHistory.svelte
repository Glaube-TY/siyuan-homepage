<script lang="ts">
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import type { NotificationDeliveryHistoryRecord } from "../types";
  interface Props { records: NotificationDeliveryHistoryRecord[]; error?: string | null; }
  let { records, error = null }: Props = $props();
  interface DeliveryGroup { key: string; title: string; source: string; type: string; scheduledAt?: string; lastAttemptAt: string; deliveries: NotificationDeliveryHistoryRecord[]; }
  function groupRecords(items: NotificationDeliveryHistoryRecord[]): DeliveryGroup[] {
    const groups = new Map<string, DeliveryGroup>();
    for (const record of items) {
      const key = `${record.eventId}:${record.occurrenceKey}`;
      const group = groups.get(key) ?? { key, title: record.title, source: record.source, type: record.type, scheduledAt: record.scheduledAt, lastAttemptAt: record.lastAttemptAt, deliveries: [] };
      group.deliveries.push(record);
      if (record.lastAttemptAt > group.lastAttemptAt) group.lastAttemptAt = record.lastAttemptAt;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));
  }
</script>
<SettingSection title="最近投递结果">
  {#if error}<p class="shp-notification-error">历史读取失败：{error}</p>{/if}
  {#if records.length === 0 && !error}<p class="shp-notification-history-empty">暂无投递记录。</p>{:else if records.length > 0}
    <div class="shp-notification-history-list">
      {#each groupRecords(records) as group (group.key)}
        <div class="shp-notification-history-item">
          <div class="shp-notification-history-heading"><strong>{group.title}</strong><small>{group.source} · {group.type}{group.scheduledAt ? ` · 计划 ${new Date(group.scheduledAt).toLocaleString()}` : ""}</small></div>
          <div class="shp-notification-history-deliveries">{#each group.deliveries as record (record.id)}<span class:shp-notification-history-failed={record.status === "failed"}>{record.targetTitle}：{record.status}{record.errorMessage ? `（${record.errorMessage}）` : ""}</span>{/each}</div>
          <time>{new Date(group.lastAttemptAt).toLocaleString()}</time>
        </div>
      {/each}
    </div>
  {/if}
</SettingSection>

<style>
  .shp-notification-history-list { display: grid; gap: 8px; }
  .shp-notification-history-item { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, auto) auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; }
  .shp-notification-history-heading, .shp-notification-history-deliveries { display: grid; gap: 4px; }
  .shp-notification-history-item small, .shp-notification-history-item time, .shp-notification-history-empty { color: var(--b3-theme-on-surface); font-size: 12px; }
  .shp-notification-history-empty, .shp-notification-error { margin: 0; line-height: 1.5; }
  .shp-notification-history-failed, .shp-notification-error { color: var(--b3-theme-error); }
  @media (max-width: 700px) { .shp-notification-history-item { grid-template-columns: 1fr; } }
</style>

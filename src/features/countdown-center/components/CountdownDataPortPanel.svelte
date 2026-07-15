<script lang="ts">
  import { showMessage } from "siyuan";
  import {
    createCountdownCenterBackup,
    downloadCountdownText,
    exportCountdownCsv,
    importCountdownBackup,
    importCountdownCsv,
    parseCountdownBackup,
    parseCountdownCsv,
    previewCountdownCsvImport,
    previewCountdownImport,
    serializeCountdownBackup,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownImportExport";
  import type { CountdownEventsFile } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    eventsFile: CountdownEventsFile;
    advancedEnabled: boolean;
    onChanged: () => Promise<void>;
  }
  let { eventsFile, advancedEnabled, onChanged }: Props = $props();
  let includeNotifications = $state(false);
  let mode = $state<"merge" | "replace">("merge");
  let importing = $state(false);
  async function exportJson() {
    try {
      const backup = await createCountdownCenterBackup(
        advancedEnabled && includeNotifications,
      );
      downloadCountdownText(
        `countdown-backup-${Date.now()}.json`,
        serializeCountdownBackup(backup),
        "application/json;charset=utf-8",
      );
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "导出失败",
        5000,
        "error",
      );
    }
  }
  function exportCsv() {
    downloadCountdownText(
      `countdown-events-${Date.now()}.csv`,
      exportCountdownCsv(eventsFile),
      "text/csv;charset=utf-8",
    );
  }
  async function read(file: File, type: "json" | "csv") {
    importing = true;
    try {
      const text = await file.text();
      if (type === "json") {
        const shouldIncludeNotifications =
          advancedEnabled && includeNotifications;
        const backup = parseCountdownBackup(text, {
          includeNotifications: shouldIncludeNotifications,
        });
        const preview = previewCountdownImport(eventsFile, backup.eventsFile);
        const accepted = window.confirm(
          `将${mode === "replace" ? "替换" : "合并"}数据：新增 ${preview.added}，更新 ${preview.updated}，冲突 ${preview.conflicts}，分类 ${preview.categories}。继续吗？`,
        );
        if (!accepted) return;
        if (mode === "replace") {
          if (
            !window.confirm(
              "替换会移除当前备份中不存在的事件和分类。系统将先下载自动备份，请再次确认。",
            )
          )
            return;
          const current = await createCountdownCenterBackup(
            advancedEnabled && includeNotifications,
          );
          downloadCountdownText(
            `countdown-before-replace-${Date.now()}.json`,
            serializeCountdownBackup(current),
            "application/json;charset=utf-8",
          );
        }
        await importCountdownBackup(
          backup,
          mode,
          shouldIncludeNotifications,
        );
      } else {
        const result = parseCountdownCsv(
          text,
          eventsFile.categories,
          eventsFile.events,
        );
        if (result.errors.length) {
          showMessage(
            `CSV 有 ${result.errors.length} 行错误，首个错误：第 ${result.errors[0].line} 行 ${result.errors[0].message}`,
            7000,
            "error",
          );
          return;
        }
        const preview = previewCountdownCsvImport(
          eventsFile,
          result,
          mode,
        );
        const prompt =
          mode === "merge"
            ? `CSV 解析成功 ${preview.total} 条：新增 ${preview.added}，更新 ${preview.updated}，冲突 ${preview.conflicts}（将保留本地版本）。是否安全合并？`
            : `CSV 解析成功 ${preview.total} 条。替换后将删除 CSV 之外的事件，但保留现有分类、全局显示设置和通知设置。系统会先下载完整 JSON 备份，是否继续？`;
        if (!window.confirm(prompt)) return;
        if (mode === "replace") {
          const current = await createCountdownCenterBackup(false);
          downloadCountdownText(
            `countdown-before-csv-replace-${Date.now()}.json`,
            serializeCountdownBackup(current),
            "application/json;charset=utf-8",
          );
        }
        await importCountdownCsv(eventsFile, result, mode);
      }
      await onChanged();
      showMessage("纪念日数据导入完成");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "导入失败",
        7000,
        "error",
      );
    } finally {
      importing = false;
    }
  }
</script>

<div class="shp-countdown-data-port">
  <div class="shp-countdown-data-actions">
    <CountdownIconButton
      name="backup"
      label="导出完整 JSON 备份"
      onclick={() => void exportJson()}
    />
    <CountdownIconButton name="csv" label="导出 CSV" onclick={exportCsv} />
  </div>
  <label
    ><span>导入方式</span><select class="b3-text-field" bind:value={mode}
      ><option value="merge">安全合并</option><option value="replace"
        >替换（导入前自动备份）</option
      ></select
    ></label
  >{#if advancedEnabled}<label
      ><span>包含通知设置</span><input
        type="checkbox"
        class="b3-switch fn__flex-center"
        bind:checked={includeNotifications}
      /></label
    >{/if}
  <div class="shp-countdown-data-actions">
    <label
      class="shp-countdown-data-file-button"
      class:disabled={importing}
      title="导入 JSON 备份"
      aria-label="导入 JSON 备份"
      ><CountdownIcon name="upload" /><input
        type="file"
        accept="application/json,.json"
        disabled={importing}
        onchange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void read(file, "json");
          event.currentTarget.value = "";
        }}
      /></label
    ><label
      class="shp-countdown-data-file-button"
      class:disabled={importing}
      title="导入 CSV"
      aria-label="导入 CSV"
      ><CountdownIcon name="upload" /><input
        type="file"
        accept="text/csv,.csv"
        disabled={importing}
        onchange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void read(file, "csv");
          event.currentTarget.value = "";
        }}
      /></label
    >
  </div>
  <p>
    JSON 包含事件、分类和全局显示设置。CSV 使用
    UTF-8/BOM，支持标准引号、逗号和换行；导出文件包含更新时间，用于安全识别冲突。损坏或不支持的数据不会覆盖现有文件。
  </p>
</div>

<style>
  .shp-countdown-data-port {
    display: grid;
    gap: 10px;
  }
  .shp-countdown-data-port label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .shp-countdown-data-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .shp-countdown-data-actions label {
    display: inline-flex;
    justify-content: center;
  }
  .shp-countdown-data-file-button {
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
  }
  .shp-countdown-data-file-button:hover,
  .shp-countdown-data-file-button:focus-within {
    background: var(--b3-list-hover);
    color: var(--b3-theme-on-background);
    outline: 2px solid
      color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
    outline-offset: -2px;
  }
  .shp-countdown-data-actions input[type="file"] {
    display: none;
  }
  .shp-countdown-data-port p {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    line-height: 1.6;
  }
  .shp-countdown-data-port .disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  @media (max-width: 600px) {
    .shp-countdown-data-port > label {
      align-items: stretch;
      flex-direction: column;
    }
    .shp-countdown-data-port .b3-text-field {
      width: 100%;
      max-width: none;
    }
  }
</style>

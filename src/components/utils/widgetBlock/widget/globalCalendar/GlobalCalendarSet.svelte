<script lang="ts">
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import type { GlobalCalendarConfig } from "@/features/global-calendar/global-calendar-types";
  import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

  interface Props { config?: GlobalCalendarConfig; advancedEnabled?: boolean }
  let { config = $bindable(), advancedEnabled = false }: Props = $props();
</script>

{#if !advancedEnabled}
  <AdvancedFeatureLock title="全局日历" subtitle="汇总任务、日记和重要日期" icon="calendar" compact />
{:else}
<SettingSection title="日历显示">
  <SettingRow title="组件标题">
    <input class="control-lg" type="text" bind:value={config.title} />
  </SettingRow>
  <SettingRow title="每周起始日">
    <select class="control-md" bind:value={config.weekStartsOn}>
      <option value={1}>星期一</option>
      <option value={0}>星期日</option>
    </select>
  </SettingRow>
  <SettingRow title="显示相邻月份日期">
    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={config.showAdjacentDays} />
  </SettingRow>
  <SettingRow title="显示每日事项数量">
    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={config.showEventCount} />
  </SettingRow>
  <SettingRow title="首页每日预览数">
    <input class="control-sm" type="number" min="1" max="8" bind:value={config.maxPreviewEvents} />
  </SettingRow>
  <SettingRow title="详细页默认视图">
    <select class="control-md" bind:value={config.defaultDetailView}>
      <option value="month">月历</option>
      <option value="week">周视图</option>
      <option value="day">日视图</option>
      <option value="year">年视图</option>
      <option value="agenda">日程</option>
    </select>
  </SettingRow>
  <SettingRow title="任务卡片配色">
    <select class="control-md" bind:value={config.taskColorMode}>
      <option value="theme">跟随主题</option>
      <option value="gradient">多彩梯度</option>
      <option value="priority">按优先级</option>
      <option value="urgency">按临期程度</option>
    </select>
  </SettingRow>
  <SettingRow title="日程开始小时">
    <input class="control-sm" type="number" min="0" max="22" bind:value={config.workdayStart} />
  </SettingRow>
  <SettingRow title="日程结束小时">
    <input class="control-sm" type="number" min="1" max="23" bind:value={config.workdayEnd} />
  </SettingRow>
</SettingSection>

<SettingSection title="数据来源">
  <SettingRow title="任务">
    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={config.sources.tasks} />
  </SettingRow>
  <SettingRow title="强化日记">
    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={config.sources.diary} />
  </SettingRow>
  <SettingRow title="纪念日与倒数日">
    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={config.sources.countdown} />
  </SettingRow>
  <SettingRow title="自定义日程与课程">
    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={config.sources.schedule} />
  </SettingRow>
</SettingSection>
{/if}

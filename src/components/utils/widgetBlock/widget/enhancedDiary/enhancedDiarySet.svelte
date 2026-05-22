<script lang="ts">
    import { onMount } from "svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import { lsNotebooks } from "@/api";
    import {
        DEFAULT_ENHANCED_DIARY_CONFIG,
        ENHANCED_DIARY_PERIODS,
        type EnhancedDiaryConfig,
        type EnhancedDiaryPeriod,
        type EnhancedDiaryMonthRule,
        type EnhancedDiaryYearRule,
    } from "./enhancedDiaryTypes";
    import {
        loadEnhancedDiaryConfig,
    } from "./enhancedDiaryConfig";

    interface Props {
        plugin: any;
        draftConfig?: EnhancedDiaryConfig;
    }

    let {
        plugin,
        draftConfig = $bindable<EnhancedDiaryConfig>({ ...DEFAULT_ENHANCED_DIARY_CONFIG }),
    }: Props = $props();

    const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
        { value: 0, label: "周日" },
        { value: 1, label: "周一" },
        { value: 2, label: "周二" },
        { value: 3, label: "周三" },
        { value: 4, label: "周四" },
        { value: 5, label: "周五" },
        { value: 6, label: "周六" },
    ];

    const MONTH_RULE_OPTIONS: { value: EnhancedDiaryMonthRule; label: string }[] = [
        { value: "monthEnd", label: "月末最后一天" },
        { value: "nextMonthFirst", label: "次月1号" },
    ];

    const YEAR_RULE_OPTIONS: { value: EnhancedDiaryYearRule; label: string }[] = [
        { value: "dec31", label: "12月31日" },
        { value: "nextJan1", label: "次年1月1日" },
    ];

    const PERIOD_LABELS: Record<EnhancedDiaryPeriod, string> = {
        day: "日记",
        week: "周记",
        month: "月记",
        year: "年记",
    };

    const LB = "\u007B\u007B";
    const RB = "\u007D\u007D";
    const VARIABLE_HINTS = `可用变量：${LB}完成标记${RB}（必需）、${LB}date${RB}、${LB}week${RB}、${LB}month${RB}、${LB}year${RB}、${LB}周期范围${RB}、${LB}开始日期${RB}、${LB}结束日期${RB}`;

    let notebooks = $state<{ id: string; name: string }[]>([]);
    let notebooksLoadFailed = $state(false);

    onMount(() => {
        loadEnhancedDiaryConfig(plugin).then((loaded) => {
            draftConfig = loaded;
        });

        lsNotebooks()
            .then((res) => {
                notebooks = (res?.notebooks || []).map((nb: any) => ({
                    id: nb.id,
                    name: nb.name,
                }));
            })
            .catch((err) => {
                console.warn("[enhancedDiary] 加载笔记本列表失败", err);
                notebooksLoadFailed = true;
            });
    });
</script>

<SettingSection title="强化日记设置">
    <SettingRow
        title="全局配置说明"
        description="以下为全局配置，任意强化日记组件共用。不写入 widget 配置 JSON。<br/>修改后点击弹窗底部的『确定』统一保存；点击『取消』不会保存本次修改。"
    >
    </SettingRow>

    <SettingRow title="日记笔记本" description="用于创建今日日记。强化日记会调用思源原生 createDailyNote，不会自己计算日记路径。">
        <select bind:value={draftConfig.dailyNotebookId} class="control-sm">
            <option value="">请选择日记笔记本</option>
            {#each notebooks as nb}
                <option value={nb.id}>{nb.name}</option>
            {/each}
        </select>
        {#if notebooksLoadFailed}
            <span class="error-hint">笔记本列表加载失败，请稍后重试</span>
        {/if}
    </SettingRow>

    <SettingRow title="周记复盘日期" description="每周复盘目标日期（0=周日，1=周一，依此类推）">
        <select bind:value={draftConfig.weekReviewDay} class="control-sm">
            {#each WEEKDAY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
    </SettingRow>

    <SettingRow title="月记复盘规则" description="月总结的目标日期规则">
        <select bind:value={draftConfig.monthReviewRule} class="control-sm">
            {#each MONTH_RULE_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
    </SettingRow>

    <SettingRow title="年记复盘规则" description="年总结的目标日期规则">
        <select bind:value={draftConfig.yearReviewRule} class="control-sm">
            {#each YEAR_RULE_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
    </SettingRow>

    <SettingRow title="任务迁移提醒天数" description="未完成任务所在日记超过该天数后，后续工作台会提示迁移到今日日记。默认 30 天。">
        <input
            type="number"
            bind:value={draftConfig.taskMigrationReminderDays}
            class="control-sm"
            min="1"
            max="3650"
            step="1"
        />
    </SettingRow>

    <SettingRow
        title="模板结构说明"
        description="系统标题不建议修改。插件后续会通过 Markdown 标题层级定位「新建任务」「迁移任务」「快速记录」「项目推进」「任务动态」等区块。任务格式兼容 Tasks Plus。"
    >
    </SettingRow>
</SettingSection>

{#each ENHANCED_DIARY_PERIODS as period}
    <SettingSection title="{PERIOD_LABELS[period]}模板">
        <SettingRow
            title="模板内容"
            description="{VARIABLE_HINTS}<br/><b>{LB}完成标记{RB} 必需</b>，保存时会自动补回。"
        >
        </SettingRow>
        <div class="template-textarea-wrapper">
            <textarea
                bind:value={draftConfig.templates[period]}
                class="template-textarea"
                rows={10}
                placeholder="输入 {PERIOD_LABELS[period]} Markdown 模板..."
            ></textarea>
        </div>
    </SettingSection>
{/each}

<style>
    .template-textarea-wrapper {
        padding: 0.5rem 0;
    }

    .template-textarea {
        width: 100%;
        min-height: 180px;
        padding: 8px 10px;
        font-family: var(--b3-font-family-code, monospace);
        font-size: 12px;
        line-height: 1.5;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        resize: vertical;
        box-sizing: border-box;
    }

    .template-textarea:focus {
        outline: none;
        border-color: var(--b3-theme-primary);
    }

    .error-hint {
        color: var(--b3-theme-error, #d32f2f);
        font-size: 12px;
        margin-top: 4px;
        display: block;
    }
</style>

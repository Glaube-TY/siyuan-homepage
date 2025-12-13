<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let advancedEnabled: boolean = false;
    export let CMKnockSound: string = "普通";

    let CYBMOKData: any = {};
    let totalMerit: number = 0;
    let maxMeritDate: any = {};

    onMount(async () => {
        CYBMOKData = await plugin.loadData("CYBMOKData.json");

        totalMerit = Number(getTotalMerit());

        maxMeritDate = getMaxMeritDate();
    });

    // 计算总功德数
    function getTotalMerit() {
        if (!CYBMOKData || typeof CYBMOKData !== "object") return 0;
        return Object.values(CYBMOKData).reduce(
            (total: number, count: any) => total + (Number(count) || 0),
            0,
        );
    }

    // 获取最多功德的日期
    function getMaxMeritDate() {
        if (
            !CYBMOKData ||
            typeof CYBMOKData !== "object" ||
            Object.keys(CYBMOKData).length === 0
        ) {
            return { date: "暂无", count: 0 };
        }

        let maxDate = "";
        let maxCount = 0;

        for (const [date, count] of Object.entries(CYBMOKData)) {
            const numCount = Number(count) || 0;
            if (numCount > maxCount) {
                maxCount = numCount;
                maxDate = date;
            }
        }

        // 格式化日期显示
        const formattedDate =
            maxDate.length === 8
                ? `${maxDate.slice(0, 4)}年${maxDate.slice(4, 6)}月${maxDate.slice(6, 8)}日`
                : maxDate;

        return { date: formattedDate, count: maxCount };
    }
</script>

<div class="content-panel">
    {#if advancedEnabled}
        <div class="content-panel">
            <label>
                敲击音效
                <select bind:value={CMKnockSound}>
                    <option value="普通">普通</option>
                    <option value="空洞">空洞</option>
                    <option value="空灵">空灵</option>
                </select>
            </label>
        </div>

        {#if totalMerit > 0}
            <!-- 功德统计总结 -->
            <div class="merit-summary">
                <div class="summary-item">
                    <span class="summary-label">你已积攒的总功德数为：</span>
                    <span class="summary-value">{totalMerit}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">在</span>
                    <span class="summary-date">{maxMeritDate.date}</span>
                    <span class="summary-label">这一天积攒的功德最多，为：</span
                    >
                    <span class="summary-value">{maxMeritDate.count}</span>
                </div>
            </div>
        {:else}
            <h3>暂无功德记录，拿起棒槌开敲吧！</h3>
        {/if}
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ai.feishu.cn/wiki/GJIDwjfIhizRNVkXlaHcmncfnf1"
            target="_blank">赛博木鱼</a
        >
    </div>
</div>

<style lang="scss">
    .merit-summary {
        margin-top: 1rem;
        padding: 1rem;
        background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
        border-radius: 8px;
        border-left: 4px solid #ffd700;
    }

    .summary-item {
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;

        &:last-child {
            margin-bottom: 0;
        }
    }

    .summary-label {
        color: #666;
        font-size: 0.9rem;
    }

    .summary-value {
        color: #ff6b35;
        font-weight: bold;
        font-size: 1.1rem;
        background: linear-gradient(45deg, #ffd700, #ffa500);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .summary-date {
        color: red;
        font-weight: 600;
        padding: 0.2rem 0.5rem;
        background: rgba(74, 144, 226, 0.1);
        border-radius: 4px;
        font-size: 0.9rem;
    }
</style>

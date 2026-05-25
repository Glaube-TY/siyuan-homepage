<script lang="ts">
    import { onMount } from "svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import { loadCYBMOKStats, getCYBMOKStoreStatus } from "./cybmokData";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    interface Props {
        advancedEnabled?: boolean;
        CMKnockSound?: string;
        CYBMOKDatabaseId?: string;
    }

    let {
        advancedEnabled = false,
        CMKnockSound = $bindable("普通"),
        CYBMOKDatabaseId = $bindable(""),
    }: Props = $props();

    let totalMerit: number = $state(0);
    let maxMeritDate: any = $state({ date: "暂无", count: 0 });
    let dbStatusMessage = $state("");
    let isLoadingStats = $state(false);

    onMount(async () => {
        await refreshStats();
    });

    async function refreshStats() {
        if (!CYBMOKDatabaseId?.trim()) {
            totalMerit = 0;
            maxMeritDate = { date: "暂无", count: 0 };
            dbStatusMessage =
                "木鱼功德数据将保存到思源数据库。旧本地数据会在填写数据库 ID 后自动迁移。";
            return;
        }

        isLoadingStats = true;
        try {
            const status = await getCYBMOKStoreStatus(CYBMOKDatabaseId);
            if (!status.ok) {
                dbStatusMessage = status.message;
                totalMerit = 0;
                maxMeritDate = { date: "暂无", count: 0 };
                return;
            }
            const stats = await loadCYBMOKStats(CYBMOKDatabaseId);
            totalMerit = stats.totalMerit;
            maxMeritDate = stats.maxMeritDate;
            dbStatusMessage = "";
        } catch {
            dbStatusMessage = "无法读取木鱼数据库，请检查数据库 ID";
        } finally {
            isLoadingStats = false;
        }
    }
</script>

{#if advancedEnabled}
    <SettingSection title="数据库设置">
        <SettingRow
            title="数据库 ID"
            description="填写用于保存功德数据的数据库 ID。同一主页空间内的木鱼组件会自动共用已有数据库 ID。"
        >
            <input
                type="text"
                bind:value={CYBMOKDatabaseId}
                class="control-full"
                placeholder="输入木鱼功德数据库 ID"
                onchange={() => refreshStats()}
            />
        </SettingRow>
        {#if dbStatusMessage}
            <div class="db-hint">{dbStatusMessage}</div>
        {/if}
    </SettingSection>

    <SettingSection title="音效设置">
        <SettingRow title="敲击音效">
            <select bind:value={CMKnockSound} class="control-sm">
                <option value="普通">普通</option>
                <option value="空洞">空洞</option>
                <option value="空灵">空灵</option>
            </select>
        </SettingRow>
    </SettingSection>

    {#if isLoadingStats}
        <h3>加载功德统计...</h3>
    {:else if totalMerit > 0}
        <SettingSection title="功德统计">
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
        </SettingSection>
    {:else if CYBMOKDatabaseId?.trim()}
        <h3>暂无功德记录，拿起棒槌开敲吧！</h3>
    {/if}
{:else}
    <AdvancedFeatureLock
        title="赛博木鱼"
        subtitle="当代年轻人解压神器。"
        icon="check"
        features={["功德是自己积攒的", "幸福是自己争取的"]}
        highlights={["木鱼", "敲击"]}
        compact
    />
{/if}

<style lang="scss">
    .db-hint {
        margin-top: 0.5rem;
        font-size: 0.82rem;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
    }

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

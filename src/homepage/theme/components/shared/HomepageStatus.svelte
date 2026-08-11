<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import type { HomepageStatusModel } from "../../api/types";
    interface Props { status: HomepageStatusModel; }
    let { status }: Props = $props();
</script>

<div class="hp-status" data-hp-context-region="status" data-hp-status-state={status.runtimeState}>
    <div class="hp-status__text" class:hp-status__text--error={Boolean(status.errorMessage)}>{status.text}</div>
    <button class="hp-status__refresh" class:hp-status__refresh--active={status.refreshing} type="button" title="刷新状态语" aria-label="刷新状态语" disabled={status.refreshing || status.runtimeState === "generating"} onclick={() => void status.refresh()}>
        <SiyuanIcon name="refresh" size={14} />
    </button>
</div>

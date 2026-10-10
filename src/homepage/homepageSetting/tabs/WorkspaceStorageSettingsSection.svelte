<script lang="ts">
    import { onDestroy } from "svelte";
    import { getWorkspaceStorageChecked, type WorkspaceStorageData } from "@/api";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import { formatStorageSize, formatStorageTime, workspaceStorageFailure, WORKSPACE_DIRECTORY_LABELS } from "./workspaceStorage";

    let result: WorkspaceStorageData | null = $state(null);
    let busy = $state(false);
    let failure = $state("");
    let alive = true;
    let controller: AbortController | null = null;
    onDestroy(() => { alive = false; controller?.abort(); });

    async function loadStorage(): Promise<void> {
        if (!alive || busy) return;
        busy = true;
        failure = "";
        controller = new AbortController();
        try {
            const data = await getWorkspaceStorageChecked(controller.signal);
            if (alive) result = data;
        } catch (error) {
            if (alive) failure = workspaceStorageFailure(error);
        } finally {
            if (alive) { busy = false; controller = null; }
        }
    }
</script>

<SettingSection title="工作空间存储">
    <SettingRow title="当前连接的 Kernel 工作空间" description="连接远程 Kernel 时统计远程工作空间；这不是前端设备的本地磁盘占用、磁盘剩余空间或云端存储配额。每次获取都会重新扫描，仅由你主动触发。">
        <button type="button" class="b3-button b3-button--outline" disabled={busy} aria-busy={busy} onclick={loadStorage}>
            {busy ? "统计中…" : result ? "重新统计" : "获取统计"}
        </button>
    </SettingRow>
    {#if failure}
        <p role="alert">{failure}{result ? " 刷新失败，下方保留上一次成功结果，并非本次新统计。" : ""}</p>
    {:else}
        <p role="status">{busy ? (result ? "重新统计中，下方仍为上一次成功结果。" : "正在统计工作空间，请稍候。")
            : result ? "统计成功。" : "点击获取工作空间存储统计"}</p>
    {/if}
    {#if result}
        <SettingRow title="工作空间总占用" description="已落盘普通文件的总字节数，不包含目录分配空间或链接目标。"><span>{formatStorageSize(result.totalSize)}</span></SettingRow>
        <SettingRow title="资源文件占用" description="已包含在 data 与总占用中，不重复相加。"><span>{formatStorageSize(result.assetsSize)}</span></SettingRow>
        <SettingRow title="统计时间"><time datetime={new Date(result.calculatedAt).toISOString()}>{formatStorageTime(result.calculatedAt)}</time></SettingRow>
        {#each result.directories as entry (entry.name)}
            <SettingRow title={`${WORKSPACE_DIRECTORY_LABELS[entry.name]}（${entry.name}）`}><span>{formatStorageSize(entry.size)}</span></SettingRow>
        {/each}
    {/if}
</SettingSection>

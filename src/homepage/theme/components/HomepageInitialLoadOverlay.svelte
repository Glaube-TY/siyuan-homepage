<script lang="ts">
    interface Props {
        failed?: boolean;
        mode?: "initial" | "theme";
        themeName?: string;
        progress?: number;
        detail?: string;
    }

    let {
        failed = false,
        mode = "initial",
        themeName = "",
        progress,
        detail = "",
    }: Props = $props();
    const normalizedProgress = $derived(
        typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : undefined,
    );
</script>

<div
    class="hp-initial-load-overlay"
    class:hp-initial-load-overlay--failed={failed}
    class:hp-initial-load-overlay--theme-transition={mode === "theme"}
    role={failed ? "alert" : "status"}
    aria-live={failed ? "assertive" : "polite"}
    aria-busy={!failed}
>
    <div class="hp-initial-load-overlay__panel">
        <div class="hp-initial-load-overlay__copy">
            <strong>{failed ? "主页加载失败" : mode === "theme" ? "正在切换主题" : "正在准备主页"}</strong>
            <span>
                {failed
                    ? "请关闭当前主页标签后重新打开，已有组件和布局不会被修改。"
                    : mode === "theme"
                        ? `正在首次准备“${themeName || "主页主题"}”，已有组件与布局将保持不变…`
                        : detail || "正在恢复主题与组件布局…"}
            </span>
        </div>

        {#if !failed}
            <div
                class="hp-initial-load-overlay__progress"
                class:hp-initial-load-overlay__progress--indeterminate={normalizedProgress === undefined}
                role="progressbar"
                aria-label={mode === "theme" ? "主题切换进度" : "主页加载进度"}
                aria-valuemin={normalizedProgress === undefined ? undefined : 0}
                aria-valuemax={normalizedProgress === undefined ? undefined : 100}
                aria-valuenow={normalizedProgress}
            ><span style:width={normalizedProgress === undefined ? undefined : `${normalizedProgress}%`}></span></div>
        {/if}
    </div>
</div>

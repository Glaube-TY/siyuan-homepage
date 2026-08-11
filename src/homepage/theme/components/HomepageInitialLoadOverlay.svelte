<script lang="ts">
    interface Props {
        failed?: boolean;
    }

    let { failed = false }: Props = $props();
</script>

<div
    class="hp-initial-load-overlay"
    class:hp-initial-load-overlay--failed={failed}
    role={failed ? "alert" : "status"}
    aria-live={failed ? "assertive" : "polite"}
    aria-busy={!failed}
>
    <div class="hp-initial-load-overlay__panel">
        <div class="hp-initial-load-overlay__copy">
            <strong>{failed ? "主页加载失败" : "正在准备主页"}</strong>
            <span>{failed ? "请关闭当前主页标签后重新打开，已有组件和布局不会被修改。" : "正在恢复主题与组件布局…"}</span>
        </div>

        {#if !failed}
            <div
                class="hp-initial-load-overlay__progress"
                role="progressbar"
                aria-label="主页加载进度"
            ><span></span></div>
        {/if}
    </div>
</div>

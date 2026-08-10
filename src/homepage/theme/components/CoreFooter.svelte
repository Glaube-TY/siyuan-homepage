<script lang="ts">
    import { mdToHtml } from "@/components/tools/mdToHtml";
    import type { HomepageFooterPresentationState } from "../api/types";

    interface Props {
        model: HomepageFooterPresentationState;
    }

    let { model }: Props = $props();
</script>

{#if model.visible}
    <footer class="hp-core-footer" data-hp-footer-mode={model.mode}>
        <div class="hp-core-footer__content">
            {#if model.mode === "custom" && model.html}
                {@html mdToHtml(model.html)}
            {:else}
                <div class="hp-core-footer__name">🏠思源笔记主页插件</div>
                <div class="hp-core-footer__author">作者: Glaube-TY</div>
                <div class="hp-core-footer__support">
                    <a href="https://glaube-ty.top/da-shang/" class="hp-core-footer__link">赞助支持 💸</a>
                </div>
            {/if}
        </div>
    </footer>
{/if}

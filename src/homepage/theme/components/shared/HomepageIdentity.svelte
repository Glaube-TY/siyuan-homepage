<script lang="ts">
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
    import type { HomepageIdentityModel } from "../../api/types";

    interface Props { identity: HomepageIdentityModel; }
    let { identity }: Props = $props();
    let radius = $derived(identity.icon.style === "square" ? "0%" : identity.icon.style === "round" ? "20%" : "50%");
</script>

<div class="hp-identity">
    {#if identity.showIcon}
        <div class="hp-identity__icon" aria-hidden="true">
            {#if identity.icon.type === "emoji"}
                {@html normalizeSiyuanDocIcon(identity.icon.emoji) || "🏠"}
            {:else if identity.icon.imageSrc}
                <img class="hp-identity__icon-image" src={identity.icon.imageSrc} alt="" style={`border-radius: ${radius};`} />
            {/if}
        </div>
    {/if}
    <h1 class="hp-identity__title">{identity.title}</h1>
</div>

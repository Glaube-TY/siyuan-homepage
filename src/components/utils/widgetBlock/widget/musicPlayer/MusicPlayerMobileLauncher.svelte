<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";
    import { requestOpenMobileMusicPlayer } from "./musicMobilePlayerBridge";

    let advancedEnabled = $state(getHomepageEntitlementSnapshot().advanced);
    let opening = $state(false);
    let errorMessage = $state("");
    let openRequestVersion = 0;

    async function openPlayer(): Promise<void> {
        if (!advancedEnabled || opening) return;
        opening = true;
        errorMessage = "";
        const version = ++openRequestVersion;
        try {
            for (let attempt = 0; attempt < 48; attempt++) {
                const request = requestOpenMobileMusicPlayer();
                if (request.handled) {
                    errorMessage = request.unavailableReason || "";
                    return;
                }
                await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
                if (version !== openRequestVersion) return;
            }
            errorMessage = "NAS 音乐播放器仍在初始化，请稍后重试。";
        } finally {
            if (version === openRequestVersion) opening = false;
        }
    }

    onMount(() => subscribeHomepageEntitlement((snapshot) => {
        advancedEnabled = snapshot.advanced;
        if (!snapshot.advanced) {
            openRequestVersion += 1;
            opening = false;
            errorMessage = "";
        }
    }));

    onDestroy(() => {
        openRequestVersion += 1;
    });
</script>

<div class="music-mobile-launcher">
    {#if advancedEnabled}
        <button type="button" disabled={opening} onclick={() => void openPlayer()}>
            <span class="music-mobile-launcher__icon"><MusicPlayerIcon name="headphones" size={32} /></span>
            <span class="music-mobile-launcher__copy">
                <strong>{opening ? "正在打开播放器…" : "打开 NAS 音乐播放器"}</strong>
                <small>使用移动端常驻播放器，关闭主页后仍可继续播放</small>
            </span>
        </button>
        {#if errorMessage}<p role="status">{errorMessage}</p>{/if}
    {:else}
        <AdvancedFeatureLock
            title="音乐播放器"
            subtitle="播放 NAS 音乐，桌面端与移动端均可使用。"
            icon="music"
            features={["NAS 音乐双地址自动切换", "封面、歌词、歌单与播放队列"]}
            highlights={["NAS 音乐", "跨设备队列"]}
            compact
        />
    {/if}
</div>

<style lang="scss">
    .music-mobile-launcher {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px;
        box-sizing: border-box;
    }

    button {
        width: min(100%, 24rem);
        min-height: 5rem;
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.8rem 1rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 35%, var(--b3-border-color));
        border-radius: 1rem;
        background: color-mix(in srgb, var(--b3-theme-background) 88%, var(--b3-theme-primary) 12%);
        color: var(--b3-theme-on-background);
        text-align: left;

        &:disabled {
            opacity: 0.65;
        }
    }

    .music-mobile-launcher__icon {
        width: 3.1rem;
        height: 3.1rem;
        flex: none;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .music-mobile-launcher__copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;

        strong {
            font-size: 1rem;
        }

        small {
            color: var(--b3-theme-on-surface-light);
            line-height: 1.4;
        }
    }

    p {
        margin: 8px 0 0;
        color: var(--b3-card-error-color, #dc2626);
        font-size: 0.8rem;
        line-height: 1.45;
        text-align: center;
    }
</style>

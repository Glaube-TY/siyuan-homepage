<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let webviewUrl: string = "";

    onMount(() => {
        try {
            const config = JSON.parse(contentTypeJson);
            console.log("contentTypeJson:", config);
            if (config.type === "custom-web" && config.data?.[0]?.url) {
                webviewUrl = config.data[0].url;
                console.log("webviewUrl", webviewUrl); // 这里应该能正常输出 URL
            } else {
                webviewUrl = "about:blank";
            }
        } catch (e) {
            console.error("无法解析 contentTypeJson", e);
            webviewUrl = "about:blank";
        }
    });
</script>

<div class="content-display">
    <webview class="custom-web" src={webviewUrl}></webview>
</div>

<style>
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        background-color: var(--bg3-color-dark);
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .custom-web {
        flex: 1;
        width: 100%;
        height: 100%;
        border: none;
        margin: 0;
        padding: 0;
    }
</style>

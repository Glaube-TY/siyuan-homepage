<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        title?: string;
        source?: string;
        remoteUrl?: string;
        localDataUrl?: string | null;
        remotePlaceholder?: string;
        uploadLabel?: string;
        previewAlt?: string;
    }

    let {
        title = "背景图片",
        source = $bindable("remote"),
        remoteUrl = $bindable(""),
        localDataUrl = $bindable(null),
        remotePlaceholder = "输入远程图片URL",
        uploadLabel = "上传图片",
        previewAlt = "图片预览"
    }: Props = $props();

    let fileInput: HTMLInputElement | null = $state(null);
    let previewData: string = $state("");

    async function refreshPreview() {
        try {
            if (source === "remote" && remoteUrl) {
                previewData = await getImage(remoteUrl);
            } else if (source === "local" && localDataUrl) {
                previewData = localDataUrl;
            } else {
                previewData = "";
            }
        } catch (e) {
            console.warn("图片预览加载失败:", e);
            previewData = "";
        }
    }

    onMount(() => {
        void refreshPreview();
    });

    function handleSourceChange() {
        if (source === "remote") {
            localDataUrl = "";
            refreshPreview();
        } else {
            remoteUrl = "";
            previewData = localDataUrl || "";
        }
    }

    function handleUpload() {
        const file = fileInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                localDataUrl = reader.result;
                previewData = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }
</script>

<SettingSection title={title}>
    <SettingRow title="图片来源">
        <select
            bind:value={source}
            onchange={handleSourceChange}
            class="control-sm"
        >
            <option value="remote">远程图片</option>
            <option value="local">本地图片</option>
        </select>
    </SettingRow>

    {#if source === "remote"}
        <SettingRow title="图片URL">
            <input
                type="text"
                bind:value={remoteUrl}
                onchange={refreshPreview}
                placeholder={remotePlaceholder}
                class="control-full"
            />
        </SettingRow>
    {:else}
        <SettingRow title={uploadLabel}>
            <button onclick={() => fileInput?.click()} class="file-action-btn">📁</button>
            <input
                type="file"
                bind:this={fileInput}
                accept="image/*"
                onchange={handleUpload}
                style="display: none;"
            />
        </SettingRow>
    {/if}

    {#if previewData}
        <div class="image-preview-block">
            <img src={previewData} alt={previewAlt} />
        </div>
    {/if}
</SettingSection>

<style lang="scss">
    .image-preview-block {
        margin-top: 0.75rem;
        padding: 0.75rem;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
        display: flex;
        justify-content: center;
        align-items: center;

        img {
            max-width: 100%;
            max-height: 150px;
            border-radius: 6px;
            object-fit: contain;
        }
    }
</style>

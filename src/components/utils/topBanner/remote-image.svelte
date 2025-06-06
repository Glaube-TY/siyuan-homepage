<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";

    export let plugin: any;
    export let onSaveSuccess: (url: string) => void;
    export let onClose: () => void;

    let remoteImageUrl = "";

    // 页面加载时读取保存的数据
    onMount(async () => {
        const savedData = await plugin.loadData("bannerImage.json");
        if (savedData?.url && !savedData.url.startsWith("data:image")) {
            remoteImageUrl = savedData.url;
        }
    });

    // 保存按钮点击事件
    const handleSave = async (): Promise<void> => {
        if (!remoteImageUrl.trim()) return;

        await plugin.saveData("bannerImage.json", { url: remoteImageUrl });
        onSaveSuccess(remoteImageUrl);
        showMessage("远程图片地址已保存！");
    };
</script>

<div class="remote-image-settings">
    <div class="input-and-button">
        <div class="input-group">
            <input
                id="remote-image-url"
                type="text"
                placeholder="请输入远程图片链接"
                bind:value={remoteImageUrl}
            />
        </div>

        <button
            on:click={async () => {
                await handleSave();
                onClose();
            }}
            class="save-button"
        >
            确认
        </button>

        <button on:click={() => onClose()} class="cancel-button"> 取消 </button>
    </div>
</div>

<style>
    .remote-image-settings {
        padding: 1rem;
    }

    .input-and-button {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    input[type="text"] {
        flex-grow: 1;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        width: 400px;
    }

    .save-button {
        background-color: #4caf50;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        cursor: pointer;
        border-radius: 4px;
        white-space: nowrap;
    }

    .save-button:hover {
        background-color: #45a049;
    }

    .cancel-button {
        background-color: #999;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        cursor: pointer;
        border-radius: 4px;
        white-space: nowrap;
    }

    .cancel-button:hover {
        background-color: #777;
    }
</style>

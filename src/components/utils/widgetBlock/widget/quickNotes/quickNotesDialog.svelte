<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";
    import { writeQuickNote } from "@/features/quick-note/quick-note-write-service";

    interface Props {
        quickNotesPosition: string;
        quickNotesTimestampEnabled: boolean;
        quickNotesAddPosition: string;
        close: () => void;
    }

    let {
        quickNotesPosition,
        quickNotesTimestampEnabled,
        quickNotesAddPosition,
        close
    }: Props = $props();

    let quickNotesContent = $state("");

    onMount(async () => {});

    async function addQuickNote() {
        if (quickNotesContent === "") {
            showMessage("请输入内容");
            return;
        }

        const result = await writeQuickNote({
            content: quickNotesContent,
            source: "local",
            options: {
                quickNotesPosition,
                quickNotesTimestampEnabled,
                quickNotesAddPosition,
            },
        });
        showMessage(result.message);
        if (!result.ok) return;

        close();
    }
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div class="content-display">
    <textarea
        name="content"
        placeholder="请输入需要记录的内容……"
        bind:value={quickNotesContent}
    ></textarea>
    <div class="button-group">
        <button onclick={addQuickNote}>添加</button>
        <button onclick={close}>取消</button>
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        textarea {
            width: 400px;
            height: 200px;
            font-size: 16px;
            font-family: "Courier New", Courier, monospace;
            background-color: var(--b3-theme-background);
            color: var(--b3-theme-on-surface);
            border: 1px solid var(--b3-border-color);
            border-radius: 8px;
            padding: 1rem;
            box-sizing: border-box;
            resize: none;
        }

        .button-group {
            display: flex;
            justify-content: center;
            margin-top: 1rem;
            gap: 1rem;

            button {
                padding: 0.5rem 1rem;
                font-size: 14px;
                font-weight: 600;
                border-radius: 8px;
                background-color: var(--b3-theme-background);
                color: var(--b3-theme-on-surface);
                border: 1px solid var(--b3-border-color);

                &:hover {
                    background-color: var(--b3-theme-primary);
                }
            }
        }
    }
</style>

<script lang="ts">
    import { showMessage } from "siyuan";
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
    let submitting = $state(false);

    async function addQuickNote() {
        if (submitting) return;
        if (quickNotesContent === "") {
            showMessage("请输入内容");
            return;
        }

        submitting = true;
        let shouldClose = false;
        try {
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
            shouldClose = result.ok;
        } finally {
            submitting = false;
        }

        if (shouldClose) close();
    }
</script>

<div class="content-display">
    <textarea
        name="content"
        aria-label="快速笔记内容"
        placeholder="请输入需要记录的内容……"
        bind:value={quickNotesContent}
    ></textarea>
    <div class="button-group">
        <button type="button" onclick={close} disabled={submitting}>取消</button>
        <button type="button" class="primary" onclick={addQuickNote} disabled={submitting} aria-busy={submitting}>
            {submitting ? "添加中…" : "添加"}
        </button>
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        box-sizing: border-box;

        textarea {
            flex: 1 1 auto;
            width: 100%;
            min-width: 0;
            min-height: 180px;
            font-size: 16px;
            line-height: 1.6;
            font-family: inherit;
            background-color: var(--b3-theme-background);
            color: var(--b3-theme-on-background);
            border: 1px solid var(--b3-border-color);
            border-radius: 10px;
            padding: 1rem;
            box-sizing: border-box;
            resize: none;

            &:focus-visible {
                border-color: var(--b3-theme-primary);
                outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
                outline-offset: 0;
            }
        }

        .button-group {
            display: flex;
            justify-content: flex-end;
            gap: 0.5rem;

            button {
                min-width: 88px;
                min-height: 44px;
                padding: 0.625rem 1rem;
                font-size: 14px;
                font-weight: 600;
                border-radius: 8px;
                background-color: var(--b3-theme-background);
                color: var(--b3-theme-on-background);
                border: 1px solid var(--b3-border-color);
                cursor: pointer;
                touch-action: manipulation;

                &:disabled {
                    cursor: wait;
                    opacity: 0.58;
                }

                &:hover:not(:disabled),
                &:active:not(:disabled) {
                    background-color: var(--b3-list-hover);
                }

                &.primary {
                    border-color: var(--b3-theme-primary);
                    background-color: var(--b3-theme-primary);
                    color: var(--b3-theme-on-primary);
                }
            }
        }
    }

    @media (max-width: 600px) {
        .content-display {
            height: 100%;
            padding: 1rem 1rem max(1rem, env(safe-area-inset-bottom));

            textarea {
                flex: 1 1 auto;
                height: auto;
                min-height: 180px;
            }

            .button-group {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));

                button {
                    width: 100%;
                    min-width: 0;
                }
            }
        }
    }
</style>

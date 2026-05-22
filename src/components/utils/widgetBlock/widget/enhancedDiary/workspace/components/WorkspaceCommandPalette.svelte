<script lang="ts">
    export interface WorkspaceCommand {
        id: string;
        title: string;
        description: string;
        group: string;
        keywords?: string[];
        disabled?: boolean;
        run: () => void | Promise<void>;
    }

    interface Props {
        open: boolean;
        commands: WorkspaceCommand[];
        onClose: () => void;
    }

    let { open, commands, onClose }: Props = $props();
    let query = $state("");
    let inputEl: HTMLInputElement | null = $state(null);

    function normalize(value: unknown): string {
        return String(value || "").toLowerCase().trim();
    }

    function commandMatches(command: WorkspaceCommand, keyword: string): boolean {
        if (!keyword) return true;
        return [
            command.title,
            command.description,
            command.group,
            ...(command.keywords || []),
        ].some((value) => normalize(value).includes(keyword));
    }

    const filteredCommands = $derived.by(() => {
        const keyword = normalize(query);
        return commands.filter((command) => commandMatches(command, keyword));
    });

    $effect(() => {
        if (!open) return;
        query = "";
        window.setTimeout(() => inputEl?.focus(), 0);
    });

    async function runCommand(command: WorkspaceCommand): Promise<void> {
        if (command.disabled) return;
        onClose();
        await command.run();
    }

    function handleKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key === "Enter" && filteredCommands.length > 0) {
            event.preventDefault();
            void runCommand(filteredCommands[0]);
        }
    }
</script>

{#if open}
    <div class="palette-backdrop" role="presentation" onclick={onClose}>
        <dialog
            open
            class="command-palette"
            aria-label="工作台命令面板"
            onclick={(event) => event.stopPropagation()}
            onkeydown={handleKeydown}
        >
            <header>
                <input
                    bind:this={inputEl}
                    type="search"
                    placeholder="搜索命令、页面、快捷操作..."
                    bind:value={query}
                />
                <button type="button" aria-label="关闭命令面板" onclick={onClose}>×</button>
            </header>

            <div class="command-list">
                {#if filteredCommands.length === 0}
                    <div class="empty-state">没有匹配命令</div>
                {:else}
                    {#each filteredCommands as command (command.id)}
                        <button
                            type="button"
                            class="command-item"
                            disabled={command.disabled}
                            onclick={() => runCommand(command)}
                        >
                            <span class="command-group">{command.group}</span>
                            <span class="command-main">
                                <strong>{command.title}</strong>
                                <small>{command.description}</small>
                            </span>
                        </button>
                    {/each}
                {/if}
            </div>

            <footer>
                <span>Enter 执行</span>
                <span>Esc 关闭</span>
                <span>Ctrl/Cmd K 打开</span>
            </footer>
        </dialog>
    </div>
{/if}

<style>
    .palette-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 72px 18px 18px;
        background: rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(2px);
    }

    .command-palette {
        position: fixed;
        top: 72px;
        left: 50%;
        transform: translateX(-50%);
        width: min(680px, 100%);
        max-height: min(680px, calc(100vh - 120px));
        margin: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-shadow: 0 24px 72px rgba(0, 0, 0, 0.24);
        overflow: hidden;
    }

    header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border-bottom: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
    }

    input {
        width: 100%;
        min-width: 0;
        height: 38px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 0 12px;
        font-size: 14px;
        outline: none;
    }

    input:focus {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
    }

    header button {
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 20px;
        cursor: pointer;
        flex-shrink: 0;
    }

    header button:hover {
        background: var(--b3-theme-background);
        color: var(--b3-theme-primary);
    }

    .command-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        overflow: auto;
    }

    .command-item {
        display: grid;
        grid-template-columns: 84px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        width: 100%;
        border: 1px solid transparent;
        border-radius: 9px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
    }

    .command-item:hover:not(:disabled),
    .command-item:focus-visible {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
        background: color-mix(in srgb, var(--b3-theme-primary) 7%, transparent);
        outline: none;
    }

    .command-item:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    .command-group {
        width: fit-content;
        max-width: 100%;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        padding: 2px 8px;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .command-main {
        min-width: 0;
    }

    .command-main strong,
    .command-main small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .command-main strong {
        font-size: 14px;
        color: var(--b3-theme-on-background);
    }

    .command-main small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .empty-state {
        padding: 26px 12px;
        text-align: center;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        font-size: 13px;
    }

    footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
        padding: 9px 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        font-size: 11px;
    }

    @media (max-width: 640px) {
        .palette-backdrop {
            padding-top: 36px;
        }

        .command-palette {
            top: 36px;
            width: calc(100vw - 36px);
        }

        .command-item {
            grid-template-columns: 1fr;
            gap: 6px;
        }

        footer {
            justify-content: flex-start;
            flex-wrap: wrap;
        }
    }
</style>

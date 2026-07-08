<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import type { AccountingIconName } from "./accountingIconTypes";
    import AccountingIconPicker from "./AccountingIconPicker.svelte";
    import { generateCategoryKey } from "./accountingSettings";
    import type { CategoryItem } from "./accountingCategoryConfig";

    interface Props {
        categories: CategoryItem[];
        direction: "expense" | "income";
        onChange: (updated: CategoryItem[]) => void;
    }

    let { categories, direction: _, onChange }: Props = $props();

    let localList = $state<CategoryItem[]>([]);
    let editLabel = $state<Record<string, string>>({});
    let editSec = $state<Record<string, string>>({});
    let iconPickerFor = $state<string | null>(null);
    let dragIndex = $state<number | null>(null);
    let lastCategoriesSig = $state("");

    $effect(() => {
        // Signature guard: only sync when categories actually changed
        const sig = categories.map((c) => `${c.key}:${c.label}`).join("|");
        if (sig === lastCategoriesSig) return;
        lastCategoriesSig = sig;

        const nextList = categories.map((c) => ({
            ...c,
            secondaries: [...c.secondaries],
        }));
        const labels: Record<string, string> = {};
        for (const c of nextList) {
            labels[c.key] = c.label;
        }
        // Assign both at once — never read back localList in this effect
        localList = nextList;
        editLabel = labels;
    });

    function emitChange(list: CategoryItem[]): void {
        onChange(list.map((c) => ({
            ...c,
            secondaries: [...c.secondaries],
        })));
    }

    function updateLabel(key: string): void {
        const label = editLabel[key]?.trim();
        if (!label) return;
        const item = localList.find((c) => c.key === key);
        if (item) {
            item.label = label;
            emitChange(localList);
        }
    }

    function updateIcon(key: string, iconKey: AccountingIconName): void {
        const item = localList.find((c) => c.key === key);
        if (item) {
            item.icon = iconKey;
            emitChange(localList);
        }
        iconPickerFor = null;
    }

    function addCategory(): void {
        const cat: CategoryItem = {
            key: generateCategoryKey(),
            label: "新分类",
            icon: "moreHorizontal",
            secondaries: [],
        };
        localList = [...localList, cat];
        editLabel = { ...editLabel, [cat.key]: "新分类" };
        emitChange(localList);
    }

    function removeCategory(key: string): void {
        const idx = localList.findIndex((c) => c.key === key);
        if (idx >= 0) {
            localList = [...localList.slice(0, idx), ...localList.slice(idx + 1)];
            emitChange(localList);
        }
    }

    // ── Drag handlers ──
    function handleDragStart(event: DragEvent, index: number): void {
        dragIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
    }

    function handleDragOver(event: DragEvent, index: number): void {
        event.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        const list = [...localList];
        const [item] = list.splice(dragIndex, 1);
        list.splice(index, 0, item);
        dragIndex = index;
        localList = list;
        // Defer emit to dragend — dragover fires too frequently
    }

    function handleDragEnd(): void {
        emitChange(localList);
        dragIndex = null;
    }

    // ── Secondary operations ──
    function addSecondary(catKey: string): void {
        const sec = (editSec[catKey] || "").trim();
        if (!sec) return;
        const list = localList.map((c) => {
            if (c.key === catKey) {
                return { ...c, secondaries: [...c.secondaries, sec] };
            }
            return c;
        });
        localList = list;
        emitChange(localList);
        editSec = { ...editSec, [catKey]: "" };
    }

    function removeSecondary(catKey: string, secIndex: number): void {
        const list = localList.map((c) => {
            if (c.key === catKey) {
                const secs = [...c.secondaries];
                secs.splice(secIndex, 1);
                return { ...c, secondaries: secs };
            }
            return c;
        });
        localList = list;
        emitChange(localList);
    }

    function updateSecondary(catKey: string, secIndex: number, value: string): void {
        localList = localList.map((c) => {
            if (c.key === catKey) {
                const secs = [...c.secondaries];
                secs[secIndex] = value;
                return { ...c, secondaries: secs };
            }
            return c;
        });
    }

    function commitSecondary(): void {
        emitChange(localList);
    }
</script>

<div class="ac-cat-manager">
    {#if localList.length === 0}
        <p class="ac-cat-empty">暂无分类，点击下方"+"添加。</p>
    {:else}
        <div class="ac-cat-list">
            {#each localList as cat, i (cat.key)}
                <div
                    class="ac-cat-card"
                    class:dragging={dragIndex === i}
                >
                    <div class="ac-cat-head">
                        <span
                            class="ac-drag-handle"
                            title="拖动排序"
                            role="button"
                            tabindex="0"
                            draggable="true"
                            ondragstart={(e) => handleDragStart(e, i)}
                            ondragover={(e) => handleDragOver(e, i)}
                            ondragend={handleDragEnd}
                        >⋮⋮</span>
                        <button
                            class="ac-cat-icon-btn"
                            onclick={() => (iconPickerFor = iconPickerFor === cat.key ? null : cat.key)}
                            title="点击更换图标"
                        >
                            <AccountingIcon name={cat.icon} size={18} />
                        </button>
                        <input
                            class="ac-cat-name-input"
                            type="text"
                            value={editLabel[cat.key] ?? cat.label}
                            oninput={(e) => { editLabel = { ...editLabel, [cat.key]: e.currentTarget.value }; }}
                            onchange={() => updateLabel(cat.key)}
                            onblur={() => updateLabel(cat.key)}
                        />
                        <button class="ac-cat-del-btn" onclick={() => removeCategory(cat.key)} title="删除分类">×</button>
                    </div>

                    {#if iconPickerFor === cat.key}
                        <div class="ac-icon-picker-wrap">
                            <AccountingIconPicker
                                value={cat.icon}
                                onChange={(iconKey) => updateIcon(cat.key, iconKey)}
                                onClose={() => (iconPickerFor = null)}
                            />
                        </div>
                    {/if}

                    <div class="ac-sec-list">
                        {#each cat.secondaries as sec, si}
                            <span class="ac-sec-chip">
                                <input
                                    class="ac-sec-input"
                                    type="text"
                                    value={sec}
                                    oninput={(e) => updateSecondary(cat.key, si, e.currentTarget.value)}
                                    onblur={commitSecondary}
                                    size={Math.max(sec.length + 1, 4)}
                                />
                                <button class="ac-sec-del" onclick={() => removeSecondary(cat.key, si)}>×</button>
                            </span>
                        {/each}
                        <span class="ac-sec-add">
                            <input
                                type="text"
                                placeholder="+"
                                value={editSec[cat.key] ?? ""}
                                oninput={(e) => { editSec = { ...editSec, [cat.key]: e.currentTarget.value }; }}
                                onkeydown={(e) => { if (e.key === "Enter") addSecondary(cat.key); }}
                                size={4}
                            />
                        </span>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <button class="ac-add-cat-btn" onclick={addCategory}>
        <AccountingIcon name="plus" size={14} /> 新增分类
    </button>
</div>

<style lang="scss">
    .ac-cat-manager {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .ac-cat-empty {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.78rem;
        text-align: center;
        padding: 1rem 0;
    }

    .ac-cat-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .ac-cat-card {
        padding: 0.5rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        transition: all 0.12s;
        position: relative;
    }

    .ac-cat-card.dragging {
        opacity: 0.5;
        border-color: var(--b3-theme-primary);
    }

    .ac-cat-head {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }

    .ac-drag-handle {
        cursor: grab;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.85rem;
        letter-spacing: -1px;
        user-select: none;
        padding: 0.1rem 0.15rem;
    }

    .ac-drag-handle:active { cursor: grabbing; }

    .ac-cat-icon-btn {
        width: 2rem;
        height: 2rem;
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
        background: transparent;
        color: var(--b3-theme-primary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: border-color 0.12s;
    }

    .ac-cat-icon-btn:hover { border-color: var(--b3-theme-primary); }

    .ac-cat-name-input {
        flex: 1;
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 0.25rem 0.35rem;
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        background: transparent;
        min-width: 3rem;
    }

    .ac-cat-name-input:hover,
    .ac-cat-name-input:focus {
        border-color: var(--b3-border-color);
        background: var(--b3-theme-surface);
        outline: none;
    }

    .ac-cat-del-btn {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--b3-theme-error);
        font-size: 1rem;
        padding: 0.1rem 0.3rem;
        border-radius: 4px;
    }

    .ac-cat-del-btn:hover {
        background: color-mix(in srgb, var(--b3-theme-error) 10%, transparent);
    }

    .ac-icon-picker-wrap {
        position: absolute;
        top: 100%;
        left: 2.5rem;
        z-index: 20;
        margin-top: 0.3rem;
    }

    .ac-sec-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.35rem;
        padding-left: 2.2rem;
    }

    .ac-sec-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        padding: 0.1rem 0.3rem 0.1rem 0.5rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        font-size: 0.75rem;
    }

    .ac-sec-input {
        border: none;
        background: transparent;
        font: inherit;
        font-size: 0.75rem;
        color: var(--b3-theme-on-background);
        padding: 0.1rem 0;
        max-width: 8rem;
        outline: none;
    }

    .ac-sec-input:focus {
        border-bottom: 1px solid var(--b3-theme-primary);
    }

    .ac-sec-del {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--b3-theme-error);
        font-size: 0.8rem;
        padding: 0;
        line-height: 1;
    }

    .ac-sec-add input {
        border: 1px dashed var(--b3-border-color);
        border-radius: 999px;
        background: transparent;
        font: inherit;
        font-size: 0.75rem;
        padding: 0.1rem 0.45rem;
        width: 3.5rem;
        color: var(--b3-theme-on-surface-light);
    }

    .ac-sec-add input:focus {
        border-color: var(--b3-theme-primary);
        outline: none;
        color: var(--b3-theme-on-background);
    }

    .ac-add-cat-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.4rem;
        border: 1px dashed var(--b3-border-color);
        border-radius: 8px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.12s;
    }

    .ac-add-cat-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }
</style>

<script lang="ts">
    import { showMessage } from "siyuan";
    import { addDaysFromToday, isValidDateText } from "./reviewDocsSchedule";

    interface Props {
        defaultDate?: string;
        title?: string;
        onConfirm: (date: string) => void;
        onCancel: () => void;
    }

    let { defaultDate = addDaysFromToday(0), title = "选择下次复习日期", onConfirm, onCancel }: Props = $props();

    let selectedDate = $state("");

    $effect(() => {
        if (!selectedDate) {
            selectedDate = defaultDate;
        }
    });

    function setQuickDate(days: number) {
        selectedDate = addDaysFromToday(days);
    }

    function handleConfirm() {
        if (!selectedDate || !isValidDateText(selectedDate)) {
            showMessage("请选择有效的日期", 3000);
            return;
        }
        onConfirm(selectedDate);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") {
            handleConfirm();
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="date-picker-dialog" onkeydown={handleKeydown}>
    <p class="date-picker-title">{title}</p>

    <label class="date-picker-field">
        <span>日期</span>
        <input type="date" bind:value={selectedDate} />
    </label>

    <div class="date-picker-quick">
        <button type="button" onclick={() => setQuickDate(0)}>今天</button>
        <button type="button" onclick={() => setQuickDate(1)}>明天</button>
        <button type="button" onclick={() => setQuickDate(3)}>三天后</button>
        <button type="button" onclick={() => setQuickDate(7)}>一周后</button>
    </div>

    <div class="date-picker-actions">
        <button type="button" class="date-picker-cancel" onclick={onCancel}>取消</button>
        <button type="button" class="date-picker-confirm" onclick={handleConfirm}>确定</button>
    </div>
</div>

<style>
    .date-picker-dialog {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px;
        color: var(--b3-theme-on-surface, #222);
        width: 100%;
        max-width: 100%;
        flex: 1 1 auto;
        min-width: 0;
        box-sizing: border-box;
    }

    .date-picker-title {
        margin: 0;
        font-size: 13px;
        opacity: 0.78;
        line-height: 1.5;
    }

    .date-picker-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    }

    .date-picker-field span {
        font-size: 12px;
        font-weight: 600;
        opacity: 0.78;
    }

    .date-picker-field input[type="date"] {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
        height: 36px;
        border: 1px solid var(--b3-border-color, #d1d5db);
        border-radius: 6px;
        background: var(--b3-theme-background, #fff);
        color: var(--b3-theme-on-surface, #222);
        font-size: 14px;
        padding: 6px 10px;
        outline: none;
    }

    .date-picker-field input[type="date"]:focus {
        border-color: var(--b3-theme-primary, #3578e5);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary, #3578e5) 20%, transparent);
    }

    .date-picker-quick {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    }

    .date-picker-quick button {
        border: 1px solid var(--b3-border-color, #d1d5db);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #222);
        cursor: pointer;
        font-size: 13px;
        padding: 7px 10px;
    }

    .date-picker-quick button:hover:not(:disabled) {
        background: var(--b3-list-hover, #f3f4f6);
        border-color: var(--b3-theme-primary, #3578e5);
    }

    .date-picker-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border-top: 1px solid var(--b3-border-color, #e5e7eb);
        padding-top: 12px;
    }

    .date-picker-actions button {
        border: 1px solid var(--b3-border-color, #d1d5db);
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        padding: 7px 16px;
    }

    .date-picker-cancel {
        background: transparent;
        color: var(--b3-theme-on-surface, #222);
    }

    .date-picker-cancel:hover {
        background: var(--b3-list-hover, #f3f4f6);
    }

    .date-picker-confirm {
        background: var(--b3-theme-primary, #3578e5);
        color: var(--b3-theme-on-primary, #fff);
        border-color: var(--b3-theme-primary, #3578e5);
    }

    .date-picker-confirm:hover {
        opacity: 0.9;
    }

    @media (max-width: 360px) {
        .date-picker-quick {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>

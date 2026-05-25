<script lang="ts">
    import { onMount } from "svelte";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { GenerateTasksPlusTaskInput } from "../../../tasksPlus/tasksPlusParser";

    interface Props {
        task?: EnhancedDiaryWorkspaceTask | null;
        initialInput?: Partial<GenerateTasksPlusTaskInput>;
        mode: "create" | "edit";
        onSubmit: (input: GenerateTasksPlusTaskInput) => void | Promise<void>;
        onClose: () => void;
    }

    let { task = null, initialInput = {}, mode: _mode, onSubmit, onClose }: Props = $props();

    let taskname = $state("");
    let priority = $state("");
    let startDate = $state("");
    let deadline = $state("");
    let recurrence = $state("");
    let reminder = $state("");
    let location = $state("");
    let tagsText = $state("");

    function parseTags(value: string): string[] {
        return value
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    function submit(): void {
        onSubmit({
            taskname,
            completed: task?.completed || false,
            priority,
            startDate,
            deadline,
            recurrence,
            reminder,
            location,
            tags: parseTags(tagsText),
        });
    }

    onMount(() => {
        taskname = task?.taskname || initialInput.taskname || "";
        priority = task?.priority || initialInput.priority || "";
        startDate = task?.startDate || initialInput.startDate || "";
        deadline = task?.deadline || initialInput.deadline || "";
        recurrence = task?.recurrence || initialInput.recurrence || "";
        reminder = task?.reminder || initialInput.reminder || "";
        location = task?.location || initialInput.location || "";
        tagsText = (task?.tags || initialInput.tags || []).join(" ");
    });
</script>

<div class="task-editor-form">
    <div class="form">
        <label>任务名称
            <input bind:value={taskname} type="text" placeholder="输入任务名称" />
        </label>
        <div class="row">
            <label>开始日期
                <input bind:value={startDate} type="date" />
            </label>
            <label>截止日期
                <input bind:value={deadline} type="date" />
            </label>
        </div>
        <div class="row">
            <label>优先级
                <select bind:value={priority}>
                    <option value="">无</option>
                    <option value="❗">低</option>
                    <option value="❗❗">中</option>
                    <option value="❗❗❗">高</option>
                    <option value="❗❗❗❗">紧急</option>
                </select>
            </label>
            <label>标签
                <input bind:value={tagsText} type="text" placeholder="多个标签用空格或逗号分隔" />
            </label>
        </div>
        <div class="row">
            <label>重复
                <input bind:value={recurrence} type="text" placeholder="例如：每天、每周" />
            </label>
            <label>提醒
                <input bind:value={reminder} type="text" placeholder="YYYY-MM-DD HH:mm 或 HH:mm" />
            </label>
        </div>
        <label>地点
            <input bind:value={location} type="text" />
        </label>
    </div>

    <footer>
        <button type="button" onclick={onClose}>取消</button>
        <button type="button" class="primary" onclick={submit}>确认</button>
    </footer>
</div>

<style>
    .task-editor-form {
        display: flex;
        flex-direction: column;
        min-height: 0;
        width: 100%;
        box-sizing: border-box;
        flex: 1;
        min-width: 0;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
        width: 100%;
        box-sizing: border-box;
    }

    .row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
        min-width: 0;
    }

    input,
    select {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        padding: 8px 10px;
        font-size: 13px;
        transition: border-color 0.12s;
        width: 100%;
        box-sizing: border-box;
    }

    input:focus,
    select:focus {
        outline: none;
        border-color: var(--b3-theme-primary);
    }

    footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 18px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
        width: 100%;
        box-sizing: border-box;
    }

    footer button {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 7px 16px;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    footer button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .primary {
        border-color: var(--b3-theme-primary) !important;
        background: var(--b3-theme-primary) !important;
        color: #fff !important;
    }

    .primary:hover {
        opacity: 0.88;
        color: #fff !important;
    }

    @media (max-width: 620px) {
        .row {
            grid-template-columns: 1fr;
        }
    }
</style>

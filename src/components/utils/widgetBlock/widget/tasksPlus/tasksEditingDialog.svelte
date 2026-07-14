<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { sql, getBlockKramdown, updateBlock as updateBlockAPI } from "@/api";
    import { ensureTaskBlockExists, updateTaskIndexItem } from "@/components/tools/siyuanComponentDataApi";
    import { generateTaskLine, parseTaskLine } from "./tasksPlusParser";

    interface Props {
        blockId: string;
        close: () => void;
    }

    let { blockId = $bindable(), close }: Props = $props();

    let parentBlockId = "";
    let parentBlockType = "";
    let taskRootId = "";
    let taskBox = "";
    let taskHpath = "";
    let taskPath = "";
    let originalParentMarkdown = "";
    let taskLines: string[] = [];

    let blockMarkdown = "";

    let taskData = $state({
        taskCheck: "",
        taskname: "",
        priority: "",
        startDate: "",
        deadline: "",
        recurrence: "",
        reminder: "",
        location: "",
        tags: [] as string[],
        visibleProjectReference: "",
    });

    let useDateTime = $state(true);
    let timePart = $state("");

    function parseTaskMarkdown(markdown: string) {
        if (!markdown) return;

        const parsedTask = parseTaskLine(markdown);
        const meta = parsedTask.parsed;
        taskData.taskCheck = parsedTask.taskCheck;
        taskData.taskname = parsedTask.taskname;
        taskData.priority = meta.priority;
        taskData.startDate = formatDateString(meta.startDate);
        taskData.deadline = formatDateString(meta.deadline);
        taskData.recurrence = meta.recurrence;
        taskData.location = meta.location;
        taskData.tags = [...meta.tags];
        taskData.visibleProjectReference = meta.visibleProjectReference || "";

        if (meta.reminder) {
            const hasDate = meta.reminder.includes(" ");
            useDateTime = hasDate;
            taskData.reminder = formatReminderValue(meta.reminder);
            if (!hasDate) timePart = meta.reminder.padStart(5, "0");
        }
    }

    async function getBlockMarkdown() {
        const blockInfo = await getBlockKramdown(blockId);
        return blockInfo.kramdown.replace(/\s*\{:.*?\}\s*$/gm, "");
    }

    function formatDateString(dateStr: string) {
        if (!dateStr) return "";
        const [year, month, day] = dateStr.split("-");
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    function formatReminderValue(value: string): string {
        if (!value) return "";

        if (value.includes(" ")) {
            const [datePart, timePart] = value.split(" ");
            const [year, month, day] = datePart.split("-").map(Number);
            const formattedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const formattedTime = timePart.padStart(5, "0");
            return `${formattedDate}T${formattedTime}`;
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const formattedTime = value.padStart(5, "0");
        return `${todayStr}T${formattedTime}`;
    }

    function handleTimeTypeChange() {
        if (!useDateTime) {
            const [_, time] = taskData.reminder.split("T");
            timePart = time || "";
            taskData.reminder = `2000-01-01T${timePart}`;
        } else {
            const [date, time] = taskData.reminder.split("T");
            timePart = time || "";
            taskData.reminder = `${date}T${timePart}`;
        }
    }

    function updateReminderTime(newTime: string) {
        if (!useDateTime) {
            taskData.reminder = `2000-01-01T${newTime}`;
        } else {
            const datePart =
                taskData.reminder.split("T")[0] ||
                new Date().toISOString().slice(0, 10);
            taskData.reminder = `${datePart}T${newTime}`;
        }
    }

    function handleReminderTimeInput(e: Event) {
        const input = e.target as HTMLInputElement;
        updateReminderTime(input.value);
    }

    function generateTaskMarkdown(): string {
        const reminderDate = useDateTime ? taskData.reminder.split("T")[0] : "";
        const reminderTime = taskData.reminder.split("T")[1] || timePart;
        const reminder = reminderDate && useDateTime
            ? `${reminderDate} ${reminderTime}`
            : reminderTime;
        return generateTaskLine({
            taskCheck: taskData.taskCheck || "- [ ]",
            taskname: taskData.taskname,
            priority: taskData.priority,
            startDate: taskData.startDate,
            deadline: taskData.deadline,
            recurrence: taskData.recurrence,
            reminder,
            location: taskData.location,
            tags: taskData.tags,
            visibleProjectReference: taskData.visibleProjectReference,
        });
    }

    async function updateBlock() {
        await getParentBlock();

        let updatedMarkdown = generateTaskMarkdown();
        const originalBlockId = blockId;
        const exists = await ensureTaskBlockExists(originalBlockId);
        if (!exists) {
            showMessage("任务块已删除，已清理索引", 3000);
            close();
            return;
        }

        if (parentBlockType != "d") {
            blockId = parentBlockId;
            taskLines[0] = updatedMarkdown;
            updatedMarkdown = taskLines.join("\n");
        }

        await updateBlockAPI("markdown", updatedMarkdown, blockId);
        await updateTaskIndexItem({
            id: originalBlockId,
            rootID: taskRootId || originalBlockId,
            root_id: taskRootId || originalBlockId,
            box: taskBox,
            path: taskPath,
            hpath: taskHpath,
            markdown: updatedMarkdown,
            content: taskData.taskname,
            checked: /\[[xX]\]/.test(taskData.taskCheck),
            updated: new Date().toISOString(),
            source: "plugin",
        });

        close();
    }

    async function getParentBlock() {
        const blockRows = await sql(
            `select parent_id, root_id, box, path, hpath from blocks where id = "${blockId}"`,
        );
        parentBlockId = blockRows[0].parent_id;
        taskRootId = blockRows[0].root_id || blockId;
        taskBox = blockRows[0].box || "";
        taskPath = blockRows[0].path || "";
        taskHpath = blockRows[0].hpath || "";

        const getParentBlockType = await sql(
            `select type from blocks where id = "${blockRows[0].parent_id}"`,
        );
        parentBlockType = getParentBlockType[0].type;

        if (parentBlockType === "d") return;

        const parentBlockMarkdownResult = await sql(
            `select markdown from blocks where id = "${parentBlockId}"`,
        );
        originalParentMarkdown = parentBlockMarkdownResult[0]?.markdown || "";

        const lines = originalParentMarkdown.split("\n");
        if (lines.length > 0) {
            taskLines = lines.slice(1);
        }
    }

    onMount(async () => {
        blockMarkdown = await getBlockMarkdown();
        parseTaskMarkdown(blockMarkdown);
    });
</script>

<div class="content-display">
    <div class="task-name">
        <label for="task-name"
            >名称：
            <input
                type="text"
                id="task-name"
                placeholder="输入任务名称"
                bind:value={taskData.taskname}
            />
        </label>
    </div>
    <div class="task-time">
        <label>
            开始⌛：
            <input type="date" bind:value={taskData.startDate} />
        </label>

        <label>
            截止📅：
            <input type="date" bind:value={taskData.deadline} />
        </label>
    </div>
    <div class="task-recurrence">
        <label>
            重复🔄：
            <input
                class="recurrence-input"
                type="text"
                bind:value={taskData.recurrence}
                placeholder="例：每天、每周"
            />
        </label>

        <label>
            提醒⏰：
            {#if useDateTime}
                <input
                    type="datetime-local"
                    bind:value={taskData.reminder}
                    step="60"
                />
            {:else}
                <input
                    type="time"
                    bind:value={timePart}
                    step="60"
                    oninput={handleReminderTimeInput}
                />
            {/if}
            <label class="time-type-switch">
                <input
                    type="checkbox"
                    bind:checked={useDateTime}
                    onchange={handleTimeTypeChange}
                />
                日期
            </label>
        </label>
    </div>
    <div class="task-location">
        <label>
            地点📍：
            <input
                type="text"
                bind:value={taskData.location}
                placeholder="输入任务地点"
            />
        </label>
        <label>
            优先级❗：
            <select bind:value={taskData.priority}>
                <option value="">无</option>
                <option value="❗">低</option>
                <option value="❗❗">中</option>
                <option value="❗❗❗">高</option>
                <option value="❗❗❗❗">紧急</option>
            </select>
        </label>
    </div>
    <div class="task-tags">
        <span> 标签 </span>
        <div class="tag-item-container">
            {#each taskData.tags as _, index}
                <div class="tag-item">
                    <input type="text" bind:value={taskData.tags[index]} placeholder="标签" />
                    <button
                        onclick={() =>
                            (taskData.tags = taskData.tags.filter(
                                (_, i) => i !== index,
                            ))}
                    >
                        ×
                    </button>
                </div>
            {/each}
        </div>
        <button
            class="add-tag-button"
            onclick={() => (taskData.tags = [...taskData.tags, ""])}
        >
            添加标签
        </button>
    </div>
    <div class="task-confirm">
        <div class="task-confirm">
            <button onclick={updateBlock}>确认</button>
        </div>
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        max-width: 90vh;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;
        gap: 10px;

        input,
        select {
            background-color: var(--b3-theme-background);
            padding: 8px;
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            color: var(--b3-theme-on-surface);

            &:hover {
                border-color: var(--b3-theme-primary);
            }

            &:active {
                border-color: var(--b3-theme-primary);
            }
        }

        button {
            color: var(--b3-theme-on-surface);
        }

        .task-name {
            display: flex;
            align-items: center;

            input {
                flex: 1;
                width: 350px;
            }
        }

        .task-time {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .task-recurrence {
            display: flex;
            align-items: center;
            gap: 10px;

            .recurrence-input {
                width: 100px;
            }
        }

        .task-location {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .task-tags {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;

            input {
                width: 100px;
            }

            .tag-item-container {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }

            .tag-item {
                display: flex;
                align-items: center;
                gap: 5px;

                button {
                    background-color: transparent;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;

                    &:hover {
                        background-color: red;
                    }
                }
            }

            .add-tag-button {
                background-color: transparent;
                border: 1px solid var(--b3-border-color);
                border-radius: 10%;
                cursor: pointer;
                padding: 5px 10px;

                &:hover {
                    background-color: var(--b3-theme-primary);
                }
            }
        }

        .task-confirm {
            margin-top: 10px;
            display: flex;
            align-items: center;
            justify-content: center;

            button {
                padding: 5px 50px;
                background-color: var(--b3-theme-primary);
                border-radius: 4px;
                border: 1px solid var(--b3-border-color);
            }
        }
    }
</style>

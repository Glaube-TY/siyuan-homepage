<script lang="ts">
    import { onMount } from "svelte";
    import { sql } from "@/api";

    interface Props {
        plugin: any;
        blockId: string;
        close: () => void;
    }

    let { plugin, blockId = $bindable(), close }: Props = $props();

    let parentBlockId = "";
    let parentBlockType = "";
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
    });

    let useDateTime = $state(true);
    let timePart = $state("");

    function parseTaskMarkdown(markdown: string) {
        if (!markdown) return;

        const taskCheckMatch = markdown.match(/^([*-]\s\[( |X|x)\])/);
        taskData.taskCheck = taskCheckMatch?.[0]?.trim() || "";

        const baseContent = markdown.split("\n\n")[0]?.split("\n")[0] || "";
        taskData.taskname = baseContent
            .replace(taskData.taskCheck, "")
            .trim()
            .split(/[📅⌛❗🔁⏰📍#]/)[0]
            .trim();

        const regex = /([📅⌛❗🔁⏰📍#]+)\s*(.*?)(?=\s*[📅⌛❗🔁⏰📍#]|$)/g;
        const matches = markdown.match(regex) || [];

        matches.forEach((match: string) => {
            const trimmed = match.trim();
            if (trimmed.startsWith("❗")) {
                taskData.priority = trimmed;
            } else if (trimmed.startsWith("⌛")) {
                const rawDate = trimmed.replace("⌛", "").trim();
                taskData.startDate = formatDateString(rawDate);
            } else if (trimmed.startsWith("📅")) {
                const rawDate = trimmed.replace("📅", "").trim();
                taskData.deadline = formatDateString(rawDate);
            } else if (trimmed.startsWith("🔁")) {
                taskData.recurrence = trimmed.replace("🔁", "").trim();
            } else if (trimmed.startsWith("⏰")) {
                const reminderValue = trimmed.replace("⏰", "").trim();
                const hasDate = reminderValue.includes(" ");
                useDateTime = hasDate;

                taskData.reminder = formatReminderValue(reminderValue);

                if (!hasDate) {
                    timePart = reminderValue.padStart(5, "0");
                }
            } else if (trimmed.startsWith("📍")) {
                taskData.location = trimmed.replace("📍", "").trim();
            }
        });

        taskData.tags = [];

        const tagRegex = /#([^#]+)#/g;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(markdown)) !== null) {
            taskData.tags.push(tagMatch[1].trim());
        }
    }

    async function getBlockMarkdown() {
        const blockInfo = await plugin.client.getBlockKramdown({ id: blockId });
        return blockInfo.data.kramdown.replace(/\s*\{:.*?\}\s*$/gm, "");
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
        let parts: string[] = [];
        const taskCheck = taskData.taskCheck || "- [ ]";

        if (taskData.taskname) {
            parts.push(taskCheck + " " + taskData.taskname);
        }

        if (taskData.priority) {
            parts.push(taskData.priority);
        }

        if (taskData.startDate) {
            parts.push("⌛" + taskData.startDate);
        }

        if (taskData.deadline) {
            parts.push("📅" + taskData.deadline);
        }

        if (taskData.recurrence) {
            parts.push("🔁" + taskData.recurrence.trim());
        }

        if (taskData.reminder) {
            const reminderDate = useDateTime
                ? taskData.reminder.split("T")[0].replace(/-/g, "-")
                : "";
            const reminderTime = taskData.reminder.split("T")[1] || timePart;
            const reminderStr =
                reminderDate && useDateTime
                    ? `${reminderDate} ${reminderTime}`
                    : reminderTime;
            parts.push("⏰" + reminderStr);
        }

        if (taskData.location) {
            parts.push("📍" + taskData.location);
        }

        if (taskData.tags.length > 0) {
            parts.push(...taskData.tags.map((tag) => `#${tag.trim()}#`));
        }

        return parts.join(" ");
    }

    async function updateBlock() {
        await getParentBlock();

        let updatedMarkdown = generateTaskMarkdown();

        if (parentBlockType != "d") {
            blockId = parentBlockId;
            taskLines[0] = updatedMarkdown;
            updatedMarkdown = taskLines.join("\n");
        }

        await plugin.client.updateBlock({
            id: blockId,
            data: updatedMarkdown,
            dataType: "markdown",
        });

        close();
    }

    async function getParentBlock() {
        const parentBlockID = await sql(
            `select parent_id from blocks where id = "${blockId}"`,
        );
        parentBlockId = parentBlockID[0].parent_id;

        const getParentBlockType = await sql(
            `select type from blocks where id = "${parentBlockID[0].parent_id}"`,
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
            color: var(--b3-theme-text);

            &:hover {
                border-color: var(--b3-theme-primary);
            }

            &:active {
                border-color: var(--b3-theme-primary);
            }
        }

        button {
            color: var(--b3-theme-text);
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

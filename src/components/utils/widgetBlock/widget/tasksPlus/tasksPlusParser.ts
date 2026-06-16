export interface ParsedTasksPlusMeta {
    deadline: string;
    startDate: string;
    priority: string;
    recurrence: string;
    reminder: string;
    location: string;
    tags: string[];
}

export interface ParsedTasksPlusTask {
    taskCheck: string;
    taskname: string;
    parsed: ParsedTasksPlusMeta;
    markdown: string;
}

export interface GenerateTasksPlusTaskInput {
    taskname: string;
    completed?: boolean;
    priority?: string;
    startDate?: string;
    deadline?: string;
    recurrence?: string;
    reminder?: string;
    location?: string;
    tags?: string[];
    taskCheck?: string;
}

const TASK_META_SPLIT_RE = /[📅⌛❗🔁⏰📍#]/;
const TASK_META_TOKEN_RE = /([📅⌛❗🔁⏰📍#]+)\s*(.*?)(?=\s*[📅⌛❗🔁⏰📍#]|$)/g;

function firstMarkdownLine(markdown: string): string {
    return (markdown || "").split("\n\n")[0]?.split("\n")[0]?.trim() || "";
}

function normalizeTag(tag: string): string {
    return tag.replace(/^#+|#+$/g, "").trim();
}

function compactParts(parts: Array<string | undefined | null | false>): string {
    return parts
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(" ");
}

export function isTaskCompleted(taskCheck: string): boolean {
    return /\[(x|X)\]/.test(taskCheck);
}

export function extractTaskTags(markdown: string): string[] {
    const tags: string[] = [];
    const tagRegex = /#([^#]+)#/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(markdown)) !== null) {
        const tag = tagMatch[1].trim();
        if (tag) tags.push(tag);
    }
    return tags;
}

export function parseTaskLine(markdown: string): ParsedTasksPlusTask {
    const taskLine = firstMarkdownLine(markdown);
    const taskCheckMatch = taskLine.match(/^([*-]\s\[( |X|x)\])/);
    const taskCheck = taskCheckMatch ? taskCheckMatch[0].trim() : "";

    const taskname = taskLine
        .replace(taskCheck, "")
        .trim()
        .split(TASK_META_SPLIT_RE)[0]
        .trim();

    const parsed: ParsedTasksPlusMeta = {
        deadline: "",
        startDate: "",
        priority: "",
        recurrence: "",
        reminder: "",
        location: "",
        tags: extractTaskTags(taskLine),
    };

    const matches: string[] = Array.from(taskLine.matchAll(TASK_META_TOKEN_RE), (match) => match[0]);
    matches.forEach((match: string) => {
        const trimmed = String(match).trim();
        if (trimmed.startsWith("📅")) {
            parsed.deadline = trimmed.replace("📅", "").trim();
        } else if (trimmed.startsWith("⌛")) {
            parsed.startDate = trimmed.replace("⌛", "").trim();
        } else if (trimmed.startsWith("❗")) {
            parsed.priority = trimmed;
        } else if (trimmed.startsWith("🔁")) {
            parsed.recurrence = trimmed.replace("🔁", "").trim();
        } else if (trimmed.startsWith("⏰")) {
            parsed.reminder = trimmed.replace("⏰", "").trim();
        } else if (trimmed.startsWith("📍")) {
            parsed.location = trimmed.replace("📍", "").trim();
        }
    });

    return {
        taskCheck,
        taskname,
        parsed,
        markdown: taskLine,
    };
}

export function generateTaskLine(input: GenerateTasksPlusTaskInput): string {
    const taskname = input.taskname.trim();
    if (!taskname) {
        throw new Error("Task name is required");
    }

    const taskCheck = input.taskCheck || (input.completed ? "- [x]" : "- [ ]");
    const tags = (input.tags || [])
        .map(normalizeTag)
        .filter(Boolean)
        .map((tag) => `#${tag}#`);

    return compactParts([
        `${taskCheck} ${taskname}`,
        input.priority,
        input.startDate ? `⌛${input.startDate.trim()}` : "",
        input.deadline ? `📅${input.deadline.trim()}` : "",
        input.recurrence ? `🔁${input.recurrence.trim()}` : "",
        input.reminder ? `⏰${input.reminder.trim()}` : "",
        input.location ? `📍${input.location.trim()}` : "",
        ...tags,
    ]);
}

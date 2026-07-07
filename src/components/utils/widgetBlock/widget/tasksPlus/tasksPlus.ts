import {
    getTaskIndexResult,
    type ComponentDataResult,
} from "@/components/tools/siyuanComponentDataApi";

export interface RecentTasksInfo {
    id: string;
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
}

export async function gettasksList(
    plugin?: any,
    notebookIds: string[] = [],
): Promise<ComponentDataResult<any>> {
    void plugin;
    return getTaskIndexResult(notebookIds);
}

export async function formatTasksList(
    tasksList: any[],
    internalFilter: string = "all",
    isCustomFilter: boolean = false,
    customFilter: string = "",
    tasksSort: string = "startdate",
) {

    if (tasksList.length > 0) {
        tasksList = tasksList.map((task) => {
            const initmarkdown = task.markdown;
            const markdown =
                initmarkdown.split("\n\n")[0]?.split("\n")[0] || "";

            const box = task.box;

            const taskCheckMatch = markdown.match(/^([*-]\s\[( |X|x)\])/);
            const taskCheck = taskCheckMatch
                ? taskCheckMatch[0].trim()
                : "";

            const taskname = markdown
                .replace(taskCheck, "")
                .trim()
                .split(/[📅⌛❗🔁⏰📍#]/)[0]
                .trim();

            const updated = task.updated;
            const id = task.id;
            const hpath = task.hpath;

            const regex = /([📅⌛❗🔁⏰📍#]+(?:\s*[^📅⌛❗🔁⏰📍#]+)?)/g;
            const matches = markdown.match(regex) || [];
            const parsed = {
                deadline: "", // 截止日期 📅
                startDate: "", // 开始日期 ⌛
                priority: "", // 紧要程度 ❗
                recurrence: "", // 周期循环 🔁
                reminder: "", // 提醒时间 ⏰
                location: "", // 地点 📍
                tags: [] as string[], // 标签 #...#
            };

            matches.forEach((match: string) => {
                const trimmed = match.trim();
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

            // 额外检查：确保独立的优先级符号被捕获
            const priorityOnlyMatch = markdown.match(/❗+$/);
            if (priorityOnlyMatch && !parsed.priority) {
                parsed.priority = priorityOnlyMatch[0];
            }

            const tagRegex = /#([^#]+)#/g;
            let tagMatch;
            while ((tagMatch = tagRegex.exec(markdown)) !== null) {
                parsed.tags.push(tagMatch[1].trim());
            }

            return { taskCheck, taskname, updated, id, parsed, hpath, initmarkdown, markdown, box };
        });

        tasksList = isCustomFilter
            ? customFilterTasks(tasksList, customFilter)
            : interalfilterTasks(tasksList, internalFilter);

        tasksList.sort((a, b) => {
            const getDate = (task: any) => {
                const dateStr = tasksSort === "startdate" ?
                    task.parsed.startDate :
                    task.parsed.deadline;
                return dateStr ? new Date(dateStr).getTime() : Infinity;
            };

            const getPriority = (task: any) =>
                (task.parsed.priority?.match(/❗/g) || []).length * -1;

            switch (tasksSort) {
                case "startdate":
                case "deadline":
                    return getDate(a) - getDate(b);
                case "priority":
                    return getPriority(a) - getPriority(b);
                default:
                    return 0;
            }
        });

        return tasksList;
    }
    return [];
}

export function customFilterTasks(tasksList: any[], filter: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    const nextweek = new Date(today.getTime() + 86400000 * 7);
    const nextmonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const conditions = filter.split('\n').map(line => line.trim().toLowerCase());

    return tasksList.filter(task => {
        return conditions.every(condition => {
            const startDateStr = task.parsed.startDate;
            const deadlineStr = task.parsed.deadline;
            const startDate = startDateStr ? new Date(startDateStr) : null;
            const deadline = deadlineStr ? new Date(deadlineStr) : null;

            if (condition === 'not done') {
                return !['x', 'X'].some(c => task.taskCheck.includes(c));
            } else if (condition === 'done') {
                return ['x', 'X'].some(c => task.taskCheck.includes(c));
            } else if (condition === 'start') {
                return !!startDate;
            } else if (condition === 'not start') {
                return !startDate;
            } else if (condition.startsWith('start date ')) {
                const dateStr = condition.replace('start date ', '').trim();
                const targetDate = parseCustomDate(dateStr);
                return startDate && targetDate && isWithinDay(startDate, targetDate);
            } else if (condition.startsWith('start after date ')) {
                const dateStr = condition.replace('start after date ', '').trim();
                const targetDate = parseCustomDate(dateStr);
                return startDate && targetDate && startDate > targetDate;
            } else if (condition === 'start today') {
                return startDate && isWithinDay(startDate, today);
            } else if (condition === 'start after today') {
                return startDate && startDate > today;
            } else if (condition === 'start before today') {
                return startDate && startDate < today;
            } else if (condition.startsWith('start before date ')) {
                const dateStr = condition.replace('start before date ', '').trim();
                const targetDate = parseCustomDate(dateStr);
                return startDate && targetDate && startDate < targetDate;
            } else if (condition === 'start tomorrow') {
                return startDate && isWithinDay(startDate, tomorrow);
            } else if (condition === 'start before tomorrow') {
                return startDate && startDate < tomorrow;
            } else if (condition === 'start after tomorrow') {
                return startDate && startDate > tomorrow;
            } else if (condition === 'start nextweek') {
                return startDate && startDate > nextweek;
            } else if (condition === 'start before nextweek') {
                return startDate && startDate < nextweek;
            } else if (condition === 'start after nextweek') {
                return startDate && startDate > nextweek;
            } else if (condition === 'start nextmonth') {
                return startDate && startDate > nextmonth;
            } else if (/^start after \d+ (day|week|month)s?$/.test(condition)) {
                const match = condition.match(/^start after (\d+) (day|week|month)s?$/);
                if (match) {
                    const amount = parseInt(match[1], 10);
                    const unit = match[2] as 'day' | 'week' | 'month';
                    const targetDate = addTimeToDate(today, amount, unit);
                    return startDate && startDate > targetDate;
                }
                return false;
            } else if (/^start before \d+ (day|week|month)s?$/.test(condition)) {
                const match = condition.match(/^start before (\d+) (day|week|month)s?$/);
                if (match) {
                    const amount = parseInt(match[1], 10);
                    const unit = match[2] as 'day' | 'week' | 'month';
                    const targetDate = addTimeToDate(today, -amount, unit);
                    return startDate && startDate < targetDate;
                }
                return false;
            } else if (condition === 'start after nextmonth') {
                return startDate && startDate > nextmonth;
            } else if (condition === 'start before nextmonth') {
                return startDate && startDate < nextmonth;
            } else if (condition === 'deadline') {
                return !!deadline;
            } else if (condition === 'not deadline') {
                return !deadline;
            } else if (condition === 'deadline today') {
                return deadline && isWithinDay(deadline, today);
            } else if (condition === 'deadline after today') {
                return deadline && deadline > today;
            } else if (condition === 'deadline before today') {
                return deadline && deadline < today;
            } else if (condition === 'deadline before tomorrow') {
                return deadline && deadline < tomorrow;
            } else if (condition === 'deadline after tomorrow') {
                return deadline && deadline > tomorrow;
            } else if (condition === 'deadline nextweek') {
                return deadline && isWithinDay(deadline, nextweek);
            } else if (condition === 'deadline before nextweek') {
                return deadline && deadline < nextweek;
            } else if (condition === 'deadline after nextweek') {
                return deadline && deadline > nextweek;
            } else if (condition === 'deadline nextmonth') {
                return deadline && isWithinDay(deadline, nextmonth);
            } else if (condition === 'deadline before nextmonth') {
                return deadline && deadline < nextmonth;
            } else if (condition === 'deadline after nextmonth') {
                return deadline && deadline > nextmonth;
            } else if (condition === 'deadline tomorrow') {
                return deadline && isWithinDay(deadline, tomorrow);
            } else if (condition.startsWith('deadline date ')) {
                const dateStr = condition.replace('deadline date ', '').trim();
                const targetDate = parseCustomDate(dateStr);
                return deadline && targetDate && isWithinDay(deadline, targetDate);
            } else if (condition.startsWith('deadline before date ')) {
                const dateStr = condition.replace('deadline before date ', '').trim();
                const targetDate = parseCustomDate(dateStr);
                return deadline && targetDate && deadline < targetDate;
            } else if (condition.startsWith('deadline after date ')) {
                const dateStr = condition.replace('deadline after date ', '').trim();
                const targetDate = parseCustomDate(dateStr);
                return deadline && targetDate && deadline > targetDate;
            } else if (/^deadline before \d+ (day|week|month)s?$/.test(condition)) {
                const match = condition.match(/^deadline before (\d+) (day|week|month)s?$/);
                if (match) {
                    const amount = parseInt(match[1], 10);
                    const unit = match[2] as 'day' | 'week' | 'month';
                    const targetDate = addTimeToDate(today, amount, unit);
                    return deadline && deadline < targetDate;
                }
                return false;
            } else if (/^deadline after \d+ (day|week|month)s?$/.test(condition)) {
                const match = condition.match(/^deadline after (\d+) (day|week|month)s?$/);
                if (match) {
                    const amount = parseInt(match[1], 10);
                    const unit = match[2] as 'day' | 'week' | 'month';
                    const targetDate = addTimeToDate(today, -amount, unit);
                    return deadline && deadline > targetDate;
                }
                return false;
            } else if (condition === 'priority') {
                return !!task.parsed.priority;
            } else if (condition === 'not priority') {
                return !task.parsed.priority;
            } else if (/^priority \d+(?:,\d+)*$/.test(condition)) {
                const priorityLevels = condition.replace('priority ', '')
                    .split(',')
                    .map(level => parseInt(level, 10))
                    .filter(level => !isNaN(level) && level >= 1);

                if (priorityLevels.length === 0) return false;

                // 获取优先级符号数量，处理只有❗的情况
                const priorityText = task.parsed.priority || '';
                const exclamationCount = (priorityText.match(/❗/g) || []).length;
                return priorityLevels.includes(exclamationCount);
            } else if (condition === 'recurrence') {
                return !!task.parsed.recurrence;
            } else if (condition === 'not recurrence') {
                return !task.parsed.recurrence;
            } else if (/^recurrence (everyday|everyweek|everymonth|everyyear|every \d+ (day|month|year)s?)$/.test(condition)) {
                const recurrenceText = task.parsed.recurrence || "";
                let match;
                if (condition === 'recurrence everyday') {
                    return /每天/.test(recurrenceText);
                } else if (condition === 'recurrence everyweek') {
                    return /每周/.test(recurrenceText);
                } else if (condition === 'recurrence everymonth') {
                    return /每月/.test(recurrenceText);
                } else if (condition === 'recurrence everyyear') {
                    return /每年/.test(recurrenceText);
                } else if ((match = condition.match(/^recurrence every (\d+) (day|month|year)s?$/))) {
                    const interval = parseInt(match[1], 10);
                    const unit = match[2];
                    const regexMap: Record<string, RegExp> = {
                        day: new RegExp(`每${interval}天`),
                        month: new RegExp(`每${interval}个月`),
                        year: new RegExp(`每${interval}年`)
                    };
                    return regexMap[unit]?.test(recurrenceText) ?? false;
                }
            } else if (condition === 'tag') {
                return task.parsed.tags.length > 0;
            } else if (condition === 'not tag') {
                return task.parsed.tags.length === 0;
            } else if (condition.startsWith('tag ')) {
                const tags = condition
                    .split(' ')[1]
                    ?.split(/[，,]/)
                    ?.map(t => t.trim())
                    ?.filter(Boolean);

                if (!tags || tags.length === 0) return false;

                return tags.some(tag => task.parsed.tags.includes(tag));
            } else if (condition === 'location') {
                return !!task.parsed.location;
            } else if (condition === 'not location') {
                return !task.parsed.location;
            } else if (condition.startsWith('location ')) {
                const locationKeyword = condition.replace('location ', '').trim();
                return task.parsed.location.trim() === locationKeyword;
            } else if (condition === 'reminder') {
                return !!task.parsed.reminder?.trim();
            } else if (condition === 'not reminder') {
                return !task.parsed.reminder?.trim();
            } else if (condition.startsWith('notebook ')) {
                const boxNames = condition.replace('notebook ', '')
                    .split(/[，,]/)
                    .map(name => name.trim())
                    .filter(Boolean);
                return boxNames.length > 0 && boxNames.includes(task.box);
            } else if (condition.startsWith('path include ')) {
                const pathKeyword = condition.replace('path include ', '').trim();
                return task.hpath.includes(pathKeyword);
            } else if (condition.startsWith('path ')) {
                const exactPath = condition.replace('path ', '').trim();
                return task.hpath === exactPath;
            } else if (condition.startsWith('name include ')) {
                const nameKeyword = condition.replace('name include ', '').trim();
                return task.taskname.includes(nameKeyword);
            } else if (condition.startsWith('name ')) {
                const exactName = condition.replace('name ', '').trim();
                return task.taskname === exactName;
            } else {
                return false;
            }
        });
    });
}

function interalfilterTasks(tasksList: any[], internalFilter: string) {

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);

    return tasksList.filter(task => {
        const startDateStr = task.parsed.startDate;
        const deadlineStr = task.parsed.deadline;

        // 转换为 Date 对象
        const startDate = startDateStr ? new Date(new Date(startDateStr).setHours(0, 0, 0, 0)) : null;
        const deadline = deadlineStr ? new Date(new Date(deadlineStr).setHours(0, 0, 0, 0)) : null;

        // 根据筛选条件过滤
        switch (internalFilter) {
            case 'uncompleted':
                return !['x', 'X'].some(c => task.taskCheck.includes(c));
            case 'completed':
                return ['x', 'X'].some(c => task.taskCheck.includes(c));
            case 'today':
                if (startDate && !deadline) {
                    return startDate <= today;
                }
                if (deadline && !startDate) {
                    return deadline >= today;
                }
                if (startDate && deadline) {
                    return startDate <= today && today <= deadline;
                }
                return deadline && isWithinDay(deadline, today);
            case 'tomorrow':
                if (startDate && !deadline) {
                    return startDate <= tomorrow;
                }
                if (deadline && !startDate) {
                    return deadline >= tomorrow;
                }
                if (startDate && deadline) {
                    return startDate <= tomorrow && tomorrow <= deadline;
                }
                return deadline && isWithinDay(deadline, tomorrow);
            case 'mostImportant':
                return (task.parsed.priority.match(/❗/g) || []).length >= 4;
            default:
                return true;
        }
    });
}

function parseCustomDate(dateString: string): Date | null {
    const regex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
    const match = dateString.match(regex);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // 月份从0开始
        const day = parseInt(match[3], 10);
        return new Date(year, month, day);
    }
    return null;
}

function addTimeToDate(baseDate: Date, amount: number, unit: 'day' | 'week' | 'month'): Date {
    const date = new Date(baseDate);
    switch (unit) {
        case 'day':
            return new Date(date.getTime() + amount * 86400000); // 一天的毫秒数
        case 'week':
            return new Date(date.getTime() + amount * 7 * 86400000);
        case 'month':
            date.setMonth(date.getMonth() + amount);
            return date;
    }
}


// 保持原有的辅助函数不变
function isWithinDay(date: Date, targetDay: Date): boolean {
    return date.getFullYear() === targetDay.getFullYear() &&
        date.getMonth() === targetDay.getMonth() &&
        date.getDate() === targetDay.getDate();
}

import { loadOpenTasks } from "@/features/task-data/task-query";
import { loadCountdownCenterData } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { getCountdownOccurrencesInRange } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { getEnhancedDiaryIndexEntries } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import {
  formatCalendarDate,
  type GlobalCalendarEvent,
  type GlobalCalendarLoadResult,
  type GlobalCalendarSource,
} from "./global-calendar-types";
import {
  expandGlobalCalendarSchedules,
  loadGlobalCalendarSchedules,
} from "./global-calendar-schedule-store";

export interface GlobalCalendarProvider {
  id: GlobalCalendarSource;
  load(plugin: any, start: Date, end: Date): Promise<GlobalCalendarEvent[]>;
}

const extraProviders = new Map<GlobalCalendarSource, GlobalCalendarProvider>();

function inRange(date: string, start: Date, end: Date): boolean {
  return date >= formatCalendarDate(start) && date <= formatCalendarDate(end);
}

function cleanTaskTitle(value: string): string {
  return (
    String(value || "任务")
      .replace(/<[^>]+>/g, "")
      .replace(/^[*-]\s*\[[ xX]\]\s*/, "")
      .trim() || "任务"
  );
}

const builtInProviders: GlobalCalendarProvider[] = [
  {
    id: "tasks",
    async load(plugin, start, end) {
      const tasks = await loadOpenTasks(plugin);
      const events: GlobalCalendarEvent[] = [];
      for (const task of tasks) {
        const project = task.parsed as typeof task.parsed & {
          visibleProjectTargetId?: string;
          visibleProjectReference?: string;
        };
        const title = cleanTaskTitle(task.taskname || task.markdown);
        const startDate = task.parsed.startDate;
        const deadline = task.parsed.deadline;
        if (startDate && inRange(startDate, start, end)) {
          events.push({
            id: `task:${task.id}:start`,
            source: "tasks",
            date: startDate,
            title,
            subtitle: deadline === startDate ? "任务" : "开始",
            entityId: task.id,
            startAt: `${startDate}T00:00:00`,
            endAt: `${deadline || startDate}T23:59:00`,
            allDay: true,
            projectId: project.visibleProjectTargetId,
            projectTitle:
              project.visibleProjectReference?.replace(/^📁\s*/, "") ||
              undefined,
            target: { kind: "block", id: task.id },
          });
        }
        if (
          deadline &&
          deadline !== startDate &&
          inRange(deadline, start, end)
        ) {
          events.push({
            id: `task:${task.id}:deadline`,
            source: "tasks",
            date: deadline,
            title,
            subtitle: "截止",
            entityId: task.id,
            startAt: `${startDate || deadline}T00:00:00`,
            endAt: `${deadline}T23:59:00`,
            allDay: true,
            projectId: project.visibleProjectTargetId,
            projectTitle:
              project.visibleProjectReference?.replace(/^📁\s*/, "") ||
              undefined,
            target: { kind: "block", id: task.id },
          });
        }
      }
      return events;
    },
  },
  {
    id: "schedule",
    async load(_plugin, start, end) {
      return expandGlobalCalendarSchedules(
        await loadGlobalCalendarSchedules(),
        start,
        end,
      );
    },
  },
  {
    id: "diary",
    async load(plugin, start, end) {
      const config = await loadEnhancedDiaryConfig(plugin);
      if (!config.dailyNotebookId) return [];
      const entries = await getEnhancedDiaryIndexEntries(
        config.dailyNotebookId,
      );
      return Object.values(entries)
        .map((entry) => ({
          entry,
          date: entry.date.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
        }))
        .filter(({ date }) => inRange(date, start, end))
        .map(({ entry, date }) => ({
          id: `diary:${entry.id}`,
          source: "diary" as const,
          date,
          title: entry.title || `${date} 日记`,
          subtitle: "日记",
          target: { kind: "block" as const, id: entry.id },
        }));
    },
  },
  {
    id: "countdown",
    async load(_plugin, start, end) {
      const { events } = await loadCountdownCenterData({
        includeArchived: false,
      });
      return events.flatMap((event) =>
        getCountdownOccurrencesInRange(event, start, end).map((occurrence) => ({
          id: `countdown:${event.id}:${occurrence.localDate}`,
          source: "countdown" as const,
          date: occurrence.localDate,
          title: event.name,
          subtitle: event.note || "纪念日",
          target: event.linkedBlockId
            ? { kind: "block" as const, id: event.linkedBlockId }
            : { kind: "countdown" as const, eventId: event.id },
        })),
      );
    },
  },
];

export function registerGlobalCalendarProvider(
  provider: GlobalCalendarProvider,
): () => void {
  if (!/^[a-z][a-z0-9_-]{1,47}$/.test(provider.id))
    throw new Error(`非法日历来源 ID: ${provider.id}`);
  extraProviders.set(provider.id, provider);
  return () => extraProviders.delete(provider.id);
}

export async function loadGlobalCalendarEvents(
  plugin: any,
  start: Date,
  end: Date,
  enabledSources: Record<string, boolean>,
): Promise<GlobalCalendarLoadResult> {
  const providers = [
    ...new Map(
      [...builtInProviders, ...extraProviders.values()].map((provider) => [
        provider.id,
        provider,
      ]),
    ).values(),
  ];
  const settled = await Promise.all(
    providers
      .filter((provider) => enabledSources[provider.id] !== false)
      .map(async (provider) => {
        try {
          return {
            id: provider.id,
            events: await provider.load(plugin, start, end),
          };
        } catch (error) {
          console.warn(`[global-calendar] ${provider.id} source failed`, error);
          return { id: provider.id, events: null };
        }
      }),
  );
  return {
    events: settled
      .flatMap((item) => item.events || [])
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.source.localeCompare(b.source) ||
          a.title.localeCompare(b.title),
      ),
    failedSources: settled
      .filter((item) => item.events === null)
      .map((item) => item.id),
  };
}

<script lang="ts">
    import Archive from "@lucide/svelte/icons/archive";
    import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
    import Bell from "@lucide/svelte/icons/bell";
    import CalendarCheck2 from "@lucide/svelte/icons/calendar-check-2";
    import CalendarClock from "@lucide/svelte/icons/calendar-clock";
    import CalendarDays from "@lucide/svelte/icons/calendar-days";
    import CalendarOff from "@lucide/svelte/icons/calendar-off";
    import CalendarRange from "@lucide/svelte/icons/calendar-range";
    import ChartGantt from "@lucide/svelte/icons/chart-gantt";
    import ChartNoAxesCombined from "@lucide/svelte/icons/chart-no-axes-combined";
    import ClockAlert from "@lucide/svelte/icons/clock-alert";
    import Columns3 from "@lucide/svelte/icons/columns-3";
    import Flag from "@lucide/svelte/icons/flag";
    import FolderTree from "@lucide/svelte/icons/folder-tree";
    import History from "@lucide/svelte/icons/history";
    import Link2Off from "@lucide/svelte/icons/link-2-off";
    import ListFilter from "@lucide/svelte/icons/list-filter";
    import ListTodo from "@lucide/svelte/icons/list-todo";
    import ListTree from "@lucide/svelte/icons/list-tree";
    import LocateFixed from "@lucide/svelte/icons/locate-fixed";
    import MapPin from "@lucide/svelte/icons/map-pin";
    import MoveRight from "@lucide/svelte/icons/move-right";
    import PanelsTopLeft from "@lucide/svelte/icons/panels-top-left";
    import Repeat2 from "@lucide/svelte/icons/repeat-2";
    import Sun from "@lucide/svelte/icons/sun";
    import Tags from "@lucide/svelte/icons/tags";

    export type WorkspaceTaskIconName =
        | "start" | "deadline" | "range" | "overdue" | "unscheduled"
        | "project" | "archive" | "tags" | "repeat" | "reminder" | "location"
        | "sort" | "filter" | "list" | "kanban" | "agenda" | "calendar"
        | "timeline" | "gantt" | "matrix" | "analytics" | "relation" | "open"
        | "today" | "migrate" | "priority";

    interface Props { name: WorkspaceTaskIconName; size?: number; title?: string; }
    let { name, size = 15, title = "" }: Props = $props();

    const icons = {
        start: CalendarClock, deadline: CalendarCheck2, range: CalendarRange,
        overdue: ClockAlert, unscheduled: CalendarOff, project: FolderTree,
        archive: Archive, tags: Tags, repeat: Repeat2, reminder: Bell,
        location: MapPin, sort: ArrowUpDown, filter: ListFilter, list: ListTodo,
        kanban: Columns3, agenda: ListTree, calendar: CalendarDays,
        timeline: History, gantt: ChartGantt, matrix: PanelsTopLeft,
        analytics: ChartNoAxesCombined, relation: Link2Off, open: LocateFixed,
        today: Sun, migrate: MoveRight, priority: Flag,
    } as const;
    const Icon = $derived(icons[name]);
</script>

<Icon {size} strokeWidth={1.8} aria-hidden={title ? undefined : "true"} aria-label={title || undefined} />

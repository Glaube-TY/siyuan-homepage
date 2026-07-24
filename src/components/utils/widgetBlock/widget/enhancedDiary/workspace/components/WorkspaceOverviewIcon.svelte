<script lang="ts">
    import Activity from "@lucide/svelte/icons/activity";
    import ArrowRight from "@lucide/svelte/icons/arrow-right";
    import BellDot from "@lucide/svelte/icons/bell-dot";
    import CalendarCheck from "@lucide/svelte/icons/calendar-check";
    import CalendarDays from "@lucide/svelte/icons/calendar-days";
    import CircleCheckBig from "@lucide/svelte/icons/circle-check-big";
    import ClockAlert from "@lucide/svelte/icons/clock-alert";
    import FolderKanban from "@lucide/svelte/icons/folder-kanban";
    import FolderTree from "@lucide/svelte/icons/folder-tree";
    import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
    import ListPlus from "@lucide/svelte/icons/list-plus";
    import ListTodo from "@lucide/svelte/icons/list-todo";
    import NotebookPen from "@lucide/svelte/icons/notebook-pen";
    import NotebookText from "@lucide/svelte/icons/notebook-text";
    import RefreshCw from "@lucide/svelte/icons/refresh-cw";
    import Star from "@lucide/svelte/icons/star";
    import Target from "@lucide/svelte/icons/target";

    export type WorkspaceOverviewIconName =
        | "activity" | "arrow" | "attention" | "calendar" | "check" | "clock"
        | "dashboard" | "folder" | "projects" | "record" | "recordAdd" | "refresh"
        | "star" | "target" | "taskAdd" | "tasks" | "today";

    interface Props { name: WorkspaceOverviewIconName; size?: number; strokeWidth?: number; }
    let { name, size = 18, strokeWidth = 1.8 }: Props = $props();
</script>

{#if name === "activity"}<Activity {size} {strokeWidth} />
{:else if name === "arrow"}<ArrowRight {size} {strokeWidth} />
{:else if name === "attention"}<BellDot {size} {strokeWidth} />
{:else if name === "calendar"}<CalendarCheck {size} {strokeWidth} />
{:else if name === "check"}<CircleCheckBig {size} {strokeWidth} />
{:else if name === "clock"}<ClockAlert {size} {strokeWidth} />
{:else if name === "dashboard"}<LayoutDashboard {size} {strokeWidth} />
{:else if name === "folder"}<FolderTree {size} {strokeWidth} />
{:else if name === "projects"}<FolderKanban {size} {strokeWidth} />
{:else if name === "record"}<NotebookText {size} {strokeWidth} />
{:else if name === "recordAdd"}<NotebookPen {size} {strokeWidth} />
{:else if name === "refresh"}<RefreshCw {size} {strokeWidth} />
{:else if name === "star"}<Star {size} {strokeWidth} />
{:else if name === "target"}<Target {size} {strokeWidth} />
{:else if name === "taskAdd"}<ListPlus {size} {strokeWidth} />
{:else if name === "tasks"}<ListTodo {size} {strokeWidth} />
{:else}<CalendarDays {size} {strokeWidth} />{/if}

<script lang="ts">
    import {
        Activity,
        ArrowRight,
        BellDot,
        CalendarCheck,
        CalendarDays,
        CircleCheckBig,
        ClockAlert,
        FolderKanban,
        FolderTree,
        LayoutDashboard,
        ListPlus,
        ListTodo,
        NotebookPen,
        NotebookText,
        RefreshCw,
        Star,
        Target,
    } from "@lucide/svelte/icons";

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

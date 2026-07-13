<script lang="ts">
    import ListPlus from "@lucide/svelte/icons/list-plus";
    import NotebookPen from "@lucide/svelte/icons/notebook-pen";
    import FolderPlus from "@lucide/svelte/icons/folder-plus";
    import ExternalLink from "@lucide/svelte/icons/external-link";
    import Target from "@lucide/svelte/icons/target";
    import CircleCheckBig from "@lucide/svelte/icons/circle-check-big";
    import CircleAlert from "@lucide/svelte/icons/circle-alert";
    import ListTodo from "@lucide/svelte/icons/list-todo";
    import NotebookText from "@lucide/svelte/icons/notebook-text";
    import Star from "@lucide/svelte/icons/star";
    import Activity from "@lucide/svelte/icons/activity";
    import Clock3 from "@lucide/svelte/icons/clock-3";
    import Tags from "@lucide/svelte/icons/tags";
    import ChartNoAxesCombined from "@lucide/svelte/icons/chart-no-axes-combined";
    import FolderTree from "@lucide/svelte/icons/folder-tree";
    import Pencil from "@lucide/svelte/icons/pencil";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import CalendarDays from "@lucide/svelte/icons/calendar-days";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import LocateFixed from "@lucide/svelte/icons/locate-fixed";
    import Archive from "@lucide/svelte/icons/archive";
    import ArchiveRestore from "@lucide/svelte/icons/archive-restore";

    export type ProjectIconName =
        | "taskAdd" | "recordAdd" | "projectAdd" | "open" | "target" | "completed"
        | "alert" | "tasks" | "records" | "key" | "activity" | "clock" | "tags"
        | "chart" | "tree" | "edit" | "next" | "calendar" | "delete" | "locate"
        | "archive" | "restore";

    interface Props {
        name: ProjectIconName;
        size?: number;
        strokeWidth?: number;
        class?: string;
        ariaHidden?: boolean;
    }

    let { name, size = 17, strokeWidth = 1.9, class: className = "", ariaHidden = true }: Props = $props();
</script>

{#if name === "taskAdd"}<ListPlus {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "recordAdd"}<NotebookPen {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "projectAdd"}<FolderPlus {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "open"}<ExternalLink {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "target"}<Target {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "completed"}<CircleCheckBig {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "alert"}<CircleAlert {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "tasks"}<ListTodo {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "records"}<NotebookText {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "key"}<Star {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "activity"}<Activity {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "clock"}<Clock3 {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "tags"}<Tags {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "chart"}<ChartNoAxesCombined {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "tree"}<FolderTree {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "edit"}<Pencil {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "next"}<ChevronRight {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "calendar"}<CalendarDays {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "delete"}<Trash2 {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "locate"}<LocateFixed {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "archive"}<Archive {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "restore"}<ArchiveRestore {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{/if}

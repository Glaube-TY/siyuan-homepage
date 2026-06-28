<script lang="ts">
    import Play from "@lucide/svelte/icons/play";
    import Pause from "@lucide/svelte/icons/pause";
    import SkipBack from "@lucide/svelte/icons/skip-back";
    import SkipForward from "@lucide/svelte/icons/skip-forward";
    import Shuffle from "@lucide/svelte/icons/shuffle";
    import Repeat from "@lucide/svelte/icons/repeat";
    import Repeat1 from "@lucide/svelte/icons/repeat-1";
    import Volume2 from "@lucide/svelte/icons/volume-2";
    import VolumeX from "@lucide/svelte/icons/volume-x";
    import ListMusic from "@lucide/svelte/icons/list-music";
    import ListPlus from "@lucide/svelte/icons/list-plus";
    import Heart from "@lucide/svelte/icons/heart";
    import Plus from "@lucide/svelte/icons/plus";
    import Pencil from "@lucide/svelte/icons/pencil";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
    import X from "@lucide/svelte/icons/x";
    import Check from "@lucide/svelte/icons/check";
    import Search from "@lucide/svelte/icons/search";
    import Image from "@lucide/svelte/icons/image";
    import FileText from "@lucide/svelte/icons/file-text";
    import Crosshair from "@lucide/svelte/icons/crosshair";
    import ArrowUp from "@lucide/svelte/icons/arrow-up";
    import ArrowDown from "@lucide/svelte/icons/arrow-down";
    import Maximize2 from "@lucide/svelte/icons/maximize-2";
    import Music from "@lucide/svelte/icons/music";

    export type IconName =
        | "play" | "pause" | "previous" | "next" | "shuffle" | "repeat" | "repeatOne"
        | "volume" | "volumeMuted" | "queue" | "queueAdd" | "listMusic"
        | "locate" | "heart" | "heartFilled" | "add" | "edit" | "trash" | "more"
        | "close" | "remove" | "check" | "search" | "lyrics" | "cover"
        | "sortAsc" | "sortDesc" | "playlist" | "playlistAdd" | "detail" | "musicNote";

    interface Props {
        name: IconName;
        size?: number;
        class?: string;
        strokeWidth?: number;
        ariaHidden?: boolean;
    }

    let {
        name,
        size = 18,
        class: className = "",
        strokeWidth = 2,
        ariaHidden = true,
    }: Props = $props();
</script>

{#if name === "play"}
    <Play {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "pause"}
    <Pause {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "previous"}
    <SkipBack {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "next"}
    <SkipForward {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "shuffle"}
    <Shuffle {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "repeat"}
    <Repeat {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "repeatOne"}
    <Repeat1 {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "volume"}
    <Volume2 {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "volumeMuted"}
    <VolumeX {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "queue" || name === "playlist" || name === "listMusic"}
    <ListMusic {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "queueAdd" || name === "playlistAdd"}
    <ListPlus {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "heart"}
    <Heart {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "heartFilled"}
    <Heart {size} strokeWidth={strokeWidth} class={className} fill="currentColor" aria-hidden={ariaHidden} />
{:else if name === "add"}
    <Plus {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "edit"}
    <Pencil {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "trash"}
    <Trash2 {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "more"}
    <MoreHorizontal {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "close" || name === "remove"}
    <X {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "check"}
    <Check {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "search"}
    <Search {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "lyrics"}
    <FileText {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "cover"}
    <Image {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "locate"}
    <Crosshair {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "sortAsc"}
    <ArrowUp {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "sortDesc"}
    <ArrowDown {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "detail"}
    <Maximize2 {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "musicNote"}
    <Music {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{/if}

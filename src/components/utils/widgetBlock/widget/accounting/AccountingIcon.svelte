<script lang="ts">
    import Wallet from "@lucide/svelte/icons/wallet";
    import TrendingUp from "@lucide/svelte/icons/trending-up";
    import TrendingDown from "@lucide/svelte/icons/trending-down";
    import Plus from "@lucide/svelte/icons/plus";
    import Maximize2 from "@lucide/svelte/icons/maximize-2";
    import ReceiptText from "@lucide/svelte/icons/receipt-text";
    import ChartPie from "@lucide/svelte/icons/chart-pie";
    import ChartColumn from "@lucide/svelte/icons/chart-column";
    import CalendarDays from "@lucide/svelte/icons/calendar-days";
    import Tags from "@lucide/svelte/icons/tags";
    import Pencil from "@lucide/svelte/icons/pencil";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import Search from "@lucide/svelte/icons/search";
    import X from "@lucide/svelte/icons/x";
    import Check from "@lucide/svelte/icons/check";
    import Gauge from "@lucide/svelte/icons/gauge";
    // 分类图标
    import UtensilsCrossed from "@lucide/svelte/icons/utensils-crossed";
    import ShoppingBag from "@lucide/svelte/icons/shopping-bag";
    import Home from "@lucide/svelte/icons/home";
    import Plane from "@lucide/svelte/icons/plane";
    import BookOpen from "@lucide/svelte/icons/book-open";
    import Building2 from "@lucide/svelte/icons/building-2";
    import Gamepad2 from "@lucide/svelte/icons/gamepad-2";
    import Gift from "@lucide/svelte/icons/gift";
    import Dumbbell from "@lucide/svelte/icons/dumbbell";
    import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
    import Briefcase from "@lucide/svelte/icons/briefcase";
    import Award from "@lucide/svelte/icons/award";
    import Hand from "@lucide/svelte/icons/hand";
    import Receipt from "@lucide/svelte/icons/receipt";
    import ArrowRightLeft from "@lucide/svelte/icons/arrow-right-left";
    import PiggyBank from "@lucide/svelte/icons/piggy-bank";
    import ArrowUpWideNarrow from "@lucide/svelte/icons/arrow-up-wide-narrow";
    import Coins from "@lucide/svelte/icons/coins";
    import Banknote from "@lucide/svelte/icons/banknote";
    import Landmark from "@lucide/svelte/icons/landmark";
    import Apple from "@lucide/svelte/icons/apple";
    import Coffee from "@lucide/svelte/icons/coffee";
    import Shirt from "@lucide/svelte/icons/shirt";
    import Train from "@lucide/svelte/icons/train";
    import Car from "@lucide/svelte/icons/car";
    import Smartphone from "@lucide/svelte/icons/smartphone";
    import Tv from "@lucide/svelte/icons/tv";
    import Wifi from "@lucide/svelte/icons/wifi";
    import Tent from "@lucide/svelte/icons/tent";
    import Mountain from "@lucide/svelte/icons/mountain";
    import Music from "@lucide/svelte/icons/music";
    import Clapperboard from "@lucide/svelte/icons/clapperboard";
    import Stethoscope from "@lucide/svelte/icons/stethoscope";
    import Baby from "@lucide/svelte/icons/baby";
    import PawPrint from "@lucide/svelte/icons/paw-print";
    import Settings from "@lucide/svelte/icons/settings";
    import type { AccountingIconName } from "./accountingIconTypes";
    export type { AccountingIconName };

    interface Props {
        name: AccountingIconName;
        size?: number;
        strokeWidth?: number;
        class?: string;
        ariaHidden?: boolean;
    }

    let {
        name,
        size = 18,
        strokeWidth = 2,
        class: className = "",
        ariaHidden = true,
    }: Props = $props();
</script>

{#if name === "wallet"}
    <Wallet {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "income"}
    <TrendingUp {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "expense"}
    <TrendingDown {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "plus"}
    <Plus {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "open"}
    <Maximize2 {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "records"}
    <ReceiptText {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "chartPie"}
    <ChartPie {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "chartColumn"}
    <ChartColumn {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "calendar"}
    <CalendarDays {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "tags"}
    <Tags {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "edit"}
    <Pencil {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "trash"}
    <Trash2 {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "search"}
    <Search {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "close"}
    <X {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "check"}
    <Check {size} {strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "budget"}
    <Gauge {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "utensils"}
    <UtensilsCrossed {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "shoppingBag"}
    <ShoppingBag {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "home"}
    <Home {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "plane"}
    <Plane {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "bookOpen"}
    <BookOpen {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "building2"}
    <Building2 {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "gamepad2"}
    <Gamepad2 {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "gift"}
    <Gift {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "dumbbell"}
    <Dumbbell {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "moreHorizontal"}
    <MoreHorizontal {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "briefcase"}
    <Briefcase {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "award"}
    <Award {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "hand"}
    <Hand {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "receipt"}
    <Receipt {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "arrowRightLeft"}
    <ArrowRightLeft {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "piggyBank"}
    <PiggyBank {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "arrowUpWideNarrow"}
    <ArrowUpWideNarrow {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "coins"}
    <Coins {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "banknote"}
    <Banknote {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "landmark"}
    <Landmark {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "apple"}
    <Apple {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "coffee"}
    <Coffee {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "shirt"}
    <Shirt {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "train"}
    <Train {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "car"}
    <Car {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "smartphone"}
    <Smartphone {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "tv"}
    <Tv {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "wifi"}
    <Wifi {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "tent"}
    <Tent {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "mountain"}
    <Mountain {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "music"}
    <Music {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "clapperboard"}
    <Clapperboard {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "stethoscope"}
    <Stethoscope {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "baby"}
    <Baby {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
{:else if name === "pawPrint"}
    <PawPrint {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
    {:else if name === "trendingUp"}
    <TrendingUp {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
    {:else if name === "settings"}
    <Settings {size} strokeWidth={strokeWidth} class={className} aria-hidden={ariaHidden} />
    {/if}

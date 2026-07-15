<script lang="ts">
  import Archive from "@lucide/svelte/icons/archive";
  import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Bell from "@lucide/svelte/icons/bell";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Braces from "@lucide/svelte/icons/braces";
  import Briefcase from "@lucide/svelte/icons/briefcase";
  import Cake from "@lucide/svelte/icons/cake";
  import Calendar from "@lucide/svelte/icons/calendar";
  import CalendarCheck from "@lucide/svelte/icons/calendar-check";
  import CalendarClock from "@lucide/svelte/icons/calendar-clock";
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import Check from "@lucide/svelte/icons/check";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Clock from "@lucide/svelte/icons/clock";
  import Copy from "@lucide/svelte/icons/copy";
  import CreditCard from "@lucide/svelte/icons/credit-card";
  import Database from "@lucide/svelte/icons/database";
  import DatabaseBackup from "@lucide/svelte/icons/database-backup";
  import Download from "@lucide/svelte/icons/download";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import FileText from "@lucide/svelte/icons/file-text";
  import Flag from "@lucide/svelte/icons/flag";
  import Folder from "@lucide/svelte/icons/folder";
  import Gift from "@lucide/svelte/icons/gift";
  import GraduationCap from "@lucide/svelte/icons/graduation-cap";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Heart from "@lucide/svelte/icons/heart";
  import House from "@lucide/svelte/icons/house";
  import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
  import List from "@lucide/svelte/icons/list";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Save from "@lucide/svelte/icons/save";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import Sheet from "@lucide/svelte/icons/sheet";
  import SquareCheckBig from "@lucide/svelte/icons/square-check-big";
  import Star from "@lucide/svelte/icons/star";
  import Table2 from "@lucide/svelte/icons/table-2";
  import Tags from "@lucide/svelte/icons/tags";
  import Target from "@lucide/svelte/icons/target";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Upload from "@lucide/svelte/icons/upload";
  import X from "@lucide/svelte/icons/x";

  type CountdownIconType = "lucide" | "emoji";

  interface Props {
    name?: string;
    size?: number;
    label?: string;
    iconType?: CountdownIconType;
  }

  let {
    name = "calendar",
    size = 18,
    label = "",
    iconType = "lucide",
  }: Props = $props();

  const registry = {
    calendar: Calendar,
    cake: Cake,
    heart: Heart,
    flag: Flag,
    clock: Clock,
    briefcase: Briefcase,
    graduation: GraduationCap,
    file: FileText,
    "credit-card": CreditCard,
    home: House,
    star: Star,
    bell: Bell,
    gift: Gift,
    bookmark: Bookmark,
    target: Target,
    add: Plus,
    close: X,
    overview: LayoutDashboard,
    events: List,
    settings: Settings,
    today: CalendarCheck,
    "next-7": CalendarClock,
    "next-30": CalendarDays,
    "high-priority": CircleAlert,
    all: ListChecks,
    refresh: RefreshCw,
    edit: Pencil,
    delete: Trash2,
    upload: Upload,
    download: Download,
    backup: DatabaseBackup,
    restore: RotateCcw,
    archive: Archive,
    "archive-restore": ArchiveRestore,
    copy: Copy,
    "external-link": ExternalLink,
    filter: ListFilter,
    select: SquareCheckBig,
    drag: GripVertical,
    "arrow-left": ArrowLeft,
    "chevron-left": ChevronLeft,
    "chevron-right": ChevronRight,
    save: Save,
    categories: Tags,
    data: Database,
    check: Check,
    search: Search,
    folder: Folder,
    json: Braces,
    csv: Table2,
    sheet: Sheet,
  } as const;

  type RegistryName = keyof typeof registry;
  const ResolvedIcon = $derived(
    iconType === "lucide" && name in registry
      ? registry[name as RegistryName]
      : null,
  );
</script>

<span
  class="shp-countdown-icon"
  class:emoji={!ResolvedIcon}
  style={`width:${size}px;height:${size}px`}
  role={label ? "img" : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : "true"}
>
  {#if ResolvedIcon}<ResolvedIcon
      {size}
      strokeWidth={1.8}
      aria-hidden="true"
    />{:else}<span style={`font-size:${size}px`}>{name}</span>{/if}
</span>

<style>
  .shp-countdown-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    color: currentColor;
    flex: 0 0 auto;
  }
  .shp-countdown-icon :global(svg) {
    display: block;
  }
  .shp-countdown-icon.emoji > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>

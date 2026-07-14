export type SiyuanIconName =
    | "overview"
    | "tasks"
    | "projects"
    | "records"
    | "review"
    | "more"
    | "calendar"
    | "notifications"
    | "settings"
    | "plans"
    | "create"
    | "template"
    | "warning"
    | "migrate"
    | "diary"
    | "close"
    | "open"
    | "style"
    | "drag"
    | "refresh"
    | "delete"
    | "hide"
    | "folder"
    | "search"
    | "confirm"
    | "cancel"
    | "previous"
    | "next"
    | "vip"
    | string;

export const SIYUAN_ICON_MAP: Record<string, string> = {
    overview: "iconWorkspace",
    tasks: "iconCheck",
    projects: "iconTags",
    records: "iconEdit",
    review: "iconRefresh",
    more: "iconMore",
    calendar: "iconCalendar",
    plans: "iconClock",
    notifications: "iconInbox",
    settings: "iconSettings",
    create: "iconAdd",
    template: "iconMarkdown",
    warning: "iconInfo",
    migrate: "iconMove",
    diary: "iconFile",
    close: "iconClose",
    open: "iconOpen",
    style: "iconTheme",
    drag: "iconMove",
    refresh: "iconRefresh",
    delete: "iconTrashcan",
    hide: "iconEyeoff",
    folder: "iconFolder",
    search: "iconSearch",
    confirm: "iconCheck",
    cancel: "iconClose",
    previous: "iconLeft",
    next: "iconRight",
    vip: "iconVIP",
    lock: "iconVIP",
    check: "iconCheck",
    edit: "iconEdit",
};

export function resolveSiyuanIconId(name: SiyuanIconName): string {
    return SIYUAN_ICON_MAP[name] || name;
}

export function renderSiyuanIcon(name: SiyuanIconName, size = 14, className = "homepage-siyuan-icon"): string {
    const iconId = resolveSiyuanIconId(name);
    return `<svg class="${className}" style="width:${size}px;height:${size}px;display:inline-block;flex-shrink:0;fill:currentColor;color:currentColor;vertical-align:-0.15em;" aria-hidden="true"><use href="#${iconId}" xlink:href="#${iconId}"></use></svg>`;
}

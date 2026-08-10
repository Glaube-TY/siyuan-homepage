import type { WidgetPresentationManifest } from "./types";

export const LEGACY_WIDGET_ICON_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
    "documents.recent": "iconFile",
    "documents.favorite": "iconBookmark",
    "journal.recent": "iconCalendar",
    "task.list": "iconCheck",
    documents: "iconFile",
    list: "iconList",
    stat: "iconGraph",
    tasks: "iconCheck",
    chart: "iconGraph",
    calendar: "iconCalendar",
    note: "iconEdit",
    media: "iconRecord",
    utility: "iconTools",
    embed: "iconLink",
    complex: "iconWorkspace",
});

export function resolveWidgetPresentationIcon(
    semanticIcon: string,
    manifest?: WidgetPresentationManifest,
): string | undefined {
    const themedIcon = manifest?.icons?.[semanticIcon];
    if (typeof themedIcon === "string" && themedIcon.trim()) return themedIcon.trim();
    return LEGACY_WIDGET_ICON_FALLBACKS[semanticIcon];
}

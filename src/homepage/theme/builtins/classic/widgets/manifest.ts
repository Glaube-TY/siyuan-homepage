import { WIDGET_PRESENTATION_CONTRACT_VERSION, type WidgetPresentationManifest } from "../../../widgetPresentation/types";

export const classicWidgetPresentation: WidgetPresentationManifest = Object.freeze({
    contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
    generic: Object.freeze({ id: "classic.legacy" }),
    icons: Object.freeze({
        "documents.recent": "iconFile",
        "documents.favorite": "iconBookmark",
        "journal.recent": "iconCalendar",
        "task.list": "iconCheck",
    }),
});

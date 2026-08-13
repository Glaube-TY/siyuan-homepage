import { WIDGET_PRESENTATION_CONTRACT_VERSION, type WidgetPresentationManifest } from "../../../widgetPresentation/types";

export const technologyWidgetPresentation: WidgetPresentationManifest = Object.freeze({
    contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
    shell: Object.freeze({
        id: "technology.hud",
        variants: 3,
        exclude: Object.freeze({
            widgetTypes: Object.freeze(["PicCaro"]),
            presentationVariants: Object.freeze(["timedate.dial"]),
        }),
        tokens: Object.freeze({
            background: "var(--hp-tech-panel)",
            border: "1px solid var(--hp-tech-line)",
            borderRadius: "3px",
            boxShadow: "var(--hp-tech-shadow)",
        }),
    }),
    generic: Object.freeze({ id: "technology.workspace.generic" }),
    categories: Object.freeze({
        collection: Object.freeze({ id: "technology.workspace.collection" }),
        metrics: Object.freeze({ id: "technology.workspace.metrics" }),
        visualization: Object.freeze({ id: "technology.workspace.visualization" }),
        editorial: Object.freeze({ id: "technology.workspace.editorial" }),
        media: Object.freeze({ id: "technology.workspace.media" }),
        control: Object.freeze({ id: "technology.workspace.control" }),
        embedded: Object.freeze({ id: "technology.workspace.embedded" }),
        workspace: Object.freeze({ id: "technology.workspace.workspace" }),
        intrinsic: Object.freeze({ id: "technology.workspace.intrinsic" }),
    }),
    icons: Object.freeze({
        "documents.recent": "iconFile",
        "documents.favorite": "iconBookmark",
        "journal.recent": "iconCalendar",
        "task.list": "iconCheck",
        documents: "iconFile",
        tasks: "iconCheck",
        list: "iconList",
        stat: "iconGraph",
        chart: "iconGraph",
        calendar: "iconCalendar",
        note: "iconEdit",
        media: "iconRecord",
        utility: "iconTools",
        embed: "iconLink",
        complex: "iconWorkspace",
    }),
});

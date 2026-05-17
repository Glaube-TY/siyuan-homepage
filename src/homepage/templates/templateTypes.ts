export interface LayoutTemplateItem {
    widgetId: string;
    order: number;
    colSpan: number;
    rowSpan: number;
    style?: Record<string, unknown>;
    hidden?: boolean;
}

export interface LayoutTemplatePackage {
    id: string;
    name: string;
    description: string;
    kind: "layout";
    savedColumns: number;
    layoutItems: LayoutTemplateItem[];
}

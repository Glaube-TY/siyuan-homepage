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

/**
 * 统一内存表示：旧公开模板和当前模板都归一化到此结构。
 * 不保存分栏结构、sectionId、view 设置或完整布局快照。
 */
export interface SectionLayoutTemplatePayload {
    layoutItems: Array<{
        widgetId: string;
        order: number;
        style: string | null;
        colSpan?: number;
        rowSpan?: number;
        hasContent?: boolean;
    }>;
    widgetConfigs: Record<string, Record<string, unknown>>;
    columns: number;
    gap: number;
}

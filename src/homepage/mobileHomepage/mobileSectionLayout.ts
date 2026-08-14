import type { DeviceLayoutSection, DeviceViewLayout } from "@/homepage/deviceView/deviceViewTypes";

export const MOBILE_ALL_SECTION_ID = "all";
export const DEFAULT_MOBILE_SECTION_ID = "mobile-home";
export const DEFAULT_MOBILE_SECTION_NAME = "主页";

export interface MobileHomepageSection {
    id: string;
    name: string;
    index: number;
    widgetIds: string[];
}

export interface MobileSectionState {
    sections: MobileHomepageSection[];
    assignments: Record<string, string>;
    activeSectionId: string;
}

export type MobileSectionOperation =
    | { type: "assign"; widgetId: string; sectionId: string }
    | { type: "create"; sectionId: string; name: string }
    | { type: "rename"; sectionId: string; name: string }
    | { type: "delete"; sectionId: string }
    | { type: "move"; sectionId: string; direction: -1 | 1 };

function normalizeSectionName(value: string): string {
    const name = value.trim();
    if (!name) throw new Error("分区名称不能为空");
    if (name.length > 30) throw new Error("分区名称不能超过 30 个字符");
    return name;
}

function readNamedSections(layout: DeviceViewLayout): MobileHomepageSection[] {
    const orderIds = new Set(layout.order.map((item) => item.id));
    const sections = Object.entries(layout.sections || {})
        .filter(([, section]) => typeof section.name === "string" && Boolean(section.name.trim()))
        .map(([id, section], sourceIndex) => ({
            id,
            name: section.name!.trim(),
            index: Number.isInteger(section.index) ? section.index! : sourceIndex,
            widgetIds: section.widgetIds.filter((widgetId) => orderIds.has(widgetId)),
        }))
        .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name, "zh-CN"));

    if (sections.length === 0) {
        return [{
            id: DEFAULT_MOBILE_SECTION_ID,
            name: DEFAULT_MOBILE_SECTION_NAME,
            index: 0,
            widgetIds: layout.order.map((item) => item.id),
        }];
    }

    const assigned = new Set<string>();
    for (const section of sections) {
        section.widgetIds = section.widgetIds.filter((widgetId) => {
            if (assigned.has(widgetId)) return false;
            assigned.add(widgetId);
            return true;
        });
    }
    for (const item of layout.order) {
        if (!assigned.has(item.id)) sections[0].widgetIds.push(item.id);
    }
    return sections.map((section, index) => ({ ...section, index }));
}

function writeSections(
    layout: DeviceViewLayout,
    sections: MobileHomepageSection[],
    activeSectionId?: string,
): DeviceViewLayout {
    const persisted: Record<string, DeviceLayoutSection> = Object.fromEntries(
        sections.map((section, index) => [
            section.id,
            {
                name: normalizeSectionName(section.name),
                index,
                widgetIds: [...section.widgetIds],
            },
        ]),
    );
    const nextActiveSectionId = persisted[activeSectionId || ""]
        ? activeSectionId!
        : sections[0].id;
    return {
        ...layout,
        sections: persisted,
        activeSectionId: nextActiveSectionId,
        componentSectionsModeEnabled: true,
    };
}

export function applyMobileSectionOperation(
    layout: DeviceViewLayout,
    operation?: MobileSectionOperation,
): DeviceViewLayout {
    const sections = readNamedSections(layout).map((section) => ({
        ...section,
        widgetIds: [...section.widgetIds],
    }));
    if (!operation) return writeSections(layout, sections, layout.activeSectionId);

    if (operation.type === "assign") {
        if (!layout.order.some((item) => item.id === operation.widgetId)) {
            throw new Error(`移动主页分区设置引用了不存在的组件 ${operation.widgetId}`);
        }
        const target = sections.find((section) => section.id === operation.sectionId);
        if (!target) throw new Error("目标分区不存在");
        for (const section of sections) {
            section.widgetIds = section.widgetIds.filter((id) => id !== operation.widgetId);
        }
        target.widgetIds.push(operation.widgetId);
    } else if (operation.type === "create") {
        if (sections.some((section) => section.id === operation.sectionId)) {
            throw new Error("分区 ID 已存在");
        }
        const name = normalizeSectionName(operation.name);
        if (sections.some((section) => section.name === name)) {
            throw new Error(`分区“${name}”已存在`);
        }
        sections.push({
            id: operation.sectionId,
            name,
            index: sections.length,
            widgetIds: [],
        });
    } else if (operation.type === "rename") {
        const target = sections.find((section) => section.id === operation.sectionId);
        if (!target) throw new Error("要重命名的分区不存在");
        const name = normalizeSectionName(operation.name);
        if (sections.some((section) => section.id !== target.id && section.name === name)) {
            throw new Error(`分区“${name}”已存在`);
        }
        target.name = name;
    } else if (operation.type === "delete") {
        if (sections.length <= 1) throw new Error("移动主页至少需要保留一个分区");
        const targetIndex = sections.findIndex((section) => section.id === operation.sectionId);
        if (targetIndex < 0) throw new Error("要删除的分区不存在");
        const [removed] = sections.splice(targetIndex, 1);
        const fallback = sections[Math.min(targetIndex, sections.length - 1)];
        fallback.widgetIds.push(...removed.widgetIds);
    } else {
        const currentIndex = sections.findIndex((section) => section.id === operation.sectionId);
        if (currentIndex < 0) throw new Error("要移动的分区不存在");
        const nextIndex = currentIndex + operation.direction;
        if (nextIndex >= 0 && nextIndex < sections.length) {
            [sections[currentIndex], sections[nextIndex]] = [sections[nextIndex], sections[currentIndex]];
        }
    }

    return writeSections(layout, sections, layout.activeSectionId);
}

export function readMobileSectionState(layout: DeviceViewLayout | null): MobileSectionState {
    if (!layout) {
        return {
            sections: [{ id: DEFAULT_MOBILE_SECTION_ID, name: DEFAULT_MOBILE_SECTION_NAME, index: 0, widgetIds: [] }],
            assignments: {},
            activeSectionId: DEFAULT_MOBILE_SECTION_ID,
        };
    }
    const sections = readNamedSections(layout);
    const assignments: Record<string, string> = {};
    for (const section of sections) {
        for (const widgetId of section.widgetIds) assignments[widgetId] = section.id;
    }
    const activeSectionId = sections.some((section) => section.id === layout.activeSectionId)
        ? layout.activeSectionId!
        : sections[0].id;
    return { sections, assignments, activeSectionId };
}

export function createMobileSectionId(): string {
    return `mobile-section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

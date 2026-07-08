export type MobileQuickActionId = "accounting-record" | "mobile-homepage" | "ai-knowledge-base" | "quick-notes" | "mobile-settings";

export interface MobileQuickActionSetting {
    id: MobileQuickActionId;
    enabled: boolean;
    order: number;
}

export interface MobileQuickActionDefinition {
    id: MobileQuickActionId;
    label: string;
    description: string;
    icon: string;
}

export type MobileQuickActionsDockSide = "left" | "right";

export interface MobileQuickActionsPosition {
    side: MobileQuickActionsDockSide;
    y: number;
}

export const DEFAULT_MOBILE_QUICK_ACTION_BUTTON_SIZE = 52;
export const MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE = 44;
export const MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE = 72;
export const DEFAULT_MOBILE_QUICK_ACTION_EDGE_GAP = 14;
export const DEFAULT_MOBILE_QUICK_ACTION_BOTTOM_GAP = 18;
export const DEFAULT_MOBILE_QUICK_ACTION_TOP_GAP = 14;

export const MOBILE_QUICK_ACTION_DEFINITIONS: MobileQuickActionDefinition[] = [
    {
        id: "accounting-record",
        label: "记一笔",
        description: "快速记录收支",
        icon: "wallet",
    },
    {
        id: "mobile-homepage",
        label: "打开主页",
        description: "打开移动端主页",
        icon: "iconhomepage",
    },
    {
        id: "ai-knowledge-base",
        label: "AI 知识库",
        description: "打开移动端知识库",
        icon: "iconNotebrain",
    },
    {
        id: "quick-notes",
        label: "快速笔记",
        description: "记录到快速笔记",
        icon: "edit",
    },
    {
        id: "mobile-settings",
        label: "设置",
        description: "调整移动端入口",
        icon: "settings",
    },
];

const KNOWN_MOBILE_QUICK_ACTION_IDS = new Set<MobileQuickActionId>(
    MOBILE_QUICK_ACTION_DEFINITIONS.map((item) => item.id),
);

export function isMobileQuickActionId(value: unknown): value is MobileQuickActionId {
    return typeof value === "string" && KNOWN_MOBILE_QUICK_ACTION_IDS.has(value as MobileQuickActionId);
}

export function normalizeMobileQuickActionItems(value: unknown): MobileQuickActionSetting[] {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set<MobileQuickActionId>();
    const normalized: MobileQuickActionSetting[] = [];

    for (const item of source) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        if (!isMobileQuickActionId(raw.id) || seen.has(raw.id)) continue;

        const order = Number(raw.order);
        normalized.push({
            id: raw.id,
            enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
            order: Number.isFinite(order) ? order : normalized.length,
        });
        seen.add(raw.id);
    }

    normalized.sort((a, b) => a.order - b.order);

    for (const definition of MOBILE_QUICK_ACTION_DEFINITIONS) {
        if (seen.has(definition.id)) continue;
        normalized.push({
            id: definition.id,
            enabled: true,
            order: normalized.length,
        });
    }

    return normalized.map((item, index) => ({
        ...item,
        order: index,
    }));
}

export function normalizeMobileQuickActionButtonSize(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_MOBILE_QUICK_ACTION_BUTTON_SIZE;
    return Math.min(
        MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        Math.max(MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE, Math.round(num)),
    );
}

export function normalizeMobileQuickActionsPosition(
    value: unknown,
    options: {
        viewportHeight?: number;
        buttonSize?: number;
        topGap?: number;
        bottomGap?: number;
    } = {},
): MobileQuickActionsPosition {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const side: MobileQuickActionsDockSide = raw.side === "left" ? "left" : "right";
    const buttonSize = normalizeMobileQuickActionButtonSize(options.buttonSize);
    const topGap = Number.isFinite(Number(options.topGap)) ? Number(options.topGap) : DEFAULT_MOBILE_QUICK_ACTION_TOP_GAP;
    const bottomGap = Number.isFinite(Number(options.bottomGap)) ? Number(options.bottomGap) : DEFAULT_MOBILE_QUICK_ACTION_BOTTOM_GAP;
    const viewportHeight = Number(options.viewportHeight);
    const defaultY = Number.isFinite(viewportHeight) && viewportHeight > 0
        ? viewportHeight - buttonSize - bottomGap
        : DEFAULT_MOBILE_QUICK_ACTION_BOTTOM_GAP;
    const rawY = Number(raw.y);
    const y = Number.isFinite(rawY) && rawY >= 0 ? rawY : defaultY;

    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
        return {
            side,
            y: Math.max(0, Math.round(y)),
        };
    }

    const maxY = Math.max(topGap, viewportHeight - buttonSize - bottomGap);
    return {
        side,
        y: Math.round(Math.min(maxY, Math.max(topGap, y))),
    };
}

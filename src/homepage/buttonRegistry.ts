export interface HomepageButtonItem {
    id: number;
    label: string;
    checked: boolean;
    shortcut: string;
    order: number;
    action?: string;
}

export const CORE_ACTIONS = ["search", "diary", "addWidget", "cleanEmptyDocs", "templateCenter", "settings"] as const;
export type CoreAction = typeof CORE_ACTIONS[number];

const LABEL_TO_ACTION: Record<string, CoreAction> = {
    "🔍 搜索笔记": "search",
    "📅 今日日记": "diary",
    "➕ 添加组件": "addWidget",
    "⚙ 主页设置": "settings",
};

const PROTECTED_ACTIONS: CoreAction[] = ["addWidget", "settings", "cleanEmptyDocs", "templateCenter"];

export function createDefaultButtons(): HomepageButtonItem[] {
    return [
        { id: 1728000000000, label: "🔍 搜索笔记", checked: true, shortcut: "Ctrl+P", order: 0, action: "search" },
        { id: 1728000001000, label: "📅 今日日记", checked: true, shortcut: "Alt+5", order: 1, action: "diary" },
        { id: 1728000002000, label: "➕ 添加组件", checked: true, shortcut: "", order: 2, action: "addWidget" },
        { id: 1728000002400, label: "🎨 布局模板", checked: true, shortcut: "", order: 3, action: "templateCenter" },
        { id: 1728000002500, label: "🧹 清理空文档", checked: true, shortcut: "", order: 4, action: "cleanEmptyDocs" },
        { id: 1728000003000, label: "⚙ 主页设置", checked: true, shortcut: "", order: 5, action: "settings" },
    ];
}

function normalizeNumber(value: unknown, defaultValue: number, min?: number, max?: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    let result = num;
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
    return result;
}

function normalizeString(value: unknown, defaultValue: string): string {
    return typeof value === "string" ? value : defaultValue;
}

function normalizeBoolean(value: unknown, defaultValue: boolean): boolean {
    return typeof value === "boolean" ? value : defaultValue;
}

export function normalizeButtonsList(rawList: unknown): HomepageButtonItem[] {
    if (!Array.isArray(rawList) || rawList.length === 0) {
        return createDefaultButtons();
    }

    const normalized = rawList.map((item, index): HomepageButtonItem => {
        const raw = item as Record<string, unknown>;
        let action: string | undefined = typeof raw?.action === "string" ? raw.action : undefined;

        // 对旧默认按钮按 label 回填 action
        if (!action && raw?.label && typeof raw.label === "string") {
            action = LABEL_TO_ACTION[raw.label];
        }

        return {
            id: normalizeNumber(raw?.id, Date.now() + index),
            label: normalizeString(raw?.label, ""),
            checked: normalizeBoolean(raw?.checked, true),
            shortcut: normalizeString(raw?.shortcut, ""),
            order: normalizeNumber(raw?.order, index),
            action,
        };
    });

    // 老用户：如果不存在 action === "cleanEmptyDocs"，追加内置按钮（checked: false）
    const hasCleanEmptyDocs = normalized.some((item) => item.action === "cleanEmptyDocs");
    if (!hasCleanEmptyDocs) {
        const maxOrder = normalized.length > 0 ? Math.max(...normalized.map((b) => b.order)) : -1;
        normalized.push({
            id: 1728000002500,
            label: "🧹 清理空文档",
            checked: false,
            shortcut: "",
            order: maxOrder + 1,
            action: "cleanEmptyDocs",
        });
    }

    // 老用户：如果不存在 action === "templateCenter"，追加内置按钮（checked: false）
    const hasTemplateCenter = normalized.some((item) => item.action === "templateCenter");
    if (!hasTemplateCenter) {
        const maxOrder = normalized.length > 0 ? Math.max(...normalized.map((b) => b.order)) : -1;
        normalized.push({
            id: 1728000002400,
            label: "🎨 布局模板",
            checked: false,
            shortcut: "",
            order: maxOrder + 1,
            action: "templateCenter",
        });
    }

    // 统一 templateCenter 内置按钮 label，老用户旧 label 强制刷新
    for (const item of normalized) {
        if (item.action === "templateCenter") {
            item.label = "🎨 布局模板";
        }
    }

    return normalized;
}

export function isCoreButton(button: { action?: string; label: string }): boolean {
    if (button.action && PROTECTED_ACTIONS.includes(button.action as CoreAction)) {
        return true;
    }
    return false;
}

export interface ButtonActionMeta {
    action: string;
    title: string;
    badge?: string;
    description: string;
    sourceText?: string;
    sourceName?: string;
    sourceUrl?: string;
    usage?: string[];
    safety?: string[];
}

const BUTTON_ACTION_META: Record<string, ButtonActionMeta> = {
    addWidget: {
        action: "addWidget",
        title: "➕ 添加组件",
        badge: "内置功能",
        description: "打开组件添加入口，用于向主页添加新的功能组件。",
        usage: [
            "点击后可以选择并添加主页组件。",
            "添加后组件会进入主页组件区，并参与当前布局。",
        ],
    },
    settings: {
        action: "settings",
        title: "⚙ 主页设置",
        badge: "内置功能",
        description: "打开主页设置窗口，用于调整主页行为、横幅、标题、按钮、组件和样式。",
        usage: [
            "点击后进入当前设置界面。",
            "这是插件主页配置的主要入口。",
        ],
    },
    cleanEmptyDocs: {
        action: "cleanEmptyDocs",
        title: "🧹 清理空文档",
        badge: "迁移优化",
        description: "扫描当前工作空间中的空文档，支持预览、多选和删除前复检。",
        sourceText: "该功能来自作者的独立项目，已迁移并针对当前主页插件优化。",
        sourceName: "siyuan-empty-doc-cleaner",
        sourceUrl: "https://github.com/Glaube-TY/siyuan-empty-doc-cleaner",
        usage: [
            "点击快捷按钮后会打开清理空文档弹窗。",
            "弹窗会列出检测到的叶子空文档。",
            "可以先预览文档内容，再勾选需要删除的文档。",
        ],
        safety: [
            "默认只扫描叶子空文档，避免误删包含子文档的父文档。",
            "删除前会再次校验文档是否仍为空。",
            "删除前需要二次确认。",
        ],
    },
    templateCenter: {
        action: "templateCenter",
        title: "🎨 布局模板",
        badge: "会员功能",
        description: "打开布局模板中心，保存和应用你自己的主页布局方案。",
        usage: [
            "点击后打开布局模板弹窗。",
            "会员用户可以把当前主页布局保存为模板。",
            "以后可以一键恢复自己的布局方案。",
        ],
        safety: [
            "布局模板只作用于当前设备主主页。",
            "只保存组件分布、尺寸和样式，不保存组件内容。",
            "不会修改侧边栏和移动端主页布局。",
            "应用前会自动备份。",
        ],
    },
};

export function getButtonActionMeta(button: { action?: string }): ButtonActionMeta | null {
    if (button.action && BUTTON_ACTION_META[button.action]) {
        return BUTTON_ACTION_META[button.action];
    }
    return null;
}

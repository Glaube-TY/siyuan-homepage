export interface TemplateBackupEntry {
    id: string;
    createdAt: number;
    templateId?: string;
    templateName?: string;
    deviceId: string | null;
    reason: string;
    widgetLayoutSnapshot: any;
    createdWidgetIds?: string[];
}

export const TEMPLATE_BACKUP_FILE = "homepageTemplateBackups.json";

const MAX_BACKUP_COUNT = 3;

const EMPTY_LAYOUT = { defaultOrder: [], profiles: {} };

export async function loadTemplateBackups(plugin: any): Promise<TemplateBackupEntry[]> {
    try {
        const data = await plugin.loadData(TEMPLATE_BACKUP_FILE);
        if (!Array.isArray(data)) {
            return [];
        }
        return data;
    } catch {
        return [];
    }
}

async function safeLoadWidgetLayoutSnapshot(plugin: any): Promise<any> {
    try {
        const layout = await plugin.loadData("widgetLayout.json");
        return layout ?? EMPTY_LAYOUT;
    } catch {
        console.warn("[TemplateBackup] 读取 widgetLayout.json 失败，将使用空布局快照");
        return EMPTY_LAYOUT;
    }
}

export async function createTemplateBackup(
    plugin: any,
    input: {
        templateId?: string;
        templateName?: string;
        deviceId: string | null;
        reason: string;
        createdWidgetIds?: string[];
    },
): Promise<TemplateBackupEntry> {
    const widgetLayout = await safeLoadWidgetLayoutSnapshot(plugin);

    const backup: TemplateBackupEntry = {
        id: `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        templateId: input.templateId,
        templateName: input.templateName,
        deviceId: input.deviceId,
        reason: input.reason,
        widgetLayoutSnapshot: widgetLayout,
        createdWidgetIds: input.createdWidgetIds,
    };

    const backups = await loadTemplateBackups(plugin);
    backups.push(backup);

    const trimmed = backups.slice(-MAX_BACKUP_COUNT);
    await plugin.saveData(TEMPLATE_BACKUP_FILE, trimmed);

    return backup;
}

export async function restoreLatestTemplateBackup(plugin: any): Promise<boolean> {
    const backups = await loadTemplateBackups(plugin);
    if (backups.length === 0) {
        return false;
    }

    const latest = backups[backups.length - 1];
    const snapshot = latest.widgetLayoutSnapshot ?? EMPTY_LAYOUT;

    await plugin.saveData("widgetLayout.json", snapshot);
    return true;
}

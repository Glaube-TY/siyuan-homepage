export type NotificationCenterSubTab = "rules" | "desktop" | "mobile" | "external" | "history";

export const NOTIFICATION_CENTER_SUB_TABS: ReadonlyArray<{
    id: NotificationCenterSubTab;
    label: string;
    requiresAdvanced?: boolean;
}> = [
    { id: "rules", label: "通知规则", requiresAdvanced: true },
    { id: "desktop", label: "桌面通知", requiresAdvanced: true },
    { id: "mobile", label: "移动通知", requiresAdvanced: true },
    { id: "external", label: "外联通知", requiresAdvanced: true },
    { id: "history", label: "发送历史", requiresAdvanced: true },
];

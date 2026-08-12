export type NotificationCenterSubTab = "rules" | "desktop" | "mobile" | "external" | "history";

export const NOTIFICATION_CENTER_SUB_TABS: ReadonlyArray<{
    id: NotificationCenterSubTab;
    label: string;
}> = [
    { id: "rules", label: "通知规则" },
    { id: "desktop", label: "桌面通知" },
    { id: "mobile", label: "移动通知" },
    { id: "external", label: "外联通知" },
    { id: "history", label: "发送历史" },
];

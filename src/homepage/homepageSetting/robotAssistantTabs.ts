export type RobotAssistantSubTab =
    | "general"
    | "wechat"
    | "feishu"
    | "qq"
    | "agent"
    | "sessions"
    | "logs";

export const ROBOT_ASSISTANT_SUB_TABS: ReadonlyArray<{
    id: RobotAssistantSubTab;
    label: string;
    requiresAdvanced?: boolean;
}> = [
    { id: "general", label: "总体设置", requiresAdvanced: true },
    { id: "wechat", label: "微信机器人", requiresAdvanced: true },
    { id: "feishu", label: "飞书机器人", requiresAdvanced: true },
    { id: "qq", label: "QQ 机器人", requiresAdvanced: true },
    { id: "agent", label: "Agent 设置", requiresAdvanced: true },
    { id: "sessions", label: "会话管理", requiresAdvanced: true },
    { id: "logs", label: "消息日志", requiresAdvanced: true },
];

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
}> = [
    { id: "general", label: "总体设置" },
    { id: "wechat", label: "微信机器人" },
    { id: "feishu", label: "飞书机器人" },
    { id: "qq", label: "QQ 机器人" },
    { id: "agent", label: "Agent 设置" },
    { id: "sessions", label: "会话管理" },
    { id: "logs", label: "消息日志" },
];

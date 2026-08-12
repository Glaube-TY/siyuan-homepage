import { AI_KNOWLEDGE_BASE_SUB_TABS, type AiKnowledgeBaseSubTab } from "./aiKnowledgeBaseTabs";
import { NOTIFICATION_CENTER_SUB_TABS, type NotificationCenterSubTab } from "./notificationCenterTabs";
import { ROBOT_ASSISTANT_SUB_TABS, type RobotAssistantSubTab } from "./robotAssistantTabs";
import { mainTabs, subTabs } from "./tabDefs";
import type { HomepageSettingMainTab, HomepageSettingSubTab } from "./types";

export type SettingScope =
    | "all-devices"
    | "current-device"
    | "mobile-shared";

export type SettingSearchSubTab =
    | HomepageSettingSubTab
    | AiKnowledgeBaseSubTab
    | NotificationCenterSubTab
    | RobotAssistantSubTab;

export interface SettingSearchEntry {
    id: string;
    mainTab: HomepageSettingMainTab;
    subTab?: SettingSearchSubTab;
    section?: string;
    title: string;
    description: string;
    scope: SettingScope;
    keywords?: readonly string[];
    target: "row" | "section";
}

export interface SettingSearchResult extends SettingSearchEntry {
    mainTabLabel: string;
    subTabLabel?: string;
    scopeLabel: string;
    pathLabel: string;
    score: number;
}

export type SettingsSaveStatus = "idle" | "pending" | "saving" | "saved" | "synced" | "error";

export const SETTING_SCOPE_LABELS: Readonly<Record<SettingScope, string>> = {
    "all-devices": "全部设备",
    "current-device": "当前设备",
    "mobile-shared": "所有移动端",
};

interface EntryDefaults {
    mainTab: HomepageSettingMainTab;
    subTab?: SettingSearchSubTab;
    section?: string;
    scope: SettingScope;
}

type EntryInput = Omit<SettingSearchEntry, keyof EntryDefaults | "target"> & {
    target?: SettingSearchEntry["target"];
};

function defineSettings(defaults: EntryDefaults, entries: readonly EntryInput[]): SettingSearchEntry[] {
    return entries.map((entry) => ({
        ...defaults,
        ...entry,
        target: entry.target ?? "row",
    }));
}

const SETTINGS_SEARCH_REGISTRY: readonly SettingSearchEntry[] = [
    ...defineSettings(
        { mainTab: "homepage", subTab: "behavior", section: "主页行为", scope: "current-device" },
        [
            { id: "homepage.behavior.auto-open", title: "自动打开主页", description: "启动思源后自动进入主页", keywords: ["启动", "首页"] },
            { id: "homepage.behavior.sidebar", title: "开启侧边栏👑", description: "在桌面端启用主页侧边栏", keywords: ["边栏", "dock"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "appearance", scope: "current-device" },
        [
            { id: "homepage.appearance.theme", title: "主页主题", description: "选择当前设备桌面主页使用的主题", keywords: ["外观", "经典", "卡片"], target: "section" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "mobile", section: "移动端主页", scope: "mobile-shared" },
        [
            { id: "homepage.mobile.auto-open-enabled", title: "移动端自动打开窗口👑", description: "移动端启动后自动打开所选界面", keywords: ["手机", "启动"] },
            { id: "homepage.mobile.auto-open-target", title: "自动打开", description: "选择移动端启动后默认打开的界面", keywords: ["手机", "主页"] },
            { id: "homepage.mobile.preview", title: "打开手机端主页", description: "在电脑上以手机尺寸编辑移动端主页", keywords: ["预览", "编辑"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "mobile", section: "悬浮快捷按钮", scope: "mobile-shared" },
        [
            { id: "homepage.mobile.quick-actions", title: "开启悬浮快捷按钮", description: "在手机端显示可展开的主页快捷入口", keywords: ["手机", "浮动"] },
            { id: "homepage.mobile.quick-action-size", title: "主按钮大小", description: "设置移动端悬浮主按钮尺寸" },
            { id: "homepage.mobile.quick-action-items", title: "快捷按钮管理", description: "调整移动端快捷入口顺序和显示状态", keywords: ["排序"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "banner", section: "横幅开关", scope: "current-device" },
        [
            { id: "homepage.banner.enabled", title: "启用横幅图片", description: "在主页顶部显示横幅图片", keywords: ["banner"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "banner", section: "横幅设置", scope: "current-device" },
        [
            { id: "homepage.banner.type", title: "横幅类型", description: "选择横幅图片来源类型" },
            { id: "homepage.banner.height", title: "横幅高度", description: "设置主页横幅显示高度" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "banner", section: "图片来源", scope: "current-device" },
        [
            { id: "homepage.banner.source", title: "图片来源", description: "选择使用本地图片或网络图片" },
            { id: "homepage.banner.local-image", title: "选择图片", description: "从本地选择横幅图片", keywords: ["上传"] },
            { id: "homepage.banner.remote-url", title: "图片地址", description: "输入横幅远程图片 URL", keywords: ["网络", "链接"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "banner", section: "Bing 每日一图", scope: "current-device" },
        [
            { id: "homepage.banner.bing-api", title: "远程接口", description: "选择 Bing 每日一图使用的远程接口", keywords: ["bing", "壁纸"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "title", section: "标题图标", scope: "current-device" },
        [
            { id: "homepage.title.icon-enabled", title: "显示标题图标", description: "控制主页标题前的图标是否显示" },
            { id: "homepage.title.icon-type", title: "图标类型", description: "选择表情或图片作为标题图标", keywords: ["emoji"] },
            { id: "homepage.title.emoji", title: "选择表情", description: "设置主页标题使用的表情" },
            { id: "homepage.title.image", title: "选择图片", description: "设置主页标题使用的本地图片" },
            { id: "homepage.title.icon-style", title: "图标样式", description: "设置标题图标的外观形态" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "title", section: "标题文字", scope: "current-device" },
        [
            { id: "homepage.title.text", title: "自定义标题", description: "修改主页顶部显示的标题文字" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "title", section: "标题区域外观", scope: "current-device" },
        [
            { id: "homepage.title.align", title: "标题对齐方式", description: "设置标题、状态语和快捷按钮的对齐方式" },
            { id: "homepage.title.quick-button-style", title: "快捷按钮样式", description: "设置标题区域快捷按钮外观" },
            { id: "homepage.title.banner-title-color", title: "横幅内标题颜色", description: "设置标题融入横幅时的文字颜色" },
            { id: "homepage.title.banner-status-color", title: "横幅内状态语颜色", description: "设置状态语融入横幅时的文字颜色" },
            { id: "homepage.title.banner-button-color", title: "横幅内按钮颜色", description: "设置快捷按钮融入横幅时的颜色" },
            { id: "homepage.title.glass-enabled", title: "横幅毛玻璃层", description: "在横幅标题区域显示毛玻璃背景", keywords: ["玻璃", "模糊"] },
            { id: "homepage.title.glass-color-source", title: "毛玻璃颜色来源", description: "选择主题色或自定义颜色" },
            { id: "homepage.title.glass-color", title: "毛玻璃颜色", description: "设置毛玻璃背景颜色" },
            { id: "homepage.title.glass-opacity", title: "毛玻璃浓度", description: "设置毛玻璃背景透明度" },
            { id: "homepage.title.glass-blur", title: "模糊强度", description: "设置横幅毛玻璃的模糊程度" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "title", section: "状态语", scope: "current-device" },
        [
            { id: "homepage.status.mode", title: "状态语来源", description: "选择自定义或 AI 生成主页状态语" },
            { id: "homepage.status.text", title: "自定义状态语", description: "设置主页标题下方的状态文字", keywords: ["变量"] },
            { id: "homepage.status.prompt", title: "生成提示语", description: "控制 AI 状态语的风格和格式", keywords: ["prompt"] },
            { id: "homepage.status.max-chars", title: "返回字符上限", description: "限制 AI 状态语的最大长度" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "button", section: "快捷按钮管理", scope: "current-device" },
        [
            { id: "homepage.buttons.manage", title: "快捷按钮管理", description: "新增、删除、排序并配置主页快捷按钮", target: "section" },
            { id: "homepage.buttons.label", title: "按钮标签", description: "修改选中快捷按钮显示的文字" },
            { id: "homepage.buttons.shortcut", title: "快捷键", description: "为选中的主页按钮设置组合快捷键" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "widgets", section: "组件布局", scope: "current-device" },
        [
            { id: "homepage.widgets.columns", title: "每行组件数量", description: "设置主页每行显示的组件个数" },
            { id: "homepage.widgets.gap", title: "组件间距", description: "设置主页组件之间的间距" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "widgets", section: "组件分区导航 👑", scope: "current-device" },
        [
            { id: "homepage.widgets.sections", title: "启用分区导航", description: "将主页组件划分到可切换的分区" },
            { id: "homepage.widgets.section-align", title: "导航对齐", description: "设置组件分区导航的水平位置" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "widgets", section: "快速笔记", scope: "all-devices" },
        [
            { id: "homepage.widgets.quick-notes", title: "开启快速笔记", description: "启用主页快速笔记入口" },
            { id: "homepage.widgets.quick-notes-doc", title: "笔记存放位置", description: "设置快速笔记写入的思源文档 ID" },
            { id: "homepage.widgets.quick-notes-position", title: "添加位置", description: "选择新笔记添加到文档顶部或底部" },
            { id: "homepage.widgets.quick-notes-time", title: "启用时间戳", description: "在快速笔记内容前添加创建时间" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "widgets", section: "任务管理 Plus", scope: "all-devices" },
        [
            { id: "homepage.widgets.task-editor", title: "开启任务编辑器", description: "启用任务管理 Plus 编辑功能" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "widgets", section: "文档预览", scope: "all-devices" },
        [
            { id: "homepage.widgets.preview-mode", title: "默认预览模式", description: "设置文档悬浮预览默认使用的模式" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "indexing", scope: "all-devices" },
        [
            { id: "homepage.indexing.all", title: "检索总操作", description: "统一检查或重建主页组件检索数据", target: "section" },
            { id: "homepage.indexing.favorites", title: "收藏文档索引", description: "管理收藏文档组件使用的索引", target: "section" },
            { id: "homepage.indexing.review", title: "复习文档索引", description: "管理复习文档组件使用的索引", target: "section" },
            { id: "homepage.indexing.tasks", title: "任务索引", description: "管理任务组件使用的索引", target: "section" },
            { id: "homepage.indexing.heatmap", title: "热力图索引", description: "管理热力图组件使用的数据索引", target: "section" },
            { id: "homepage.indexing.statistics", title: "统计卡片索引", description: "管理统计卡片使用的数据索引", target: "section" },
            { id: "homepage.indexing.diary", title: "强化日记索引", description: "管理强化日记及项目记录索引", target: "section" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "devices", section: "当前设备", scope: "current-device" },
        [
            { id: "homepage.devices.reset", title: "重置当前界面", description: "清空当前设备桌面主页布局，不删除业务数据", keywords: ["恢复", "清空"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "styles", section: "页脚", scope: "current-device" },
        [
            { id: "homepage.styles.footer", title: "显示页脚", description: "在主页底部显示自定义页脚内容" },
            { id: "homepage.styles.footer-content", title: "页脚内容", description: "设置主页页脚显示的 HTML 内容" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "styles", section: "鼠标样式", scope: "current-device" },
        [
            { id: "homepage.styles.cursor", title: "鼠标图标", description: "选择自定义鼠标指针样式" },
            { id: "homepage.styles.cursor-global", title: "应用于全局", description: "将鼠标样式应用到整个思源笔记", keywords: ["鼠标"] },
            { id: "homepage.styles.mouse-trail", title: "鼠标轨迹", description: "显示鼠标移动轨迹效果" },
            { id: "homepage.styles.click-effect", title: "点击特效", description: "点击时显示特效文字" },
            { id: "homepage.styles.click-content", title: "特效内容", description: "设置点击特效随机显示的文字" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "styles", section: "背景图片", scope: "current-device" },
        [
            { id: "homepage.styles.background", title: "开启背景图片", description: "为主页或思源界面显示背景图片" },
            { id: "homepage.styles.background-global", title: "应用于全局", description: "将背景图片应用到整个思源笔记", keywords: ["背景"] },
            { id: "homepage.styles.background-source", title: "图片来源", description: "选择本地或网络背景图片" },
            { id: "homepage.styles.background-image", title: "选择图片", description: "选择本地背景图片" },
            { id: "homepage.styles.background-url", title: "图片地址", description: "设置远程背景图片地址" },
            { id: "homepage.styles.background-opacity", title: "透明度", description: "设置背景图片显示强度" },
            { id: "homepage.styles.background-blur", title: "模糊", description: "设置背景图片虚化强度" },
        ],
    ),
    ...defineSettings(
        { mainTab: "homepage", subTab: "styles", section: "飘落特效", scope: "current-device" },
        [
            { id: "homepage.styles.falling", title: "开启飘落特效", description: "在页面上显示飘落动画" },
            { id: "homepage.styles.falling-global", title: "应用于全局", description: "将飘落特效应用到整个思源笔记", keywords: ["飘落"] },
            { id: "homepage.styles.falling-icon", title: "飘落图形", description: "选择飘落使用的图形样式" },
            { id: "homepage.styles.falling-density", title: "密度", description: "设置飘落图形数量", keywords: ["飘落"] },
            { id: "homepage.styles.falling-speed", title: "速度", description: "设置飘落图形下落速度", keywords: ["飘落"] },
        ],
    ),
    ...defineSettings(
        { mainTab: "aiKnowledgeBase", subTab: "entries", section: "AI 知识库", scope: "all-devices" },
        [
            { id: "ai.entries.dock", title: "开启侧边栏对话", description: "在右侧侧边栏启用 AI 知识库入口" },
            { id: "ai.entries.tab", title: "开启标签页对话", description: "在左上角显示 AI 知识库标签页入口" },
        ],
    ),
    ...defineSettings(
        { mainTab: "aiKnowledgeBase", subTab: "status", section: "状态语 AI 生成", scope: "all-devices" },
        [
            { id: "ai.status.model", title: "状态语 AI 模型", description: "独立选择主页状态语使用的大模型" },
            { id: "ai.status.thinking", title: "状态语思考模式", description: "控制状态语生成时是否允许模型思考" },
        ],
    ),
    ...defineSettings(
        { mainTab: "aiKnowledgeBase", subTab: "selection", section: "编辑器选区 AI 工具栏", scope: "all-devices" },
        [
            { id: "ai.selection.enabled", title: "启用选区 AI 工具栏", description: "划选正文文字后显示 AI 操作入口", keywords: ["划词", "选中文字"] },
            { id: "ai.selection.skills", title: "选区 AI 技能", description: "新增、编辑、排序和启停选区处理技能", keywords: ["翻译", "润色", "总结"], target: "section" },
        ],
    ),
    ...defineSettings(
        { mainTab: "aiKnowledgeBase", subTab: "workbenches", section: "临时工作台", scope: "all-devices" },
        [
            { id: "ai.workbenches.manage", title: "临时工作台管理", description: "查看、打开和删除所有 Agent 入口生成的临时工作台", keywords: ["工作台", "AI 卡片", "空间占用"], target: "section" },
        ],
    ),
    ...defineSettings(
        { mainTab: "notifyBridge", subTab: "desktop", section: "桌面系统通知", scope: "current-device" },
        [
            { id: "notify.desktop.enabled", title: "开启桌面系统通知", description: "通过操作系统通知中心显示提醒" },
            { id: "notify.desktop.permission", title: "通知权限", description: "查看当前系统通知授权状态" },
            { id: "notify.desktop.duration", title: "显示时长", description: "设置桌面通知自动关闭时间" },
            { id: "notify.desktop.max-body", title: "最大正文字数", description: "限制桌面通知正文长度" },
            { id: "notify.desktop.urgent", title: "错误和紧急通知样式", description: "为高优先级通知增加警示标识" },
        ],
    ),
    ...defineSettings(
        { mainTab: "notifyBridge", subTab: "mobile", section: "移动端系统通知", scope: "mobile-shared" },
        [
            { id: "notify.mobile.enabled", title: "开启移动通知", description: "在原生手机端注册本地通知计划" },
            { id: "notify.mobile.behavior", title: "通知持续方式", description: "控制移动系统通知是否持续显示" },
            { id: "notify.mobile.days", title: "未来计划天数", description: "生成未来指定天数的固定通知" },
            { id: "notify.mobile.status", title: "通知计划状态", description: "查看已注册计划和最近对账信息" },
            { id: "notify.mobile.plan", title: "当前设备计划", description: "重新生成或清理当前设备通知计划" },
        ],
    ),
    ...defineSettings(
        { mainTab: "notifyBridge", subTab: "external", section: "外联通知", scope: "all-devices" },
        [
            { id: "notify.external.enabled", title: "开启外联通知", description: "向 Webhook 或飞书渠道投递通知" },
            { id: "notify.external.rate-limit", title: "按渠道限流", description: "限制同一渠道的连续发送频率" },
            { id: "notify.external.interval", title: "最小发送间隔", description: "设置同一渠道两次发送的最短间隔" },
            { id: "notify.external.dedupe", title: "内存去重", description: "在指定时间窗口内忽略重复通知" },
            { id: "notify.external.channels", title: "通知渠道", description: "管理 Webhook 和飞书通知渠道" },
        ],
    ),
    ...defineSettings(
        { mainTab: "notifyBridge", subTab: "history", section: "最近投递结果", scope: "all-devices" },
        [
            { id: "notify.history", title: "通知发送历史", description: "查看最近通知投递结果和失败原因", keywords: ["日志", "记录"], target: "section" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "general", section: "机器人助手", scope: "all-devices" },
        [
            { id: "robot.general.enabled", title: "启用机器人助手", description: "启用远程机器人接入" },
            { id: "robot.general.provider", title: "当前使用的机器人", description: "选择当前运行的机器人渠道" },
            { id: "robot.general.device", title: "运行设备", description: "指定负责连接机器人的设备" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "general", section: "运行限制", scope: "all-devices" },
        [
            { id: "robot.limits.length", title: "消息 / 回复长度", description: "设置机器人输入和回复长度限制" },
            { id: "robot.limits.timeout", title: "并发与超时", description: "设置 Agent 并发和模型、整轮超时" },
            { id: "robot.limits.context", title: "远程对话上下文", description: "设置机器人保留的历史消息数量" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "wechat", section: "微信机器人", scope: "all-devices" },
        [
            { id: "robot.wechat.chat", title: "私聊 / 群聊", description: "配置微信机器人可处理的消息类型" },
            { id: "robot.wechat.allow-list", title: "允许的用户 ID / 聊天 ID", description: "限制可以使用机器人的微信账号或会话" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "feishu", section: "飞书机器人", scope: "all-devices" },
        [
            { id: "robot.feishu.app-id", title: "App ID", description: "设置飞书机器人应用 ID" },
            { id: "robot.feishu.secret", title: "App Secret", description: "设置飞书机器人应用密钥" },
            { id: "robot.feishu.chat", title: "私聊 / 群聊", description: "配置飞书机器人可处理的消息类型" },
            { id: "robot.feishu.allow-list", title: "允许的用户 ID / 群 ID", description: "限制可以使用机器人的飞书账号或群聊" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "qq", section: "QQ 机器人", scope: "all-devices" },
        [
            { id: "robot.qq.platform", title: "开放平台", description: "打开 QQ 机器人开放平台" },
            { id: "robot.qq.app-id", title: "App ID", description: "设置 QQ 机器人应用 ID" },
            { id: "robot.qq.secret", title: "App Secret", description: "设置 QQ 机器人应用密钥" },
            { id: "robot.qq.chat", title: "私聊 / 群聊", description: "配置 QQ 机器人可处理的消息类型" },
            { id: "robot.qq.allow-list", title: "允许的用户 ID / 群 ID", description: "限制可以使用机器人的 QQ 账号或群聊" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "agent", section: "Agent 模型", scope: "all-devices" },
        [
            { id: "robot.agent.model", title: "执行模型", description: "选择机器人 Agent 使用的大模型" },
        ],
    ),
    ...defineSettings(
        { mainTab: "robotAssistant", subTab: "agent", section: "机器人可使用的 AI 工具", scope: "all-devices" },
        [
            { id: "robot.agent.write-policy", title: "默认写操作策略", description: "设置机器人执行写工具时的默认确认方式" },
            { id: "robot.agent.tools", title: "机器人 AI 工具", description: "逐项设置机器人允许使用的 Agent 工具", keywords: ["权限", "工具白名单"], target: "section" },
        ],
    ),
];

const MAIN_TAB_LABELS = new Map(mainTabs.map((tab) => [tab.key, tab.label]));
const HOMEPAGE_SUB_TAB_LABELS = new Map(subTabs.map((tab) => [tab.key, tab.label]));
const AI_SUB_TAB_LABELS = new Map(AI_KNOWLEDGE_BASE_SUB_TABS.map((tab) => [tab.id, tab.label]));
const NOTIFICATION_SUB_TAB_LABELS = new Map(NOTIFICATION_CENTER_SUB_TABS.map((tab) => [tab.id, tab.label]));
const ROBOT_SUB_TAB_LABELS = new Map(ROBOT_ASSISTANT_SUB_TABS.map((tab) => [tab.id, tab.label]));

function getSubTabLabel(entry: SettingSearchEntry): string | undefined {
    if (!entry.subTab) return undefined;
    if (entry.mainTab === "homepage") return HOMEPAGE_SUB_TAB_LABELS.get(entry.subTab as HomepageSettingSubTab);
    if (entry.mainTab === "aiKnowledgeBase") return AI_SUB_TAB_LABELS.get(entry.subTab as AiKnowledgeBaseSubTab);
    if (entry.mainTab === "notifyBridge") return NOTIFICATION_SUB_TAB_LABELS.get(entry.subTab as NotificationCenterSubTab);
    if (entry.mainTab === "robotAssistant") return ROBOT_SUB_TAB_LABELS.get(entry.subTab as RobotAssistantSubTab);
    return undefined;
}

function normalizeSearchText(value: string): string {
    return value.toLocaleLowerCase().replace(/[\s·/—_-]+/g, "");
}

function scoreEntry(entry: SettingSearchEntry, query: string): number {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return 0;
    const title = normalizeSearchText(entry.title);
    const description = normalizeSearchText(entry.description);
    const section = normalizeSearchText(entry.section ?? "");
    const keywords = normalizeSearchText(entry.keywords?.join(" ") ?? "");
    const path = normalizeSearchText(`${MAIN_TAB_LABELS.get(entry.mainTab) ?? ""}${getSubTabLabel(entry) ?? ""}`);
    const scope = normalizeSearchText(SETTING_SCOPE_LABELS[entry.scope]);
    if (title === normalizedQuery) return 120;
    if (title.startsWith(normalizedQuery)) return 100;
    if (title.includes(normalizedQuery)) return 80;
    if (keywords.includes(normalizedQuery)) return 62;
    if (section.includes(normalizedQuery)) return 48;
    if (description.includes(normalizedQuery)) return 38;
    if (path.includes(normalizedQuery)) return 24;
    if (scope.includes(normalizedQuery)) return 18;
    return 0;
}

export function searchHomepageSettings(query: string, limit = 12): SettingSearchResult[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return SETTINGS_SEARCH_REGISTRY
        .map((entry) => {
            const mainTabLabel = MAIN_TAB_LABELS.get(entry.mainTab) ?? entry.mainTab;
            const subTabLabel = getSubTabLabel(entry);
            return {
                ...entry,
                mainTabLabel,
                ...(subTabLabel ? { subTabLabel } : {}),
                scopeLabel: SETTING_SCOPE_LABELS[entry.scope],
                pathLabel: [mainTabLabel, subTabLabel, entry.section].filter(Boolean).join(" › "),
                score: scoreEntry(entry, trimmed),
            } satisfies SettingSearchResult;
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"))
        .slice(0, limit);
}

export function getHomepageSettingSearchRegistry(): readonly SettingSearchEntry[] {
    return SETTINGS_SEARCH_REGISTRY;
}

import type { HomepageSettingMainTab, HomepageSettingSubTab } from './types';

export interface MainTabItem {
    key: HomepageSettingMainTab;
    label: string;
    requiresAdvanced?: boolean;
}

export interface SubTabItem {
    key: HomepageSettingSubTab;
    label: string;
    requiresAdvanced?: boolean;
}

export const mainTabs: MainTabItem[] = [
    { key: "homepage", label: "主页设置" },
    { key: "aiKnowledgeBase", label: "AI 中心", requiresAdvanced: true },
    { key: "notifyBridge", label: "通知中心", requiresAdvanced: true },
    { key: "robotAssistant", label: "机器人助手", requiresAdvanced: true },
    { key: "vip", label: "会员服务" },
    { key: "about", label: "关于插件" },
];

export const subTabs: SubTabItem[] = [
    { key: "behavior", label: "主页行为" },
    { key: "appearance", label: "外观与主题" },
    { key: "mobile", label: "移动端", requiresAdvanced: true },
    { key: "banner", label: "横幅设置" },
    { key: "title", label: "标题设置" },
    { key: "button", label: "按钮设置" },
    { key: "widgets", label: "组件设置" },
    { key: "indexing", label: "检索管理" },
    { key: "devices", label: "设备管理" },
    { key: "styles", label: "高级样式", requiresAdvanced: true },
];

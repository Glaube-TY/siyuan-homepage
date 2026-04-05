import type { HomepageSettingMainTab, HomepageSettingSubTab } from './types';

export interface MainTabItem {
    key: HomepageSettingMainTab;
    label: string;
}

export interface SubTabItem {
    key: HomepageSettingSubTab;
    label: string;
    requiresAdvanced?: boolean;
}

export const mainTabs: MainTabItem[] = [
    { key: "homepage", label: "主页设置" },
    { key: "vip", label: "会员服务" },
    { key: "about", label: "关于插件" },
];

export const subTabs: SubTabItem[] = [
    { key: "banner", label: "横幅设置" },
    { key: "title", label: "标题设置" },
    { key: "button", label: "按钮设置" },
    { key: "widgets", label: "组件设置" },
    { key: "devices", label: "设备管理" },
    { key: "styles", label: "高级样式👑", requiresAdvanced: true },
];
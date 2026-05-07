import type { HomepageSettingMainTab, HomepageSettingSubTab } from './types';

export interface MainTabItem {
    key: HomepageSettingMainTab;
    label: string;
}

export interface SubTabItem {
    key: HomepageSettingSubTab;
    label: string;
    requiresAdvanced?: boolean;
    preferredWidth?: number;
}

export const mainTabs: MainTabItem[] = [
    { key: "homepage", label: "主页设置" },
    { key: "vip", label: "会员服务" },
    { key: "about", label: "关于插件" },
];

export const subTabs: SubTabItem[] = [
    { key: "behavior", label: "主页行为", preferredWidth: 820 },
    { key: "banner", label: "横幅设置", preferredWidth: 960 },
    { key: "title", label: "标题设置", preferredWidth: 880 },
    { key: "button", label: "按钮设置", preferredWidth: 1180 },
    { key: "widgets", label: "组件设置", preferredWidth: 980 },
    { key: "devices", label: "设备管理", preferredWidth: 1000 },
    { key: "styles", label: "高级样式👑", requiresAdvanced: true, preferredWidth: 1000 },
];
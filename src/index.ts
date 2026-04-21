import { mount, unmount } from "svelte";
import {
    Plugin,
    showMessage,
    openTab,
    getFrontend,
    Model,
} from "siyuan";

import { svelteDialog } from "@/libs/dialog";
import * as advanced from "@/components/tools/advanced";
import { loadWidgetLayoutSettings } from "@/components/utils/widgetBlock/utils/layout-shared";
import { destroyFloatingDoc } from "@/components/tools/floatingDoc";

import * as sdk from "@siyuan-community/siyuan-sdk";
import Homepage from "./homepage/homepage.svelte";
import TasksEditingDialog from "./components/utils/widgetBlock/widget/tasksPlus/tasksEditingDialog.svelte";
import QuickNotesDialog from "./components/utils/widgetBlock/widget/quickNotes/quickNotesDialog.svelte";
import Sidebar from "./components/utils/sidebar/sidebar.svelte";
import MobileHomepage from "./homepage/mobileHomepage/mobileHomepage.svelte";


const STORAGE_NAME = "menu-config";
const TAB_TYPE = "homepage_tab";
const TAB_ID = "siyuan-homepagehomepage_tab";
const DOCK_TYPE = "homepage_dock";

const HOMEPAGE_ICON_SVG = `<symbol id="iconhomepage" viewBox="0 0 1024 1024">
    <path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15736"></path><path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15737"></path><path d="M512 165.341867L119.466667 467.9168V981.333333h785.066666V467.9168z" fill="#E0E1E2" p-id="15738"></path><path d="M1006.933333 810.666667a17.066667 17.066667 0 0 0-17.066666 17.066666v17.066667h-17.066667v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667h-34.133334a17.066667 17.066667 0 1 0 0 34.133333h34.133334v51.2h-34.133334a17.066667 17.066667 0 1 0 0 34.133334h34.133334v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-153.6a17.066667 17.066667 0 0 0-17.066667-17.066666z m-34.133333 119.466666v-51.2h17.066667v51.2h-17.066667zM119.466667 878.933333a17.066667 17.066667 0 1 0 0-34.133333H85.333333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667H34.133333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v153.6a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h34.133334a17.066667 17.066667 0 1 0 0-34.133334H85.333333v-51.2h34.133334z m-68.266667 51.2H34.133333v-51.2h17.066667v51.2z" fill="#E0E1E2" p-id="15739"></path><path d="M256 452.266667h204.8v136.533333H256zM256 691.2h204.8v170.666667H256zM563.2 452.266667h204.8v136.533333H563.2zM563.2 691.2h204.8v290.133333H563.2z" fill="#556080" p-id="15740"></path><path d="M563.2 452.266667h204.8v102.4H563.2zM256 452.266667h204.8v47.189333H256zM375.466667 759.466667v-68.266667h-34.133334v68.266667h-85.333333v34.133333h85.333333v68.266667h34.133334v-68.266667h85.333[... 52 char[... 14 chars omitted ...]
</symbol>`;

const TASK_ICON_SVG = `<symbol id="iconTask" viewBox="0 0 1024 1024">
    <path d="M224.924444 967.111111C153.813333 967.111111 128 929.578667 128 862.620444V242.659556c0-62.421333 18.033778-105.671111 91.448889-105.671112h56.988444s32.711111 10.168889 32.711111 15.246223c0 38.727111 26.936889 79.018667 60.757334 79.018666h277.12c32.199111 0 59.136-40.206222 59.136-78.933333 0-5.077333 36.494222-15.246222 36.494222-15.246222h55.779556c67.726222 0 100.977778 43.278222 100.977777 105.671111v619.875555c0 75.064889-35.456 104.490667-106.510222 104.490667H224.924444z m63.104-420.366222a40.647111 40.647111 0 0 0 0.213334 56.675555l118.385778 118.528 1.607111 2.062223a38.812444 38.812444 0 0 0 55.808 0l251.889777-253.952a39.537778 39.537778 0 0 0-55.594666-56.234667L436.024889 639.544889l-91.776-93.44a40.604444 40.604444 0 0 0-27.875556-11.121778 40.064 40.064 0 0 0-28.344889 11.690667v0.071111z m125.454223-382.321778c-22.101333 0-39.921778-30.392889-40.035556-55.808C373.333333 83.2 391.196444 56.888889 413.482667 56.888889h190.791111c22.215111 0 40.035556 26.296889 40.035555 51.712 0 25.415111-17.820444 55.808-38.855111 55.808l-191.971555 0.014222z" fill="#323233" p-id="14715"></path>
</symbol>`;

interface PluginConfig {
    quickNotesEnabled?: boolean;
    quickNotesPosition?: string;
    quickNotesTimestampEnabled?: boolean;
    quickNotesAddPosition?: string;
    taskEditorEnabled?: boolean;
    sidebarEnabled?: boolean;
    autoOpenMobileHomepage?: boolean;
    autoOpenHomepage?: boolean;
}

export default class PluginHomepage extends Plugin {
    customTab!: () => Model;
    isMobile = false;
    currentMobileDialog: ReturnType<typeof svelteDialog> | null = null;
    private homepageInstance: Record<string, any> | null = null;
    private homepageTabDiv: HTMLDivElement | null = null;
    private sidebarDockInstance: Record<string, any> | null = null;
    private homepageTabObserver: MutationObserver | null = null;
    ADVANCED = false;
    private docTreeMenuEventBindThis = this.handleDocTreeMenu.bind(this);
    private contentMenuEventBindThis = this.handleContentMenu.bind(this);
    private editorTitleIconMenuEventBindThis = this.handleEditorTitleIconMenu.bind(this);

    // 已应用签名状态：用于检测外部同步变化
    private lastAppliedConfigSignature = "";
    private lastAppliedLayoutSignature = "";

    // 整页 reload 去重保护：避免同一轮变化重复触发
    private homepageReloadTriggered = false;

    client = new sdk.Client(undefined, 'fetch');

    // 更新已应用签名（homepage 初始化完成后调用）
    public updateAppliedSignatures(configSig: string, layoutSig: string): void {
        this.lastAppliedConfigSignature = configSig;
        this.lastAppliedLayoutSignature = layoutSig;
        console.debug('[Homepage] 已应用签名已更新');
    }

    // 获取当前已应用签名
    public getAppliedSignatures(): { config: string; layout: string } {
        return {
            config: this.lastAppliedConfigSignature,
            layout: this.lastAppliedLayoutSignature,
        };
    }

    // 统一整页 reload 入口：签名变化时调用
    public triggerHomepageFullReload(reason: string): void {
        if (this.homepageReloadTriggered) {
            console.debug(`[Homepage] 整页 reload 已触发过，跳过: ${reason}`);
            return;
        }
        this.homepageReloadTriggered = true;
        console.debug(`[Homepage] 触发整页 reload: ${reason}`);
        window.location.reload();
    }

    // 计算配置签名（归一化后）：排除设备管理态字段，避免误判
    private computeConfigSignature(config: any): string {
        try {
            const normalized = this.normalizeConfigForSignature(config);
            return JSON.stringify(normalized);
        } catch {
            return "";
        }
    }

    // 归一化配置用于签名：排除不应触发 reload 的设备管理态字段
    private normalizeConfigForSignature(config: any): any {
        if (!config || typeof config !== 'object') {
            return config;
        }

        // 获取当前设备 ID 用于提取当前设备的 banner 配置
        const deviceId = this.getLocalDeviceIdForSignature();

        // 构建归一化后的配置对象
        const normalized: any = {};

        for (const key of Object.keys(config)) {
            // 完全排除 deviceProfiles
            if (key === 'deviceProfiles') {
                continue;
            }

            // bannerDeviceProfiles 只保留当前设备的 bannerHeight，排除 scrollTop
            if (key === 'bannerDeviceProfiles') {
                if (deviceId && config[key]?.[deviceId]?.bannerHeight !== undefined) {
                    normalized[key] = {
                        [deviceId]: {
                            bannerHeight: config[key][deviceId].bannerHeight
                        }
                    };
                }
                continue;
            }

            // 其他字段原样保留
            normalized[key] = config[key];
        }

        return normalized;
    }

    // 获取本地设备 ID（用于签名归一化）
    private getLocalDeviceIdForSignature(): string | null {
        try {
            // 优先从 localStorage 读取
            const storedId = localStorage.getItem('syhomepage-device-id');
            if (storedId) {
                return storedId;
            }
        } catch {
            // localStorage 不可用，忽略
        }
        return null;
    }

    // 计算布局签名
    private computeLayoutSignature(layout: any): string {
        try {
            return JSON.stringify(layout);
        } catch {
            return "";
        }
    }

    // plugin 侧签名检查：在 homepage 组件 mount 之前就能检测到签名变化并整页 reload
    // 返回 true 表示已触发 reload，调用方应终止后续流程
    public async checkHomepageSignatureAndReload(reason: string): Promise<boolean> {
        // 如果已触发过 reload，不再重复检查
        if (this.homepageReloadTriggered) {
            return true;
        }

        // 如果没有已应用签名（首次加载），跳过检查
        const appliedSigs = this.getAppliedSignatures();
        if (!appliedSigs.config && !appliedSigs.layout) {
            return false;
        }

        try {
            // 读取最新配置
            const rawConfig = (await this.loadData("homepageSettingConfig.json")) || {};
            // 使用 shared 的 loadWidgetLayoutSettings，确保与 homepage.svelte 口径一致
            const layoutSettings = await loadWidgetLayoutSettings(this);

            const currentConfigSig = this.computeConfigSignature(rawConfig);
            const currentLayoutSig = this.computeLayoutSignature(layoutSettings);

            // 检查签名是否变化
            if (currentConfigSig !== appliedSigs.config || currentLayoutSig !== appliedSigs.layout) {
                console.debug(`[Homepage] plugin 侧检测到签名变化: ${reason}`);
                this.triggerHomepageFullReload(`plugin-signature-changed: ${reason}`);
                return true;
            }
        } catch (e) {
            console.warn('[Homepage] plugin 侧签名检查失败:', e);
        }

        return false;
    }

    async onload() {
        const config = await this.getPluginConfig();
        this.registerIcon();

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        this.eventBus.on("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.on("click-editortitleicon", this.editorTitleIconMenuEventBindThis);
        if (config.taskEditorEnabled ?? true) {
            this.eventBus.on("open-menu-content", this.contentMenuEventBindThis);
        }
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        this.registerTopBar();
        this.registerCommand();

        // 在非移动端时注册 dock 侧边栏
        if ((config.sidebarEnabled ?? false) && !this.isMobile) {
            this.registerDock();
        }

    }

    async onunload() {
        this.eventBus.off("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.off("open-menu-content", this.contentMenuEventBindThis);
        this.eventBus.off("click-editortitleicon", this.editorTitleIconMenuEventBindThis);

        // 销毁 Homepage 组件实例
        this.destroyHomepageInstance();

        // 关闭移动端对话框
        if (this.currentMobileDialog) {
            this.currentMobileDialog.close();
            this.currentMobileDialog = null;
        }

        // 销毁全局悬浮预览单例（清理 DOM、样式、Protyle 等资源）
        try {
            destroyFloatingDoc();
        } catch {
            // 忽略销毁过程中的错误
        }

        // 销毁 dock Sidebar 实例
        if (this.sidebarDockInstance) {
            try {
                unmount(this.sidebarDockInstance);
            } catch {
                // 忽略卸载过程中的错误
            }
            this.sidebarDockInstance = null;
        }

        // 断开主页 tab 连接状态观察器
        if (this.homepageTabObserver) {
            this.homepageTabObserver.disconnect();
            this.homepageTabObserver = null;
        }
    }

    async onLayoutReady() {
        this.homepageTabDiv = document.createElement("div");
        // 不再提前 mount，等 tab init 容器进入 DOM 后再创建实例

        // 建立轻量观察：当 homepageTabDiv 脱离 DOM 时自动销毁 Homepage 实例
        this.homepageTabObserver = new MutationObserver(() => {
            if (this.homepageInstance && this.homepageTabDiv && !this.homepageTabDiv.isConnected) {
                this.destroyHomepageInstance();
            }
        });
        this.homepageTabObserver.observe(document.body, { childList: true, subtree: true });

        const self = this;
        this.customTab = this.addTab({
            type: TAB_TYPE,
            async init() {
                // 轻量保护：确保 custom tab 上下文完整
                if (!this.element) {
                    console.debug('[Homepage] Tab init: element 未就绪');
                    return;
                }

                // plugin 侧先检查签名变化，即使 homepage 组件还没 mount 也能触发 reload
                const shouldReload = await self.checkHomepageSignatureAndReload('customTab.init');
                if (shouldReload) {
                    // 已触发 reload，不再继续挂载
                    return;
                }

                if (self.homepageTabDiv) {
                    this.element.appendChild(self.homepageTabDiv);
                    // 容器真正进入页面后再创建 Homepage 实例（避免过早 mount）
                    if (!self.homepageInstance) {
                        self.createHomepageInstance();
                    }
                }
            },
        });

        // 检查是否在新窗口中打开
        const urlParams = new URLSearchParams(window.location.search);
        const isNewWindow = urlParams.has('json');

        // 只在非新窗口中自动打开主页
        if (!isNewWindow) {
            const config = await this.getPluginConfig();
            if (this.isMobile && config.autoOpenMobileHomepage === true) {
                this.openMobileHomepage();
            } else if (config.autoOpenHomepage === true && !this.isMobile) {
                this.openHomepage();
            }
        }

        // 会员校验（非阻塞）
        void this.verifyLicense();
    }

    // 创建主页实例（仅在容器已连接到 DOM 时执行）
    private createHomepageInstance(): void {
        if (!this.homepageTabDiv || !this.homepageTabDiv.isConnected) {
            // 容器未创建或未进入 DOM，暂不 mount
            return;
        }
        this.homepageInstance = mount(Homepage as any, {
            target: this.homepageTabDiv,
            props: {
                app: this.app,
                plugin: this,
            }
        } as any);
    }

    // 销毁主页实例
    private destroyHomepageInstance(): void {
        if (this.homepageInstance) {
            try {
                unmount(this.homepageInstance);
            } catch (e) {
                console.warn("[Plugin] 销毁主页实例失败:", e);
            }
            this.homepageInstance = null;
        }
        // 清空容器内容
        if (this.homepageTabDiv) {
            this.homepageTabDiv.innerHTML = "";
        }
    }

    // 重建主页实例（用于恢复坏掉的实例）
    public reloadHomepageInstance(): void {
        this.destroyHomepageInstance();
        this.createHomepageInstance();
    }

    private async verifyLicense() {
        try {
            const vipInfo = await advanced.updateVIP();
            const userName = vipInfo.USER_NAME;
            const userId = vipInfo.USER_ID;
            const licenseResult = await advanced.verifyLicense(this, userName, userId);

            if (licenseResult.valid && licenseResult.code === 0) {
                this.ADVANCED = true;
                window.dispatchEvent(new CustomEvent("homepage-advanced-ready"));
                const remainingDays = licenseResult.userInfo.remainingDays;
                if (remainingDays === 7) {
                    showMessage("您的激活码还有 7 天过期，建议及时更新！");
                } else if (remainingDays === 3) {
                    showMessage("您的激活码还有 3 天过期，建议及时更新！");
                } else if (remainingDays === 1) {
                    showMessage("您的激活码还有 1 天过期，建议及时更新！");
                }
            } else {
                this.ADVANCED = false;
                window.dispatchEvent(new CustomEvent("homepage-advanced-unavailable"));
                if (licenseResult.code === 5) {
                    showMessage("❌ 您的激活码已过期！");
                }
            }
        } catch (error) {
            console.error("会员校验失败:", error);
            this.ADVANCED = false;
            window.dispatchEvent(new CustomEvent("homepage-advanced-unavailable"));
        }
    }

    private registerIcon() {
        this.addIcons(HOMEPAGE_ICON_SVG);
        this.addIcons(TASK_ICON_SVG);
    }

    private registerCommand() {
        this.addCommand({
            langKey: "快速笔记",
            hotkey: "⇧⌘Q",
            callback: async () => {
                const config = await this.getPluginConfig();
                const quickNotesEnabled = config.quickNotesEnabled;
                const quickNotesPosition = config.quickNotesPosition;
                const quickNotesTimestampEnabled = config.quickNotesTimestampEnabled;
                const quickNotesAddPosition = config.quickNotesAddPosition;

                if (!quickNotesEnabled) {
                    showMessage("❌请先在主页设置中开启快速笔记");
                    return;
                } else if (!quickNotesPosition || !String(quickNotesPosition).trim()) {
                    showMessage("❌请先在主页设置中设置快速笔记的位置");
                    return;
                } else {
                    const dialog = svelteDialog({
                        title: "快速笔记",
                        constructor: (containerEl: HTMLElement) => {
                            return mount(QuickNotesDialog as any, {
                                target: containerEl,
                                props: {
                                    quickNotesPosition,
                                    quickNotesTimestampEnabled,
                                    quickNotesAddPosition,
                                    plugin: this,
                                    close: () => {
                                        dialog.close();
                                    },
                                },
                            });
                        },
                    });
                }

            },
        });

        // 添加快速打开主页的快捷键命令
        this.addCommand({
            langKey: "打开主页",
            hotkey: "⇧⌘H",
            callback: () => {
                // 检查是否为移动端
                if (this.isMobile) {
                    showMessage("❌移动端不支持快捷键开启");
                    return;
                } else {
                    this.openHomepage();
                }
            },
        });
    }

    private registerTopBar() {
        this.addTopBar({
            icon: "iconhomepage",
            title: "打开主页",
            position: "left",
            callback: () => {
                if (this.isMobile) {
                    this.openMobileHomepage();
                } else {
                    this.openHomepage();
                }
            }
        });
    }

    private async openHomepage() {
        // plugin 侧先检查签名变化，即使 homepage 组件还没 mount 也能触发 reload
        const shouldReload = await this.checkHomepageSignatureAndReload('openHomepage');
        if (shouldReload) {
            // 已触发 reload，不再继续打开 tab
            return;
        }

        openTab({
            app: this.app,
            custom: {
                icon: "iconhomepage",
                title: "首页",
                data: { text: "思源笔记首页" },
                id: TAB_ID,
            },
        });
    }

    private openMobileHomepage() {
        // 如果已存在对话框，先关闭
        if (this.currentMobileDialog) {
            this.currentMobileDialog.close();
            this.currentMobileDialog = null;
        }

        this.currentMobileDialog = svelteDialog({
            title: "移动主页",
            width: "100vh",
            height: "100vh",
            constructor: (containerEl: HTMLElement) => {
                return mount(MobileHomepage as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        close: () => {
                            this.currentMobileDialog?.close();
                            this.currentMobileDialog = null;
                        },
                    },
                });
            },
            // dialog 任何关闭路径（包括自身关闭按钮）都会触发，确保引用正确置空
            callback: () => {
                this.currentMobileDialog = null;
            },
        });
    }

    private async getPluginConfig(): Promise<PluginConfig> {
        return (await this.loadData("homepageSettingConfig.json")) || {};
    }

    private registerDock() {
        this.addDock({
            config: {
                position: "RightTop",
                size: { width: 200, height: 0 },
                icon: "iconhomepage",
                title: "主页侧边栏",
                hotkey: "⌥⌘C",
            },
            data: {
                text: "这是一个主页侧边栏。"
            },
            type: DOCK_TYPE,
            init: (dock) => {
                // 如果已有旧实例，先清理避免重复挂载
                if (this.sidebarDockInstance) {
                    try {
                        unmount(this.sidebarDockInstance);
                    } catch {
                        // 忽略卸载错误
                    }
                    this.sidebarDockInstance = null;
                }

                // 清理 dock.element 内可能残留的旧 sidebar 容器
                const existingContainer = dock.element.querySelector('[data-sidebar-container]');
                if (existingContainer) {
                    existingContainer.remove();
                }

                const sidebarContainer = document.createElement("div");
                sidebarContainer.setAttribute('data-sidebar-container', 'true');
                this.sidebarDockInstance = mount(Sidebar as any, {
                    target: sidebarContainer,
                    props: {
                        plugin: this,
                    }
                } as any);
                dock.element.appendChild(sidebarContainer);
            },
        });
    }

    private handleDocTreeMenu({ detail }: any) {
        if (!detail || detail.type !== 'doc') return;
        if (!detail.elements || !Array.isArray(detail.elements) || detail.elements.length === 0) return;

        const element = detail.elements[0];
        if (!element || !element.dataset) return;

        const nodeId = element.dataset.nodeId;

        // 创建主菜单项：主页插件
        detail.menu.addItem({
            icon: "iconhomepage",
            label: "主页插件",
            type: "submenu",
            submenu: [
                {
                    icon: "iconHeart",
                    label: "收藏文档",
                    click: async () => {
                        try {
                            await this.client.setBlockAttrs({
                                id: nodeId,
                                attrs: {
                                    "custom-homepage-favorites": "true"
                                }
                            });
                            showMessage("已收藏");
                        } catch (err) {
                            console.error("收藏失败", err);
                            showMessage("收藏失败，请查看控制台日志");
                        }
                    }
                },
                {
                    icon: "iconClose",
                    label: "取消收藏",
                    click: async () => {
                        try {
                            await this.client.setBlockAttrs({
                                id: nodeId,
                                attrs: {
                                    "custom-homepage-favorites": ""
                                }
                            });
                            showMessage("已取消收藏");
                        } catch (err) {
                            console.error("取消收藏失败", err);
                            showMessage("取消收藏失败，请查看控制台日志");
                        }
                    }
                }
            ]
        });
    }

    private handleContentMenu({ detail }: any) {
        if (!detail) return;
        const blockElement = detail.element?.closest?.('[data-node-id]');
        if (!blockElement) {
            console.warn('未找到块元素');
            return;
        }
        detail.menu.addItem({
            icon: "iconTask",
            label: "任务编辑器（主页插件）",
            click: () => {
                const blockId = blockElement.getAttribute('data-node-id');
                if (blockId) {
                    const dialog = svelteDialog({
                        title: "任务编辑器",
                        constructor: (containerEl: HTMLElement) => {
                            return mount(TasksEditingDialog as any, {
                                target: containerEl,
                                props: {
                                    blockId: blockId,
                                    plugin: this,
                                    close: () => {
                                        dialog.close();
                                    },
                                },
                            });
                        },
                    });

                }
            }
        });
    }

    private handleEditorTitleIconMenu({ detail }: any) {
        if (!detail) {
            console.debug('[EditorTitleIconMenu] 事件详情为空');
            return;
        }

        // 从事件中获取当前文档ID
        // click-editortitleicon 事件通常包含 data 或 protyle 信息
        let docId: string | null = null;

        // 尝试从多种可能的位置获取文档ID
        if (detail.data?.id) {
            docId = detail.data.id;
        } else if (detail.protyle?.block?.id) {
            docId = detail.protyle.block.id;
        } else if (detail.protyle?.block?.rootID) {
            docId = detail.protyle.block.rootID;
        }

        if (!docId) {
            console.debug('[EditorTitleIconMenu] 无法获取当前文档ID');
            return;
        }

        // 创建主菜单项：主页插件
        detail.menu.addItem({
            icon: "iconhomepage",
            label: "主页插件",
            type: "submenu",
            submenu: [
                {
                    icon: "iconHeart",
                    label: "收藏文档",
                    click: async () => {
                        try {
                            await this.client.setBlockAttrs({
                                id: docId,
                                attrs: {
                                    "custom-homepage-favorites": "true"
                                }
                            });
                            showMessage("已收藏");
                        } catch (err) {
                            console.error("收藏失败", err);
                            showMessage("收藏失败，请查看控制台日志");
                        }
                    }
                },
                {
                    icon: "iconClose",
                    label: "取消收藏",
                    click: async () => {
                        try {
                            await this.client.setBlockAttrs({
                                id: docId,
                                attrs: {
                                    "custom-homepage-favorites": ""
                                }
                            });
                            showMessage("已取消收藏");
                        } catch (err) {
                            console.error("取消收藏失败", err);
                            showMessage("取消收藏失败，请查看控制台日志");
                        }
                    }
                }
            ]
        });
    }
}
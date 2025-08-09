import {
    Plugin,
    showMessage,
    openTab,
    getFrontend,
    IModel,
    fetchSyncPost
} from "siyuan";

import { svelteDialog } from "@/libs/dialog";
import * as advanced from "@/components/utils/advanced";

import * as sdk from "@siyuan-community/siyuan-sdk";
import Homepage from "./components/homepage.svelte";
import TasksEditingDialog from "./components/utils/widgetBlock/widget/tasksPlus/tasksEditingDialog.svelte";
import QuickNotesDialog from "./components/utils/widgetBlock/widget/quickNotes/quickNotesDialog.svelte";
import Sidebar from "./components/utils/sidebar/sidebar.svelte";
import MobileHomepage from "./components/utils/mobileHomepage/mobileHomepage.svelte";

const STORAGE_NAME = "menu-config";
const TAB_TYPE = "homepage_tab";
const DOCK_TYPE = "homepage_dock";

export default class PluginHomepage extends Plugin {

    customTab: () => IModel;
    isMobile: boolean;
    currentMobileDialog: any = null;
    ADVANCED = false;
    private docTreeMenuEventBindThis = this.handleDocTreeMenu.bind(this);
    private contentMenuEventBindThis = this.handleContentMenu.bind(this);

    client = new sdk.Client(undefined, 'fetch');

    workplacePath: string;

    async onload() {
        this.registerIcon();

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        const confRes = await fetchSyncPost("/api/system/getConf");
        this.workplacePath = confRes.data.conf.system.workspaceDir;

        this.eventBus.on("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.on("open-menu-content", this.contentMenuEventBindThis);

        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        this.registerTopBar();
        this.registerCommand();
        await this.registerDock();
    }

    async onunload() {
        this.eventBus.off("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.off("open-menu-content", this.contentMenuEventBindThis);
    }

    async onLayoutReady() {
        let tabDiv = document.createElement("div");
        new Homepage({
            target: tabDiv,
            props: {
                app: this.app,
                plugin: this,
            }
        });

        this.customTab = this.addTab({
            type: TAB_TYPE,
            init() {
                this.element.appendChild(tabDiv);
            },
        });

        // 自动打开主页
        const savedConfig = await this.loadData("homepageSettingConfig.json");
        if (savedConfig.autoOpenHomepage === true) {
            if (this.isMobile && savedConfig.autoOpenMobileHomepage === true) {
                // 移动端打开方式
                this.currentMobileDialog = svelteDialog({
                    title: "移动主页",
                    width: "100vh",
                    height: "100vh",
                    constructor: (containerEl: HTMLElement) => {
                        return new MobileHomepage({
                            target: containerEl,
                            props: {
                                plugin: this,
                                close: () => {
                                    this.currentMobileDialog.close();
                                },
                            },
                        });
                    },
                });
            } else {
                // 桌面端保持原有逻辑
                openTab({
                    app: this.app,
                    custom: {
                        icon: "iconhomepage",
                        title: "首页",
                        data: { text: "思源笔记首页" },
                        id: this.name + TAB_TYPE,
                    },
                });
            }
        }

        let USER_NAME, USER_ID
        await advanced.updateVIP().then((res) => {
            USER_NAME = res.USER_NAME;
            USER_ID = res.USER_ID;
        });
        await advanced.verifyLicense(
            this,
            USER_NAME,
            USER_ID,
        ).then(async (res) => {
            if (res.valid && res.code === 0) {
                this.ADVANCED = true;
                if (res.userInfo.remainingDays === 7) {
                    showMessage("您的激活码还有 7 天过期，建议及时更新！");
                } else if (res.userInfo.remainingDays === 3) {
                    showMessage("您的激活码还有 3 天过期，建议及时更新！");
                } else if (res.userInfo.remainingDays === 1) {
                    showMessage("您的激活码还有 1 天过期，建议及时更新！");
                }
            } else if (res.code === 5) {
                showMessage("❌ 您的激活码已过期！");
            }
        });
    }

    private registerIcon() {
        this.addIcons(`<symbol id="iconhomepage" viewBox="0 0 1024 1024">
                <path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15736"></path><path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15737"></path><path d="M512 165.341867L119.466667 467.9168V981.333333h785.066666V467.9168z" fill="#E0E1E2" p-id="15738"></path><path d="M1006.933333 810.666667a17.066667 17.066667 0 0 0-17.066666 17.066666v17.066667h-17.066667v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667h-34.133334a17.066667 17.066667 0 1 0 0 34.133333h34.133334v51.2h-34.133334a17.066667 17.066667 0 1 0 0 34.133334h34.133334v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-153.6a17.066667 17.066667 0 0 0-17.066667-17.066666z m-34.133333 119.466666v-51.2h17.066667v51.2h-17.066667zM119.466667 878.933333a17.066667 17.066667 0 1 0 0-34.133333H85.333333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667H34.133333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v153.6a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h34.133334a17.066667 17.066667 0 1 0 0-34.133334H85.333333v-51.2h34.133334z m-68.266667 51.2H34.133333v-51.2h17.066667v51.2z" fill="#E0E1E2" p-id="15739"></path><path d="M256 452.266667h204.8v136.533333H256zM256 691.2h204.8v170.666667H256zM563.2 452.266667h204.8v136.533333H563.2zM563.2 691.2h204.8v290.133333H563.2z" fill="#556080" p-id="15740"></path><path d="M563.2 452.266667h204.8v102.4H563.2zM256 452.266667h204.8v47.189333H256zM375.466667 759.466667v-68.266667h-34.133334v68.266667h-85.333333v34.133333h85.333333v68.266667h34.133334v-68.266667h85.333333v-34.133333z" fill="#7383BF" p-id="15741"></path>
            </symbol>`);

        this.addIcons(`<symbol id="iconTask" viewBox="0 0 1024 1024">
                <path d="M224.924444 967.111111C153.813333 967.111111 128 929.578667 128 862.620444V242.659556c0-62.421333 18.033778-105.671111 91.448889-105.671112h56.988444s32.711111 10.168889 32.711111 15.246223c0 38.727111 26.936889 79.018667 60.757334 79.018666h277.12c32.199111 0 59.136-40.206222 59.136-78.933333 0-5.077333 36.494222-15.246222 36.494222-15.246222h55.779556c67.726222 0 100.977778 43.278222 100.977777 105.671111v619.875555c0 75.064889-35.456 104.490667-106.510222 104.490667H224.924444z m63.104-420.366222a40.647111 40.647111 0 0 0 0.213334 56.675555l118.385778 118.528 1.607111 2.062223a38.812444 38.812444 0 0 0 55.808 0l251.889777-253.952a39.537778 39.537778 0 0 0-55.594666-56.234667L436.024889 639.544889l-91.776-93.44a40.604444 40.604444 0 0 0-27.875556-11.121778 40.064 40.064 0 0 0-28.344889 11.690667v0.071111z m125.454223-382.321778c-22.101333 0-39.921778-30.392889-40.035556-55.808C373.333333 83.2 391.196444 56.888889 413.482667 56.888889h190.791111c22.215111 0 40.035556 26.296889 40.035555 51.712 0 25.415111-17.820444 55.808-38.855111 55.808l-191.971555 0.014222z" fill="#323233" p-id="14715"></path>
            </symbol>`)
    }

    private registerCommand() {
        this.addCommand({
            langKey: "快速笔记",
            hotkey: "⇧⌘Q",
            callback: async () => {
                const homepageSettingConfig = await this.loadData("homepageSettingConfig.json");
                const quickNotesEnabled = homepageSettingConfig.quickNotesEnabled;
                const quickNotesPosition = homepageSettingConfig.quickNotesPosition;
                const quickNotesTimestampEnabled = homepageSettingConfig.quickNotesTimestampEnabled;
                const quickNotesAddPosition = homepageSettingConfig.quickNotesAddPosition;

                if (!quickNotesEnabled) {
                    showMessage("❌请先在主页设置中开启快速笔记");
                    return;
                } else if (quickNotesPosition == "") {
                    showMessage("❌请先在主页设置中设置快速笔记的位置");
                    return;
                } else {
                    const dialog = svelteDialog({
                        title: "快速笔记",
                        constructor: (containerEl: HTMLElement) => {
                            return new QuickNotesDialog({
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
    }

    private registerTopBar() {
        this.addTopBar({
            icon: "iconhomepage",
            title: "打开主页",
            position: "left",
            callback: () => {
                if (this.isMobile) {
                    // 移动端打开方式
                    this.currentMobileDialog = svelteDialog({
                        title: "移动主页",
                        width: "100vh",
                        height: "100vh",
                        constructor: (containerEl: HTMLElement) => {
                            return new MobileHomepage({
                                target: containerEl,
                                props: {
                                    plugin: this,
                                    close: () => {
                                        this.currentMobileDialog.close();
                                    },
                                },
                            });
                        },
                    });
                } else {
                    // 桌面端保持原有逻辑
                    openTab({
                        app: this.app,
                        custom: {
                            icon: "iconhomepage",
                            title: "首页",
                            data: { text: "思源笔记首页" },
                            id: this.name + TAB_TYPE,
                        },
                    });
                }
            }
        });
    }

    private async registerDock() {
        const sidebarEnabled = await this.loadData("homepageSettingConfig.json").then((res) => {
            return res.sidebarEnabled;
        })
        if (sidebarEnabled) {
            this.addDock({
                config: {
                    position: "RightTop",
                    size: { width: 200, height: 0 },
                    icon: "iconhomepage",
                    title: "侧边栏",
                    hotkey: "⌥⌘C",
                },
                data: {
                    text: "这是一个主页侧边栏。"
                },
                type: DOCK_TYPE,
                init: (dock) => {
                    const sidebarContainer = document.createElement("div");
                    new Sidebar({
                        target: sidebarContainer,
                        props: {
                            plugin: this,
                        }
                    });
                    dock.element.appendChild(sidebarContainer);
                },
            });
        }
    }

    private handleDocTreeMenu({ detail }: any) {
        if (detail?.type !== 'doc') return;

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
                    click: () => {
                        this.client.setBlockAttrs({
                            id: nodeId,
                            attrs: {
                                "customFavorites": "true"
                            }
                        }).then(() => {
                            showMessage("已收藏");
                        }).catch(err => {
                            console.error("收藏失败", err);
                            showMessage("收藏失败，请查看控制台日志");
                        });
                    }
                },
                {
                    icon: "iconClose",
                    label: "取消收藏",
                    click: () => {
                        this.client.setBlockAttrs({
                            id: nodeId,
                            attrs: {
                                "customFavorites": "false"
                            }
                        }).then(() => {
                            showMessage("已取消收藏");
                        }).catch(err => {
                            console.error("取消收藏失败", err);
                            showMessage("取消收藏失败，请查看控制台日志");
                        });
                    }
                }
            ]
        });
    }

    private handleContentMenu({ detail }: any) {
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
                            return new TasksEditingDialog({
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
}

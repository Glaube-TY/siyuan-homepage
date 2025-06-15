import {
    Plugin,
    showMessage,
    openTab,
    getFrontend,
    IModel,
} from "siyuan";

import * as sdk from "@siyuan-community/siyuan-sdk";
import Homepage from "./components/homepage.svelte";

const STORAGE_NAME = "menu-config";
const TAB_TYPE = "custom_tab";

export default class PluginHomepage extends Plugin {

    customTab: () => IModel;
    private isMobile: boolean;
    private docTreeMenuEventBindThis = this.handleDocTreeMenu.bind(this);

    client = new sdk.Client(undefined, 'fetch');

    async onload() {
        // 文档树右键菜单监听
        this.eventBus.on("open-menu-doctree", this.docTreeMenuEventBindThis);

        // 注册图标
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        // 自定义图标
        this.addIcons(`<symbol id="iconhomepage" viewBox="0 0 1024 1024">
                <path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15736"></path><path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15737"></path><path d="M512 165.341867L119.466667 467.9168V981.333333h785.066666V467.9168z" fill="#E0E1E2" p-id="15738"></path><path d="M1006.933333 810.666667a17.066667 17.066667 0 0 0-17.066666 17.066666v17.066667h-17.066667v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667h-34.133334a17.066667 17.066667 0 1 0 0 34.133333h34.133334v51.2h-34.133334a17.066667 17.066667 0 1 0 0 34.133334h34.133334v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-153.6a17.066667 17.066667 0 0 0-17.066667-17.066666z m-34.133333 119.466666v-51.2h17.066667v51.2h-17.066667zM119.466667 878.933333a17.066667 17.066667 0 1 0 0-34.133333H85.333333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667H34.133333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v153.6a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h34.133334a17.066667 17.066667 0 1 0 0-34.133334H85.333333v-51.2h34.133334z m-68.266667 51.2H34.133333v-51.2h17.066667v51.2z" fill="#E0E1E2" p-id="15739"></path><path d="M256 452.266667h204.8v136.533333H256zM256 691.2h204.8v170.666667H256zM563.2 452.266667h204.8v136.533333H563.2zM563.2 691.2h204.8v290.133333H563.2z" fill="#556080" p-id="15740"></path><path d="M563.2 452.266667h204.8v102.4H563.2zM256 452.266667h204.8v47.189333H256zM375.466667 759.466667v-68.266667h-34.133334v68.266667h-85.333333v34.133333h85.333333v68.266667h34.133334v-68.266667h85.333333v-34.133333z" fill="#7383BF" p-id="15741"></path>
            </symbol>`);

        // 顶部栏主页按钮
        this.addTopBar({
            icon: "iconhomepage",
            title: "打开主页",
            position: "left",  // 位置为左侧
            callback: () => {
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
        });
    }

    async onunload() {
        // 移除文档数右键菜单监听
        this.eventBus.off("open-menu-doctree", this.docTreeMenuEventBindThis);
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

    // 文档树右键菜单事件处理
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
}

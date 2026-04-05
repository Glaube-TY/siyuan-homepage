import { svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./styleSetting.svelte";
import WidgetBlockContent from "./contentSetting.svelte";
import { setBlockSize } from "./utils/block-size-handler";
import { saveLayout } from "./utils/layout-handler";
import { saveLayout as saveSidebarLayout } from "@/components/utils/sidebar/widget_layout";
import { saveLayout as saveMobileLayout } from "@/components/utils/mobileHomepage/mobileHomepage_layout";
import latestDocs from "./widget/latestDocs/latestDocs.svelte";
import latestDailyNotes from "./widget/latestDailyNotes/latestDailyNotes.svelte";
import TaskMan from "./widget/tasks/recentTasks.svelte";
import countdown from "./widget/countdown/countdown.svelte";
import weather from "./widget/weather/weather.svelte";
import HOT from "./widget/HOT/HOT.svelte";
import favorites from "./widget/favorites/favorites.svelte";
import heatmap from "./widget/heatmap/heatmap.svelte";
import customText from "./widget/customText/customText.svelte";
import customWeb from "./widget/webview/webview.svelte";
import customProtyle from "./widget/protyle/protyle.svelte";
import timedate from "./widget/timedate/timedate.svelte";
import focus from "./widget/focus/focus.svelte";
import sql from "./widget/sql/sql.svelte";
import TaskManPlus from "./widget/tasksPlus/tasksPlus.svelte";
import quickNotes from "./widget/quickNotes/quickNotes.svelte";
import dailyQuote from "./widget/dailyQuote/dailyQuote.svelte";
import visualChart from "./widget/visualChart/visualChart.svelte";
import musicPlayer from "./widget/musicPlayer/musicPlayer.svelte";
import Stikynot from "./widget/stikynot/stikynot.svelte";
import News from "./widget/News/News.svelte";
import databaseChart from "./widget/databaseChart/databaseChart.svelte";
import childDocs from "./widget/childDocs/childDocs.svelte";
import constellation from "./widget/constellation/constellation.svelte";
import historyDays from "./widget/historyDays/historyDays.svelte";
import statisticalCard from "./widget/statisticalCard/statisticalCard.svelte";
import almanac from "./widget/almanac/almanac.svelte";
import PicCaro from "./widget/PicCaro/PicCaro.svelte";
import CYBMOK from "./widget/CYBMOK/CYBMOK.svelte";
import countdownTimer from "./widget/countdownTimer/countdownTimer.svelte";
import conditionDocs from "./widget/conditionDocs/conditionDocs.svelte";
import { mount } from "svelte";

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;
    public widgetLayoutNumber: number;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
    ) {
        this.id = id || `block-${Date.now()}`;
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.style = style || 'aspect-ratio: 1 / 1;background-color: rgba(0, 0, 0, 0.03);draggable: true;border: 2px solid var(--b3-theme-primary);box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);transition: all 0.2s ease-in-out;border-radius: 8px;';
        this.loadcontent = loadcontent || '';

        plugin.loadData("homepageSettingConfig.json").then((config: { widgetLayoutNumber?: number }) => {
            this.widgetLayoutNumber = config.widgetLayoutNumber || 4;
        });

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;

        this.element.innerHTML = `
            <button class="block-style-button" title="样式设置">🎨</button>
            <button class="drag-handle" title="拖拽组件">🧲</button>
            <button class="block-content-button" title="内容设置">⚙️</button>
        `;

        this.element.setAttribute("style", this.style);

        this.setupEventListeners();
    }

    private setupEventListeners() {
        const styleButton = this.element.querySelector(".block-style-button");
        const contentButton = this.element.querySelector(".block-content-button");
        const updateButton = this.element.querySelector(".block-update-button");

        if (styleButton) {
            styleButton.addEventListener("click", () => {
                this.currentBlockForSettingsRef.value = this.element;

                const dialogRef = svelteDialog({
                    title: "组件样式",
                    constructor: (containerEl: HTMLElement) => {
                        return mount(WidgetBlockStyle, {
                                                    target: containerEl,
                                                    props: {
                                                        plugin: this.plugin,
                                                        currentBlockId: this.element.id,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onDelete: () => {
                                                            if (this.currentBlockForSettingsRef.value) {
                                                                this.currentBlockForSettingsRef.value.remove();
                                                                this.currentBlockForSettingsRef.value = null;
                                                            }
                                                            dialogRef.close();
                                                            saveLayout(this.plugin);
                                                            saveSidebarLayout(this.plugin);
                                                            saveMobileLayout(this.plugin);
                                                            this.plugin.removeData(`widget-${this.id}.json`);
                                                        },
                                                        onSetSize: (size: number) => {
                                                            setBlockSize(this.currentBlockForSettingsRef.value, size, this.widgetLayoutNumber);
                                                            dialogRef.close();
                                                        },
                                                    },
                                                });
                    },
                });
            });
        }

        if (contentButton) {
            contentButton.addEventListener("click", () => {
                this.currentBlockForSettingsRef.value = this.element;

                const dialogRef = svelteDialog({
                    title: "组件内容",
                    constructor: (containerEl: HTMLElement) => {
                        return mount(WidgetBlockContent, {
                                                    target: containerEl,
                                                    props: {
                                                        plugin: this.plugin,
                                                        currentBlockId: this.element.id,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onConfirm: (contentTypeJson: string) => {
                                                            const blockElement = document.getElementById(this.id);
                                                            if (blockElement) {
                                                                this.updateContent(contentTypeJson);
                                                            }
                                                            this.plugin.saveData(`widget-${this.id}.json`, contentTypeJson);
                                                            dialogRef.close();
                                                        }
                                                    },
                                                });
                    },
                });
            });
        }

        if (updateButton) {
            updateButton.addEventListener("click", async () => {
                const widgetConfig = await this.plugin.loadData(`widget-${this.id}.json`);
                if (widgetConfig) {
                    this.updateContent(JSON.stringify(widgetConfig));
                } else {
                    console.warn("未找到对应的 widget 配置");
                }
            });
        }
    }

    public appendTo(container: Element | null) {
        if (container) {
            container.appendChild(this.element);
        }
    }

    public updateContent(contentTypeJson?: string): void {
        if (!contentTypeJson) {
            console.warn("未提供有效的 content 数据");
            return;
        }

        let contentData: any;

        try {
            contentData = JSON.parse(contentTypeJson);
        } catch (e) {
            console.error("无法解析 JSON 数据", e);
            return;
        }

        this.element.innerHTML = `
        <button class="block-style-button" title="样式设置">🎨</button>
        <button class="drag-handle" title="拖拽组件">🧲</button>
        <button class="block-content-button" title="内容设置">⚙️</button>
        <button class="block-update-button" title="刷新组件">🔄</button>
        `;

        // 根据 content 类型动态加载组件
        if (contentData.type === "latest-docs") {
            mount(latestDocs, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "heatmap") {
            mount(heatmap, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "favorites") {
            mount(favorites, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "recent-journals") {
            mount(latestDailyNotes, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "TaskMan") {
            mount(TaskMan, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "countdown") {
            mount(countdown, {
                            target: this.element,
                            props: {
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "weather") {
            mount(weather, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "HOT") {
            mount(HOT, {
                            target: this.element,
                            props: {
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "custom-text") {
            mount(customText, {
                            target: this.element,
                            props: {
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "custom-web") {
            mount(customWeb, {
                            target: this.element,
                            props: {
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "custom-protyle") {
            mount(customProtyle, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "timedate") {
            mount(timedate, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "focus") {
            mount(focus, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "sql") {
            mount(sql, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "TaskManPlus") {
            mount(TaskManPlus, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "quick-notes") {
            mount(quickNotes, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "dailyQuote") {
            mount(dailyQuote, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "visualChart") {
            mount(visualChart, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "musicPlayer") {
            mount(musicPlayer, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "stikynot") {
            mount(Stikynot, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "News") {
            mount(News, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "databaseChart") {
            mount(databaseChart, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "childDocs") {
            mount(childDocs, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "constellation") {
            mount(constellation, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "historyDays") {
            mount(historyDays, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "statisticalCard") {
            mount(statisticalCard, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "almanac") {
            mount(almanac, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "PicCaro") {
            mount(PicCaro, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "CYBMOK") {
            mount(CYBMOK, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "countdownTimer") {
            mount(countdownTimer, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        } else if (contentData.type === "conditionDocs") {
            mount(conditionDocs, {
                            target: this.element,
                            props: {
                                plugin: this.plugin,
                                contentTypeJson: contentTypeJson
                            }
                        });
        }



        // 重新绑定按钮事件（如果需要）
        this.setupEventListeners();
    }
}
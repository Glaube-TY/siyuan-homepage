import { confirmDialogBoolean, svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./styleSetting.svelte";
import WidgetBlockContent from "./contentSetting.svelte";
import { setBlockSize } from "./utils/block-size-handler";
import { mountWidgetContent, type WidgetRuntimeContext } from "./widgetMountRegistry";
import { mount, unmount } from "svelte";
import { deleteWidgetFromSurface, loadWidgetLayoutSettings, stringifyWidgetConfigForMount, normalizeWidgetConfigData } from "./utils/layout-shared";
import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
import { Menu, showMessage } from "siyuan";
import type { HomepageLayoutRuntimeOptions } from "./utils/layout-handler";
import { saveWidgetContentPreservingSize } from "./styleUtils";
import { createWidgetInstanceId, loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import { applyWidgetAppearanceCompatibility } from "@/homepage/theme/widgetAppearance/widgetAppearanceCompat";
import { getWidgetDefinition } from "./widgetDefinitionRegistry";
import {
    resolveWidgetContextMenuActionLabel,
    resolveWidgetContextMenuActions,
    type WidgetContextMenuActionContext,
} from "./widgetContextMenuActions";

// 内部交互控件和显式声明的区域保留自己的右键行为。
// 第三方组件可在任意容器上添加 data-widget-native-context-menu 作为逃生口。
const WIDGET_NATIVE_CONTEXT_MENU_SELECTOR = [
    "input",
    "textarea",
    "select",
    "option",
    "iframe",
    "a",
    "button",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']",
    "[role='combobox']",
    "[role='menu']",
    "[role='option']",
    "[role='slider']",
    "[data-widget-native-context-menu]",
    "[data-widget-editor]",
    ".protyle",
    ".protyle-wysiwyg",
    ".ql-editor",
    ".ProseMirror",
].join(",");

export class WidgetBlock {
    private static forcedContextMenuRouterUsers = 0;
    private static pendingForcedContextMenuWidget: WidgetBlock | null = null;

    private static readonly handleWindowForcedContextMenuGesture = (event: MouseEvent): void => {
        if (!event.altKey || event.button !== 2) return;

        const target = event.target;
        if (!(target instanceof Element)) return;
        const widgetElement = target.closest<HTMLElement>(".widget-block");
        const widget = (widgetElement as any)?.__widgetBlockInstance;
        if (!(widget instanceof WidgetBlock)) return;

        // 必须在 window 捕获阶段截断。Protyle 的正文 contextmenu 会操作思源的
        // 全局单例菜单；等事件抵达组件元素再阻止已经太晚，菜单会相互覆盖。
        event.preventDefault();
        event.stopImmediatePropagation();
        widget.handleForcedContextMenuGesture(event);
    };

    private static readonly handleWindowForcedContextMenuKeyUp = (event: KeyboardEvent): void => {
        if (event.key !== "Alt") return;

        const widget = WidgetBlock.pendingForcedContextMenuWidget;
        WidgetBlock.pendingForcedContextMenuWidget = null;
        if (!widget) return;

        // 此监听位于捕获阶段，但真正打开使用 setTimeout；因此 Protyle 的目标/冒泡
        // keyup 会先完整执行并收尾其工具栏与菜单状态，之后组件菜单才出现。
        widget.scheduleForcedContextMenu();
    };

    private static readonly handleWindowForcedContextMenuBlur = (): void => {
        WidgetBlock.pendingForcedContextMenuWidget = null;
    };

    private static retainForcedContextMenuRouter(): void {
        if (WidgetBlock.forcedContextMenuRouterUsers === 0) {
            window.addEventListener("mousedown", WidgetBlock.handleWindowForcedContextMenuGesture, true);
            window.addEventListener("mouseup", WidgetBlock.handleWindowForcedContextMenuGesture, true);
            window.addEventListener("contextmenu", WidgetBlock.handleWindowForcedContextMenuGesture, true);
            window.addEventListener("keyup", WidgetBlock.handleWindowForcedContextMenuKeyUp, true);
            window.addEventListener("blur", WidgetBlock.handleWindowForcedContextMenuBlur, true);
        }
        WidgetBlock.forcedContextMenuRouterUsers += 1;
    }

    private static releaseForcedContextMenuRouter(): void {
        WidgetBlock.forcedContextMenuRouterUsers = Math.max(
            0,
            WidgetBlock.forcedContextMenuRouterUsers - 1,
        );
        if (WidgetBlock.forcedContextMenuRouterUsers === 0) {
            window.removeEventListener("mousedown", WidgetBlock.handleWindowForcedContextMenuGesture, true);
            window.removeEventListener("mouseup", WidgetBlock.handleWindowForcedContextMenuGesture, true);
            window.removeEventListener("contextmenu", WidgetBlock.handleWindowForcedContextMenuGesture, true);
            window.removeEventListener("keyup", WidgetBlock.handleWindowForcedContextMenuKeyUp, true);
            window.removeEventListener("blur", WidgetBlock.handleWindowForcedContextMenuBlur, true);
            WidgetBlock.pendingForcedContextMenuWidget = null;
        }
    }

    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;
    public widgetLayoutNumber: number = 4;

    private readonly plugin: any;
    private forcedContextMenuRouterRetained = false;
    private forcedContextMenuGestureActive = false;
    private forcedContextMenuTimer = 0;
    private forcedContextMenuX = 0;
    private forcedContextMenuY = 0;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private runtimeOptions: HomepageLayoutRuntimeOptions;
    private mountedWidget: Record<string, any> | null = null;
    private isNewInstance: boolean;
    /** 当前 WidgetBlock 的新组件草稿配置是否已经持久化（create 成功）。用于布局提交失败后可安全重试。 */
    private draftConfigPersisted: boolean = false;
    private initialEmptyCommit: Promise<boolean> | null = null;

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
        runtimeOptions: HomepageLayoutRuntimeOptions = {},
    ) {
        this.isNewInstance = !id;
        this.id = id || createWidgetInstanceId();
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.runtimeOptions = runtimeOptions;
        this.runtimeOptions.deviceViewContext ||= getCurrentDeviceViewContext(plugin, "desktop-homepage");
        this.style = style || "aspect-ratio: 1 / 1;";
        this.loadcontent = loadcontent || '';

        // 从当前设备 desktop-homepage/layout.json 读取列数。
        loadWidgetLayoutSettings(plugin, runtimeOptions, runtimeOptions.deviceViewContext).then((settings) => {
            this.widgetLayoutNumber = settings.widgetLayoutNumber;
        }).catch((error) => {
            console.warn(`[WidgetBlock] 异步读取布局列数失败 (${this.id})`, error);
        });

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;
        this.element.dataset.widgetMountState = "idle";
        if (this.isNewInstance) {
            this.element.dataset.widgetDraft = "true";
        }

        this.element.innerHTML = this.renderControls();

        this.element.setAttribute("style", this.style);
        const appearance = applyWidgetAppearanceCompatibility(this.element, this.style);
        this.style = appearance.runtimeStyle;

        // 在 DOM 上挂载实例引用，便于外部统一销毁
        (this.element as any).__widgetBlockInstance = this;

        this.setupEventListeners();
    }

    private renderControls(): string {
        return `
            <button class="drag-handle" type="button" title="拖拽组件" aria-label="拖拽组件">${renderSiyuanIcon("drag", 14)}</button>
        `;
    }

    // 公开销毁方法：统一清理 widget 实例
    public destroy(): void {
        this.element.removeEventListener("contextmenu", this.handleContextMenu);
        if (this.forcedContextMenuTimer) {
            window.clearTimeout(this.forcedContextMenuTimer);
            this.forcedContextMenuTimer = 0;
        }
        if (this.forcedContextMenuRouterRetained) {
            if (WidgetBlock.pendingForcedContextMenuWidget === this) {
                WidgetBlock.pendingForcedContextMenuWidget = null;
            }
            WidgetBlock.releaseForcedContextMenuRouter();
            this.forcedContextMenuRouterRetained = false;
        }
        this.cleanupMountedWidget();
        (this.element as any).__widgetBlockInstance = null;
    }

    private cleanupMountedWidget(): void {
        if (this.mountedWidget) {
            unmount(this.mountedWidget);
            this.mountedWidget = null;
        }
        this.element.dataset.widgetMountState = "idle";
    }

    /**
     * 只反映 Svelte 实例是否已经成功挂载。
     * 布局恢复用它区分“完整组件”和“只有外壳的占位块”，避免重建正在运行的组件。
     */
    public hasMountedContent(): boolean {
        return this.mountedWidget !== null && this.element.dataset.widgetMountState === "ready";
    }

    /**
     * 新增组件立即落成一个合法的空文字组件，避免未配置草稿在布局恢复时被丢弃。
     * 布局写入完成前禁用拖动，保证首次拖动使用最新 revision。
     */
    public persistInitialEmptyContent(): Promise<boolean> {
        if (!this.isNewInstance) return Promise.resolve(true);
        if (this.initialEmptyCommit) return this.initialEmptyCommit;

        this.initialEmptyCommit = this.commitInitialEmptyContent()
            .finally(() => {
                this.initialEmptyCommit = null;
            });
        return this.initialEmptyCommit;
    }

    private async commitInitialEmptyContent(): Promise<boolean> {
        const dragHandle = this.element.querySelector<HTMLButtonElement>(".drag-handle");
        if (dragHandle) dragHandle.disabled = true;
        const emptyConfig = {
            activeTab: "custom",
            type: "custom-text",
            instanceId: this.id,
            data: [{ customText: "" }],
        };

        try {
            if (!this.draftConfigPersisted) {
                await saveWidgetContentPreservingSize(
                    this.plugin,
                    this.id,
                    emptyConfig,
                    this.runtimeOptions.deviceViewContext!,
                    this.element,
                    true,
                );
                this.draftConfigPersisted = true;
            }

            if (this.runtimeOptions.onFirstContentCommitted) {
                const committed = await this.runtimeOptions.onFirstContentCommitted(this.id, this.runtimeOptions);
                if (!committed) throw new Error(this.element.parentElement?.dataset.layoutSaveError || "主页布局写入失败");
            }

            this.updateContent(JSON.stringify(emptyConfig));
            this.isNewInstance = false;
            this.draftConfigPersisted = false;
            delete this.element.dataset.widgetDraft;
            return true;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            showMessage(`空白组件保存失败：${reason}`, 5000, "error");
            return false;
        } finally {
            if (dragHandle?.isConnected) dragHandle.disabled = false;
        }
    }

    public isRuntimeForSection(sectionId: string | null, context: DeviceViewContext): boolean {
        const currentSectionId = this.runtimeOptions.sectionId || null;
        const runtimeContext = this.runtimeOptions.deviceViewContext;
        return (
            currentSectionId === (sectionId || null)
            && runtimeContext?.scopeId === context.scopeId
            && runtimeContext?.surface === context.surface
        );
    }

    /** 仅用于可逆 DOM 事务保存当前运行上下文，不写入任何持久化文件。 */
    public getRuntimeOptionsSnapshot(): HomepageLayoutRuntimeOptions {
        return {
            sectionsEnabled: this.runtimeOptions.sectionsEnabled,
            sectionId: this.runtimeOptions.sectionId,
            deviceViewContext: this.runtimeOptions.deviceViewContext,
            componentSectionContainers: this.runtimeOptions.componentSectionContainers,
            preservedWidgetElements: this.runtimeOptions.preservedWidgetElements,
        };
    }

    public showMountError(message = "组件暂时无法加载，切换回此分栏时将重试"): void {
        this.cleanupMountedWidget();
        this.element.innerHTML = this.renderControls();
        const errorElement = document.createElement("div");
        errorElement.className = "homepage-widget-local-error";
        errorElement.setAttribute("role", "status");
        errorElement.textContent = message;
        this.element.appendChild(errorElement);
        this.element.dataset.widgetMountState = "failed";
    }

    /**
     * 只在组件内容缺失时挂载；已成功挂载的实例保持原样。
     * 容器不可见时等待可见后再挂载，避免 ECharts 等组件在零尺寸容器初始化。
     */
    public async ensureContentMounted(contentTypeJson?: string, runtimeContext: WidgetRuntimeContext = {}): Promise<boolean> {
        if (this.hasMountedContent()) {
            return true;
        }
        if (!contentTypeJson) {
            return false;
        }
        if (!this.isElementVisible()) {
            const visible = await this.waitForElementVisible();
            if (!visible) {
                return false;
            }
        }
        this.updateContent(contentTypeJson, runtimeContext);
        return this.hasMountedContent();
    }

    private isElementVisible(): boolean {
        return (
            this.element.isConnected
            && this.element.clientWidth > 0
            && this.element.clientHeight > 0
            && getComputedStyle(this.element).display !== "none"
        );
    }

    private waitForElementVisible(timeoutMs = 1000): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.isElementVisible()) {
                resolve(true);
                return;
            }
            const observer = new ResizeObserver(() => {
                if (this.isElementVisible()) {
                    cleanup();
                    resolve(true);
                }
            });
            let rafId = 0;
            let timer = 0;
            const cleanup = () => {
                observer.disconnect();
                if (rafId) cancelAnimationFrame(rafId);
                if (timer) window.clearTimeout(timer);
            };
            observer.observe(this.element);
            rafId = requestAnimationFrame(() => {
                if (this.isElementVisible()) {
                    cleanup();
                    resolve(true);
                }
            });
            timer = window.setTimeout(() => {
                cleanup();
                resolve(this.isElementVisible());
            }, timeoutMs);
        });
    }

    /** 容器模式切换时沿用现有实例，并更新其后续保存、隐藏和移动所使用的分栏上下文。 */
    public async updateRuntimeOptions(runtimeOptions: HomepageLayoutRuntimeOptions): Promise<void> {
        const settings = await loadWidgetLayoutSettings(
            this.plugin,
            runtimeOptions,
            runtimeOptions.deviceViewContext,
        );
        this.runtimeOptions = { ...this.runtimeOptions, ...runtimeOptions };
        this.widgetLayoutNumber = settings.widgetLayoutNumber;
    }

    private setupEventListeners(): void {
        // Alt + 右键由共享的 window 捕获路由处理，早于 Protyle 的正文监听。
        // 普通右键仍保留冒泡监听和编辑器放行规则。
        if (!this.forcedContextMenuRouterRetained) {
            WidgetBlock.retainForcedContextMenuRouter();
            this.forcedContextMenuRouterRetained = true;
        }
        this.element.addEventListener("contextmenu", this.handleContextMenu);
    }

    private handleForcedContextMenuGesture(event: MouseEvent): void {
        this.forcedContextMenuX = event.clientX;
        this.forcedContextMenuY = event.clientY;

        if (event.type === "mousedown") {
            WidgetBlock.pendingForcedContextMenuWidget = null;
            this.forcedContextMenuGestureActive = true;
            if (this.forcedContextMenuTimer) {
                window.clearTimeout(this.forcedContextMenuTimer);
                this.forcedContextMenuTimer = 0;
            }
            return;
        }

        if (event.type === "contextmenu" && this.forcedContextMenuGestureActive) {
            // Chromium/平台可能在 mouseup 前派发 contextmenu。此时先记住坐标，
            // 统一等 mouseup，避免后续抬键逻辑把刚打开的菜单关闭。
            return;
        }

        if (event.type === "mouseup") {
            this.forcedContextMenuGestureActive = false;
        }

        // Alt 仍按下时不创建菜单。聚焦的 Protyle 会在 Alt keyup 中刷新全局菜单，
        // 若提前打开，组件菜单就会一闪而过。统一交给 keyup 收尾后再打开。
        WidgetBlock.pendingForcedContextMenuWidget = this;
    }

    private scheduleForcedContextMenu(): void {
        if (this.forcedContextMenuTimer) {
            window.clearTimeout(this.forcedContextMenuTimer);
        }
        this.forcedContextMenuTimer = window.setTimeout(() => {
            this.forcedContextMenuTimer = 0;
            if (this.element.isConnected) {
                this.openContextMenu(this.forcedContextMenuX, this.forcedContextMenuY);
            }
        }, 0);
    }

    private readonly handleContextMenu = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest(WIDGET_NATIVE_CONTEXT_MENU_SELECTOR)) return;

        event.preventDefault();
        event.stopPropagation();
        this.openContextMenu(event.clientX, event.clientY);
    };

    private openContextMenu(clientX: number, clientY: number): void {
        const menu = new Menu("homepage-widget-context-menu");
        menu.addItem({
            icon: "iconSettings",
            label: "内容设置",
            click: () => this.openContentSettings(),
        });
        menu.addItem({
            icon: "iconRefresh",
            label: "刷新组件",
            disabled: this.isNewInstance && !this.draftConfigPersisted,
            click: () => void this.refreshContent(),
        });

        const widgetType = this.element.dataset.widgetType || "";
        const definition = widgetType ? getWidgetDefinition(widgetType) : undefined;
        const actionContext = definition?.contextMenuActions?.length
            ? this.createContextMenuActionContext(widgetType)
            : null;
        const widgetActions = actionContext
            ? resolveWidgetContextMenuActions(definition?.contextMenuActions, actionContext)
            : [];
        if (actionContext && widgetActions.length) {
            menu.addSeparator();
            for (const action of widgetActions) {
                menu.addItem({
                    ...(action.icon ? { icon: action.icon } : {}),
                    label: resolveWidgetContextMenuActionLabel(action, actionContext),
                    disabled: action.disabled?.(actionContext) === true,
                    click: () => void Promise.resolve(action.execute(actionContext)).catch((error) => {
                        const message = error instanceof Error ? error.message : String(error);
                        showMessage(`组件操作失败：${message}`, 5000, "error");
                    }),
                });
            }
        }
        menu.addSeparator();
        menu.addItem({
            icon: "iconTheme",
            label: this.resolveAppearancePolicy() === "theme-controlled" ? "组件大小" : "样式设置",
            click: () => this.openStyleSettings(),
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconTrashcan",
            label: "删除组件",
            warning: true,
            click: () => void this.confirmAndDeleteFromCurrentSurface(),
        });

        const rect = this.element.getBoundingClientRect();
        const openedFromKeyboard = clientX === 0 && clientY === 0;
        menu.open({
            x: openedFromKeyboard ? rect.right : clientX,
            y: openedFromKeyboard ? rect.top + 8 : clientY,
            isLeft: false,
        });
    }

    private createContextMenuActionContext(widgetType: string): WidgetContextMenuActionContext {
        return {
            widgetType,
            widgetId: this.id,
            plugin: this.plugin,
            element: this.element,
            placement: "homepage",
            deviceViewContext: this.runtimeOptions.deviceViewContext!,
            hasPersistedConfig: !this.isNewInstance || this.draftConfigPersisted,
            loadConfig: () => loadWidgetInstanceConfig(this.runtimeOptions.deviceViewContext!, this.id),
            saveConfig: async (config) => {
                await saveWidgetContentPreservingSize(
                    this.plugin,
                    this.id,
                    config,
                    this.runtimeOptions.deviceViewContext!,
                    this.element,
                );
                this.updateContent(JSON.stringify(config), { refreshReason: "settings" });
            },
            refresh: () => this.refreshContent(),
        };
    }

    private resolveAppearancePolicy(): "theme-controlled" | "user-configurable" {
        return this.element
            .closest<HTMLElement>(".homepage-container[data-hp-widget-appearance-policy]")
            ?.dataset.hpWidgetAppearancePolicy === "theme-controlled"
            ? "theme-controlled"
            : "user-configurable";
    }

    private openStyleSettings(): void {
                this.currentBlockForSettingsRef.value = this.element;
                const appearancePolicy = this.resolveAppearancePolicy();

                const dialogRef = svelteDialog({
                    title: "组件样式",
                    constructor: (containerEl: HTMLElement) => {
                        return mount(WidgetBlockStyle, {
                                                    target: containerEl,
                                                    props: {
                                                        plugin: this.plugin,
                                                        currentBlockId: this.element.id,
                                                        deviceViewContext: this.runtimeOptions.deviceViewContext,
                                                        blockElement: this.element,
                                                        appearancePolicy,
                                                        hasPersistedConfig: !this.isNewInstance || this.draftConfigPersisted,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onSetSize: async (size: number) => {
                                                            const layoutNumber = this.widgetLayoutNumber;
                                                            await setBlockSize(this.currentBlockForSettingsRef.value, size, layoutNumber);
                                                        },
                                                        layoutRuntimeOptions: this.runtimeOptions,
                                                    },
                                                });
                    },
                });
    }

    private async confirmAndDeleteFromCurrentSurface(): Promise<void> {
        const confirmed = await confirmDialogBoolean({
            title: "删除组件",
            content: "确定要从当前界面删除这个组件吗？\n\n布局引用和组件配置会按现有保护规则处理，此操作无法撤销。",
        });
        if (!confirmed) return;

        if (this.isNewInstance && !this.draftConfigPersisted) {
            this.destroy();
            this.element.remove();
            this.currentBlockForSettingsRef.value = null;
            showMessage("组件已从当前界面删除", 3000);
            return;
        }

        try {
            const result = await deleteWidgetFromSurface(
                this.runtimeOptions.deviceViewContext!,
                this.id,
            );
            if (result.status === "success" || result.status === "layoutCommittedConfigRetained") {
                try {
                    this.destroy();
                } catch (error) {
                    console.warn("[WidgetBlock] destroy failed after delete:", error);
                }
                this.element.remove();
                this.currentBlockForSettingsRef.value = null;
                if (result.status === "layoutCommittedConfigRetained") {
                    showMessage("组件已从主页移除，配置文件因保护性错误保留", 5000);
                } else {
                    showMessage("组件已从当前界面删除", 3000);
                }
                return;
            }
            if (result.status === "notCommitted") {
                showMessage(`组件删除失败（布局未提交）：${result.reason}`, 5000, "error");
                return;
            }
            showMessage(`组件删除状态无法确认，请人工检查：${result.reason}`, 6000, "error");
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            showMessage(`组件删除失败：${reason}`, 5000, "error");
        }
    }

    private openContentSettings(): void {
                this.currentBlockForSettingsRef.value = this.element;

                const dialogRef = svelteDialog({
                    title: "组件内容",
                    width: "min(750px, calc(100vw - 32px))",
                    height: "72vh",
                    constructor: (containerEl: HTMLElement) => {
                        return mount(WidgetBlockContent, {
                                                    target: containerEl,
                                                    props: {
                                                        plugin: this.plugin,
                                                        currentBlockId: this.element.id,
                                                        deviceViewContext: this.runtimeOptions.deviceViewContext,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onConfirm: async (contentTypeJson: string) => {
                                                            this.updateContent(contentTypeJson);

                                                            // 新组件首次创建成功后，后续重试使用 save/update 模式，避免 create 重复导致文件已存在错误。
                                                            const shouldCreate = this.isNewInstance && !this.draftConfigPersisted;
                                                            await saveWidgetContentPreservingSize(
                                                                this.plugin,
                                                                this.id,
                                                                JSON.parse(contentTypeJson),
                                                                this.runtimeOptions.deviceViewContext!,
                                                                this.element,
                                                                shouldCreate,
                                                            );

                                                            // 配置已经持久化（create 或 save 成功），标记草稿已持久化。
                                                            // 后续再次确认即可安全走 save 分支，允许布局提交失败后重试。
                                                            this.draftConfigPersisted = true;

                                                            // 写后重新读取校验：失败时保留草稿，不提交布局引用。
                                                            const reloaded = await loadWidgetInstanceConfig(
                                                                this.runtimeOptions.deviceViewContext!,
                                                                this.id,
                                                            );
                                                            const normalized = normalizeWidgetConfigData(reloaded);
                                                            const hasValidType = normalized !== null
                                                                && typeof normalized.type === "string"
                                                                && normalized.type.trim().length > 0;
                                                            if (!hasValidType) {
                                                                throw new Error("组件配置写后校验失败，请重试");
                                                            }

                                                            // 仅新组件需要把写后验证通过的组件提交到当前分栏/全局布局。
                                                            // 已有组件编辑成功即可关闭对话框，不依赖布局签名更新。
                                                            if (this.isNewInstance && this.runtimeOptions.onFirstContentCommitted) {
                                                                const committed = await this.runtimeOptions.onFirstContentCommitted(
                                                                    this.id,
                                                                    this.runtimeOptions,
                                                                );
                                                                if (!committed) {
                                                                    // 布局提交失败：保持 widgetDraft、isNewInstance 与 draftConfigPersisted，允许用户重试。
                                                                    const saveReason = this.element.parentElement?.dataset.layoutSaveError;
                                                                    throw new Error(
                                                                        saveReason
                                                                            ? `组件内容已保存，但主页布局写入失败：${saveReason}`
                                                                            : "组件内容已保存，但主页布局写入失败，请重试",
                                                                    );
                                                                }
                                                            }

                                                            this.isNewInstance = false;
                                                            this.draftConfigPersisted = false;
                                                            delete this.element.dataset.widgetDraft;
                                                            dialogRef.close();
                                                        }
                                                    },
                                                });
                    },
                });
    }

    private async refreshContent(): Promise<void> {
        const widgetConfig = await loadWidgetInstanceConfig(this.runtimeOptions.deviceViewContext!, this.id);
        if (widgetConfig) {
            this.updateContent(stringifyWidgetConfigForMount(widgetConfig) || '', {
                forceIndexRefresh: true,
                refreshReason: "manual",
            });
        }
    }

    public appendTo(container: Element | null) {
        if (container) {
            container.appendChild(this.element);
        }
    }

    public updateContent(contentTypeJson?: string, runtimeContext: WidgetRuntimeContext = {}): void {
        if (!contentTypeJson) {
            return;
        }

        this.cleanupMountedWidget();

        this.element.innerHTML = this.renderControls();
        this.element.dataset.widgetMountState = "mounting";

        try {
            this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson, {
                deviceViewContext: this.runtimeOptions.deviceViewContext,
                ...runtimeContext,
            });
            this.element.dataset.widgetMountState = this.mountedWidget ? "ready" : "failed";
        } catch (error) {
            this.mountedWidget = null;
            this.element.dataset.widgetMountState = "failed";
            throw error;
        }
    }
}

import { unmount } from "svelte";
import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
import { mountWidgetContent, type WidgetRuntimeContext } from "../../components/utils/widgetBlock/widgetMountRegistry";
import { stringifyWidgetConfigForMount } from "../../components/utils/widgetBlock/utils/layout-shared";
import { createWidgetInstanceId, loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import { getWidgetDefinition } from "@/components/utils/widgetBlock/widgetDefinitionRegistry";
import {
    resolveWidgetContextMenuActionLabel,
    resolveWidgetContextMenuActions,
    type WidgetContextMenuActionContext,
} from "@/components/utils/widgetBlock/widgetContextMenuActions";
import { saveWidgetContentPreservingSize } from "@/components/utils/widgetBlock/styleUtils";

type MobileWidgetEventName =
    | "mobile-widget-action"
    | "mobile-widget-longpress"
    | "mobile-widget-refreshed";

export interface MobileWidgetContextAction {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly disabled: boolean;
    execute: () => Promise<void>;
}

export const MOBILE_WIDGET_EDITABLE_SELECTOR = [
    "input",
    "textarea",
    "select",
    "a",
    "[role='button']",
    "[role='textbox']",
    "[contenteditable]:not([contenteditable='false'])",
    "[data-widget-editor]",
    ".ql-editor",
].join(",");

export const MOBILE_SORTABLE_FILTER_SELECTOR = [
    "button:not(.mobile-widget-drag-handle)",
    MOBILE_WIDGET_EDITABLE_SELECTOR,
].join(",");

function clampGridSpan(value: string, max: number): string {
    const match = value.match(/^span\s+(\d+)$/i);
    if (!match) return value;
    return `span ${Math.max(1, Math.min(max, Number(match[1])))}`;
}

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private readonly previewMode: boolean;
    private readonly deviceViewContext: DeviceViewContext;
    private mountedWidget: Record<string, any> | null = null;
    private longPressTimer: number | null = null;
    private pointerStart: { x: number; y: number } | null = null;

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
        runtimeContext: { previewMode?: boolean; deviceViewContext?: DeviceViewContext } = {},
    ) {
        this.id = id || createWidgetInstanceId();
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.previewMode = runtimeContext.previewMode ?? false;
        this.deviceViewContext = runtimeContext.deviceViewContext || getCurrentDeviceViewContext(plugin, "mobile-homepage");
        this.style =
            style ||
            "aspect-ratio: 1 / 1;background-color: rgba(255, 255, 255, 0.72);border: 1px solid var(--b3-border-color);box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);transition: transform 0.2s ease, box-shadow 0.2s ease;border-radius: 12px;position: relative;overflow: hidden;";
        this.loadcontent = loadcontent || "";

        this.element = document.createElement("div");
        this.element.className = "widget-block mobile-widget-card";
        this.element.id = this.id;
        this.element.dataset.widgetMountState = "idle";
        this.element.innerHTML = this.renderControls();
        this.element.setAttribute("style", this.style);
        this.element.style.gridColumn = clampGridSpan(this.element.style.gridColumn, 2);
        this.element.style.gridRow = clampGridSpan(this.element.style.gridRow, 4);

        (this.element as any).__widgetBlockInstance = this;

        this.setupPointerEvents();
    }

    private renderControls(): string {
        return `
            <div class="mobile-widget-chrome" aria-hidden="false">
                <button class="mobile-widget-action-button" type="button" title="组件操作" aria-label="组件操作">⋯</button>
                <button class="mobile-widget-drag-handle drag-handle" type="button" title="拖拽排序" aria-label="拖拽排序">${renderSiyuanIcon("drag", 16)}</button>
            </div>
            <div class="mobile-widget-size-fallback" role="status">
                <strong>请放大组件</strong>
                <span>放大后显示完整内容</span>
            </div>
        `;
    }

    private setupPointerEvents(): void {
        // 操作按钮采用区块级事件委托。组件重挂载会替换内部 DOM，
        // 但区块元素本身始终存在，因此“三点”按钮不会因重渲染失去监听器。
        this.element.addEventListener("click", (event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.closest(".mobile-widget-action-button")) return;
            event.preventDefault();
            event.stopPropagation();
            this.currentBlockForSettingsRef.value = this.element;
            this.dispatchMobileEvent("mobile-widget-action");
        });

        this.element.addEventListener("pointerdown", (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(`button,${MOBILE_WIDGET_EDITABLE_SELECTOR}`)) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;

            this.pointerStart = { x: event.clientX, y: event.clientY };
            this.clearLongPressTimer();
            this.longPressTimer = window.setTimeout(() => {
                this.currentBlockForSettingsRef.value = this.element;
                this.dispatchMobileEvent("mobile-widget-longpress");
                this.clearLongPressTimer();
            }, 520);
        });

        this.element.addEventListener("pointermove", (event) => {
            if (!this.pointerStart) return;
            const dx = Math.abs(event.clientX - this.pointerStart.x);
            const dy = Math.abs(event.clientY - this.pointerStart.y);
            if (dx > 10 || dy > 10) {
                this.clearLongPressTimer();
            }
        });

        this.element.addEventListener("pointerup", () => {
            this.clearLongPressTimer();
        });
        this.element.addEventListener("pointercancel", () => {
            this.clearLongPressTimer();
        });
        this.element.addEventListener("pointerleave", () => {
            this.clearLongPressTimer();
        });
    }

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.pointerStart = null;
    }

    private dispatchMobileEvent(name: MobileWidgetEventName): void {
        this.element.dispatchEvent(
            new CustomEvent(name, {
                bubbles: true,
                detail: {
                    id: this.id,
                    element: this.element,
                    instance: this,
                },
            }),
        );
    }

    public destroy(): void {
        this.clearLongPressTimer();
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

    public hasMountedContent(): boolean {
        return this.mountedWidget !== null && this.element.dataset.widgetMountState === "ready";
    }

    private createContextMenuActionContext(widgetType: string): WidgetContextMenuActionContext {
        return {
            widgetType,
            widgetId: this.id,
            plugin: this.plugin,
            element: this.element,
            placement: "mobile",
            deviceViewContext: this.deviceViewContext,
            hasPersistedConfig: true,
            loadConfig: () => loadWidgetInstanceConfig(this.deviceViewContext, this.id),
            saveConfig: async (config) => {
                await saveWidgetContentPreservingSize(
                    this.plugin,
                    this.id,
                    config,
                    this.deviceViewContext,
                    this.element,
                    false,
                );
                this.updateContent(JSON.stringify(config), { refreshReason: "settings" });
            },
            refresh: () => this.refreshContent(),
        };
    }

    public getContextMenuActions(): readonly MobileWidgetContextAction[] {
        const widgetType = this.element.dataset.widgetType || "";
        const definition = widgetType ? getWidgetDefinition(widgetType) : undefined;
        if (!definition?.contextMenuActions?.length) return [];

        const context = this.createContextMenuActionContext(widgetType);
        return resolveWidgetContextMenuActions(definition.contextMenuActions, context).map((action) => ({
            id: action.id,
            label: resolveWidgetContextMenuActionLabel(action, context),
            icon: action.icon,
            disabled: action.disabled?.(context) === true,
            execute: async () => {
                await action.execute(context);
            },
        }));
    }

    public appendTo(container: Element | null): void {
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
        this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson, {
            placement: "mobile",
            previewMode: this.previewMode,
            deviceViewContext: this.deviceViewContext,
            ...runtimeContext,
            instanceId: this.id,
        });
        this.element.dataset.widgetMountState = this.mountedWidget ? "ready" : "failed";
        this.element.dataset.widgetContextActions = this.getContextMenuActions().length ? "true" : "false";
    }

    public async refreshContent(): Promise<void> {
        const widgetConfig = await loadWidgetInstanceConfig(this.deviceViewContext, this.id);
        if (!widgetConfig) {
            return;
        }
        const contentJson = stringifyWidgetConfigForMount(widgetConfig);
        if (!contentJson) {
            return;
        }
        this.updateContent(contentJson, {
            forceIndexRefresh: true,
            refreshReason: "manual",
        });
        this.dispatchMobileEvent("mobile-widget-refreshed");
    }
}

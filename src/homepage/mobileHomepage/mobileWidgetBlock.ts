import { unmount } from "svelte";
import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
import { mountWidgetContent, type WidgetRuntimeContext } from "../../components/utils/widgetBlock/widgetMountRegistry";
import { stringifyWidgetConfigForMount } from "../../components/utils/widgetBlock/utils/layout-shared";

type MobileWidgetEventName =
    | "mobile-widget-action"
    | "mobile-widget-longpress"
    | "mobile-widget-refreshed";

function createMobileWidgetId(): string {
    try {
        return `block-${crypto.randomUUID()}`;
    } catch {
        return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
}

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private readonly previewMode: boolean;
    private mountedWidget: Record<string, any> | null = null;
    private longPressTimer: number | null = null;
    private pointerStart: { x: number; y: number } | null = null;

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
        runtimeContext: { previewMode?: boolean } = {},
    ) {
        this.id = id || createMobileWidgetId();
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.previewMode = runtimeContext.previewMode ?? false;
        this.style =
            style ||
            "aspect-ratio: 1 / 1;background-color: rgba(255, 255, 255, 0.72);border: 1px solid var(--b3-border-color);box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);transition: transform 0.2s ease, box-shadow 0.2s ease;border-radius: 12px;position: relative;overflow: hidden;";
        this.loadcontent = loadcontent || "";

        this.element = document.createElement("div");
        this.element.className = "widget-block mobile-widget-card";
        this.element.id = this.id;
        this.element.innerHTML = this.renderControls(false);
        this.element.setAttribute("style", this.style);

        (this.element as any).__widgetBlockInstance = this;

        this.setupPointerEvents();
        this.setupChromeEventListeners();
    }

    private renderControls(includeRefresh = false): string {
        return `
            <div class="mobile-widget-chrome" aria-hidden="false">
                <button class="mobile-widget-action-button" type="button" title="组件操作" aria-label="组件操作">⋯</button>
                <button class="mobile-widget-drag-handle drag-handle" type="button" title="拖拽排序" aria-label="拖拽排序">${renderSiyuanIcon("drag", 16)}</button>
                ${includeRefresh ? `<button class="mobile-widget-refresh-button" type="button" title="刷新组件" aria-label="刷新组件">${renderSiyuanIcon("refresh", 15)}</button>` : ""}
            </div>
        `;
    }

    private setupChromeEventListeners(): void {
        const actionButton = this.element.querySelector(".mobile-widget-action-button");
        const refreshButton = this.element.querySelector(".mobile-widget-refresh-button");

        actionButton?.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.currentBlockForSettingsRef.value = this.element;
            this.dispatchMobileEvent("mobile-widget-action");
        });

        refreshButton?.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.refreshContent();
        });
    }

    private setupPointerEvents(): void {
        this.element.addEventListener("pointerdown", (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("button,input,textarea,select,a,[role='button']")) return;
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
        this.element.innerHTML = this.renderControls(true);
        this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson, {
            placement: "mobile",
            previewMode: this.previewMode,
            ...runtimeContext,
        });
        this.setupChromeEventListeners();
    }

    public async refreshContent(): Promise<void> {
        const widgetConfig = await this.plugin.loadData(`widget-${this.id}.json`);
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

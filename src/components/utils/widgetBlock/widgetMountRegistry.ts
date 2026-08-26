import { mount } from "svelte";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import { applyWidgetPresentation } from "@/homepage/theme/widgetPresentation/runtime";
import type { WidgetPlacement } from "@/homepage/theme/widgetPresentation/types";
import { resolveWidgetPremiumRequirement } from "@/features/entitlement/homepage-premium-features";
import { getWidgetDefinition } from "./widgetDefinitionRegistry";
import WidgetRuntimeHost from "./WidgetRuntimeHost.svelte";

export interface WidgetRuntimeContext {
    placement?: WidgetPlacement;
    persistentMusicRuntime?: boolean;
    previewMode?: boolean;
    forceIndexRefresh?: boolean;
    refreshReason?: "initial" | "manual" | "settings";
    deviceViewContext?: DeviceViewContext;
}

function sanitizeWidgetTypeClass(widgetType: string): string {
    return widgetType.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

export function mountWidgetContent(
    target: HTMLElement,
    plugin: any,
    contentTypeJson: string,
    runtimeContext: WidgetRuntimeContext = {},
): Record<string, any> | null {
    let contentData: any;

    try {
        contentData = JSON.parse(contentTypeJson);
    } catch (error) {
        console.error("无法解析 Widget JSON 数据", error);
        return null;
    }

    const widgetType = contentData.type;
    const definition = typeof widgetType === "string" ? getWidgetDefinition(widgetType) : undefined;
    if (!definition) {
        console.warn(`未知的 widget 类型: ${String(widgetType)}`);
        return null;
    }

    const placement = runtimeContext.placement || "homepage";
    if (!definition.supportedPlacements.includes(placement)) {
        console.warn("[WidgetPresentation] Widget placement 未声明，沿用 Legacy 挂载", {
            widgetType,
            placement,
        });
    }

    target.dataset.widgetType = widgetType;
    Array.from(target.classList)
        .filter((className) => className.startsWith("widget-type-"))
        .forEach((className) => target.classList.remove(className));
    target.classList.add(`widget-type-${sanitizeWidgetTypeClass(widgetType)}`);
    const presentation = applyWidgetPresentation(target, definition, placement, contentData);
    const premiumRequired = resolveWidgetPremiumRequirement(widgetType, contentData);

    const props: Record<string, any> = { contentTypeJson };
    if (definition.requiresPlugin) props.plugin = plugin;
    props.placement = widgetType === "notebrain" ? (runtimeContext.placement || "dock") : placement;
    props.runtimeContext = {
        placement,
        previewMode: runtimeContext.previewMode ?? false,
        forceIndexRefresh: runtimeContext.forceIndexRefresh === true,
        refreshReason: runtimeContext.refreshReason || "initial",
        deviceViewContext: runtimeContext.deviceViewContext,
    };
    props.previewMode = runtimeContext.previewMode ?? false;

    const registeredComponent = definition.placementComponents?.[placement] ?? definition.component;
    const selectedComponent = presentation.renderer ?? registeredComponent;
    const existingNodes = new Set(target.childNodes);
    const hostProps = (component: typeof selectedComponent) => ({
        component,
        componentProps: props,
        frame: definition.frame,
        premiumRequired,
        premiumTitle: definition.semanticLabel,
    });
    try {
        return mount(WidgetRuntimeHost, { target, props: hostProps(selectedComponent) });
    } catch (error) {
        console.error("[WidgetPresentation] Widget renderer 挂载失败", {
            themeId: presentation.themeId,
            widgetType,
            widgetId: target.id,
            level: presentation.level,
            fallback: selectedComponent !== registeredComponent ? "registered-component" : "widget-mount-error",
            error,
        });
        if (selectedComponent === registeredComponent) throw error;
        for (const node of Array.from(target.childNodes)) {
            if (!existingNodes.has(node)) node.remove();
        }
        return mount(WidgetRuntimeHost, { target, props: hostProps(registeredComponent) });
    }
}

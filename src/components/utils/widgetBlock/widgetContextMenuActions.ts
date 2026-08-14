import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import type { WidgetPlacement } from "@/homepage/theme/widgetPresentation/types";

export interface WidgetContextMenuActionContext {
    readonly widgetType: string;
    readonly widgetId: string;
    readonly plugin: any;
    readonly element: HTMLElement;
    readonly placement: WidgetPlacement;
    readonly deviceViewContext: DeviceViewContext;
    readonly hasPersistedConfig: boolean;
    loadConfig: () => Promise<Record<string, unknown> | null>;
    saveConfig: (config: Record<string, unknown>) => Promise<void>;
    refresh: () => Promise<void>;
}

export interface WidgetContextMenuAction {
    /** 同一组件内稳定且唯一的动作 ID。 */
    id: string;
    label: string | ((context: WidgetContextMenuActionContext) => string);
    icon?: string;
    order?: number;
    visible?: (context: WidgetContextMenuActionContext) => boolean;
    disabled?: (context: WidgetContextMenuActionContext) => boolean;
    execute: (context: WidgetContextMenuActionContext) => void | Promise<void>;
}

export function resolveWidgetContextMenuActions(
    actions: readonly WidgetContextMenuAction[] | undefined,
    context: WidgetContextMenuActionContext,
): readonly WidgetContextMenuAction[] {
    return [...(actions || [])]
        .filter((action) => action.visible?.(context) !== false)
        .sort((left, right) => (left.order ?? 100) - (right.order ?? 100));
}

export function resolveWidgetContextMenuActionLabel(
    action: WidgetContextMenuAction,
    context: WidgetContextMenuActionContext,
): string {
    return typeof action.label === "function" ? action.label(context) : action.label;
}

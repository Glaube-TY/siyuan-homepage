import { getWidgetDefinition } from "@/components/utils/widgetBlock/widgetDefinitionRegistry";
import { applyWidgetPresentation } from "./runtime";

export function syncHomepageWidgetPresentations(elements: Iterable<HTMLElement>): void {
    for (const element of elements) {
        const widgetType = element.dataset.widgetType;
        const definition = widgetType ? getWidgetDefinition(widgetType) : undefined;
        if (!definition) continue;
        applyWidgetPresentation(element, definition, "homepage");
    }
}

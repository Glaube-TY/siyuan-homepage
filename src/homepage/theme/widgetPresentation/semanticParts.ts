import type { WidgetSemanticPart } from "./types";

export const WIDGET_SEMANTIC_PARTS: readonly WidgetSemanticPart[] = Object.freeze([
    "root",
    "header",
    "icon",
    "title",
    "actions",
    "body",
    "list",
    "item",
    "primary",
    "secondary",
    "meta",
    "empty",
    "loading",
    "error",
]);

const SEMANTIC_PART_SET = new Set<string>(WIDGET_SEMANTIC_PARTS);

export function isWidgetSemanticPart(value: unknown): value is WidgetSemanticPart {
    return typeof value === "string" && SEMANTIC_PART_SET.has(value);
}


export function resolveWidgetRuntimeInstanceId(
    runtimeInstanceId: unknown,
    content: Record<string, unknown> | null | undefined,
): string | undefined {
    const candidates = [runtimeInstanceId, content?.instanceId, content?.blockId];
    return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function normalizeWidgetContentForRuntime(
    content: Record<string, unknown>,
    runtimeInstanceId: unknown,
): Record<string, unknown> {
    if (typeof runtimeInstanceId !== "string" || !runtimeInstanceId.trim()) return content;
    return { ...content, instanceId: runtimeInstanceId };
}

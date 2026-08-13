export type FocusBindingKind = "task" | "project" | "habit";

export interface FocusBindingSnapshot {
    kind: FocusBindingKind;
    id: string;
    title: string;
    projectId?: string;
    projectTitle?: string;
}

export function normalizeFocusBinding(value: unknown): FocusBindingSnapshot | undefined {
    if (value == null) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("番茄钟绑定对象无效");
    const input = value as Record<string, unknown>;
    const kind = String(input.kind || "");
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!(["task", "project", "habit"] as string[]).includes(kind) || !id || !title) throw new Error("番茄钟绑定关键字段无效");
    const text = (key: string) => typeof input[key] === "string" && String(input[key]).trim() ? String(input[key]).trim() : undefined;
    const projectId = text("projectId");
    const projectTitle = text("projectTitle");
    return { kind: kind as FocusBindingKind, id, title, ...(projectId ? { projectId } : {}), ...(projectTitle ? { projectTitle } : {}) };
}

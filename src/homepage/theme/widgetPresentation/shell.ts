import type { WidgetShellDefinition } from "./types";

const SHELL_TOKEN_PROPERTIES = Object.freeze({
    background: "--hp-widget-shell-background",
    border: "--hp-widget-shell-border",
    borderRadius: "--hp-widget-shell-border-radius",
    boxShadow: "--hp-widget-shell-box-shadow",
} as const);

/** 生成主页根节点的主题外壳令牌，不触碰会被布局保存的 Widget inline style。 */
export function serializeWidgetShellTokens(shell?: Readonly<WidgetShellDefinition>): string | undefined {
    if (!shell?.tokens) return undefined;
    const declarations = Object.entries(SHELL_TOKEN_PROPERTIES).flatMap(([token, property]) => {
        const value = shell.tokens?.[token as keyof typeof SHELL_TOKEN_PROPERTIES];
        return value ? [`${property}:${value}`] : [];
    });
    return declarations.length > 0 ? declarations.join(";") : undefined;
}

/**
 * 根据 Widget 稳定身份生成视觉变体。结果只存在于 DOM，切换主题或排序时不会改写配置。
 */
export function resolveWidgetShellVariant(identity: string, variants: number): number {
    const count = Number.isInteger(variants) ? Math.min(12, Math.max(1, variants)) : 1;
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
        hash ^= identity.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % count) + 1;
}

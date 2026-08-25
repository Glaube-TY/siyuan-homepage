import DOMPurify from "dompurify";

type LuteRenderer = { Md2HTML?: (input: string) => string };

let cachedLuteRenderer: LuteRenderer | null = null;

function getLuteRenderer(): LuteRenderer | null {
    const luteFactory = (window as unknown as {
        Lute?: { New?: () => LuteRenderer };
    }).Lute;
    if (!cachedLuteRenderer && typeof luteFactory?.New === "function") {
        cachedLuteRenderer = luteFactory.New() ?? null;
    }
    return cachedLuteRenderer;
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function mdToHtml(markdown: string): string {
    if (!markdown) return "";

    try {
        const lute = getLuteRenderer();
        const rawHtml =
            typeof lute?.Md2HTML === "function"
                ? lute.Md2HTML(markdown)
                : `<p>${escapeHtml(markdown)}</p>`;

        return DOMPurify.sanitize(rawHtml);
    } catch {
        return DOMPurify.sanitize(`<p>${escapeHtml(markdown)}</p>`);
    }
}

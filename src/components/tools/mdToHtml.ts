import DOMPurify from "dompurify";

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
        const luteFactory = (window as unknown as {
            Lute?: { New?: () => { Md2HTML?: (input: string) => string } };
        }).Lute;

        const lute = luteFactory?.New?.();
        const rawHtml =
            typeof lute?.Md2HTML === "function"
                ? lute.Md2HTML(markdown)
                : `<p>${escapeHtml(markdown)}</p>`;

        return DOMPurify.sanitize(rawHtml);
    } catch {
        return DOMPurify.sanitize(`<p>${escapeHtml(markdown)}</p>`);
    }
}

import DOMPurify from "dompurify";

export function MD2HTML(markdown: string) {
    let htmlContent: string;
    if (markdown) {
        const lute = window.Lute.New();
        const rawHtml = lute.Md2HTML(markdown);
        htmlContent = DOMPurify.sanitize(rawHtml);
    } else {
        htmlContent = "";
    }
    return htmlContent;
}
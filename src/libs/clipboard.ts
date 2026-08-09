/**
 * 跨运行时复制文本：优先使用现代 Clipboard API；Docker HTTP、旧 WebView
 * 或权限受限环境下回退到同步的 execCommand 方案。
 */
export async function writeTextToClipboard(text: string): Promise<void> {
  const content = String(text ?? "");
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;

  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(content);
      return;
    } catch {
      // 权限拒绝或非安全上下文时继续使用 DOM 回退。
    }
  }

  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") {
    throw new Error("当前运行环境不支持复制到剪贴板");
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand("copy")) throw new Error("浏览器拒绝了复制操作");
  } finally {
    textarea.remove();
  }
}

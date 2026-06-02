/**
 * Markdown 转 HTML 工具
 * 参考 siyuan-homepage 的 MD2HTML.ts 实现
 */

import DOMPurify from "dompurify";

/**
 * 将 Markdown 转换为安全的 HTML
 * @param markdown Markdown 字符串
 * @returns 安全的 HTML 字符串
 */
export function mdToHtml(markdown: string): string {
  if (!markdown) {
    return "";
  }

  // @ts-ignore - window.Lute 是思源注入的全局对象
  const lute = window.Lute.New();
  const rawHtml = lute.Md2HTML(markdown);
  return DOMPurify.sanitize(rawHtml);
}
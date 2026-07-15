import type { ReviewItem, ReviewPriority } from "@/components/utils/widgetBlock/widget/reviewDocs/reviewDocsTypes";
import { reviewOverdueDays } from "./review-notify-rules";
import type { ReviewNotifySettings } from "./types";

const priorityLabels: Record<ReviewPriority, string> = { high: "高", medium: "中", low: "低", "": "未设置" };

function itemPath(item: ReviewItem): string {
  return item.hpath || item.path || "";
}

export function renderReviewDigestContent(items: ReviewItem[], settings: ReviewNotifySettings, scheduledDate: string, overdue = false): string {
  const visible = items.slice(0, settings.maxItemsPerMessage);
  const lines = [`共 ${items.length} 个复习项目：`, ""];
  visible.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title || item.content || item.id}`);
    const meta = [
      `到期：${item.attrs.nextDate}`,
      `优先级：${priorityLabels[item.attrs.priority]}`,
      overdue ? `逾期：${reviewOverdueDays(item, scheduledDate)} 天` : "",
      settings.includePath && itemPath(item) ? `路径：${itemPath(item)}` : "",
      settings.includeNote && item.attrs.note ? `备注：${item.attrs.note}` : "",
    ].filter(Boolean);
    lines.push(`   ${meta.join("；")}`);
  });
  const hidden = items.length - visible.length;
  if (hidden > 0) lines.push("", `另有 ${hidden} 项未展开。`);
  return lines.join("\n");
}

export function renderReviewItemContent(item: ReviewItem, settings: ReviewNotifySettings): string {
  return [
    `标题：${item.title || item.content || item.id}`,
    `到期日期：${item.attrs.nextDate}`,
    `分类：${item.attrs.category || "未分类"}`,
    `优先级：${priorityLabels[item.attrs.priority]}`,
    settings.includePath && itemPath(item) ? `路径：${itemPath(item)}` : "",
    settings.includeNote && item.attrs.note ? `备注：${item.attrs.note}` : "",
    settings.includeSiyuanLink ? `链接：siyuan://blocks/${item.id}` : "",
  ].filter(Boolean).join("\n");
}

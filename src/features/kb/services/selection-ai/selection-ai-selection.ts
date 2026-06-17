import type { Protyle } from "siyuan";
import { getCurrentDocumentId } from "../siyuan/current-doc-service";
import type { SelectionAiContext, SelectionAiRect, SelectionAiSkill, SelectionAiToolbarSettings } from "./selection-ai-types";

function toElement(node: Node | null | undefined): HTMLElement | null {
  if (!node) return null;
  if (node instanceof HTMLElement) return node;
  return node.parentElement;
}

function toSelectionRect(range: Range): SelectionAiRect | undefined {
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return undefined;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function truncateByChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  const chars = Array.from(text);
  if (chars.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: chars.slice(0, maxChars).join(""),
    truncated: true,
  };
}

function getProtyleWysiwygElement(protyle: Protyle): HTMLElement | null {
  const element = (protyle as unknown as { wysiwyg?: { element?: unknown } }).wysiwyg?.element;
  return element instanceof HTMLElement ? element : null;
}

function getProtyleTitleElement(protyle: Protyle): HTMLElement | null {
  const wysiwyg = getProtyleWysiwygElement(protyle);
  if (!wysiwyg) return null;
  return wysiwyg.querySelector(".protyle-title__input") as HTMLElement | null;
}

function getDocTitleFromProtyle(protyle: Protyle): string | undefined {
  try {
    const titleEl = getProtyleTitleElement(protyle);
    if (titleEl) {
      const text = titleEl.textContent?.trim();
      if (text) return text;
    }
    // fallback: 从 protyle 属性读取
    const title = (protyle as unknown as { title?: { title?: string } }).title?.title;
    if (typeof title === "string" && title.trim()) return title.trim();
  } catch {
    // 静默降级
  }
  return undefined;
}

function getDocTextFromProtyle(protyle: Protyle): string | undefined {
  try {
    const wysiwyg = getProtyleWysiwygElement(protyle);
    if (!wysiwyg) return undefined;
    // 获取正文纯文本，排除标题
    const clone = wysiwyg.cloneNode(true) as HTMLElement;
    const titleInClone = clone.querySelector(".protyle-title__input");
    titleInClone?.remove();
    // 移除 protyle-action 等非内容元素
    clone.querySelectorAll(".protyle-action, .protyle-background").forEach((el) => el.remove());
    const text = clone.textContent?.trim();
    return text || undefined;
  } catch {
    // 静默降级
  }
  return undefined;
}

function calcSelectionStartInDocument(
  documentText: string | undefined,
  selectedText: string,
  range: Range | undefined,
  wysiwyg: HTMLElement | null
): number | undefined {
  if (!documentText) return undefined;

  // 优先用 Range 计算
  if (range && wysiwyg) {
    try {
      const preRange = document.createRange();
      preRange.setStart(wysiwyg, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const preText = preRange.toString();
      const idx = Array.from(preText).length;
      const docChars = Array.from(documentText);
      if (idx >= 0 && idx <= docChars.length) {
        // 粗略校验：从 idx 附近截取，看是否能找到选中文字的前几个字符
        const probe = docChars.slice(idx, idx + 10).join("");
        const selectedChars = Array.from(selectedText);
        const prefix = selectedChars.slice(0, 5).join("");
        if (!prefix || probe.includes(prefix)) {
          return idx;
        }
      }
    } catch {
      // 静默降级
    }
  }

  // fallback: indexOf → 转为字符位置
  const idx = documentText.indexOf(selectedText);
  if (idx < 0) return undefined;
  return Array.from(documentText.slice(0, idx)).length;
}

function getProtyleRootId(protyle: Protyle): string | undefined {
  const rootId = (protyle as unknown as { block?: { rootID?: unknown } }).block?.rootID;
  return typeof rootId === "string" && rootId.trim() ? rootId.trim() : undefined;
}

function getBlockIdFromSelection(selection: Selection): string | undefined {
  const element = toElement(selection.anchorNode) ?? toElement(selection.focusNode);
  const blockElement = element?.closest("[data-node-id]") as HTMLElement | null;
  const blockId = blockElement?.dataset?.nodeId;
  return blockId && blockId.trim() ? blockId.trim() : undefined;
}

function getBlockIdFromRange(range: Range): string | undefined {
  const element = toElement(range.commonAncestorContainer);
  const blockElement = element?.closest("[data-node-id]") as HTMLElement | null;
  const blockId = blockElement?.dataset?.nodeId;
  return blockId && blockId.trim() ? blockId.trim() : undefined;
}

function selectionBelongsToProtyle(selection: Selection, protyle: Protyle): boolean {
  const wysiwyg = getProtyleWysiwygElement(protyle);
  if (!wysiwyg) return true;

  const anchor = toElement(selection.anchorNode);
  const focus = toElement(selection.focusNode);
  return Boolean((anchor && wysiwyg.contains(anchor)) || (focus && wysiwyg.contains(focus)));
}

function rangeBelongsToProtyle(range: Range, protyle: Protyle): boolean {
  const wysiwyg = getProtyleWysiwygElement(protyle);
  if (!wysiwyg) return true;

  const container = toElement(range.commonAncestorContainer);
  return Boolean(container && wysiwyg.contains(container));
}

function getProtyleToolbarRange(protyle: Protyle): Range | null {
  const toolbarRange = (protyle as unknown as { toolbar?: { range?: unknown } }).toolbar?.range;
  if (toolbarRange instanceof Range) {
    return toolbarRange;
  }
  return null;
}

export function captureSelectionAiContext(
  protyle: Protyle,
  _settings: SelectionAiToolbarSettings,
  maxSelectedTextChars: number = 6000
): SelectionAiContext | null {
  // 优先读取 window.getSelection
  const selection = window.getSelection();
  let range: Range | null = null;
  let fromWindowSelection = false;

  if (selection && selection.rangeCount > 0) {
    const selText = selection.toString().trim();
    if (selText) {
      range = selection.getRangeAt(0).cloneRange();
      fromWindowSelection = true;
    }
  }

  // fallback: protyle.toolbar.range
  if (!range) {
    const toolbarRange = getProtyleToolbarRange(protyle);
    if (toolbarRange) {
      const cloned = toolbarRange.cloneRange();
      if (cloned.toString().trim()) {
        range = cloned;
      }
    }
  }

  if (!range) return null;

  const originalSelectedText = range.toString().trim();
  if (!originalSelectedText) return null;

  const { text: selectedText, truncated } = truncateByChars(
    originalSelectedText,
    maxSelectedTextChars
  );

  const docId = getProtyleRootId(protyle) ?? getCurrentDocumentId() ?? undefined;

  let blockId: string | undefined;
  if (fromWindowSelection && selection) {
    blockId = selectionBelongsToProtyle(selection, protyle)
      ? getBlockIdFromSelection(selection)
      : undefined;
  } else {
    blockId = rangeBelongsToProtyle(range, protyle)
      ? getBlockIdFromRange(range)
      : undefined;
  }

  // 采集文档标题和正文
  const docTitle = getDocTitleFromProtyle(protyle);
  const documentText = getDocTextFromProtyle(protyle);
  const wysiwyg = getProtyleWysiwygElement(protyle);
  const selectionStartInDocument = calcSelectionStartInDocument(
    documentText,
    originalSelectedText,
    range,
    wysiwyg
  );

  return {
    selectedText,
    originalSelectedText,
    truncated,
    docId,
    blockId,
    docTitle,
    documentText,
    selectionStartInDocument,
    source: "protyle-toolbar",
    createdAt: Date.now(),
    selectionRect: toSelectionRect(range),
    range,
  };
}

export function applySelectionAiSkillTextLimit(
  context: SelectionAiContext,
  skill: SelectionAiSkill
): SelectionAiContext {
  const maxChars = skill.maxSelectedTextChars ?? 6000;
  const { text: selectedText, truncated } = truncateByChars(
    context.originalSelectedText,
    maxChars
  );

  if (selectedText === context.selectedText && truncated === context.truncated) {
    return context;
  }

  return {
    ...context,
    selectedText,
    truncated,
  };
}

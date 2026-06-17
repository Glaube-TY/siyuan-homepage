import type { SelectionAiRect } from "./selection-ai-types";

const TOOLBAR_BUTTON_SELECTORS = [
  '[data-name="shp-selection-ai-menu"]',
  '[data-name^="shp-selection-ai-"]',
  '[data-type="shp-selection-ai-menu"]',
  '[data-type^="shp-selection-ai-"]',
  '.toolbar__item',
  'button',
  'span',
];

const VALIDITY_MS = 1200;

interface PointerRecord {
  x: number;
  y: number;
  rect: SelectionAiRect | null;
  timestamp: number;
}

let lastPointer: PointerRecord | null = null;
let listenerAttached = false;

function toSelectionAiRect(domRect: DOMRect): SelectionAiRect {
  return {
    left: domRect.left,
    top: domRect.top,
    right: domRect.right,
    bottom: domRect.bottom,
    width: domRect.width,
    height: domRect.height,
  };
}

function tryFindButtonRect(target: EventTarget | null): SelectionAiRect | null {
  if (!(target instanceof HTMLElement)) return null;

  // 尝试从 target 向上查找 toolbar 按钮
  for (const selector of TOOLBAR_BUTTON_SELECTORS) {
    const el = target.closest(selector) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      // 确保 rect 有效（非零大小）
      if (rect.width > 0 && rect.height > 0) {
        return toSelectionAiRect(rect);
      }
    }
  }
  return null;
}

function handlePointerDown(event: PointerEvent): void {
  // 记录每一次 pointerdown 的坐标
  const x = event.clientX;
  const y = event.clientY;

  // 尝试识别按钮 rect
  const rect = tryFindButtonRect(event.target);

  lastPointer = {
    x,
    y,
    rect,
    timestamp: Date.now(),
  };
}

export function initSelectionAiToolbarPointerTracker(): void {
  if (listenerAttached) return;
  listenerAttached = true;
  document.addEventListener("pointerdown", handlePointerDown, true);
}

export function destroySelectionAiToolbarPointerTracker(): void {
  if (!listenerAttached) return;
  listenerAttached = false;
  document.removeEventListener("pointerdown", handlePointerDown, true);
  lastPointer = null;
}

export function getRecentSelectionAiToolbarAnchorRect(): SelectionAiRect | undefined {
  if (!lastPointer) return undefined;

  const age = Date.now() - lastPointer.timestamp;
  if (age > VALIDITY_MS) return undefined;

  // 优先返回 button rect
  if (lastPointer.rect) return lastPointer.rect;

  // fallback: 1x1 rect at pointer position
  const { x, y } = lastPointer;
  return {
    left: x,
    top: y,
    right: x,
    bottom: y,
    width: 1,
    height: 1,
  };
}

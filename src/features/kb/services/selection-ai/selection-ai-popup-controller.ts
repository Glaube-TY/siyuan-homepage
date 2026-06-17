import { mount, unmount } from "svelte";
import SelectionAiPopup from "../../components/selection-ai/SelectionAiPopup.svelte";
import type { SelectionAiRect, SelectionAiRequest, SelectionAiToolbarSettings } from "./selection-ai-types";

let currentPopup: { container: HTMLElement; component: Record<string, unknown> } | null = null;

export function destroySelectionAiPopup(): void {
  if (!currentPopup) return;

  try {
    unmount(currentPopup.component);
  } catch {
    // ignore stale component cleanup errors
  }
  currentPopup.container.remove();
  currentPopup = null;
}

export function openSelectionAiPopup(options: {
  request: SelectionAiRequest;
  settings: SelectionAiToolbarSettings;
  anchorRect?: SelectionAiRect;
}): void {
  destroySelectionAiPopup();

  const container = document.createElement("div");
  container.setAttribute("data-shp-selection-ai-popup", "true");
  document.body.appendChild(container);

  const component = mount(SelectionAiPopup as any, {
    target: container,
    props: {
      request: options.request,
      settings: options.settings,
      anchorRect: options.anchorRect,
      onClose: destroySelectionAiPopup,
    },
  } as any);

  currentPopup = { container, component: component as Record<string, unknown> };
}

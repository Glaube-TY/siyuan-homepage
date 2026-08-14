import { mount, unmount } from "svelte";
import SelectionAiPopup from "../../components/selection-ai/SelectionAiPopup.svelte";
import type { SelectionAiRect, SelectionAiRequest, SelectionAiToolbarSettings } from "./selection-ai-types";

let currentPopup: { container: HTMLElement; component: Record<string, unknown> } | null = null;
const closeOnEntitlementUnavailable = () => destroySelectionAiPopup();

export function destroySelectionAiPopup(): void {
  if (!currentPopup) return;

  try {
    unmount(currentPopup.component);
  } catch {
    // ignore stale component cleanup errors
  }
  currentPopup.container.remove();
  currentPopup = null;
  window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
}

export function openSelectionAiPopup(options: {
  request: SelectionAiRequest;
  settings: SelectionAiToolbarSettings;
  anchorRect?: SelectionAiRect;
  advancedEnabled?: boolean;
}): void {
  destroySelectionAiPopup();
  window.addEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);

  const container = document.createElement("div");
  container.setAttribute("data-shp-selection-ai-popup", "true");
  document.body.appendChild(container);

  let component: Record<string, unknown>;
  try {
    component = mount(SelectionAiPopup as any, {
      target: container,
      props: {
        request: options.request,
        settings: options.settings,
        anchorRect: options.anchorRect,
        advancedEnabled: options.advancedEnabled ?? false,
        onClose: destroySelectionAiPopup,
      },
    } as any) as Record<string, unknown>;
  } catch (error) {
    window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
    container.remove();
    throw error;
  }

  currentPopup = { container, component };
}

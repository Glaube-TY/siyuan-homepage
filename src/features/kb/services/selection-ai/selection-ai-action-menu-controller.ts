import { mount, unmount } from "svelte";
import SelectionAiActionMenu from "../../components/selection-ai/SelectionAiActionMenu.svelte";
import type { SelectionAiRect, SelectionAiSkill } from "./selection-ai-types";

let currentMenu: { container: HTMLElement; component: Record<string, unknown> } | null = null;

export function destroySelectionAiActionMenu(): void {
  if (!currentMenu) return;

  try {
    unmount(currentMenu.component);
  } catch {
    // ignore stale component cleanup errors
  }
  currentMenu.container.remove();
  currentMenu = null;
}

export function openSelectionAiActionMenu(options: {
  skills: SelectionAiSkill[];
  anchorRect?: SelectionAiRect;
  onSelect: (skill: SelectionAiSkill) => void;
}): void {
  // 同一时间只允许一个技能选择菜单
  destroySelectionAiActionMenu();

  const container = document.createElement("div");
  container.setAttribute("data-shp-selection-ai-action-menu", "true");
  document.body.appendChild(container);

  const component = mount(SelectionAiActionMenu as any, {
    target: container,
    props: {
      skills: options.skills,
      anchorRect: options.anchorRect,
      onSelect: (skill: SelectionAiSkill) => {
        options.onSelect(skill);
      },
      onClose: destroySelectionAiActionMenu,
    },
  } as any);

  currentMenu = { container, component: component as Record<string, unknown> };
}

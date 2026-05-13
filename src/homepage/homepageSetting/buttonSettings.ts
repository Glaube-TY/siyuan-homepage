import type { ButtonItem } from './types';
import { createDefaultButtons as createDefaultButtonsFromRegistry, normalizeButtonsList as normalizeButtonsListFromRegistry, isCoreButton as isCoreButtonFromRegistry, getButtonActionMeta as getButtonActionMetaFromRegistry } from '../buttonRegistry';

export function createDefaultButtons(): ButtonItem[] {
    return createDefaultButtonsFromRegistry() as ButtonItem[];
}

export function normalizeButtons(buttons: ButtonItem[]): ButtonItem[] {
    return normalizeButtonsListFromRegistry(buttons) as ButtonItem[];
}

export function addButton(buttons: ButtonItem[], nextId: number): { buttons: ButtonItem[]; newButton: ButtonItem; nextId: number } {
    const newId = nextId + 1;
    const newButton: ButtonItem = {
        id: newId,
        label: `新建按钮`,
        checked: false,
        order: buttons.length > 0 ? Math.max(...buttons.map((b) => b.order)) + 1 : 0,
    };

    return {
        buttons: [...buttons, newButton],
        newButton,
        nextId: newId,
    };
}

export function moveButtonUp(buttons: ButtonItem[], selectedIndex: number): ButtonItem[] {
    if (selectedIndex <= 0) {
        return buttons;
    }

    const newIndex = selectedIndex - 1;
    const newList = [...buttons];
    [newList[selectedIndex], newList[newIndex]] = [newList[newIndex], newList[selectedIndex]];

    return newList.map((item, index) => ({ ...item, order: index }));
}

export function moveButtonDown(buttons: ButtonItem[], selectedIndex: number): ButtonItem[] {
    if (selectedIndex === -1 || selectedIndex >= buttons.length - 1) {
        return buttons;
    }

    const newIndex = selectedIndex + 1;
    const newList = [...buttons];
    [newList[selectedIndex], newList[newIndex]] = [newList[newIndex], newList[selectedIndex]];

    return newList.map((item, index) => ({ ...item, order: index }));
}

export function deleteButton(buttons: ButtonItem[], buttonId: number): ButtonItem[] {
    return buttons.filter((item) => item.id !== buttonId);
}

export function isCoreButton(button: ButtonItem): boolean {
    return isCoreButtonFromRegistry(button);
}

export { getButtonActionMetaFromRegistry as getButtonActionMeta };
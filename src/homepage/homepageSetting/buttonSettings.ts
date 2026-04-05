import type { ButtonItem } from './types';

export function createDefaultButtons(): ButtonItem[] {
    return [
        {
            id: 1728000000000,
            label: "🔍 搜索笔记",
            checked: true,
            shortcut: "Ctrl+P",
            order: 0,
            action: "search",
        },
        {
            id: 1728000001000,
            label: "📅 今日日记",
            checked: true,
            shortcut: "Alt+5",
            order: 1,
            action: "diary",
        },
        {
            id: 1728000002000,
            label: "➕ 添加组件",
            checked: true,
            order: 2,
            action: "addWidget",
        },
        {
            id: 1728000003000,
            label: "⚙ 主页设置",
            checked: true,
            order: 3,
            action: "settings",
        },
    ];
}

export function normalizeButtons(buttons: ButtonItem[]): ButtonItem[] {
    return buttons.map((item) => ({
        ...item,
        order: item.order ?? 0,
    }));
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
    const coreActions = ["addWidget", "settings"];
    if (button.action) {
        return coreActions.includes(button.action);
    }
    const coreLabels = ["➕ 添加组件", "⚙ 主页设置"];
    return coreLabels.includes(button.label);
}
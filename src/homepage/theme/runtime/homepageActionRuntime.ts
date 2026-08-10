import { getButtonAction, type ButtonItem } from "../../header/quick-button";
import { getButtonDisplayLabel, getButtonIconName, isCoreButton } from "../../buttonRegistry";
import type { HomepageActionDescriptor, HomepageActionsModel } from "../api/types";

export function createHomepageActionsModel(
    buttons: readonly ButtonItem[],
    invokeButton: (button: ButtonItem) => void | Promise<void>,
): HomepageActionsModel {
    const sourceById = new Map<string, ButtonItem>();
    const items: HomepageActionDescriptor[] = [...buttons]
        .sort((a, b) => a.order - b.order)
        .map((button) => {
            const id = `button.${button.id}`;
            sourceById.set(id, button);
            const action = getButtonAction(button);
            return Object.freeze({
                id,
                sourceId: button.id,
                action,
                label: getButtonDisplayLabel(button),
                iconName: getButtonIconName(button),
                shortcut: button.shortcut?.trim() || undefined,
                order: button.order,
                placement: button.checked ? "primary" : "overflow",
                custom: !isCoreButton(button),
            });
        });
    return Object.freeze({
        items: Object.freeze(items),
        async invoke(id: string): Promise<void> {
            const button = sourceById.get(id);
            if (!button) throw new Error(`未知主页 Action: ${id}`);
            await invokeButton(button);
        },
    });
}

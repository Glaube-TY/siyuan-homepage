import { openEmoji } from "siyuan";

/**
 * 打开思源内置 emoji 搜索弹窗
 * @param triggerElement 触发元素，用于计算弹窗位置
 * @param onSelect 选中 emoji 后的回调函数
 */
export function openSiyuanEmojiPicker(
    triggerElement: HTMLElement,
    onSelect: (emoji: string) => void
): void {
    const rect = triggerElement.getBoundingClientRect();

    openEmoji({
        position: {
            x: rect.left,
            y: rect.bottom,
            w: rect.width,
            h: rect.height,
        },
        selectedCB: (emoji: string) => {
            onSelect(emoji);
        },
    });
}

// 兼容旧接口的别名
export const calculateEmojiPickerPosition = () => null;
export const bindEmojiPickerEvents = () => () => {};
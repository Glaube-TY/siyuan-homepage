export interface EmojiPickerPosition {
    top: string;
    left: string;
}

export function calculateEmojiPickerPosition(
    button: HTMLElement,
    containerSelector: string = ".settings-container"
): EmojiPickerPosition | null {
    const container = document.querySelector(containerSelector) as HTMLElement;
    if (!container) return null;

    const rect = button.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    return {
        top: `${rect.top - containerRect.top + button.offsetHeight}px`,
        left: `${rect.left - containerRect.left}px`,
    };
}

export function bindEmojiPickerEvents(
    element: HTMLElement,
    onEmojiSelect: (emoji: string) => void
): () => void {
    const handler = (event: any) => {
        const detail = event.detail;
        onEmojiSelect(detail.unicode);
    };

    element.addEventListener("emoji-click", handler);

    return () => {
        element.removeEventListener("emoji-click", handler);
    };
}
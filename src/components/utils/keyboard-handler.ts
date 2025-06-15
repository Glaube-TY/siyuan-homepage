export function triggerSearchNotes() {
    const event = new KeyboardEvent("keydown", {
        key: "p",
        code: "KeyP",
        keyCode: 80,
        ctrlKey: !window.navigator.userAgent.includes("Mac"),
        metaKey: window.navigator.userAgent.includes("Mac"),
        bubbles: true,
    });

    document.dispatchEvent(event);
}

export function triggerOpenTodayDiary() {
    const event = new KeyboardEvent("keydown", {
        key: "5",
        code: "Digit5",
        keyCode: 53,
        altKey: true,
        bubbles: true,
    });

    document.dispatchEvent(event);
}
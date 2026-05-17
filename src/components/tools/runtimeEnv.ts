export function isElectronRuntime(): boolean {
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")) {
        return true;
    }
    const maybeProcess = typeof globalThis !== "undefined"
        ? (globalThis as typeof globalThis & { process?: { versions?: { electron?: string } } }).process
        : undefined;
    if (maybeProcess?.versions?.electron) {
        return true;
    }
    if (typeof window !== "undefined" && typeof (window as any).require === "function") {
        return true;
    }
    return false;
}

export function canUseElectronLocalFileSystem(): boolean {
    if (!isElectronRuntime()) return false;
    if (typeof window === "undefined") return false;
    if (typeof (window as any).require !== "function") return false;
    return true;
}

export function isMobileRuntime(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function isBrowserRuntime(): boolean {
    return !isElectronRuntime();
}

export function getRuntimeKind(): "electron" | "mobile" | "browser" {
    if (isElectronRuntime()) return "electron";
    if (isMobileRuntime()) return "mobile";
    return "browser";
}

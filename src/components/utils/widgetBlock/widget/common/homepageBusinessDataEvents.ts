export const HOMEPAGE_BUSINESS_DATA_UPDATED_EVENT = "siyuan-homepage-business-data-updated";

export interface HomepageBusinessDataUpdatedDetail {
    toolName: string;
    action: string;
    updatedAt: string;
}

export function dispatchHomepageBusinessDataUpdated(toolName: string, action: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<HomepageBusinessDataUpdatedDetail>(HOMEPAGE_BUSINESS_DATA_UPDATED_EVENT, {
        detail: { toolName, action, updatedAt: new Date().toISOString() },
    }));
}

export function subscribeHomepageBusinessDataUpdated(toolName: string, listener: (detail: HomepageBusinessDataUpdatedDetail) => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<HomepageBusinessDataUpdatedDetail>).detail;
        if (detail?.toolName === toolName) listener(detail);
    };
    window.addEventListener(HOMEPAGE_BUSINESS_DATA_UPDATED_EVENT, handler);
    return () => window.removeEventListener(HOMEPAGE_BUSINESS_DATA_UPDATED_EVENT, handler);
}

import type { HomepageFooterPresentationState } from "../api/types";

export function resolveHomepageFooterPresentation(options: {
    advanced: boolean;
    footerEnabled: boolean;
    footerContent: string;
}): HomepageFooterPresentationState {
    if (!options.advanced) return { visible: true, mode: "default" };
    if (!options.footerEnabled) return { visible: false, mode: "default" };
    const content = options.footerContent.trim();
    return content ? { visible: true, mode: "custom", html: options.footerContent } : { visible: true, mode: "default" };
}

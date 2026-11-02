export const HOMEPAGE_SERVICE_ORIGIN = "https://siyuanhomepage.glaube-ty.top";
export const HOMEPAGE_SERVICE_API = HOMEPAGE_SERVICE_ORIGIN + "/api";

// Existing locally verified SH files keep their managed marker after the service moves.
export function matchesHomepageServiceOrigin(saved: unknown, expected: string): boolean {
    return saved === expected || (
        expected === HOMEPAGE_SERVICE_ORIGIN &&
        saved === "https://license.glaube-ty.top"
    );
}

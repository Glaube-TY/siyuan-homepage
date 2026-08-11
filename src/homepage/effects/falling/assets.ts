import { fallingIconList } from "../effectsConstants";

const FALLING_ICON_SET = new Set<string>(fallingIconList);
const DEFAULT_FALLING_ICON = "snow";

export function resolveFallingIconSource(icon: string): string {
    const effectiveIcon = FALLING_ICON_SET.has(icon) ? icon : DEFAULT_FALLING_ICON;
    return `/plugins/siyuan-homepage/asset/fallingIcon/${effectiveIcon}.png`;
}

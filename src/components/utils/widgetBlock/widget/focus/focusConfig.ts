function readPositiveDuration(value: unknown): number | undefined {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

export function resolveFocusBreakDurations(
    source: Record<string, unknown>,
    defaults: { shortBreakDuration: number; longBreakDuration: number },
): { shortBreakDuration: number; longBreakDuration: number } {
    const shortBreakDuration = readPositiveDuration(source.shortBreakDuration);
    const longBreakDuration = readPositiveDuration(source.longBreakDuration);
    const legacyBreakDuration = readPositiveDuration(source.breakDuration);
    const isLegacyFormat = shortBreakDuration === undefined && longBreakDuration === undefined && legacyBreakDuration !== undefined;

    return {
        shortBreakDuration: shortBreakDuration ?? legacyBreakDuration ?? defaults.shortBreakDuration,
        longBreakDuration: longBreakDuration
            ?? (isLegacyFormat ? legacyBreakDuration : undefined)
            ?? defaults.longBreakDuration,
    };
}

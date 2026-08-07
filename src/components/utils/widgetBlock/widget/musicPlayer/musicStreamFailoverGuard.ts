export interface MusicStreamFailoverAttempt {
    allowed: boolean;
    resumeAt: number;
}

export class MusicStreamFailoverGuard {
    private attemptedTrackKey = "";

    begin(trackKey: string, soundSeek: unknown, currentTime: number): MusicStreamFailoverAttempt {
        const seek = Number(soundSeek);
        const fallback = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
        const resumeAt = Number.isFinite(seek) && seek >= 0 ? seek : fallback;
        if (!trackKey || this.attemptedTrackKey === trackKey) return { allowed: false, resumeAt };
        this.attemptedTrackKey = trackKey;
        return { allowed: true, resumeAt };
    }

    reset(): void {
        this.attemptedTrackKey = "";
    }
}

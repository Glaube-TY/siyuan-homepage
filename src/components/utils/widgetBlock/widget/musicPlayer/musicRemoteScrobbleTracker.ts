export class MusicRemoteScrobbleTracker {
    private trackKey = "";
    private playedSeconds = 0;
    private lastPosition = 0;
    private nowPlayingSent = false;
    private completedSent = false;

    begin(trackKey: string, initialPosition = 0): void {
        this.trackKey = trackKey;
        this.playedSeconds = 0;
        this.lastPosition = Math.max(0, initialPosition);
        this.nowPlayingSent = false;
        this.completedSent = false;
    }

    tick(trackKey: string, position: number): void {
        if (trackKey !== this.trackKey || !Number.isFinite(position)) return;
        const delta = position - this.lastPosition;
        if (delta > 0 && delta < 10) this.playedSeconds += delta;
        this.lastPosition = position;
    }

    markNowPlaying(trackKey: string): boolean {
        if (trackKey !== this.trackKey || this.nowPlayingSent) return false;
        this.nowPlayingSent = true;
        return true;
    }

    shouldSubmit(trackKey: string, duration: number, force = false): boolean {
        if (trackKey !== this.trackKey || this.completedSent) return false;
        const thresholdMet = this.playedSeconds >= 30 && duration > 0 && this.playedSeconds >= duration * 0.5;
        if (!force && !thresholdMet) return false;
        this.completedSent = true;
        return true;
    }

    getPlayedSeconds(): number { return this.playedSeconds; }
}

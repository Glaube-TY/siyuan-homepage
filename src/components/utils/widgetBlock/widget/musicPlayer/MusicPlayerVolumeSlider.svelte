<script lang="ts">
    interface Props {
        volume: number;
        isMuted: boolean;
        oninput: (e: Event) => void;
        onchange?: (e: Event) => void;
    }

    let { volume, isMuted, oninput, onchange }: Props = $props();
    const percent = $derived(`${volume * 100}%`);
</script>

<div
    class="music-player-volume-slider"
    class:is-muted={isMuted}
    style="--volume-percent: {percent}"
>
    <div class="volume-slider__track">
        <div class="volume-slider__fill"></div>
    </div>
    <div class="volume-slider__thumb"></div>
    <input
        class="volume-slider__input"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        {oninput}
        {onchange}
        aria-label="音量"
    />
</div>

<style lang="scss">
    .music-player-volume-slider {
        position: relative;
        width: 100%;
        height: 20px;
        display: flex;
        align-items: center;
        cursor: pointer;

        .volume-slider__track {
            position: absolute;
            left: 0;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            height: 4px;
            border-radius: 2px;
            background: var(--mp-slider-track, var(--b3-border-color));
            overflow: hidden;
            pointer-events: none;
        }

        .volume-slider__fill {
            width: var(--volume-percent, 0%);
            height: 100%;
            background: var(--mp-slider-filled, var(--b3-theme-primary));
            border-radius: 2px;
        }

        .volume-slider__thumb {
            position: absolute;
            top: 50%;
            left: var(--volume-percent, 0%);
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--mp-slider-thumb, var(--b3-theme-primary));
            border: 2px solid var(--mp-slider-thumb-border, var(--b3-theme-surface));
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
            transform: translate(-50%, -50%);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            pointer-events: none;
        }

        &:hover .volume-slider__thumb,
        &:focus-within .volume-slider__thumb {
            transform: translate(-50%, -50%) scale(1.2);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }

        .volume-slider__input {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
            margin: 0;
            padding: 0;
            -webkit-appearance: none;
            appearance: none;
            border: none;
            background: transparent;
        }

        &.is-muted {
            opacity: 0.55;
        }
    }
</style>

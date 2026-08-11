import {
    DEFAULT_FALLING_EFFECT_ID,
    FALLING_EFFECT_API_VERSION,
    type FallingDensity,
    type FallingEffectDefinition,
    type FallingEffectFrame,
    type FallingEffectRenderer,
    type FallingEffectRendererConfig,
    type FallingEffectRendererContext,
    type FallingEffectViewport,
    type FallingSpeed,
} from "../types";

interface DensityProfile {
    readonly maxActive: number;
    readonly emitIntervalMs: number;
}

interface SpeedProfile {
    readonly minDurationMs: number;
    readonly maxDurationMs: number;
}

interface SpriteParticle {
    active: boolean;
    ageMs: number;
    lifetimeMs: number;
    baseX: number;
    x: number;
    y: number;
    size: number;
    velocityY: number;
    phase: number;
    driftAmplitude: number;
    driftRate: number;
    rotation: number;
    rotationSpeed: number;
}

const DENSITY_PROFILES: Record<FallingDensity, DensityProfile> = {
    low: { maxActive: 10, emitIntervalMs: 850 },
    medium: { maxActive: 24, emitIntervalMs: 340 },
    high: { maxActive: 42, emitIntervalMs: 160 },
};

const SPEED_PROFILES: Record<FallingSpeed, SpeedProfile> = {
    low: { minDurationMs: 12_000, maxDurationMs: 17_000 },
    medium: { minDurationMs: 8_000, maxDurationMs: 12_000 },
    high: { minDurationMs: 5_000, maxDurationMs: 8_000 },
};

const MAX_CACHED_SPRITES = 6;
const spriteCache = new Map<string, HTMLImageElement>();

function loadSprite(src: string): Promise<HTMLImageElement> {
    const cached = spriteCache.get(src);
    if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);

    const image = cached ?? new Image();
    if (!cached) {
        image.decoding = "async";
        image.src = src;
        spriteCache.set(src, image);
        if (spriteCache.size > MAX_CACHED_SPRITES) {
            const oldestKey = spriteCache.keys().next().value as string | undefined;
            if (oldestKey && oldestKey !== src) spriteCache.delete(oldestKey);
        }
    }

    return new Promise((resolve, reject) => {
        if (image.complete && image.naturalWidth > 0) {
            resolve(image);
            return;
        }
        image.addEventListener("load", () => resolve(image), { once: true });
        image.addEventListener("error", () => reject(new Error(`飘落图标加载失败: ${src}`)), { once: true });
    });
}

function createParticle(): SpriteParticle {
    return {
        active: false,
        ageMs: 0,
        lifetimeMs: 0,
        baseX: 0,
        x: 0,
        y: 0,
        size: 0,
        velocityY: 0,
        phase: 0,
        driftAmplitude: 0,
        driftRate: 0,
        rotation: 0,
        rotationSpeed: 0,
    };
}

class SpriteDriftRenderer implements FallingEffectRenderer {
    readonly #context: CanvasRenderingContext2D;
    readonly #particles: SpriteParticle[];
    #config: FallingEffectRendererConfig | null = null;
    #viewport: FallingEffectViewport = { width: 0, height: 0, pixelRatio: 1 };
    #sprite: HTMLImageElement | null = null;
    #spriteRequestId = 0;
    #emitAccumulatorMs = 0;
    #activeCount = 0;
    #particleCursor = 0;

    constructor(context: FallingEffectRendererContext) {
        this.#context = context.context;
        this.#particles = Array.from({ length: context.particleBudget }, createParticle);
    }

    configure(config: FallingEffectRendererConfig): void {
        const iconChanged = this.#config?.iconSrc !== config.iconSrc;
        const densityChanged = this.#config?.density !== config.density;
        this.#config = config;
        if (densityChanged) this.#trimToDensityBudget();
        if (!iconChanged) return;

        this.#sprite = null;
        const requestId = ++this.#spriteRequestId;
        void loadSprite(config.iconSrc)
            .then((sprite) => {
                if (requestId !== this.#spriteRequestId) return;
                this.#sprite = sprite;
                this.#emitAccumulatorMs = this.#densityProfile.emitIntervalMs;
            })
            .catch((error) => {
                if (requestId === this.#spriteRequestId) {
                    console.warn("[FallingEffect] 飘落图标加载失败，当前特效已保持为空", error);
                }
            });
    }

    resize(viewport: FallingEffectViewport): void {
        this.#viewport = viewport;
        this.#context.imageSmoothingEnabled = true;
        this.#context.imageSmoothingQuality = "low";
        for (const particle of this.#particles) {
            if (!particle.active) continue;
            particle.baseX = Math.min(Math.max(particle.baseX, 0), viewport.width);
        }
    }

    frame(frame: FallingEffectFrame): void {
        const { width, height } = frame.viewport;
        this.#context.clearRect(0, 0, width, height);
        if (!this.#config || !this.#sprite || width <= 1 || height <= 1) return;

        const density = this.#densityProfile;
        this.#emitAccumulatorMs = Math.min(
            this.#emitAccumulatorMs + frame.deltaMs,
            density.emitIntervalMs * 2,
        );
        while (
            this.#emitAccumulatorMs >= density.emitIntervalMs
            && this.#activeCount < density.maxActive
        ) {
            if (!this.#spawnParticle()) break;
            this.#emitAccumulatorMs -= density.emitIntervalMs;
        }

        for (const particle of this.#particles) {
            if (!particle.active) continue;
            particle.ageMs += frame.deltaMs;
            particle.y += particle.velocityY * frame.deltaMs;
            particle.phase += particle.driftRate * frame.deltaMs;
            particle.rotation += particle.rotationSpeed * frame.deltaMs;
            particle.x = particle.baseX + Math.sin(particle.phase) * particle.driftAmplitude;

            if (particle.ageMs >= particle.lifetimeMs || particle.y > height + particle.size) {
                particle.active = false;
                this.#activeCount -= 1;
                continue;
            }
            this.#drawParticle(particle);
        }
    }

    clear(): void {
        this.#context.clearRect(0, 0, this.#viewport.width, this.#viewport.height);
        for (const particle of this.#particles) particle.active = false;
        this.#activeCount = 0;
        this.#particleCursor = 0;
        this.#emitAccumulatorMs = 0;
    }

    destroy(): void {
        this.clear();
        this.#spriteRequestId += 1;
        this.#sprite = null;
        this.#config = null;
        this.#particles.length = 0;
    }

    get #densityProfile(): DensityProfile {
        return DENSITY_PROFILES[this.#config?.density ?? "medium"];
    }

    get #speedProfile(): SpeedProfile {
        return SPEED_PROFILES[this.#config?.speed ?? "medium"];
    }

    #spawnParticle(): boolean {
        const particle = this.#takeInactiveParticle();
        if (!particle) return false;

        const speedProfile = this.#speedProfile;
        const lifetimeMs = speedProfile.minDurationMs
            + Math.random() * (speedProfile.maxDurationMs - speedProfile.minDurationMs);
        const size = 11 + Math.random() * 19;
        particle.active = true;
        particle.ageMs = 0;
        particle.lifetimeMs = lifetimeMs;
        particle.baseX = Math.random() * this.#viewport.width;
        particle.x = particle.baseX;
        particle.y = -size;
        particle.size = size;
        particle.velocityY = (this.#viewport.height + size * 2) / lifetimeMs;
        particle.phase = Math.random() * Math.PI * 2;
        particle.driftAmplitude = 12 + Math.random() * 46;
        particle.driftRate = (0.00045 + Math.random() * 0.00055) * (Math.random() < 0.5 ? -1 : 1);
        particle.rotation = Math.random() * Math.PI * 2;
        particle.rotationSpeed = (0.00025 + Math.random() * 0.0008) * (Math.random() < 0.5 ? -1 : 1);
        this.#activeCount += 1;
        return true;
    }

    #takeInactiveParticle(): SpriteParticle | null {
        for (let offset = 0; offset < this.#particles.length; offset += 1) {
            const index = (this.#particleCursor + offset) % this.#particles.length;
            const particle = this.#particles[index];
            if (particle.active) continue;
            this.#particleCursor = (index + 1) % this.#particles.length;
            return particle;
        }
        return null;
    }

    #trimToDensityBudget(): void {
        const maxActive = this.#densityProfile.maxActive;
        if (this.#activeCount <= maxActive) return;
        for (let index = this.#particles.length - 1; index >= 0 && this.#activeCount > maxActive; index -= 1) {
            const particle = this.#particles[index];
            if (!particle.active) continue;
            particle.active = false;
            this.#activeCount -= 1;
        }
    }

    #drawParticle(particle: SpriteParticle): void {
        if (!this.#sprite) return;
        const progress = particle.ageMs / particle.lifetimeMs;
        const fadeIn = Math.min(progress / 0.08, 1);
        const fadeOut = Math.min((1 - progress) / 0.16, 1);
        this.#context.save();
        this.#context.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
        this.#context.translate(particle.x, particle.y);
        this.#context.rotate(particle.rotation);
        this.#context.drawImage(
            this.#sprite,
            -particle.size / 2,
            -particle.size / 2,
            particle.size,
            particle.size,
        );
        this.#context.restore();
    }
}

export const spriteDriftFallingEffect: FallingEffectDefinition = Object.freeze({
    id: DEFAULT_FALLING_EFFECT_ID,
    apiVersion: FALLING_EFFECT_API_VERSION,
    label: "轻量飘落",
    description: "使用单 Canvas、固定粒子池和统一帧循环渲染的轻量飘落特效。",
    createRenderer: (context) => new SpriteDriftRenderer(context),
});

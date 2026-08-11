import {
    DEFAULT_MOUSE_TRAIL_EFFECT_ID,
    MOUSE_TRAIL_EFFECT_API_VERSION,
    type MouseTrailEffectDefinition,
    type MouseTrailRenderer,
    type MouseTrailRendererContext,
} from "../types";

const PARTICLE_CLASS = "shp-mouse-trail-particle";

class GlowMouseTrailRenderer implements MouseTrailRenderer {
    readonly #particles: HTMLElement[];
    #cursor = 0;

    constructor(context: MouseTrailRendererContext) {
        const fragment = document.createDocumentFragment();
        this.#particles = Array.from({ length: context.particleBudget }, (_, index) => {
            const particle = document.createElement("i");
            particle.className = PARTICLE_CLASS;
            particle.setAttribute("aria-hidden", "true");
            particle.style.setProperty("--shp-trail-size", `${8 + (index % 4)}px`);
            particle.style.setProperty("--shp-trail-drift", `${(index % 5) - 2}px`);
            fragment.appendChild(particle);
            return particle;
        });
        context.layer.appendChild(fragment);
    }

    emit(sample: Parameters<MouseTrailRenderer["emit"]>[0]): void {
        const particle = this.#particles[this.#cursor];
        this.#cursor = (this.#cursor + 1) % this.#particles.length;
        particle.style.transform = `translate3d(${Math.round(sample.x)}px, ${Math.round(sample.y)}px, 0)`;
        particle.dataset.trailPhase = particle.dataset.trailPhase === "a" ? "b" : "a";
    }

    clear(): void {
        for (const particle of this.#particles) {
            delete particle.dataset.trailPhase;
            particle.style.transform = "translate3d(-100px, -100px, 0)";
        }
        this.#cursor = 0;
    }

    destroy(): void {
        for (const particle of this.#particles) particle.remove();
        this.#particles.length = 0;
        this.#cursor = 0;
    }
}

export const glowMouseTrailEffect: MouseTrailEffectDefinition = Object.freeze({
    id: DEFAULT_MOUSE_TRAIL_EFFECT_ID,
    apiVersion: MOUSE_TRAIL_EFFECT_API_VERSION,
    label: "柔光尾流",
    description: "轻量的柔光粒子拖尾，使用固定粒子池和合成动画。",
    createRenderer: (context) => new GlowMouseTrailRenderer(context),
});

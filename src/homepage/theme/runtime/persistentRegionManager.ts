import type { HomepagePersistentRegionName, HomepageThemeRegionFacade } from "../api/types";

const REQUIRED_REGIONS: readonly HomepagePersistentRegionName[] = ["workspace", "footer"];

export class HomepagePersistentRegionManager implements HomepageThemeRegionFacade {
    readonly #parkingContainer: HTMLElement;
    readonly #hosts = new Map<HomepagePersistentRegionName, HTMLElement>();
    readonly #anchors = new Map<HomepagePersistentRegionName, HTMLElement>();

    constructor(parkingContainer: HTMLElement) {
        this.#parkingContainer = parkingContainer;
    }

    registerHost(name: HomepagePersistentRegionName, host: HTMLElement): void {
        const existing = this.#hosts.get(name);
        if (existing && existing !== host) throw new Error(`Persistent Region Host 重复注册: ${name}`);
        this.#hosts.set(name, host);
        const anchor = this.#anchors.get(name);
        if (anchor) {
            anchor.append(host);
        } else {
            this.#parkHost(host);
        }
    }

    getHost(name: HomepagePersistentRegionName): HTMLElement {
        const host = this.#hosts.get(name);
        if (!host) throw new Error(`Persistent Region Host 尚未注册: ${name}`);
        return host;
    }

    attach(name: HomepagePersistentRegionName, anchor: HTMLElement): void {
        this.#anchors.set(name, anchor);
        const host = this.#hosts.get(name);
        if (host) {
            anchor.append(host);
            host.style.removeProperty("width");
        }
    }

    detach(name: HomepagePersistentRegionName, anchor: HTMLElement): void {
        if (this.#anchors.get(name) !== anchor) return;
        this.#anchors.delete(name);
        const host = this.#hosts.get(name);
        if (host) this.#parkHost(host, anchor);
    }

    hasRequiredAttachments(): boolean {
        return REQUIRED_REGIONS.every((name) => {
            const host = this.#hosts.get(name);
            const anchor = this.#anchors.get(name);
            return Boolean(host && anchor && host.parentElement === anchor && host.isConnected);
        });
    }

    parkAll(): void {
        for (const [name, host] of this.#hosts) {
            this.#parkHost(host, this.#anchors.get(name) ?? host.parentElement);
        }
        this.#anchors.clear();
    }

    #parkHost(host: HTMLElement, source?: Element | null): void {
        const width = source?.getBoundingClientRect().width ?? host.getBoundingClientRect().width;
        if (Number.isFinite(width) && width > 0) {
            host.style.width = `${width}px`;
        }
        this.#parkingContainer.append(host);
    }

    destroy(): void {
        this.parkAll();
        this.#hosts.clear();
    }
}

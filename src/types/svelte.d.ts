declare module "*.svelte" {
    import type { Component } from "svelte";
    const component: typeof Component;
    export default component;
}

declare function $state<T>(initial: T): T;
declare function $state<T>(): T | undefined;
declare function $derived<T>(expr: T): T;
declare function $derivedBy<T>(fn: () => T): T;
declare function $effect(fn: () => void | (() => void)): void;
declare function $props<T>(): T;
declare function $bindable<T>(initial: T): T;
declare function $inspect(...values: unknown[]): { with: (...labels: string[]) => void };

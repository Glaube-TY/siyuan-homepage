export interface HomepageWidgetDomScope {
    componentSectionContainers?: ReadonlyMap<string, HTMLElement>;
    preservedWidgetElements?: Map<string, HTMLElement>;
    currentContainer?: HTMLElement | null;
}

export interface HomepageWidgetDomEnumeration {
    containers: HTMLElement[];
    elements: HTMLElement[];
    elementsById: Map<string, HTMLElement[]>;
    stalePreservedEntries: Array<[string, HTMLElement]>;
    ownershipErrors: string[];
}

export interface HomepageWidgetRuntimeSnapshot {
    element: HTMLElement;
    widgetId: string;
    instance: unknown;
    healthy: boolean;
}

export interface HomepageWidgetDomSnapshot {
    registeredContainers: Array<[string, HTMLElement]>;
    containers: Array<{
        container: HTMLElement;
        children: HTMLElement[];
        widgetIds: string[];
    }>;
    preservedEntries: Array<[string, HTMLElement]>;
    runtimeStates: HomepageWidgetRuntimeSnapshot[];
}

export type StorePreservedWidgetElementResult =
    | { success: true }
    | { success: false; reason: string; conflictingElement?: HTMLElement };

export function getDirectWidgetElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.children).filter(
        (child): child is HTMLElement => (
            child instanceof HTMLElement
            && child.classList.contains("widget-block")
            && Boolean(child.id)
        ),
    );
}

function getScopedContainers(scope: HomepageWidgetDomScope): HTMLElement[] {
    const containers: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    const add = (container: HTMLElement | null | undefined) => {
        if (!container || seen.has(container)) return;
        seen.add(container);
        containers.push(container);
    };
    for (const container of scope.componentSectionContainers?.values() ?? []) add(container);
    add(scope.currentContainer);
    return containers;
}

/**
 * 只枚举当前 homepage 实例已登记容器的直接子组件、preserved Map，
 * 以及无分栏/事务目标明确传入的当前容器。按 HTMLElement 对象身份去重。
 */
export function enumerateHomepageWidgetElements(
    scope: HomepageWidgetDomScope,
): HomepageWidgetDomEnumeration {
    const containers = getScopedContainers(scope);
    const elements: HTMLElement[] = [];
    const elementsById = new Map<string, HTMLElement[]>();
    const seen = new Set<HTMLElement>();
    const stalePreservedEntries: Array<[string, HTMLElement]> = [];
    const ownershipErrors: string[] = [];

    const add = (element: HTMLElement) => {
        if (seen.has(element)) return;
        seen.add(element);
        elements.push(element);
        const matches = elementsById.get(element.id) ?? [];
        matches.push(element);
        elementsById.set(element.id, matches);
    };

    for (const container of containers) {
        for (const element of getDirectWidgetElements(container)) add(element);
    }

    for (const [widgetId, element] of scope.preservedWidgetElements ?? []) {
        if (!widgetId || element.id !== widgetId) {
            ownershipErrors.push("preserved Map 的 key 与 HTMLElement.id 不一致");
            add(element);
            continue;
        }
        if (seen.has(element)) {
            stalePreservedEntries.push([widgetId, element]);
            continue;
        }
        add(element);
    }

    return {
        containers,
        elements,
        elementsById,
        stalePreservedEntries,
        ownershipErrors,
    };
}

export function cleanupStalePreservedWidgetEntries(
    enumeration: HomepageWidgetDomEnumeration,
    preservedElements: Map<string, HTMLElement> | undefined,
): StorePreservedWidgetElementResult {
    if (!preservedElements) return { success: true };
    for (const [widgetId, element] of enumeration.stalePreservedEntries) {
        const current = preservedElements.get(widgetId);
        if (current !== element) {
            return {
                success: false,
                reason: `清理陈旧 preserved 记录时发现另一个实例 ${widgetId}`,
                ...(current ? { conflictingElement: current } : {}),
            };
        }
    }
    for (const [widgetId, element] of enumeration.stalePreservedEntries) {
        if (preservedElements.get(widgetId) === element) preservedElements.delete(widgetId);
    }
    return { success: true };
}

export function isElementDirectChildOfScopedContainer(
    element: HTMLElement,
    scope: HomepageWidgetDomScope,
): boolean {
    return getScopedContainers(scope).some(
        (container) => element.parentElement === container && getDirectWidgetElements(container).includes(element),
    );
}

export function storePreservedWidgetElement(
    widgetId: string,
    element: HTMLElement,
    scope: HomepageWidgetDomScope,
    ownershipEvidence?: ReadonlySet<HTMLElement>,
): StorePreservedWidgetElementResult {
    const preservedElements = scope.preservedWidgetElements;
    if (!preservedElements) return { success: false, reason: "当前实例没有 preserved Map" };
    if (!widgetId || element.id !== widgetId) {
        return { success: false, reason: "组件 ID 与元素身份不一致" };
    }

    const existing = preservedElements.get(widgetId);
    if (existing && existing !== element) {
        return {
            success: false,
            reason: `preserved Map 中已存在另一个组件实例 ${widgetId}`,
            conflictingElement: existing,
        };
    }

    const ownedByContainer = isElementDirectChildOfScopedContainer(element, scope);
    const ownedBySnapshot = ownershipEvidence?.has(element) === true;
    if (!ownedByContainer && !ownedBySnapshot && existing !== element) {
        return { success: false, reason: `组件 ${widgetId} 不属于当前 homepage 实例` };
    }

    if (ownedByContainer) element.remove();
    if (isElementDirectChildOfScopedContainer(element, scope)) {
        return { success: false, reason: `组件 ${widgetId} 仍位于当前实例容器中` };
    }
    if (!existing) preservedElements.set(widgetId, element);
    return { success: true };
}

export function clearPreservedWidgetElementAfterAppend(
    element: HTMLElement,
    preservedElements: Map<string, HTMLElement> | undefined,
): StorePreservedWidgetElementResult {
    const existing = preservedElements?.get(element.id);
    if (existing && existing !== element) {
        return {
            success: false,
            reason: `组件 ${element.id} 已挂回容器，但 preserved Map 保存了另一个实例`,
            conflictingElement: existing,
        };
    }
    if (existing === element) {
        preservedElements.delete(element.id);
    }
    return { success: true };
}

export function captureHomepageWidgetDomSnapshot(
    scope: HomepageWidgetDomScope,
): HomepageWidgetDomSnapshot {
    const registeredContainers = Array.from(scope.componentSectionContainers?.entries() ?? []);
    const containers = getScopedContainers(scope).map((container) => {
        const children = Array.from(container.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement);
        return {
            container,
            children,
            widgetIds: children
                .filter((child) => child.classList.contains("widget-block"))
                .map((child) => child.id),
        };
    });
    const runtimeElements = enumerateHomepageWidgetElements(scope).elements;
    return {
        registeredContainers,
        containers,
        preservedEntries: Array.from(scope.preservedWidgetElements?.entries() ?? []),
        runtimeStates: runtimeElements.map((element) => {
            const instance = (element as any).__widgetBlockInstance;
            return {
                element,
                widgetId: element.id,
                instance,
                healthy: Boolean(instance?.hasMountedContent?.()),
            };
        }),
    };
}

export function matchesHomepageWidgetDomSnapshot(
    snapshot: HomepageWidgetDomSnapshot,
    scope: HomepageWidgetDomScope,
): boolean {
    const registeredContainers = Array.from(scope.componentSectionContainers?.entries() ?? []);
    if (
        registeredContainers.length !== snapshot.registeredContainers.length
        || snapshot.registeredContainers.some(
            ([sectionId, container], index) => (
                registeredContainers[index]?.[0] !== sectionId
                || registeredContainers[index]?.[1] !== container
            ),
        )
    ) {
        return false;
    }

    const currentContainers = getScopedContainers(scope);
    if (
        currentContainers.length !== snapshot.containers.length
        || snapshot.containers.some((entry, index) => currentContainers[index] !== entry.container)
    ) {
        return false;
    }
    for (const entry of snapshot.containers) {
        const children = Array.from(entry.container.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement);
        if (
            children.length !== entry.children.length
            || entry.children.some((child, index) => children[index] !== child)
        ) {
            return false;
        }
        const widgetIds = children
            .filter((child) => child.classList.contains("widget-block"))
            .map((child) => child.id);
        if (
            widgetIds.length !== entry.widgetIds.length
            || entry.widgetIds.some((id, index) => widgetIds[index] !== id)
        ) {
            return false;
        }
    }

    const preservedEntries = Array.from(scope.preservedWidgetElements?.entries() ?? []);
    if (!(
        preservedEntries.length === snapshot.preservedEntries.length
        && snapshot.preservedEntries.every(
            ([widgetId, element]) => scope.preservedWidgetElements?.get(widgetId) === element,
        )
    )) {
        return false;
    }
    return snapshot.runtimeStates.every((runtime) => {
        const instance = (runtime.element as any).__widgetBlockInstance;
        return (
            runtime.element.id === runtime.widgetId
            && instance === runtime.instance
            && Boolean(instance?.hasMountedContent?.()) === runtime.healthy
        );
    });
}

export function restoreHomepageWidgetDomSnapshot(
    snapshot: HomepageWidgetDomSnapshot,
    scope: HomepageWidgetDomScope,
    transientElements: ReadonlySet<HTMLElement> = new Set(),
): StorePreservedWidgetElementResult {
    const registeredContainers = Array.from(scope.componentSectionContainers?.entries() ?? []);
    if (
        registeredContainers.length !== snapshot.registeredContainers.length
        || snapshot.registeredContainers.some(
            ([sectionId, container], index) => (
                registeredContainers[index]?.[0] !== sectionId
                || registeredContainers[index]?.[1] !== container
            ),
        )
    ) {
        return { success: false, reason: "回滚时当前实例的容器登记已变化" };
    }

    const snapshotChildren = new Set(snapshot.containers.flatMap((entry) => entry.children));
    const desiredPreserved = new Map(snapshot.preservedEntries);
    const snapshotOwnedElements = new Set<HTMLElement>([
        ...snapshotChildren,
        ...snapshot.preservedEntries.map(([, element]) => element),
    ]);
    for (const entry of snapshot.containers) {
        for (const child of Array.from(entry.container.children)) {
            if (!(child instanceof HTMLElement)) continue;
            if (!snapshotOwnedElements.has(child) && !transientElements.has(child)) {
                return { success: false, reason: "回滚容器中出现事务外 HTMLElement" };
            }
        }
    }
    for (const [widgetId, element] of scope.preservedWidgetElements ?? []) {
        const desired = desiredPreserved.get(widgetId);
        if (
            desired !== element
            && !snapshotOwnedElements.has(element)
            && !transientElements.has(element)
        ) {
            return {
                success: false,
                reason: `回滚时 preserved Map 中出现事务外实例 ${widgetId}`,
                conflictingElement: element,
            };
        }
    }
    for (const [widgetId, element] of snapshot.preservedEntries) {
        const current = scope.preservedWidgetElements?.get(widgetId);
        if (current && current !== element) {
            return {
                success: false,
                reason: `回滚时 preserved Map 中存在另一个实例 ${widgetId}`,
                conflictingElement: current,
            };
        }
    }
    for (const entry of snapshot.containers) {
        for (const child of entry.children) {
            if (!child.classList.contains("widget-block") || !child.id) continue;
            const current = scope.preservedWidgetElements?.get(child.id);
            if (current && current !== child) {
                return {
                    success: false,
                    reason: `回滚前发现组件 ${child.id} 的 preserved 冲突实例`,
                    conflictingElement: current,
                };
            }
        }
    }

    for (const element of transientElements) element.remove();
    for (const entry of snapshot.containers) {
        for (const child of entry.children) {
            entry.container.appendChild(child);
            if (child.classList.contains("widget-block")) {
                const cleared = clearPreservedWidgetElementAfterAppend(child, scope.preservedWidgetElements);
                if ("reason" in cleared) return cleared;
            }
        }
    }
    const desiredPreservedKeys = new Set(snapshot.preservedEntries.map(([widgetId]) => widgetId));
    for (const [widgetId, element] of scope.preservedWidgetElements ?? []) {
        if (desiredPreservedKeys.has(widgetId)) continue;
        if (!snapshotOwnedElements.has(element) && !transientElements.has(element)) {
            return { success: false, reason: `回滚时无法安全移除额外 preserved 实例 ${widgetId}` };
        }
        scope.preservedWidgetElements?.delete(widgetId);
    }
    for (const [widgetId, element] of snapshot.preservedEntries) {
        if (element.id !== widgetId) {
            return { success: false, reason: "快照中的 preserved key 与 HTMLElement.id 不一致" };
        }
        const current = scope.preservedWidgetElements?.get(widgetId);
        if (current && current !== element) {
            return {
                success: false,
                reason: `回滚时 preserved Map 中存在另一个实例 ${widgetId}`,
                conflictingElement: current,
            };
        }
        if (!current) {
            const restored = storePreservedWidgetElement(
                widgetId,
                element,
                scope,
                snapshotOwnedElements,
            );
            if ("reason" in restored) return restored;
        }
    }

    if (!matchesHomepageWidgetDomSnapshot(snapshot, scope)) {
        return { success: false, reason: "HTMLElement 引用或 WidgetBlock 健康状态未能完整回滚" };
    }
    const restored = enumerateHomepageWidgetElements(scope);
    if (restored.ownershipErrors.length > 0) {
        return { success: false, reason: restored.ownershipErrors[0] };
    }
    const duplicate = Array.from(restored.elementsById.entries()).find(([, elements]) => elements.length > 1);
    if (duplicate) return { success: false, reason: `回滚后仍存在重复组件 ${duplicate[0]}` };
    return { success: true };
}

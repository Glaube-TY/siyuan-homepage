import {
  computePosition,
  autoUpdate,
  offset as floatingOffset,
  flip,
  shift,
  type Placement,
} from "@floating-ui/dom";

export interface FloatingPopoverOptions {
  referenceEl: HTMLElement | undefined;
  placement?: Placement;
  offset?: number;
  shiftPadding?: number;
  open: boolean;
  onPositionUpdate?: (info: { placement: string; flipped: boolean; shifted: boolean }) => void;
}

export function floatingPopoverAction(
  floatingEl: HTMLElement,
  options: FloatingPopoverOptions,
): { update: (options: FloatingPopoverOptions) => void; destroy: () => void } {
  let cleanup: (() => void) | null = null;

  function position() {
    const ref = options.referenceEl;
    if (!ref || !options.open) return;

    computePosition(ref, floatingEl, {
      placement: options.placement ?? "top-end",
      strategy: "fixed",
      middleware: [
        floatingOffset(options.offset ?? 8),
        flip(),
        shift({ padding: options.shiftPadding ?? 8 }),
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      Object.assign(floatingEl.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      const flipped = middlewareData.flip?.index !== undefined;
      const shifted = (middlewareData.shift?.x ?? 0) !== 0 || (middlewareData.shift?.y ?? 0) !== 0;

      options.onPositionUpdate?.({ placement, flipped, shifted });
    });
  }

  function startAutoUpdate() {
    stopAutoUpdate();
    const ref = options.referenceEl;
    if (!ref || !options.open) return;

    floatingEl.style.position = "fixed";
    floatingEl.style.zIndex = "110";

    cleanup = autoUpdate(ref, floatingEl, position);
  }

  function stopAutoUpdate() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  }

  if (options.open) {
    startAutoUpdate();
  }

  return {
    update(newOptions: FloatingPopoverOptions) {
      options = newOptions;
      if (options.open) {
        startAutoUpdate();
      } else {
        stopAutoUpdate();
      }
    },
    destroy() {
      stopAutoUpdate();
    },
  };
}

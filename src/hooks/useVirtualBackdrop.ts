import { createMeasureEffect } from 'frameact';

import { hasActiveViewTransition } from './animations/useViewTransition';

const BACKDROP_CLASSNAME = 'backdrop';

// This effect implements closing menus by clicking outside of them
// without adding extra elements to the DOM
// TODO(codemod): useVirtualBackdrop: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useVirtualBackdrop(
  isOpen: boolean,
  containerRef: (el: HTMLElement) => void,
  onClose?: () => void | undefined,
  ignoreRightClick?: boolean,
  excludedClosestSelector?: string,
) {
  createMeasureEffect(
    () => [excludedClosestSelector, ignoreRightClick, isOpen, containerRef, onClose],
    () => {
      if (!isOpen || !onClose) {
        return undefined;
      }

      const handleEvent = (e: MouseEvent) => {
        const container = containerRef.current;
        const target = e.target as HTMLElement | null;
        if (!container || !target || (ignoreRightClick && e.button === 2) || hasActiveViewTransition()) {
          return;
        }

        if (
          (!container.contains(e.target as Node | null) || target.classList.contains(BACKDROP_CLASSNAME)) &&
          !(
            excludedClosestSelector &&
            (target.matches(excludedClosestSelector) || target.closest(excludedClosestSelector))
          )
        ) {
          e.preventDefault();
          e.stopPropagation();
          onClose?.();
        }
      };

      document.addEventListener('mousedown', handleEvent);

      return () => {
        document.removeEventListener('mousedown', handleEvent);
      };
    },
  );
}

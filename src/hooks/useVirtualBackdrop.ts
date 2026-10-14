import { type Accessor, createMeasureEffect } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { hasActiveViewTransition } from './animations/useViewTransition';

const BACKDROP_CLASSNAME = 'backdrop';

// This effect implements closing menus by clicking outside of them
// without adding extra elements to the DOM
export default function useVirtualBackdrop(
  isOpen: MaybeAccessor<boolean>,
  containerRef: MaybeAccessor<HTMLElement | undefined>,
  onClose?: Accessor<(() => void) | undefined>,
  ignoreRightClick?: MaybeAccessor<boolean | undefined>,
  excludedClosestSelector?: MaybeAccessor<string | undefined>,
) {
  createMeasureEffect(
    () => [read(excludedClosestSelector), read(ignoreRightClick), read(isOpen), onClose?.()] as const,
    ([excludedClosestSelector2, ignoreRightClick2, isOpen2, onClose2]) => {
      if (!isOpen2 || !onClose2) {
        return undefined;
      }

      const handleEvent = (e: MouseEvent) => {
        const container = read(containerRef);
        const target = e.target as HTMLElement | null;
        if (!container || !target || (ignoreRightClick2 && e.button === 2) || hasActiveViewTransition()) {
          return;
        }

        if (
          (!container.contains(e.target as Node | null) || target.classList.contains(BACKDROP_CLASSNAME)) &&
          !(
            excludedClosestSelector2 &&
            (target.matches(excludedClosestSelector2) || target.closest(excludedClosestSelector2))
          )
        ) {
          e.preventDefault();
          e.stopPropagation();
          onClose2();
        }
      };

      document.addEventListener('mousedown', handleEvent);

      return () => {
        document.removeEventListener('mousedown', handleEvent);
      };
    },
  );
}

import { createEffect, createSignal, requestMutation } from 'frameact';
import { addExtraClass, removeExtraClass } from 'frameact/dom';

import type { IAnchorPosition } from '../types';

import { type MaybeAccessor, read } from '../util/accessors';
import { IS_IOS, IS_PWA, IS_TOUCH_ENV } from '../util/browser/windowEnvironment';
import { depsOf } from '../util/effectDeps';

const LONG_TAP_DURATION_MS = 200;
const IOS_PWA_CONTEXT_MENU_DELAY_MS = 100;

function stopEvent(e: Event) {
  e.stopImmediatePropagation();
  e.preventDefault();
  e.stopPropagation();
}

function isNativeLinkTarget(target: EventTarget | null | undefined) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const link = target.closest('a[href]');

  return Boolean(link && link.getAttribute('href') !== '#');
}

// Deviation: `elementRef` is an accessor of the element, read when the effect applies (not tracked).
const useContextMenuHandlers = (
  elementRef: MaybeAccessor<HTMLElement | undefined>,
  isMenuDisabled?: MaybeAccessor<boolean | undefined>,
  shouldDisableOnLink?: MaybeAccessor<boolean | undefined>,
  shouldDisableOnLongTap?: MaybeAccessor<boolean | undefined>,
  // Deviation: an accessor (tt: a `Signal<boolean>`).
  getIsReady?: () => boolean,
  shouldDisablePropagation?: MaybeAccessor<boolean | undefined>,
) => {
  const [isContextMenuOpen, setIsContextMenuOpen] = createSignal(false);
  const [contextMenuAnchor, setContextMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);
  const [contextMenuTarget, setContextMenuTarget] = createSignal<HTMLElement | undefined>(undefined);
  const [isContextMenuAltKeyPressed, setIsContextMenuAltKeyPressed] = createSignal(false);

  const handleBeforeContextMenu = (e: React.MouseEvent) => {
    if (!read(isMenuDisabled) && e.button === 2) {
      requestMutation(() => {
        addExtraClass(e.target as HTMLElement, 'no-selection');
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    requestMutation(() => {
      removeExtraClass(e.target as HTMLElement, 'no-selection');
    });

    if (read(isMenuDisabled) || (read(shouldDisableOnLink) && isNativeLinkTarget(e.target))) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    if (contextMenuAnchor()) {
      return;
    }

    setIsContextMenuAltKeyPressed(e.altKey);
    setIsContextMenuOpen(true);
    setContextMenuAnchor({ x: e.clientX, y: e.clientY });
    setContextMenuTarget(e.target as HTMLElement);
  };

  const handleContextMenuClose = () => {
    setIsContextMenuOpen(false);
  };

  const handleContextMenuHide = () => {
    setContextMenuAnchor(undefined);
  };

  // Support context menu on touch devices
  createEffect(
    depsOf(
      () =>
        [
          contextMenuAnchor(),
          read(isMenuDisabled),
          read(shouldDisableOnLongTap),
          read(shouldDisableOnLink),
          read(shouldDisablePropagation),
        ] as const,
    ),
    ([anchor, isMenuDisabled2, shouldDisableOnLongTap2, shouldDisableOnLink2, shouldDisablePropagation2]) => {
      if (isMenuDisabled2 || !IS_TOUCH_ENV || shouldDisableOnLongTap2 || (getIsReady && !getIsReady())) {
        return undefined;
      }

      const element = read(elementRef);
      if (!element) {
        return undefined;
      }

      let timer: number | undefined;

      const clearLongPressTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };

      const emulateContextMenuEvent = (originalEvent: TouchEvent) => {
        clearLongPressTimer();

        const { clientX, clientY, target } = originalEvent.touches[0];

        if (anchor || (shouldDisableOnLink2 && isNativeLinkTarget(target))) {
          return;
        }

        // Temporarily intercept and clear the next click

        document.addEventListener(
          'touchend',
          (e) => {
            // On iOS in PWA mode, the context menu may cause click-through to the element in the menu upon opening
            if (IS_IOS && IS_PWA) {
              setTimeout(() => {
                document.removeEventListener('mousedown', stopEvent, {
                  capture: true,
                });
                document.removeEventListener('click', stopEvent, {
                  capture: true,
                });
              }, IOS_PWA_CONTEXT_MENU_DELAY_MS);
            }
            stopEvent(e);
          },
          {
            once: true,
            capture: true,
          },
        );

        // On iOS15, in PWA mode, the context menu immediately closes after opening
        if (IS_PWA && IS_IOS) {
          document.addEventListener('mousedown', stopEvent, {
            once: true,
            capture: true,
          });

          document.addEventListener('click', stopEvent, {
            once: true,
            capture: true,
          });
        }

        setIsContextMenuAltKeyPressed(false);
        setIsContextMenuOpen(true);
        setContextMenuAnchor({ x: clientX, y: clientY });
      };

      const startLongPressTimer = (e: TouchEvent) => {
        if (isMenuDisabled2) {
          return;
        }
        if (shouldDisablePropagation2) e.stopPropagation();
        clearLongPressTimer();

        timer = window.setTimeout(() => emulateContextMenuEvent(e), LONG_TAP_DURATION_MS);
      };

      // @perf Consider event delegation
      element.addEventListener('touchstart', startLongPressTimer, { passive: true });
      element.addEventListener('touchcancel', clearLongPressTimer, true);
      element.addEventListener('touchend', clearLongPressTimer, true);
      element.addEventListener('touchmove', clearLongPressTimer, { passive: true });

      return () => {
        clearLongPressTimer();
        element.removeEventListener('touchstart', startLongPressTimer);
        element.removeEventListener('touchcancel', clearLongPressTimer, true);
        element.removeEventListener('touchend', clearLongPressTimer, true);
        element.removeEventListener('touchmove', clearLongPressTimer);
      };
    },
  );

  return {
    isContextMenuOpen,
    contextMenuAnchor,
    contextMenuTarget,
    isContextMenuAltKeyPressed,
    handleBeforeContextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleContextMenuHide,
  };
};

export default useContextMenuHandlers;

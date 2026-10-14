import { createMeasureEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';
import { createCallbackManager } from '../../util/callbacks';

const BALANCE_BAR_MODAL_SELECTOR = '.Modal.with-balance-bar';

const balanceBarCallbacks = createCallbackManager();

// Deviation: a measure effect, as it reads layout (`getComputedStyle`).
export default function useIsTopmostBalanceBarModal(
  ref: MaybeAccessor<HTMLElement | undefined>,
  isActive?: MaybeAccessor<boolean | undefined>,
) {
  const [isTopmost, setIsTopmost] = createSignal(true);

  createMeasureEffect(
    () => read(isActive),
    (isActive2) => {
      if (!isActive2) return undefined;

      const updateIsTopmost = () => {
        setIsTopmost(checkIsTopmostBalanceBarModal(read(ref)));
      };

      updateIsTopmost();

      const unsubscribe = balanceBarCallbacks.addCallback(updateIsTopmost);
      balanceBarCallbacks.runCallbacks();

      return () => {
        unsubscribe();
        balanceBarCallbacks.runCallbacks();
      };
    },
  );

  return isTopmost;
}

function checkIsTopmostBalanceBarModal(element?: HTMLElement) {
  if (!element) return true;

  const parentModal = element.closest(BALANCE_BAR_MODAL_SELECTOR);
  if (!parentModal) return true;

  const allBalanceBarModals = document.querySelectorAll(BALANCE_BAR_MODAL_SELECTOR);
  if (allBalanceBarModals.length <= 1) {
    return true;
  }

  let topmostModal: Element | undefined;
  let highestZIndex = -Infinity;

  allBalanceBarModals.forEach((modal) => {
    const zIndex = parseInt(getComputedStyle(modal).zIndex, 10) || 0;
    if (zIndex >= highestZIndex) {
      highestZIndex = zIndex;
      topmostModal = modal;
    }
  });

  return parentModal === topmostModal;
}

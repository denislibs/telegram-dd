import { createEffect, createSignal } from 'frameact';
import { getActions, getGlobal } from '../../../../global';

import { PAID_MESSAGES_PURPOSE } from '../../../../config';
import { selectTabState } from '../../../../global/selectors';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';

// Deviation: a hook runs once; the parameters that can change are values or accessors (`read`), and the state it returns
// (`shouldAutoApprove`) is an accessor. `shouldPaidMessageAutoApprove` is read from the global when needed (tt read it at
// each render).
export default function usePaidMessageConfirmation(
  dialogKey: MaybeAccessor<string>,
  starsForAllMessages: MaybeAccessor<number>,
  isStarsBalanceModeOpen: MaybeAccessor<boolean>,
  starsBalance: MaybeAccessor<number>,
  shouldDelayConfirmHandler?: MaybeAccessor<boolean | undefined>,
) {
  const shouldPaidMessageAutoApprove = () => getGlobal().settings.byKey.shouldPaidMessageAutoApprove;

  const [shouldAutoApprove, setShouldAutoApprove] = createSignal(Boolean(shouldPaidMessageAutoApprove()));
  const [isWaitingStarsTopup, setIsWaitingStarsTopup] = createSignal(false);
  let confirmPaymentHandlerRef: NoneToVoidFunction | undefined;

  const closeConfirmDialog = () => {
    getActions().closePaymentMessageConfirmDialogOpen();
  };

  createEffect(
    () => read(dialogKey),
    (dialogKey2) => {
      return () => {
        const { paymentMessageConfirmDialogKey } = selectTabState(getGlobal());
        if (paymentMessageConfirmDialogKey === dialogKey2) {
          getActions().closePaymentMessageConfirmDialogOpen();
        }
      };
    },
  );

  createEffect(
    depsOf(
      () =>
        [isWaitingStarsTopup(), read(isStarsBalanceModeOpen), read(starsBalance), read(starsForAllMessages)] as const,
    ),
    ([isWaitingStarsTopup2, isStarsBalanceModeOpen2, starsBalance2, starsForAllMessages2]) => {
      if (isWaitingStarsTopup2 && !isStarsBalanceModeOpen2) {
        setIsWaitingStarsTopup(false);

        if (starsBalance2 > starsForAllMessages2) {
          confirmPaymentHandlerRef?.();
        }
      }
    },
  );

  const handleStarsTopup = () => {
    getActions().openStarsBalanceModal({
      topup: {
        balanceNeeded: read(starsForAllMessages),
        purpose: PAID_MESSAGES_PURPOSE,
      },
    });
    setIsWaitingStarsTopup(true);
  };

  const dialogHandler = () => {
    if (read(starsForAllMessages) > read(starsBalance)) {
      handleStarsTopup();
    } else if (read(shouldDelayConfirmHandler)) {
      setTimeout(() => {
        confirmPaymentHandlerRef?.();
      }, 250);
    } else {
      confirmPaymentHandlerRef?.();
    }

    getActions().closePaymentMessageConfirmDialogOpen();
    if (shouldAutoApprove()) getActions().setPaidMessageAutoApprove();
  };

  const handleWithConfirmation = <T extends (...args: any[]) => void>(handler: T, ...args: Parameters<T>) => {
    if (read(starsForAllMessages)) {
      confirmPaymentHandlerRef = () => handler(...args);
      if (!shouldPaidMessageAutoApprove()) {
        getActions().openPaymentMessageConfirmDialogOpen({ dialogKey: read(dialogKey) });
        return;
      }

      if (read(starsForAllMessages) > read(starsBalance)) {
        handleStarsTopup();
        return;
      }
    }

    handler(...args);
  };

  return {
    closeConfirmDialog,
    handleWithConfirmation,
    dialogHandler,
    shouldAutoApprove,
    setAutoApprove: setShouldAutoApprove,
  };
}

import { createEffect, createMemo, createSignal } from 'frameact';
import { getActions, getGlobal } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';

import { PAID_MESSAGES_PURPOSE } from '../../../../config';
import { selectTabState } from '../../../../global/selectors';

// TODO(codemod): usePaidMessageConfirmation: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function usePaidMessageConfirmation(
  dialogKey: string,
  starsForAllMessages: number,
  isStarsBalanceModeOpen: boolean,
  starsBalance: number,
  shouldDelayConfirmHandler?: boolean,
) {
  const source = createMemo(() => getGlobal().settings.byKey);
  const shouldPaidMessageAutoApprove = () => source().shouldPaidMessageAutoApprove;

  const [shouldAutoApprove, setShouldAutoApprove] = createSignal(Boolean(shouldPaidMessageAutoApprove()));
  const [isWaitingStarsTopup, setIsWaitingStarsTopup] = createSignal(false);
  let confirmPaymentHandlerRef: NoneToVoidFunction | undefined;

  const closeConfirmDialog = () => {
    getActions().closePaymentMessageConfirmDialogOpen();
  };

  createEffect(
    () => dialogKey,
    () => {
      return () => {
        const { paymentMessageConfirmDialogKey } = selectTabState(getGlobal());
        if (paymentMessageConfirmDialogKey === dialogKey) {
          getActions().closePaymentMessageConfirmDialogOpen();
        }
      };
    },
  );

  createEffect(
    depsOf(() => [isWaitingStarsTopup(), isStarsBalanceModeOpen, starsBalance, starsForAllMessages] as const),
    ([isWaitingStarsTopup2]) => {
      if (isWaitingStarsTopup2 && !isStarsBalanceModeOpen) {
        setIsWaitingStarsTopup(false);

        if (starsBalance > starsForAllMessages) {
          confirmPaymentHandlerRef?.();
        }
      }
    },
  );

  const handleStarsTopup = () => {
    getActions().openStarsBalanceModal({
      topup: {
        balanceNeeded: starsForAllMessages,
        purpose: PAID_MESSAGES_PURPOSE,
      },
    });
    setIsWaitingStarsTopup(true);
  };

  const dialogHandler = () => {
    if (starsForAllMessages > starsBalance) {
      handleStarsTopup();
    } else if (shouldDelayConfirmHandler) {
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
    if (starsForAllMessages) {
      confirmPaymentHandlerRef = () => handler(...args);
      if (!shouldPaidMessageAutoApprove()) {
        getActions().openPaymentMessageConfirmDialogOpen({ dialogKey });
        return;
      }

      if (starsForAllMessages > starsBalance) {
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

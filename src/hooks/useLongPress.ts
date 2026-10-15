import { onDestroy } from 'frameact';

import useLastCallback from './useLastCallback';

const DEFAULT_THRESHOLD = 250;

// TODO(codemod): useLongPress: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useLongPress({
  onClick,
  onStart,
  onEnd,
  threshold = DEFAULT_THRESHOLD,
}: {
  onStart?: NoneToVoidFunction;
  onClick?: (event: React.MouseEvent | React.TouchEvent) => void;
  onEnd?: NoneToVoidFunction;
  threshold?: number;
}) {
  let isLongPressActiveRef = false;
  let isPressedRef = false;
  let timerIdRef: number | undefined;

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const canProcessEvent = ('button' in e && e.button === 0) || ('touches' in e && e.touches.length > 0);
    if (isPressedRef || !canProcessEvent) {
      return;
    }

    isPressedRef = true;
    timerIdRef = window.setTimeout(() => {
      onStart?.();
      isLongPressActiveRef = true;
    }, threshold);
  };

  const end = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPressedRef) return;

    if (isLongPressActiveRef) {
      onEnd?.();
    } else {
      onClick?.(e);
    }

    cancel();
  };

  const cancel = () => {
    isLongPressActiveRef = false;
    isPressedRef = false;
    window.clearTimeout(timerIdRef);
  };

  onDestroy(() => {
    window.clearTimeout(timerIdRef);
  });

  return {
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: end,
    onTouchStart: start,
    onTouchEnd: end,
  };
}

export default useLongPress;

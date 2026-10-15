import { onDestroy } from 'frameact';

const DEFAULT_THRESHOLD = 250;

// Deviation: the callbacks are plain functions called at event time (they close over accessors, so they are never
// stale); `useLastCallback` and `useRef` are plain locals of the hook (it runs once).
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
  let isLongPressActive = false;
  let isPressed = false;
  let timerId: number | undefined;

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const canProcessEvent = ('button' in e && e.button === 0) || ('touches' in e && e.touches.length > 0);
    if (isPressed || !canProcessEvent) {
      return;
    }

    isPressed = true;
    timerId = window.setTimeout(() => {
      onStart?.();
      isLongPressActive = true;
    }, threshold);
  };

  const end = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPressed) return;

    if (isLongPressActive) {
      onEnd?.();
    } else {
      onClick?.(e);
    }

    cancel();
  };

  const cancel = () => {
    isLongPressActive = false;
    isPressed = false;
    window.clearTimeout(timerId);
  };

  onDestroy(() => {
    window.clearTimeout(timerId);
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

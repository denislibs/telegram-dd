import { createMemo, createSignal, onMount } from 'frameact';

import { throttle } from '../../util/schedulers';
import windowSize from '../../util/windowSize';
import useDebouncedCallback from '../useDebouncedCallback';

const THROTTLE = 250;

export default function useWindowSize() {
  const { width: initialWidth, height: initialHeight } = windowSize.get();
  const [width, setWidth] = createSignal(initialWidth);
  const [height, setHeight] = createSignal(initialHeight);
  const [isResizing, setIsResizing] = createSignal(false);
  const setIsResizingDebounced = useDebouncedCallback(setIsResizing, [setIsResizing], THROTTLE, true);

  onMount(() => {
    const throttledSetIsResizing = throttle(
      () => {
        setIsResizing(true);
      },
      THROTTLE,
      true,
    );

    const throttledSetSize = throttle(
      () => {
        const { width: newWidth, height: newHeight } = windowSize.get();
        setWidth(newWidth);
        setHeight(newHeight);
        setIsResizingDebounced(false);
      },
      THROTTLE,
      false,
    );

    const handleResize = () => {
      throttledSetIsResizing();
      throttledSetSize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  return createMemo(() => ({ width: width(), height: height(), isResizing: isResizing() }));
}

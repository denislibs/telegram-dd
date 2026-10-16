import { createSignal } from 'frameact';

const THRESHOLD = 5;

export default function useScrolledState(threshold = THRESHOLD) {
  const [isAtBeginning, setIsAtBeginning] = createSignal(true);
  const [isAtEnd, setIsAtEnd] = createSignal(true);

  // Deviation: a native `Event` (frameact delivers native events; `onScroll` handlers are typed with `Event`).
  const handleScroll = (e: Event) => {
    const { scrollHeight, scrollTop, clientHeight } = e.target as HTMLElement;

    setIsAtBeginning(scrollTop < threshold);
    setIsAtEnd(scrollHeight - scrollTop - clientHeight < threshold);
  };

  const updateScrollState = (element: HTMLElement | undefined) => {
    if (!element) {
      setIsAtBeginning(true);
      setIsAtEnd(true);
      return;
    }

    const { scrollHeight, scrollTop, clientHeight } = element;
    setIsAtBeginning(scrollTop < threshold);
    setIsAtEnd(scrollHeight - scrollTop - clientHeight < threshold);
  };

  return { isAtBeginning, isAtEnd, handleScroll, updateScrollState };
}

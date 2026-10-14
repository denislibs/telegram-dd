import { createSignal } from 'frameact';

const THRESHOLD = 5;

export default function useScrolledState(threshold = THRESHOLD) {
  const [isAtBeginning, setIsAtBeginning] = createSignal(true);
  const [isAtEnd, setIsAtEnd] = createSignal(true);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
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

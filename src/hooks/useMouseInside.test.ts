// Original test (not in telegram-tt): `useMouseInside` closes a menu that the mouse left, and only if it did not come back.
import { createRoot, createSignal, flushSync } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useMouseInside from './useMouseInside';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMouseInside', () => {
  it('closes after the mouse left for the close timeout, unless it came back', () => {
    createRoot((dispose) => {
      const onClose = vi.fn();
      const [isOpen] = createSignal(true);
      const [handleMouseEnter, handleMouseLeave] = useMouseInside(isOpen, onClose, 250);
      flushSync();

      handleMouseEnter();
      handleMouseLeave();
      vi.advanceTimersByTime(200);
      handleMouseEnter();
      vi.advanceTimersByTime(300);
      expect(onClose).not.toHaveBeenCalled();

      handleMouseLeave();
      vi.advanceTimersByTime(249);
      expect(onClose).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  it('closes an open menu the mouse never entered (after twice the timeout, only with the document focused)', () => {
    createRoot((dispose) => {
      const onClose = vi.fn();
      const [isOpen, setIsOpen] = createSignal(false);
      const [isDisabled, setIsDisabled] = createSignal(false);
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      useMouseInside(isOpen, onClose, 250, isDisabled);
      flushSync();

      setIsOpen(true);
      flushSync();
      vi.advanceTimersByTime(499);
      expect(onClose).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onClose).toHaveBeenCalledTimes(1);

      // A disabled hook (mobile) never closes
      setIsOpen(false);
      setIsDisabled(true);
      flushSync();
      setIsOpen(true);
      flushSync();
      vi.advanceTimersByTime(1000);
      expect(onClose).toHaveBeenCalledTimes(1);
      dispose();
    });
  });
});

// Original test (not in telegram-tt): a click is reported on release before the threshold, a long press reports its
// start after the threshold and its end on release, and a destroyed owner cancels the timer.
import { createRoot } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useLongPress from './useLongPress';

const mouse = (button = 0) => ({ button }) as unknown as React.MouseEvent;

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const onClick = vi.fn();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    let handlers!: ReturnType<typeof useLongPress>;
    const dispose = createRoot((stop) => {
      handlers = useLongPress({ onClick, onStart, onEnd, threshold: 500 });
      return stop;
    });
    return { handlers, onClick, onStart, onEnd, dispose };
  }

  it('reports a click on a quick release', () => {
    const { handlers, onClick, onStart, onEnd } = setup();
    const down = mouse();
    handlers.onMouseDown(down);
    vi.advanceTimersByTime(100);
    handlers.onMouseUp(down);
    expect(onClick).toHaveBeenCalledWith(down);
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('reports the start after the threshold and the end on release, not a click', () => {
    const { handlers, onClick, onStart, onEnd } = setup();
    handlers.onMouseDown(mouse());
    vi.advanceTimersByTime(499);
    expect(onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    handlers.onMouseLeave(mouse());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores the right button and a second press while pressed, and a release without a press', () => {
    const { handlers, onClick, onStart } = setup();
    handlers.onMouseDown(mouse(2));
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();

    handlers.onMouseUp(mouse());
    expect(onClick).not.toHaveBeenCalled();

    handlers.onMouseDown(mouse());
    handlers.onMouseDown(mouse());
    vi.advanceTimersByTime(500);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('starts nothing once its owner is destroyed', () => {
    const { handlers, onStart, dispose } = setup();
    handlers.onMouseDown(mouse());
    dispose();
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();
  });
});

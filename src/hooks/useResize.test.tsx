// Original test (not in telegram-tt): the resizable column hook: the initial width follows its signal, a drag writes the
// width in the mutate phase and reports it on mouse up, a reset clears it.
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../lib/kit/testing/dom';
import { useResize } from './useResize';

describe('useResize', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  // The harness clears the delegated listeners after each test.
  beforeEach(() => {
    delegateEvents(['mousedown', 'mouseup', 'dblclick']);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.classList.remove('cursor-ew-resize');
  });

  function mount(initialWidth: () => number | undefined) {
    const onResize = vi.fn();
    const onReset = vi.fn();
    let el!: HTMLDivElement;
    const Column = () => {
      const { initResize, resetResize, handleMouseUp } = useResize(
        () => el,
        onResize,
        onReset,
        initialWidth,
        '--left-column-width',
      );
      return (
        <div ref={el} onDblClick={resetResize}>
          <div class="handle" onMouseDown={initResize} onMouseUp={handleMouseUp} />
        </div>
      );
    };
    const host = container();
    dispose = render(() => <Column />, host);
    return { host, onResize, onReset, column: () => el };
  }

  it('applies the initial width and follows it', async () => {
    const [width, setWidth] = createSignal<number | undefined>(300);
    const { column } = mount(width);
    await harness.frame();
    expect(column().style.width).toBe('300px');
    expect(column().style.getPropertyValue('--left-column-width')).toBe('300px');

    setWidth(420);
    await harness.frame();
    expect(column().style.width).toBe('420px');
    expect(column().style.getPropertyValue('--left-column-width')).toBe('420px');
  });

  it('writes the dragged width, marks the cursor, and reports on mouse up', async () => {
    const { host, onResize, column } = mount(() => undefined);
    await harness.frame();
    const handle = host.querySelector('.handle')!;

    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true }));
    await harness.frame();
    await harness.frame();
    expect(document.body.classList.contains('cursor-ew-resize')).toBe(true);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }));
    await harness.frame();
    expect(column().style.width).toBe('60px');

    document.dispatchEvent(new MouseEvent('mouseup'));
    await harness.frame();
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('cursor-ew-resize')).toBe(false);

    // after the drag the document listeners are gone
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
    await harness.frame();
    expect(column().style.width).toBe('60px');
  });

  it('clears the width on a reset', async () => {
    const { column, onReset } = mount(() => 300);
    await harness.frame();
    expect(column().style.width).toBe('300px');

    column().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await harness.frame();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(column().style.width).toBe('');
    expect(column().style.getPropertyValue('--left-column-width')).toBe('');
  });
});

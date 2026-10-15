// Original test (not in telegram-tt): the initial history loading of the message list reads the height of the content that
// the new ids render (tt's `useEffect` ran after the DOM update), not that of the previous ids.
import { createSignal, flushSync } from 'frameact';
import { For, render } from 'frameact/dom';
import { describe, expect, it, vi } from 'vitest';

import { container as makeContainer, useDomHarness } from '../../../lib/kit/testing/dom';
import useInitialMessageLoading from './useInitialMessageLoading';

const ROW_HEIGHT = 100;
const VIEWPORT_HEIGHT = 300;

describe('useInitialMessageLoading', () => {
  const harness = useDomHarness();

  function setup(initialIds: number[]) {
    const [ids, setIds] = createSignal<number[] | undefined>(initialIds);
    const loadMoreAround = vi.fn();
    let list!: HTMLDivElement;

    const dispose = render(() => {
      useInitialMessageLoading({
        containerRef: () => list,
        isChatLoaded: true,
        messageIds: ids,
        loadMoreAround: () => loadMoreAround,
        focusingId: undefined,
        isRestricted: false,
      });

      return (
        <div
          ref={(el: HTMLDivElement) => {
            list = el;
            // jsdom has no layout: the container is a viewport, the content is as tall as its rows
            Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => VIEWPORT_HEIGHT });
          }}
        >
          <div
            ref={(el: HTMLDivElement) => {
              Object.defineProperty(el, 'clientHeight', {
                configurable: true,
                get: () => el.querySelectorAll('.row').length * ROW_HEIGHT,
              });
            }}
          >
            <For each={ids() ?? []}>{(id) => <i class="row" data-id={id()} />}</For>
          </div>
        </div>
      );
    }, makeContainer());

    return { setIds, loadMoreAround, dispose };
  }

  const frames = async () => {
    await harness.frame();
    await harness.frame();
    await harness.frame();
  };

  it('loads around when the first ids do not fill the viewport, and not again for ids that do', async () => {
    // one id: always loaded around (tt's `messageIds.length === 1`)
    const { setIds, loadMoreAround, dispose } = setup([1]);
    await frames();
    expect(loadMoreAround).toHaveBeenCalledTimes(1);

    // five rows are taller than the viewport: the height is read from the DOM that these ids render, so no second request.
    // (A measure effect reads the previous one-row content, 100 px, and requests again.)
    setIds([1, 2, 3, 4, 5]);
    flushSync();
    await frames();
    expect(loadMoreAround).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('loads around when the list shrinks under the viewport', async () => {
    const { setIds, loadMoreAround, dispose } = setup([1, 2, 3, 4, 5]);
    await frames();
    expect(loadMoreAround).not.toHaveBeenCalled();

    // two rows leave the viewport empty: request. (A measure effect reads the previous five rows, 500 px, and skips it.)
    setIds([1, 2]);
    flushSync();
    await frames();
    expect(loadMoreAround).toHaveBeenCalledTimes(1);
    dispose();
  });
});

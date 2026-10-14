// AnimatedSticker under a Transition (its own heavy-animation scope) while a ROOT animation runs (Menu, Modal,
// animateScroll): the sticker initialises when the chain is idle again and pauses for both kinds of animation.
import { beginHeavyAnimation, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import Transition from '../ui/Transition';
import AnimatedSticker from './AnimatedSticker';

const tlottie = vi.hoisted(() => {
  const animation = {
    play: vi.fn(),
    pause: vi.fn(),
    isPlaying: () => true,
    removeView: vi.fn(),
    setColor: vi.fn(),
    setSpeed: vi.fn(),
    setNoLoop: vi.fn(),
    seekToEnd: vi.fn(),
    playSegment: vi.fn(),
    changeData: vi.fn(),
    setSharedCanvasCoords: vi.fn(),
  };
  const init = vi.fn(() => animation);
  return { animation, init, impl: { init } };
});
vi.mock('../../lib/tlottie/TLottie.async', () => ({
  getTLottie: () => tlottie.impl,
  ensureTLottie: () => Promise.resolve(tlottie.impl),
}));

// jsdom has no focus: the real module would report "in background" and freeze every sticker
vi.mock('../../hooks/window/useBackgroundMode', () => ({
  default: () => undefined,
  isBackgroundModeActive: () => false,
}));

const { frame } = useDomHarness();
const violations: string[] = [];
const host = () => suppressStrict(container);

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});
beforeEach(() => {
  violations.length = 0;
  tlottie.init.mockClear();
  tlottie.animation.pause.mockClear();
  tlottie.animation.play.mockClear();
  delegateEvents(['click']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});
afterEach(() => {
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

const settle = async () => {
  await flushMicrotasks();
  await frame();
  await frame();
  flushSync();
};

it('a sticker created under a Transition during a root animation initialises when that animation ends', async () => {
  const el = host();
  const endRoot = beginHeavyAnimation(Infinity);
  const dispose = render(
    () => (
      <Transition activeKey={0} name="none">
        {() => <AnimatedSticker tgsUrl="a.tgs" size={50} />}
      </Transition>
    ),
    el,
  );
  await settle();
  expect(tlottie.init).not.toHaveBeenCalled();

  endRoot();
  await settle();
  expect(tlottie.init).toHaveBeenCalledTimes(1);
  dispose();
});

it('a root animation pauses a sticker that lives under a Transition, and its end resumes it', async () => {
  const el = host();
  const dispose = render(
    () => (
      <Transition activeKey={0} name="none">
        {() => <AnimatedSticker tgsUrl="a.tgs" size={50} play />}
      </Transition>
    ),
    el,
  );
  await settle();
  expect(tlottie.init).toHaveBeenCalledTimes(1);
  tlottie.animation.pause.mockClear();

  const endRoot = beginHeavyAnimation(Infinity);
  await settle();
  expect(tlottie.animation.pause).toHaveBeenCalled();

  tlottie.animation.play.mockClear();
  endRoot();
  await settle();
  expect(tlottie.animation.play).toHaveBeenCalled();
  dispose();
});

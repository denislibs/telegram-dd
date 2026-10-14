import { createHeavyAnimationScope, createMeasureEffect, createMutationEffect, createRoot, createSignal, type HeavyAnimationScope,onCleanup } from 'frameact';
import { createComponent, insert } from 'frameact/dom';
import { afterEach, expect, it, vi } from 'vitest';

import { container, useDomHarness } from './testing/dom';
import { Transition, type TransitionSlide } from './transition';

const { frame } = useDomHarness();

afterEach(() => {
  vi.useRealTimers();
});

const classes = (el: Element) => Array.from(el.classList).join(' ');
const slidesOf = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('.Transition_slide'));

function sized<T extends HTMLElement>(el: T, height: number): T {
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true });
  return el;
}

function animationEnd(el: Element) {
  el.dispatchEvent(new Event('animationend', { bubbles: true }));
  vi.advanceTimersByTime(50); // waitForAnimationEnd's post-event delay → requestMutation
}

interface Setup {
  root: HTMLDivElement;
  scope: HeavyAnimationScope;
  setKey: (k: number) => void;
  dispose: () => void;
  log: string[];
}

function setup(extra: Record<string, unknown> = {}, initial = 0): Setup {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const root = container();
  const scope = createHeavyAnimationScope();
  const [key, setKey] = createSignal(initial);
  const log: string[] = [];
  const dispose = createRoot((d) => {
    const props: Record<string, unknown> = {
      get activeKey() { return key(); },
      name: 'slide',
      scope,
      onStart: () => log.push('start'),
      onStop: () => log.push('stop'),
      children: (slide: TransitionSlide) => {
        const b = document.createElement('b');
        insert(b, () => `${slide.key}:${slide.isActive() ? 'active' : slide.isFrom() ? 'from' : '-'}`);
        return b;
      },
    };
    Object.defineProperties(props, Object.getOwnPropertyDescriptors(extra)); // keeps getters reactive
    insert(root, createComponent(Transition, props as never));
    return d;
  });
  return { root, scope, setKey, dispose, log };
}

it('mounts the active slide without animating; a key change animates from → to, keeps the previous slide, ends on animationend', async () => {
  const { root, scope, setKey, log } = setup();
  const t = root.firstElementChild as HTMLElement;
  expect(classes(t)).toBe('Transition');
  expect(slidesOf(t).map(classes)).toEqual(['Transition_slide Transition_slide-active']);
  expect(t.textContent).toBe('0:active');
  expect(scope.isAnimating.peek()).toBe(false);

  setKey(1);
  await frame();
  const [s0, s1] = slidesOf(t);
  expect(classes(t)).toBe('Transition Transition-slide'); // forwards
  expect(classes(s0)).toBe('Transition_slide Transition_slide-from');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-to');
  expect(t.textContent).toBe('0:from1:active');
  expect(scope.isAnimating.peek()).toBe(true);
  expect(log).toEqual(['start']);

  animationEnd(s1); // the watched slide is `to`
  expect(scope.isAnimating.peek()).toBe(true); // the end is applied in the mutate phase, not in the event
  await frame();
  expect(classes(t)).toBe('Transition');
  expect(classes(s0)).toBe('Transition_slide Transition_slide-inactive'); // kept alive
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
  expect(scope.isAnimating.peek()).toBe(false);
  expect(log).toEqual(['start', 'stop']);
  expect(slidesOf(t)).toEqual([s0, s1]);
});

it('going back reuses the kept slide (same element), animates Backwards; shouldCleanup drops the other slide after the animation', async () => {
  const { root, setKey } = setup({ shouldCleanup: true }, 0);
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [s0, s1] = slidesOf(t);
  animationEnd(s1);
  await frame(); // the end: classes, callbacks, the cleanup write
  await frame(); // the cleanup write lands in the next frame (it is made from a mutate task)
  expect(slidesOf(t)).toEqual([s1]); // cleanup: only the active one remains
  setKey(0);
  await frame();
  const [n0, n1] = slidesOf(t);
  expect(n1).toBe(s1);
  expect(n0).not.toBe(s0); // s0 was dropped by the cleanup: a new slide
  expect(classes(t)).toBe('Transition Transition-slideBackwards');
  expect(classes(n0)).toBe('Transition_slide Transition_slide-to');
  expect(classes(n1)).toBe('Transition_slide Transition_slide-from');
  animationEnd(n0);
  await frame();
  await frame();
  expect(slidesOf(t)).toEqual([n0]);
  expect(n0.textContent).toBe('0:active');
});

it('without cleanup the previous slide stays after the animation; a new step keeps only {previous, active} (tt keep-alive); renderCount keeps all', async () => {
  const { root, setKey } = setup();
  const t = root.firstElementChild as HTMLElement;
  setKey(2);
  await frame();
  const [s0, s2] = slidesOf(t);
  animationEnd(s2);
  await frame();
  expect(slidesOf(t)).toEqual([s0, s2]); // kept after the animation
  setKey(1);
  await frame();
  const now = slidesOf(t);
  expect(now.length).toBe(2); // 0 is gone: only the previous (2) and the active (1) are alive
  expect(now[1]).toBe(s2);
  expect(classes(now[0])).toBe('Transition_slide Transition_slide-to');
  expect(classes(s2)).toBe('Transition_slide Transition_slide-from');
  animationEnd(now[0]);
  await frame();
  expect(slidesOf(t)).toEqual([now[0], s2]);

  const all = setup({ renderCount: 3 });
  const t2 = all.root.firstElementChild as HTMLElement;
  all.setKey(2);
  await frame();
  animationEnd(slidesOf(t2)[1]);
  await frame();
  all.setKey(1);
  await frame();
  expect(slidesOf(t2).length).toBe(3); // every visited key stays, in key order
  expect(slidesOf(t2).map((s) => s.textContent)).toEqual(['0:-', '1:active', '2:from']);
});

it('name "none" or disableAnimation switches at once: no classes, no heavy animation, no callbacks', async () => {
  const { root, scope, setKey, log } = setup({ name: 'none' });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [s0, s1] = slidesOf(t);
  expect(classes(t)).toBe('Transition');
  expect(classes(s0)).toBe('Transition_slide Transition_slide-inactive');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
  expect(scope.isAnimating.peek()).toBe(false);
  expect(log).toEqual([]);

  const off = setup({ disableAnimation: true });
  const t2 = off.root.firstElementChild as HTMLElement;
  off.setKey(1);
  await frame();
  expect(classes(t2)).toBe('Transition');
  expect(slidesOf(t2).map(classes)).toEqual(['Transition_slide Transition_slide-inactive', 'Transition_slide Transition_slide-active']);
  expect(off.scope.isAnimating.peek()).toBe(false);
  expect(off.log).toEqual([]);
});

it('a step started during an animation supersedes it: the first end only releases its heavy animation; the second finishes the classes', async () => {
  const { root, scope, setKey, log } = setup({ isBlockingAnimation: true });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [, s1] = slidesOf(t);
  expect(scope.isBlockingAnimating.peek()).toBe(true);
  setKey(2);
  await frame();
  const [, s2] = slidesOf(t);
  expect(slidesOf(t).length).toBe(2); // slide 0 is dropped at the new step (not the previous key any more)
  expect(classes(s1)).toBe('Transition_slide Transition_slide-from');
  expect(classes(s2)).toBe('Transition_slide Transition_slide-to');
  animationEnd(s1); // the first step's end (its watched slide was s1)
  await frame();
  expect(classes(s2)).toBe('Transition_slide Transition_slide-to'); // untouched: superseded
  expect(scope.isBlockingAnimating.peek()).toBe(true); // the second step's animation
  expect(log).toEqual(['start', 'stop', 'start']); // N4: the superseded step is stopped when the next starts
  animationEnd(s2);
  await frame();
  expect(classes(s2)).toBe('Transition_slide Transition_slide-active');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-inactive');
  expect(scope.isBlockingAnimating.peek()).toBe(false);
  expect(log).toEqual(['start', 'stop', 'start', 'stop']);
});

it('the scope is provided to the slides: a blocking animation parks their frame effects until the end; disposal ends a running animation', async () => {
  const [text, setText] = createSignal('a');
  const applied: string[] = [];
  const { scope, setKey, dispose } = setup({
    isBlockingAnimation: true,
    children: () => {
      const b = document.createElement('b');
      createMutationEffect(() => text(), (v) => { applied.push(v); });
      return b;
    },
  });
  setKey(1);
  await frame();
  expect(scope.isBlockingAnimating.peek()).toBe(true);
  setText('b');
  await frame();
  expect(applied).toEqual(['a', 'a']); // the two slides' first applies only: 'b' is parked
  dispose();
  expect(scope.isBlockingAnimating.peek()).toBe(false); // dispose ended the heavy animation
  await frame();
  expect(applied).toEqual(['a', 'a']); // disposed while parked: dropped at release
});

it('shouldRestoreHeight: measured in the forced-reflow phase when the step settles, the container height set in its mutate step; the old height stays during the animation', async () => {
  const { root, setKey } = setup({ shouldRestoreHeight: true });
  const t = root.firstElementChild as HTMLElement;
  const [s0] = slidesOf(t);
  sized(s0, 120);
  await frame(); // the first measure (forced reflow) and write
  expect(t.style.height).toBe('120px');
  expect(t.style.flexBasis).toBe('120px');
  expect(s0.style.height).toBe('auto');
  setKey(1);
  await frame();
  const [, s1] = slidesOf(t);
  sized(s1, 80);
  expect(t.style.height).toBe('120px'); // kept while animating
  animationEnd(s1);
  await frame();
  expect(t.style.height).toBe('80px'); // the end task settles the step: measured and applied in that frame
  expect(s1.style.height).toBe('auto');

  // without an animation the switch settles at once (the measure runs after the mutate phase that created the slide)
  const quick = setup({
    shouldRestoreHeight: true,
    disableAnimation: true,
    contentSelector: 'b',
    children: (slide: TransitionSlide) => sized(document.createElement('b'), slide.key === 0 ? 120 : 60),
  });
  const q = quick.root.firstElementChild as HTMLElement;
  await frame();
  expect(q.style.height).toBe('120px');
  quick.setKey(1);
  await frame();
  expect(q.style.height).toBe('60px');
});

it('disposal after the end event but before its mutate task: no onStop, no writes', async () => {
  const { root, setKey, dispose, log } = setup();
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [, s1] = slidesOf(t);
  s1.dispatchEvent(new Event('animationend', { bubbles: true }));
  dispose(); // inside waitForAnimationEnd's 50 ms delay
  vi.advanceTimersByTime(50);
  await frame();
  expect(log).toEqual(['start']);
  expect(classes(s1)).toBe('Transition_slide Transition_slide-to');
});

it('a throwing onStart / onStop is reported and leaves neither the step animating nor the scope begun (clean-room finding 2)', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { root, scope, setKey, log } = setup({
    onStart: () => { log.push('start'); throw new Error('onStart boom'); },
    onStop: () => { log.push('stop'); throw new Error('onStop boom'); },
  });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [s0, s1] = slidesOf(t);
  expect(log).toEqual(['start']);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(scope.isAnimating.peek()).toBe(true); // the throw came after the step was set up
  expect(classes(s1)).toBe('Transition_slide Transition_slide-to');
  animationEnd(s1);
  await frame();
  expect(scope.isAnimating.peek()).toBe(false); // released before onStop ran
  expect(classes(t)).toBe('Transition');
  expect(classes(s0)).toBe('Transition_slide Transition_slide-inactive');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
  expect(log).toEqual(['start', 'stop']);
  expect(errors).toHaveBeenCalledTimes(2);
  setKey(2); // the next step is a normal one
  await frame();
  expect(scope.isAnimating.peek()).toBe(true);
  expect(log).toEqual(['start', 'stop', 'start']);
});

it('a non-animated switch during an animation stops it: waiter cancelled, scope released, onStop once, classes and isFrom settled (clean-room finding 2)', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const root = container();
  const scope = createHeavyAnimationScope();
  const [key, setKey] = createSignal(0);
  const [off, setOff] = createSignal(false);
  const log: string[] = [];
  createRoot(() => {
    insert(
      root,
      createComponent(Transition, {
        get activeKey() { return key(); },
        name: 'slide',
        scope,
        isBlockingAnimation: true,
        get disableAnimation() { return off(); },
        onStart: () => log.push('start'),
        onStop: () => log.push('stop'),
        children: (slide: TransitionSlide) => {
          const b = document.createElement('b');
          insert(b, () => `${slide.key}:${slide.isFrom() ? 'from' : slide.isActive() ? 'active' : '-'}`);
          return b;
        },
      }),
    );
  });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [, s1] = slidesOf(t);
  expect(scope.isBlockingAnimating.peek()).toBe(true);
  expect(t.textContent).toBe('0:from1:active');
  setOff(true);
  setKey(2);
  await frame();
  const now = slidesOf(t);
  expect(now.length).toBe(2); // keep-alive: {1, 2}
  expect(now[0]).toBe(s1);
  expect(classes(t)).toBe('Transition');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-inactive');
  expect(classes(now[1])).toBe('Transition_slide Transition_slide-active');
  expect(t.textContent).toBe('1:-2:active'); // isFrom cleared, the slides' effects not parked (the scope was released in the same step)
  expect(scope.isBlockingAnimating.peek()).toBe(false);
  expect(log).toEqual(['start', 'stop']);
  animationEnd(s1); // the cancelled waiter and the fallback: nothing happens
  vi.advanceTimersByTime(2000);
  await frame();
  expect(log).toEqual(['start', 'stop']);
  expect(classes(now[1])).toBe('Transition_slide Transition_slide-active');
});

it('disposal mid-animation: the fallback timer and a late end event do nothing, the slides are disposed, keep-alive disposes a dropped slide (clean-room finding 5)', async () => {
  const { root, scope, setKey, dispose, log } = setup({
    children: (slide: TransitionSlide) => {
      onCleanup(() => log.push(`gone ${slide.key}`));
      const b = document.createElement('b');
      b.textContent = String(slide.key);
      return b;
    },
  });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  animationEnd(slidesOf(t)[1]);
  await frame();
  setKey(2); // keep-alive keeps {1, 2}: slide 0 is dropped and disposed at the step
  await frame();
  expect(log).toEqual(['start', 'stop', 'gone 0', 'start']);
  const [s1, s2] = slidesOf(t);
  dispose();
  expect(scope.isAnimating.peek()).toBe(false);
  expect(new Set(log.slice(4))).toEqual(new Set(['gone 1', 'gone 2']));
  vi.advanceTimersByTime(2000); // the 1 s end fallback would have settled the step
  s2.dispatchEvent(new Event('animationend', { bubbles: true }));
  vi.advanceTimersByTime(50);
  await frame();
  await frame();
  expect(log.length).toBe(6); // no onStop
  expect(classes(t)).toBe('Transition Transition-slide'); // no class write after dispose
  expect(classes(s1)).toBe('Transition_slide Transition_slide-from');
  expect(classes(s2)).toBe('Transition_slide Transition_slide-to');
});

it('slide.isActive() is current in the frame of the switch: a measure effect in a slide sees it at once, with no "dirtied during the mutate phase" warning (N2)', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const seen: string[] = [];
  const { root, setKey } = setup({
    renderCount: 2, // both slides stay alive, so a switch back reuses a slide whose measure effect already exists
    children: (slide: TransitionSlide) => {
      createMeasureEffect(() => slide.isActive(), (active) => { seen.push(`${slide.key}:${active}`); });
      return document.createElement('b');
    },
  });
  await frame();
  setKey(1);
  await frame();
  await frame(); // the new slide's first measure run
  animationEnd(slidesOf(root)[1]);
  await frame();
  seen.length = 0;
  setKey(0);
  await frame(); // ONE frame: both measure effects ran with the new value
  expect(seen).toHaveLength(2);
  expect(seen).toContain('0:true');
  expect(seen).toContain('1:false');
  await frame();
  expect(seen.length).toBe(2);
  expect(warn.mock.calls.filter((c) => String(c[0]).includes('dirtied during the mutate phase'))).toEqual([]);
});

it('a superseded step whose slide keep-alive removed releases its blocking heavy animation at once, not at the 1 s fallback (N3)', async () => {
  const { root, scope, setKey } = setup({ isBlockingAnimation: true });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  setKey(2);
  await frame();
  const [, s2] = slidesOf(t);
  setKey(3); // keep-alive keeps {2, 3}: slide 1, the target of the first (still running) step, is gone
  await frame();
  const [, s3] = slidesOf(t);
  expect(slidesOf(t).length).toBe(2);
  animationEnd(s2); // the second step's end
  animationEnd(s3); // the last step's end
  await frame();
  expect(scope.isAnimating.peek()).toBe(false);
  expect(scope.isBlockingAnimating.peek()).toBe(false);
});

it('onStart / onStop are paired under supersede: every start gets exactly one stop, in order (N4)', async () => {
  const { root, setKey, log } = setup();
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  setKey(2);
  await frame();
  expect(log).toEqual(['start', 'stop', 'start']); // the first step is over the moment the second starts
  animationEnd(slidesOf(t)[0]); // the first step's own (late) end: nothing more
  await frame();
  expect(log).toEqual(['start', 'stop', 'start']);
  animationEnd(slidesOf(t)[1]);
  await frame();
  expect(log).toEqual(['start', 'stop', 'start', 'stop']);
});

// ---- slide selection of reveal / slideFadeAndroid (tt `watchedNode`) ----------

it.each(['reveal', 'slideFadeAndroid'])(
  '%s: forwards the `to` slide is watched, backwards the `from` slide (the stylesheet gives `to` no backwards animation)',
  async (name) => {
    const { root, scope, setKey, log } = setup({ name });
    const t = root.firstElementChild as HTMLElement;
    setKey(1);
    await frame();
    const [s0, s1] = slidesOf(t);
    expect(classes(t)).toBe(`Transition Transition-${name}`);
    animationEnd(s0); // `from` is not watched going forwards
    await frame();
    expect(scope.isAnimating.peek()).toBe(true);
    animationEnd(s1);
    await frame();
    expect(scope.isAnimating.peek()).toBe(false);
    expect(log).toEqual(['start', 'stop']);

    setKey(0);
    await frame();
    const [b0, b1] = slidesOf(t);
    expect(b0).toBe(s0);
    expect(classes(t)).toBe(`Transition Transition-${name}Backwards`);
    expect(classes(b0)).toBe('Transition_slide Transition_slide-to');
    expect(classes(b1)).toBe('Transition_slide Transition_slide-from');
    animationEnd(b0); // `to` has no animation going backwards: an event on it does not end the step
    await frame();
    expect(scope.isAnimating.peek()).toBe(true);
    expect(classes(b1)).toBe('Transition_slide Transition_slide-from');
    animationEnd(b1);
    await frame();
    expect(scope.isAnimating.peek()).toBe(false);
    expect(classes(t)).toBe('Transition');
    expect(classes(b0)).toBe('Transition_slide Transition_slide-active');
    expect(classes(b1)).toBe('Transition_slide Transition_slide-inactive');
    expect(log).toEqual(['start', 'stop', 'start', 'stop']);
  },
);

it('backwards reveal settles on the `from` animationend, not through the 1 s fallback; other names still watch `to` backwards', async () => {
  const { root, scope, setKey } = setup({ name: 'reveal' });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  animationEnd(slidesOf(t)[1]);
  await frame();
  setKey(0);
  await frame();
  const [, from] = slidesOf(t);
  vi.advanceTimersByTime(900);
  expect(scope.isAnimating.peek()).toBe(true);
  animationEnd(from);
  await frame();
  expect(scope.isAnimating.peek()).toBe(false);

  const slide = setup({ name: 'slide' }, 1);
  const s = slide.root.firstElementChild as HTMLElement;
  slide.setKey(0);
  await frame();
  const [to] = slidesOf(s);
  animationEnd(to); // backwards `slide` animates both: `to` is watched
  await frame();
  expect(slide.scope.isAnimating.peek()).toBe(false);
});

// ---- nextKey: the next slide is rendered ahead of time (tt `nextKey`) --------

function nextKeySetup(extra: Record<string, unknown> = {}, initial = 0, initialNext: number | undefined = 1) {
  const [nextKey, setNextKey] = createSignal<number | undefined>(initialNext);
  const rendered: number[] = [];
  const base = setup(
    {
      get nextKey() {
        return nextKey();
      },
      children: (slide: TransitionSlide) => {
        rendered.push(slide.key);
        const b = document.createElement('b');
        insert(b, () => `${slide.key}:${slide.isActive() ? 'active' : '-'}`);
        return b;
      },
      ...extra,
    },
    initial,
  );
  return { ...base, setNextKey, rendered };
}

it('nextKey: the slide is created and mounted hidden (inactive) before its key is ever active; no animation, no callbacks', async () => {
  const { root, scope, rendered, log } = nextKeySetup();
  const t = root.firstElementChild as HTMLElement;
  await frame();
  expect(rendered).toEqual([0, 1]); // 1 was rendered ahead of time
  expect(slidesOf(t).map(classes)).toEqual([
    'Transition_slide Transition_slide-active',
    'Transition_slide Transition_slide-inactive',
  ]);
  expect(t.textContent).toBe('0:active1:-');
  expect(classes(t)).toBe('Transition');
  expect(scope.isAnimating.peek()).toBe(false);
  expect(log).toEqual([]);
});

it('nextKey: switching to the pre-rendered key reuses its slide (no second render) and animates as usual; it is kept by the keep-alive', async () => {
  const { root, setKey, setNextKey, rendered } = nextKeySetup();
  const t = root.firstElementChild as HTMLElement;
  await frame();
  const [s0, s1] = slidesOf(t);
  setNextKey(2);
  setKey(1);
  await frame();
  expect(rendered).toEqual([0, 1, 2]); // slide 1 was not rendered again, slide 2 was pre-rendered
  const [a0, a1, a2] = slidesOf(t);
  expect([a0, a1]).toEqual([s0, s1]);
  expect(classes(a0)).toBe('Transition_slide Transition_slide-from');
  expect(classes(a1)).toBe('Transition_slide Transition_slide-to');
  expect(classes(a2)).toBe('Transition_slide Transition_slide-inactive'); // the keep-alive of the step keeps {previous, active, next}
  animationEnd(a1);
  await frame();
  expect(slidesOf(t)).toEqual([s0, s1, a2]);
  expect(classes(s0)).toBe('Transition_slide Transition_slide-inactive');
  expect(classes(a2)).toBe('Transition_slide Transition_slide-inactive');
  expect(t.textContent).toBe('0:-1:active2:-');
});

it('nextKey: a slide that is no longer next is dropped by the next step; the new next one is mounted in key order', async () => {
  const { root, setKey, setNextKey, rendered } = nextKeySetup();
  const t = root.firstElementChild as HTMLElement;
  await frame();
  setNextKey(3);
  await frame();
  expect(slidesOf(t).map((s) => s.textContent)).toEqual(['0:active', '1:-', '3:-']);
  setKey(3);
  await frame();
  // keep-alive after the step: previous 0 and active 3; the stale pre-rendered 1 is gone
  expect(slidesOf(t).map((s) => s.textContent)).toEqual(['0:-', '3:active']);
  expect(rendered).toEqual([0, 1, 3]);
});

it('nextKey: shouldCleanup and renderCount-less cleanup keep the pre-rendered slide; key 0 is not pre-rendered (tt tests the key for truthiness)', async () => {
  const { root, setKey } = nextKeySetup({ shouldCleanup: true }, 1, 2);
  const t = root.firstElementChild as HTMLElement;
  await frame();
  expect(slidesOf(t).map((s) => s.textContent)).toEqual(['1:active', '2:-']);
  setKey(2);
  await frame();
  const [, s2] = slidesOf(t);
  animationEnd(s2);
  await frame();
  await frame();
  expect(slidesOf(t).map((s) => s.textContent)).toEqual(['2:active']); // 1 was cleaned up; 2 is active and nothing is next any more

  const zero = nextKeySetup({}, 1, 0);
  await frame();
  expect(zero.rendered).toEqual([1]);
  expect(slidesOf(zero.root.firstElementChild as HTMLElement).length).toBe(1);
});

it('nextKey: disposal disposes the pre-rendered slide', async () => {
  const gone: number[] = [];
  const { dispose } = nextKeySetup({
    children: (slide: TransitionSlide) => {
      onCleanup(() => gone.push(slide.key));
      return document.createElement('b');
    },
  });
  await frame();
  dispose();
  expect(new Set(gone)).toEqual(new Set([0, 1]));
});

// ---- slideOptimized / slideOptimizedRtl (tt `performSlideOptimized`) ----------

function transitionEnd(el: Element) {
  el.dispatchEvent(new Event('transitionend', { bubbles: true }));
  vi.advanceTimersByTime(50);
}

const transformOf = (el: HTMLElement) => el.style.transform;

it('slideOptimized: the active slide rests at translate3d(0, 0, 0) with no transition; a step moves inline transforms (no from/to/inactive classes), the `to` slide starts off screen', async () => {
  const starts: string[] = [];
  let slides: HTMLElement[] = [];
  const { root, scope, setKey, log } = setup({
    name: 'slideOptimized',
    onStart: () => {
      starts.push(slides.map(transformOf).join(' | ')); // the starting positions, before the forced reflow
      log.push('start');
    },
  });
  const log2 = log;
  const t = root.firstElementChild as HTMLElement;
  slides = slidesOf(t);
  expect(classes(t)).toBe('Transition');
  expect(slides.map(classes)).toEqual(['Transition_slide Transition_slide-active']);
  expect(slides[0].style.transform).toBe('translate3d(0, 0, 0)');
  expect(slides[0].style.transition).toBe('none');

  setKey(1);
  await frame();
  slides = slidesOf(t);
  const [s0, s1] = slides;
  expect(classes(t)).toBe('Transition Transition-slideOptimized');
  expect(scope.isAnimating.peek()).toBe(true);
  expect(log2).toEqual(['start']);
  // after the forced reflow of the same frame: the final positions with the stylesheet's transition
  expect(classes(s0)).toBe('Transition_slide');
  expect(transformOf(s0)).toBe('translate3d(-100%, 0, 0)');
  expect(s0.style.transition).toBe('');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
  expect(transformOf(s1)).toBe('translate3d(0, 0, 0)');
  expect(s1.style.transition).toBe('');
  expect(t.textContent).toBe('0:from1:active');

  s1.dispatchEvent(new Event('animationend', { bubbles: true })); // a keyframe end is not the end of this variant
  vi.advanceTimersByTime(50);
  await frame();
  expect(scope.isAnimating.peek()).toBe(true);
  transitionEnd(s0); // nor is the `from` slide's transition
  await frame();
  expect(scope.isAnimating.peek()).toBe(true);

  transitionEnd(s1);
  await frame();
  expect(scope.isAnimating.peek()).toBe(false);
  expect(classes(t)).toBe('Transition Transition-slideOptimized'); // the container keeps its class
  expect(classes(s0)).toBe('Transition_slide');
  expect(transformOf(s0)).toBe(''); // back to the stylesheet's scale(0)
  expect(s0.style.transition).toBe('none');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
  expect(log2).toEqual(['start', 'stop']);
  await frame();
  expect(t.textContent).toBe('0:-1:active');
});

it('slideOptimized: the starting position of the `to` slide is +100% forwards and -100% backwards, the `from` slide leaves to the opposite side', async () => {
  const starts: string[] = [];
  let t!: HTMLElement;
  const { root, setKey } = setup({
    name: 'slideOptimized',
    onStart: () => starts.push(slidesOf(t).map(transformOf).join(' | ')),
  }, 1);
  t = root.firstElementChild as HTMLElement;
  setKey(2);
  await frame();
  expect(starts).toEqual(['translate3d(0, 0, 0) | translate3d(100%, 0, 0)']);
  let [s1, s2] = slidesOf(t);
  transitionEnd(s2);
  await frame();
  setKey(1);
  await frame();
  expect(starts[1]).toBe('translate3d(-100%, 0, 0) | translate3d(0, 0, 0)'); // keys 1, 2: `to` is slide 1
  expect(classes(t)).toBe('Transition Transition-slideOptimizedBackwards');
  [s1, s2] = slidesOf(t);
  expect(transformOf(s2)).toBe('translate3d(100%, 0, 0)'); // backwards: `from` leaves to the right
  expect(transformOf(s1)).toBe('translate3d(0, 0, 0)');
});

it('slideOptimizedRtl mirrors the direction (container class and positions)', async () => {
  const starts: string[] = [];
  let t!: HTMLElement;
  const { root, setKey } = setup({
    name: 'slideOptimizedRtl',
    onStart: () => starts.push(slidesOf(t).map(transformOf).join(' | ')),
  });
  t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  expect(classes(t)).toBe('Transition Transition-slideOptimizedRtlBackwards'); // forwards by key = backwards in RTL
  expect(starts).toEqual(['translate3d(0, 0, 0) | translate3d(-100%, 0, 0)']);
  const [s0, s1] = slidesOf(t);
  expect(transformOf(s0)).toBe('translate3d(100%, 0, 0)');
  expect(transformOf(s1)).toBe('translate3d(0, 0, 0)');
});

it('slideOptimized without animations (disableAnimation): at once, the container class set, no heavy animation, no callbacks', async () => {
  const { root, scope, setKey, log } = setup({ name: 'slideOptimized', disableAnimation: true });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [s0, s1] = slidesOf(t);
  expect(classes(t)).toBe('Transition Transition-slideOptimized');
  expect(classes(s0)).toBe('Transition_slide');
  expect(transformOf(s0)).toBe('');
  expect(s0.style.transition).toBe('none');
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
  expect(transformOf(s1)).toBe('translate3d(0, 0, 0)');
  expect(s1.style.transition).toBe('none');
  expect(scope.isAnimating.peek()).toBe(false);
  expect(log).toEqual([]);
});

it('slideOptimized settles through the 1 s fallback when no transition runs; a step during a step supersedes it (stop, start)', async () => {
  const { root, scope, setKey, log } = setup({ name: 'slideOptimized', isBlockingAnimation: true });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  vi.advanceTimersByTime(1000);
  await frame();
  expect(scope.isAnimating.peek()).toBe(false);
  expect(log).toEqual(['start', 'stop']);
  setKey(2);
  await frame();
  setKey(3);
  await frame();
  expect(log).toEqual(['start', 'stop', 'start', 'stop', 'start']);
  expect(scope.isBlockingAnimating.peek()).toBe(true);
  transitionEnd(slidesOf(t)[0]); // the superseded step's own end only releases its heavy animation
  await frame();
  expect(scope.isBlockingAnimating.peek()).toBe(true);
  transitionEnd(slidesOf(t).at(-1)!);
  await frame();
  expect(scope.isAnimating.peek()).toBe(false);
  expect(log).toEqual(['start', 'stop', 'start', 'stop', 'start', 'stop']);
  await frame();
  expect(slidesOf(t).map((s) => s.textContent)).toEqual(['2:-', '3:active']);
});

it('slideOptimized: shouldRestoreHeight measures the active slide after the transition; shouldCleanup drops the rest', async () => {
  const { root, setKey } = setup({ name: 'slideOptimized', shouldRestoreHeight: true, shouldCleanup: true });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  const [, s1] = slidesOf(t);
  sized(s1, 90);
  transitionEnd(s1);
  await frame();
  await frame();
  expect(t.style.height).toBe('90px');
  expect(slidesOf(t)).toEqual([s1]);
});

it('slideOptimized: switching to or from an optimized name drops every slide but the active one and clears the container class and the inline transforms', async () => {
  const [name, setName] = createSignal('slideOptimized');
  const { root, setKey } = setup(
    {
      get name() {
        return name();
      },
    },
  );
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  transitionEnd(slidesOf(t)[1]);
  await frame();
  expect(slidesOf(t).length).toBe(2);
  expect(classes(t)).toBe('Transition Transition-slideOptimized');

  setName('slide'); // no key change
  await frame();
  const [only] = slidesOf(t);
  expect(slidesOf(t).length).toBe(1);
  expect(only.textContent).toBe('1:active');
  expect(classes(t)).toBe('Transition');
  expect(classes(only)).toBe('Transition_slide Transition_slide-active');
  expect(only.style.transform).toBe('');

  setKey(2); // now a keyframe step
  await frame();
  expect(classes(t)).toBe('Transition Transition-slide');
  setName('slideOptimizedRtl'); // style switch together with a key change
  setKey(3);
  await frame();
  expect(slidesOf(t).map((s) => s.textContent)).toEqual(['3:active']);
  expect(classes(slidesOf(t)[0])).toBe('Transition_slide Transition_slide-active');
});

it('slideOptimized + nextKey: the pre-rendered slide has no state class (the container class hides it) and the step uses it', async () => {
  const { root, setKey, rendered } = nextKeySetup({ name: 'slideOptimized' });
  const t = root.firstElementChild as HTMLElement;
  await frame();
  const [s0, s1] = slidesOf(t);
  expect(classes(t)).toBe('Transition Transition-slideOptimized');
  expect(classes(s0)).toBe('Transition_slide Transition_slide-active');
  expect(classes(s1)).toBe('Transition_slide');
  setKey(1);
  await frame();
  expect(rendered).toEqual([0, 1]);
  expect(slidesOf(t)[1]).toBe(s1);
  expect(classes(s1)).toBe('Transition_slide Transition_slide-active');
});

it('slideOptimized: disposal mid-step releases the heavy animation and does nothing late', async () => {
  const { root, scope, setKey, dispose, log } = setup({ name: 'slideOptimized', isBlockingAnimation: true });
  const t = root.firstElementChild as HTMLElement;
  setKey(1);
  await frame();
  expect(scope.isBlockingAnimating.peek()).toBe(true);
  const [s0, s1] = slidesOf(t);
  dispose();
  expect(scope.isAnimating.peek()).toBe(false);
  transitionEnd(s1);
  vi.advanceTimersByTime(2000);
  await frame();
  expect(log).toEqual(['start']);
  expect(transformOf(s0)).toBe('translate3d(-100%, 0, 0)'); // untouched
});

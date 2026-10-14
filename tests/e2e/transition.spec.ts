import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The kit's <Transition> in a real browser with tt's real stylesheet (CSS keyframes, transitions, Web Animations),
// mounted by src/dev/transitionHarness.ts into the running app. The unit tests (src/lib/kit/transition.test.ts) fake the
// animation APIs; these check the same contracts against Chromium, under the strict fixture (stricterdom on, no console problems).
const HARNESS = '/src/dev/transitionHarness.ts';

async function mount(page: Page, options: Record<string, unknown>) {
  await page.evaluate(
    async ([url, opts]) => {
      const harness = await import(/* @vite-ignore */ url);
      (window as unknown as { __h: unknown }).__h = harness.mount(opts);
    },
    [HARNESS, options] as const,
  );
}

const log = (page: Page) =>
  page.evaluate(() => (window as unknown as { __h: { log: { event: string; at: number }[] } }).__h.log);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#Main')).toBeVisible();
});

test('slideOptimized: the incoming slide really slides in on a CSS transition, the outgoing one is hidden by the stylesheet, onStop follows the transitionend', async ({
  page,
}) => {
  await mount(page, { name: 'slideOptimized', initialKey: 0 });
  const xs = await page.evaluate(async () => {
    const h = (window as unknown as { __h: { el: HTMLElement; setKey: (k: number) => void; log: { event: string }[] } })
      .__h;
    h.setKey(1);
    const samples: number[] = [];
    const t0 = performance.now();
    while (!h.log.some((e) => e.event === 'stop') && performance.now() - t0 < 2000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const slide = h.el.querySelectorAll<HTMLElement>('.Transition_slide')[1];
      samples.push(Math.round(slide.getBoundingClientRect().left));
    }
    return samples;
  });
  expect(xs.length).toBeGreaterThan(3);
  expect(xs.some((x) => x > 5 && x < 385)).toBe(true); // mid-flight positions exist: the transition ran
  expect(xs.at(-1)).toBeLessThanOrEqual(1);
  const state = await page.evaluate(() => {
    const h = (window as unknown as { __h: { el: HTMLElement } }).__h;
    const [s0, s1] = Array.from(h.el.querySelectorAll<HTMLElement>('.Transition_slide'));
    return {
      container: h.el.className,
      s0: { cls: s0.className, transform: getComputedStyle(s0).transform },
      s1: { cls: s1.className, transform: getComputedStyle(s1).transform },
    };
  });
  expect(state.container).toBe('Transition Transition-slideOptimized');
  expect(state.s0.cls).toBe('Transition_slide');
  expect(state.s0.transform).toBe('matrix(0, 0, 0, 0, 0, 0)'); // the stylesheet's scale(0)
  expect(state.s1.cls).toBe('Transition_slide Transition_slide-active');
  expect(state.s1.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
  expect((await log(page)).map((e) => e.event)).toEqual(['start', 'stop']);
});

test('reveal and slideFadeAndroid backwards end on the animation of the outgoing slide, not on the 1 s fallback', async ({
  page,
}) => {
  for (const name of ['reveal', 'slideFadeAndroid']) {
    await mount(page, { name, initialKey: 1 });
    const { elapsed } = await page.evaluate(async () => {
      const h = (
        window as unknown as {
          __h: { setKey: (k: number) => void; log: { event: string; at: number }[]; dispose: () => void };
        }
      ).__h;
      h.setKey(0); // backwards
      const t0 = performance.now();
      while (!h.log.some((e) => e.event === 'stop') && performance.now() - t0 < 3000) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const stop = h.log.find((e) => e.event === 'stop');
      h.dispose();
      return { elapsed: stop ? stop.at - t0 : Infinity };
    });
    expect(elapsed, `${name} backwards`).toBeLessThan(800);
  }
});

test('nextKey: the next slide is in the DOM, hidden, before it is shown; showing it reuses the element', async ({
  page,
}) => {
  await mount(page, { name: 'slide', initialKey: 0, nextKey: 1 });
  const before = await page.evaluate(() => {
    const h = (window as unknown as { __h: { el: HTMLElement } }).__h;
    const slides = Array.from(h.el.querySelectorAll<HTMLElement>('.Transition_slide'));
    (window as unknown as { __next: Element }).__next = slides[1];
    return slides.map((s) => ({ cls: s.className, display: getComputedStyle(s).display, text: s.textContent }));
  });
  expect(before).toEqual([
    { cls: 'Transition_slide Transition_slide-active', display: 'block', text: 'slide 0' },
    { cls: 'Transition_slide Transition_slide-inactive', display: 'none', text: 'slide 1' },
  ]);
  const same = await page.evaluate(async () => {
    const h = (window as unknown as { __h: { el: HTMLElement; setKey: (k: number) => void; log: { event: string }[] } })
      .__h;
    h.setKey(1);
    while (!h.log.some((e) => e.event === 'stop')) await new Promise((resolve) => requestAnimationFrame(resolve));
    return h.el.querySelectorAll('.Transition_slide')[1] === (window as unknown as { __next: Element }).__next;
  });
  expect(same).toBe(true);
});

// tt starts a controlled swipe on iOS only.
test.describe('swipe control (iOS)', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }));
    await page.goto('/');
    await expect(page.locator('#Main')).toBeVisible();
  });

  async function drag(page: Page, xs: number[], y = 300) {
    const cdp = await page.context().newCDPSession(page);
    const point = (x: number) => [{ x, y, id: 1 }];
    const frames = () =>
      page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(xs[0]) });
    const move = async (x: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x) });
      await frames();
    };
    for (const x of xs.slice(1)) await move(x);
    return {
      move,
      release: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    };
  }

  const progress = (page: Page) =>
    page.evaluate(() => {
      const h = (window as unknown as { __h: { el: HTMLElement } }).__h;
      const from = h.el.querySelector('.Transition_slide-from');
      const animation = from?.getAnimations()[0];
      return animation
        ? {
            state: animation.playState,
            time: Number(animation.currentTime),
            left: Math.round(from.getBoundingClientRect().left),
          }
        : undefined;
    });

  test('a swipe drives the layers by the finger, a release going forward commits (the previous screen) ', async ({
    page,
  }) => {
    await mount(page, {
      name: 'slideLayers',
      initialKey: 1,
      withSwipeControl: true,
      isBlockingAnimation: true,
      swipeTarget: 0,
    });
    // Chromium absorbs the first touch moves as slop, so the swipe may start a little later than the first move; the
    // layer is measured against where the swipe started.
    const finger = await drag(page, [100, 112, 152, 212]);
    const first = await progress(page);
    expect(first?.state).toBe('paused'); // held by the finger, not running its 300 ms animation
    await finger.move(312);
    const second = await progress(page);
    expect(second!.left).toBeGreaterThan(first!.left + 60);
    expect(second!.left).toBeLessThan(390);
    expect(second!.time).toBeGreaterThan(first!.time);
    await page.waitForTimeout(1300); // a held animation does not settle on the 1 s fallback
    expect((await log(page)).map((e) => e.event)).toEqual(['swipe', 'start']);
    await finger.release();
    await expect
      .poll(async () => (await log(page)).map((e) => e.event), { timeout: 5000 })
      .toEqual(['swipe', 'start', 'stop']);
    const end = await page.evaluate(() => {
      const h = (window as unknown as { __h: { el: HTMLElement } }).__h;
      return {
        container: h.el.className,
        slides: Array.from(h.el.querySelectorAll<HTMLElement>('.Transition_slide')).map(
          (s) => `${s.textContent}:${s.className}`,
        ),
        timing: Array.from(h.el.querySelectorAll<HTMLElement>('.Transition_slide')).map(
          (s) => s.style.animationTimingFunction,
        ),
      };
    });
    expect(end.container).toBe('Transition');
    expect(end.slides).toEqual([
      'slide 0:Transition_slide Transition_slide-active',
      'slide 1:Transition_slide Transition_slide-inactive',
    ]);
    expect(end.timing).toEqual(['', '']);
  });

  test('turning the finger back and releasing reverts: the client cancel returns the screen, no animated switch back', async ({
    page,
  }) => {
    await mount(page, { name: 'slideLayers', initialKey: 1, withSwipeControl: true, swipeTarget: 0 });
    const finger = await drag(page, [100, 112, 152, 252, 212]);
    await finger.release();
    await expect
      .poll(async () => (await log(page)).map((e) => e.event), { timeout: 5000 })
      .toEqual(['swipe', 'start', 'stop', 'cancel']);
    await page.waitForTimeout(400);
    const end = await page.evaluate(() => {
      const h = (window as unknown as { __h: { el: HTMLElement; log: { event: string }[] } }).__h;
      return {
        container: h.el.className,
        slides: Array.from(h.el.querySelectorAll<HTMLElement>('.Transition_slide')).map(
          (s) => `${s.textContent}:${s.className}`,
        ),
        events: h.log.map((e) => e.event),
      };
    });
    expect(end.events).toEqual(['swipe', 'start', 'stop', 'cancel']); // the switch back was instant: no second start
    expect(end.container).toBe('Transition');
    expect(end.slides).toEqual([
      'slide 0:Transition_slide Transition_slide-inactive',
      'slide 1:Transition_slide Transition_slide-active',
    ]);
  });
});

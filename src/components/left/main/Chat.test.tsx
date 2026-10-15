// Original test (not in telegram-tt): a chat row of a chat that is not in the store renders nothing in tt; here it is an inert,
// hidden placeholder (a `<ManualFor>` row is one DOM node).
import { render } from 'frameact/dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setGlobal } from '../../../global';

import type { TabState } from '../../../global/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import { ChatAnimationTypes } from './hooks';

import Chat from './Chat';

const tabId = getCurrentTabId();

describe('Chat row of a missing chat', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('is hidden, not focusable, has no link, no menu and takes no click', async () => {
    const el = container();
    dispose = render(
      () => <Chat chatId="404" orderDiff={0} shiftDiff={0} animationType={ChatAnimationTypes.None} offsetTop={0} />,
      el,
    );
    await harness.frame();
    await harness.frame();

    const row = el.querySelector<HTMLElement>('.ListItem');
    expect(row).not.toBeNull();
    expect(row!.style.display).toBe('none');
    expect(row!.getAttribute('aria-hidden')).toBe('true');
    expect(row!.getAttribute('role')).toBeNull();
    expect(row!.getAttribute('tabindex')).toBeNull();
    expect(row!.querySelector('a, [href]')).toBeNull();
    expect(row!.textContent).toBe('');
    expect(row!.classList.contains('inactive')).toBe(true);
  });
});

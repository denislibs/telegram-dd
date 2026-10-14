import { render } from 'frameact/dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { TabState } from '../../global/types';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { updateTabState } from '../../global/reducers/tabs';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';

import MessageListHistoryHandler from './MessageListHistoryHandler';

const tabId = getCurrentTabId();
const MAIN_THREAD_ID = -1;

describe('MessageListHistoryHandler (tab-specific connected component)', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId, messageLists: [] };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    setGlobal(updateTabState(getGlobal(), { messageLists: [] }, tabId));
  });

  it('pushes one history record per message list and follows the tab state in place', async () => {
    const el = container();
    dispose = render(() => <MessageListHistoryHandler />, el);
    await harness.frame();
    const startLength = window.history.length;

    setGlobal(
      updateTabState(getGlobal(), { messageLists: [{ chatId: '1', threadId: MAIN_THREAD_ID, type: 'thread' }] }, tabId),
    );
    await harness.frame(); // the row mounts; `useHistoryBack` defers its pushState to the measure phase
    await harness.frame();
    expect(window.history.length).toBe(startLength + 1);
    expect(window.history.state).toEqual({ index: 1, historyUniqueSessionId: expect.any(Number) });
    expect(window.location.hash).toBe('#1');

    // an unrelated field of the same tab: the row is untouched (no second record)
    setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
    await harness.frame();
    await harness.frame();
    expect(window.history.length).toBe(startLength + 1);

    // a second message list: one more record; the first row keeps its identity (same store object)
    const first = getGlobal().byTabId[tabId].messageLists[0];
    setGlobal(
      updateTabState(getGlobal(), { messageLists: [first, { chatId: '2', threadId: 7, type: 'thread' }] }, tabId),
    );
    await harness.frame();
    await harness.frame();
    expect(window.history.length).toBe(startLength + 2);
    expect(window.history.state.index).toBe(2);
    expect(window.location.hash).toBe('#2_7');
  });
});

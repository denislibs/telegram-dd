// Original test (not in telegram-tt): the sticky topic pill follows the topic in the store.
import '../../../global/actions/all';

import { render } from 'frameact/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { getGlobal, setGlobal } from '../../../global';

import type { ApiTopic } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { addChats } from '../../../global/reducers/chats';
import { updateTopic, updateTopicsInfo } from '../../../global/reducers/topics';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import TopicSeparator from './TopicSeparator';

const tabId = getCurrentTabId();
const CHAT_ID = '-1001';

const topic = (title: string) =>
  ({ id: 5, title, iconColor: 0x6fb9f0, notifySettings: {}, date: 1 }) as unknown as ApiTopic;

function seed(topicTitle?: string) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } };
  global = addChats(global, { [CHAT_ID]: { id: CHAT_ID, title: 'Forum chat', type: 'chatTypeSuperGroup' } });
  global = updateTopicsInfo(global, CHAT_ID, { listedTopicIds: [5], isCache: false });
  if (topicTitle) global = updateTopic(global, CHAT_ID, 5, topic(topicTitle));
  setGlobal(global, { forceOutdated: true });
}

describe('TopicSeparator', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('shows the topic title and follows a rename in place', async () => {
    seed('Design');
    const el = container();
    dispose = render(() => <TopicSeparator chatId={CHAT_ID} topicId={5} />, el);
    await harness.frame();
    await harness.frame();

    const pill = el.querySelector<HTMLElement>('.topic-pill')!;
    expect(pill.querySelector('.topic-pill-title')!.textContent).toBe('Design');
    expect(pill.querySelector('.topic-pill-chevron')).not.toBeNull();

    setGlobal(updateTopic(getGlobal(), CHAT_ID, 5, { title: 'Design 2' }));
    await harness.frame();
    await harness.frame();
    expect(el.querySelector('.topic-pill')).toBe(pill);
    expect(pill.querySelector('.topic-pill-title')!.textContent).toBe('Design 2');
  });

  it('falls back to the chat title when the topic is missing from loaded topics', async () => {
    seed();
    const el = container();
    dispose = render(() => <TopicSeparator chatId={CHAT_ID} topicId={5} />, el);
    await harness.frame();
    await harness.frame();
    expect(el.querySelector('.topic-pill-title')!.textContent).toBe('Forum chat');
  });
});

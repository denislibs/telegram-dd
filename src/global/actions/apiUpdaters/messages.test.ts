// T2.5 (docs/plans/2026-10-14-store.md): tt's `apiUpdaters/messages.ts` runs unchanged on the store. A `newMessage`
// update goes through `getActions().apiUpdate` on a seeded global: the message appears in the store mirror, the thread's
// `listedIds` grows, the chat row's mapper re-runs once (and a row of another chat not at all), and the mirror equals
// the committed global.
import '../all';

import { createMemo, createRoot } from 'frameact';
import { unwrap } from 'frameact/store';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ApiChat, ApiMessage } from '../../../api/types';
import type { GlobalState, TabState } from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import { getActions, getGlobal, setGlobal, useGlobal, withGlobal } from '../../index';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../initialState';
import { addChats, replaceChatListIds, updateChatLastMessageId } from '../../reducers/chats';
import { addMessages, updateMessageStore } from '../../reducers/messages';
import { selectChat, selectChatLastMessageId, selectListedIds } from '../../selectors';

const tabId = getCurrentTabId();
const actions = getActions();
const tick = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

const chat = (id: string, extra: Partial<ApiChat> = {}) =>
  ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0, ...extra }) as ApiChat;
const message = (chatId: string, id: number, text: string, extra: Partial<ApiMessage> = {}) =>
  ({ id, chatId, date: 1000 + id, isOutgoing: false, content: { text: { text } }, ...extra });

function seed() {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } };
  global = addChats(global, { '100': chat('100'), '200': chat('200') });
  global = replaceChatListIds(global, 'active', ['100', '200']);
  global = addMessages(global, [message('100', 1, 'first')]);
  global = updateMessageStore(global, '100', {
    threadsById: { [MAIN_THREAD_ID]: { localState: { listedIds: [1] }, readState: {}, threadInfo: undefined } },
  } as never);
  global = updateChatLastMessageId(global, '100', 1);
  setGlobal(global, { forceOutdated: true });
}

/** The committed global without the DEV stamp, as sorted JSON. */
const sorted = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
const withoutStamp = (global: GlobalState) => {
  const { DEBUG_randomId, ...rest } = global as GlobalState & { DEBUG_randomId?: number };
  return rest;
};

beforeAll(seed);
afterEach(async () => {
  await tick();
  seed();
  await tick();
});

describe('apiUpdaters/messages.ts on the store', () => {
  it('newMessage: the message lands in the mirror, listedIds grows, one chat row re-runs, the mirror equals the committed global', async () => {
    let rowRuns = 0;
    let otherRowRuns = 0;
    // the chat list row of chat 100 and of chat 200: tt's mapper shape (chat entity + last message id)
    const { dispose, rowView, otherRowView } = createRoot((disposeRoot) => {
      const row = withGlobal({ chatId: '100' }, (global, { chatId }) => {
        rowRuns++;
        return { chat: selectChat(global, chatId), lastMessageId: selectChatLastMessageId(global, chatId) };
      });
      const otherRow = withGlobal({ chatId: '200' }, (global, { chatId }) => {
        otherRowRuns++;
        return { chat: selectChat(global, chatId) };
      });
      return {
        dispose: disposeRoot,
        rowView: createMemo(() => [row.chat?.unreadCount, row.lastMessageId]),
        otherRowView: createMemo(() => otherRow.chat?.title),
      };
    });
    expect(rowView()).toEqual([0, 1]);
    expect(otherRowView()).toBe('Chat 200');
    expect([rowRuns, otherRowRuns]).toEqual([1, 1]);

    const before = getGlobal();
    const beforeJson = sorted(withoutStamp(before));

    actions.apiUpdate({ '@type': 'newMessage', id: 2, chatId: '100', message: message('100', 2, 'hello') });
    await tick();

    // the message appears (committed global and store mirror)
    expect(selectListedIds(getGlobal(), '100', MAIN_THREAD_ID)).toEqual([1, 2]);
    const mirror = useGlobal();
    expect(mirror.messages.byChatId['100'].byId[2].content.text?.text).toBe('hello');
    expect(unwrap(mirror.messages.byChatId['100'].threadsById[MAIN_THREAD_ID].localState.listedIds)).toEqual([1, 2]);

    // the row of chat 100 re-ran once for the whole update; the row of chat 200 did not run
    expect(rowView()).toEqual([0, 2]);
    expect(rowRuns).toBe(2);
    expect(otherRowRuns).toBe(1);
    expect(otherRowView()).toBe('Chat 200');

    // the mirror equals the committed global, and the snapshot taken before the update was not touched
    expect(sorted(unwrap(mirror))).toBe(sorted(withoutStamp(getGlobal())));
    expect(sorted(withoutStamp(before))).toBe(beforeJson);
    dispose();
  });
});

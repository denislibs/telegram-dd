// T4 (docs/plans/2026-10-14-store.md): the identity-based `addCallback` consumers are tt's files, verbatim. They compare
// the committed global with the previous one (`!==`), which holds because the store callbacks receive tt's immutable
// objects. This file runs the REAL modules: ui/settings.ts (theme / language / performance), intervals.ts (master role),
// shared/sharedStateConnector.ts (echo check), util/folderManager.ts (+ hooks/useFolderManager.ts) and
// util/emoji/customEmojiManager.ts.
import 'fake-indexeddb/auto';
import './actions/ui/settings';
import './intervals';

import { createEffect, createRoot } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiChat } from '../api/types';
import type { GlobalState, SharedState, TabState } from './types';

import { ALL_FOLDER_ID } from '../config';
import { addCustomEmojiCallback, removeCustomEmojiCallback } from '../util/emoji/customEmojiManager';
import { getCurrentTabId } from '../util/establishMultitabRole';
import { getOrderedIds } from '../util/folderManager';
import { cloneDeep } from '../util/iteratees';
import { oldSetLanguage } from '../util/oldLangProvider';
import { applyPerformanceSettings } from '../util/perfomanceSettings';
import switchTheme from '../util/switchTheme';
import { addChats, replaceChatListIds } from './reducers/chats';
import { updateTabState } from './reducers/tabs';
import { initSharedState } from './shared/sharedStateConnector';
import { createSharedWorker } from './shared/sharedWorker';
import { getGlobal, setGlobal } from './index';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from './initialState';

import { useFolderManagerForOrderedIds } from '../hooks/useFolderManager';

vi.mock('../util/switchTheme', () => ({ default: vi.fn() }));
vi.mock('../util/oldLangProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../util/oldLangProvider')>()),
  oldSetLanguage: vi.fn(),
}));
vi.mock('../util/perfomanceSettings', () => ({ applyPerformanceSettings: vi.fn() }));
vi.mock('./shared/sharedWorker', () => ({ createSharedWorker: vi.fn() }));

const tabId = getCurrentTabId();
const tick = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  // the store callbacks run at tick end; `requestMutation` (applyPerformanceSettings) at the next frame
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => setTimeout(r, 0));
};
const chat = (id: string, extra: Partial<ApiChat> = {}) =>
  ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0, ...extra }) as ApiChat;

function reset(extra: Partial<GlobalState> = {}) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab }, isInited: true, ...extra },
    { forceOutdated: true },
  );
}

beforeEach(async () => {
  reset();
  await tick();
  vi.mocked(switchTheme).mockClear();
  vi.mocked(oldSetLanguage).mockClear();
  vi.mocked(applyPerformanceSettings).mockClear();
});

afterEach(async () => {
  vi.useRealTimers();
  await tick();
});

describe('actions/ui/settings.ts callback (theme / language / performance)', () => {
  const setSettings = (patch: Partial<SharedState['settings']>) => {
    const global = getGlobal();
    setGlobal({
      ...global,
      sharedState: { ...global.sharedState, settings: { ...global.sharedState.settings, ...patch } },
    });
  };

  it('switches the theme exactly once per change, and not for unrelated writes', async () => {
    const current = getGlobal().sharedState.settings.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    setSettings({ theme: next });
    await tick();
    expect(switchTheme).toHaveBeenCalledTimes(1);
    expect(vi.mocked(switchTheme).mock.calls[0][0]).toBe(next);

    setGlobal({ ...getGlobal(), isSyncing: true });
    await tick();
    setSettings({ messageTextSize: 20 });
    await tick();
    expect(switchTheme).toHaveBeenCalledTimes(1);
  });

  it('follows a language change through oldSetLanguage', async () => {
    setSettings({ language: 'de' });
    await tick();
    expect(oldSetLanguage).toHaveBeenCalledTimes(1);
    expect(oldSetLanguage).toHaveBeenCalledWith('de');
    setSettings({ language: 'de', messageTextSize: 18 });
    await tick();
    expect(oldSetLanguage).toHaveBeenCalledTimes(1);
  });

  it('applies the performance settings when the object is replaced (identity), once per replacement', async () => {
    const before = getGlobal().sharedState.settings.performance;
    setSettings({ performance: { ...before, snapEffect: !before.snapEffect } });
    await tick();
    await vi.waitFor(() => expect(applyPerformanceSettings).toHaveBeenCalledTimes(1));
    expect(vi.mocked(applyPerformanceSettings).mock.calls[0][0]).toBe(getGlobal().sharedState.settings.performance);

    // another setting, the same performance object: no second call
    setSettings({ messageTextSize: 19 });
    await tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(applyPerformanceSettings).toHaveBeenCalledTimes(1);
  });
});

describe('intervals.ts: the master-role flip starts and stops the timers', () => {
  it('startIntervals on master, stopIntervals when the role is lost', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    const base = vi.getTimerCount();
    setGlobal(updateTabState(getGlobal(), { isMasterTab: true }, tabId));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBeGreaterThan(base);

    setGlobal(updateTabState(getGlobal(), { isMasterTab: false }, tabId));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(base);
  });
});

describe('shared/sharedStateConnector.ts: global.sharedState === lastSharedState is the echo check', () => {
  it('a state received from the worker is not sent back; a local change is sent as a diff of that change only', async () => {
    const posted: any[] = [];
    let onMessage: ((event: MessageEvent) => void) | undefined;
    vi.mocked(createSharedWorker).mockReturnValue({
      port: {
        addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
          onMessage = handler;
        },
        removeEventListener: vi.fn(),
        start: vi.fn(),
        close: vi.fn(),
        postMessage: (event: unknown) => posted.push(event),
      },
    } as unknown as SharedWorker);

    const local = getGlobal().sharedState;
    initSharedState(local);
    await tick();
    expect(posted.map((e) => e.type)).toEqual(['reqGetFullState']);

    // the worker answers with the full state: it is written into the global, and the callback sees the same object
    const received = { ...local, settings: { ...local.settings, messageTextSize: 22 }, isInitial: undefined };
    onMessage!({ data: { type: 'fullState', state: received } } as MessageEvent);
    await tick();
    expect(getGlobal().sharedState.settings.messageTextSize).toBe(22);
    expect(posted.map((e) => e.type)).toEqual(['reqGetFullState']); // nothing echoed back

    const global = getGlobal();
    setGlobal({
      ...global,
      sharedState: { ...global.sharedState, settings: { ...global.sharedState.settings, shouldWarnAboutFiles: false } },
    });
    await tick();
    const updates = posted.filter((e) => e.type === 'reqUpdateState');
    expect(updates).toHaveLength(1);
    expect(updates[0].update).toEqual({ settings: { shouldWarnAboutFiles: false } });
  });
});

describe('util/folderManager.ts + hooks/useFolderManager.ts', () => {
  it('orders ids from the committed global; the hook accessor changes only with the chat list', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    let global = addChats(getGlobal(), { '1': chat('1'), '2': chat('2'), '3': chat('3') });
    global = replaceChatListIds(global, 'active', ['1', '2', '3']);
    setGlobal(global);
    await vi.advanceTimersByTimeAsync(600);

    let notifications = 0;
    const { dispose, orderedIds } = createRoot((disposeRoot) => {
      const ids = useFolderManagerForOrderedIds(ALL_FOLDER_ID);
      // a consumer of the accessor: counts how often it is told about a new order
      createEffect(
        () => ids(),
        () => {
          notifications++;
        },
      );
      return { dispose: disposeRoot, orderedIds: ids };
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(orderedIds()).toBe(getOrderedIds(ALL_FOLDER_ID));
    expect(orderedIds()?.slice().sort()).toEqual(['1', '2', '3']);
    const initial = notifications;

    // a new chat first in the list: folderManager compares chats.byId and the list ids with the previous global
    let next = addChats(getGlobal(), { '4': chat('4') });
    next = replaceChatListIds(next, 'active', ['4', '1', '2', '3']);
    setGlobal(next);
    await vi.advanceTimersByTimeAsync(600);
    expect(orderedIds()).toBe(getOrderedIds(ALL_FOLDER_ID));
    expect(orderedIds()).toHaveLength(4);
    expect(orderedIds()).toContain('4');
    expect(notifications).toBe(initial + 1);

    // a write that changes neither chats nor lists: no callback, the accessor keeps its value
    const before = orderedIds();
    setGlobal({ ...getGlobal(), isSyncing: true });
    await vi.advanceTimersByTimeAsync(600);
    expect(orderedIds()).toBe(before);
    expect(notifications).toBe(initial + 1);
    dispose();
  });
});

describe('util/emoji/customEmojiManager.ts', () => {
  it('calls the handler of an emoji id when customEmojis.byId changes and the emoji is known; not for other writes', async () => {
    const handler = vi.fn();
    addCustomEmojiCallback(handler, 'emoji-1');
    await tick();
    handler.mockClear();

    setGlobal({ ...getGlobal(), isSyncing: true });
    await tick();
    expect(handler).not.toHaveBeenCalled();

    const global = getGlobal();
    setGlobal({
      ...global,
      customEmojis: {
        ...global.customEmojis,
        byId: { ...global.customEmojis.byId, 'emoji-1': { id: 'emoji-1', isFree: true } as never },
      },
    });
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(getGlobal().customEmojis);
    removeCustomEmojiCallback(handler);
  });
});

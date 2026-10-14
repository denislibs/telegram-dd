// Review m4/m5: the FOUNDATION STUBs of the UI-bound util modules must be inert. They may not write wrong data into the
// global (a notification permission that is always `false`) nor hand an internal localization key to the server or the
// OS (a bot-forum topic title, a passkey name).
import '../global/actions/all';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, getPromiseActions, setGlobal } from '../global';

import type { TabState } from '../global/types';

import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../global/initialState';
import { getCurrentTabId } from './establishMultitabRole';
import { cloneDeep } from './iteratees';
import { getTranslationFn } from './localization';
import { requestPermission } from './notifications';

const tabId = getCurrentTabId();

describe('the localization stub', () => {
  it('never answers with the key it was asked for, and implements every LangFn member', () => {
    const lang = getTranslationFn();
    // a key that ends up as a bot-forum topic title or a passkey name must not leave the app
    expect(lang('PasscodePasskeyName')).not.toBe('PasscodePasskeyName');
    expect(lang('BotForumTopicTitlePlaceholder')).not.toBe('BotForumTopicTitlePlaceholder');

    expect(lang.with({ key: 'PasscodePasskeyName' })).toBeDefined();
    expect(lang.withRegular({ key: 'PasscodePasskeyName' })).toBe('');
    expect(lang.withAdvanced({ key: 'PasscodePasskeyName', options: { withNodes: true } })).toBeDefined();
    expect(lang.conjunction(['a', 'b'])).toBe('a, b');
    expect(lang.disjunction(['a', 'b'])).toBe('a, b');
    expect(lang.region('US')).toBeUndefined();
    expect(lang.currency('USD')).toBeUndefined();
    expect(lang.number(1234)).toBe('1234');
    expect(lang.preciseNumber(1.5)).toBe('1.5');
    expect(lang.timeFormat).toBeDefined();
    expect(lang.internalFormatters).toBeDefined();
    expect(typeof lang.code).toBe('string');
    expect(typeof lang.rawCode).toBe('string');
  });
});

describe('the notifications stub', () => {
  let permission = 'default';
  beforeEach(() => {
    const Fake = vi.fn() as unknown as typeof Notification;
    Object.defineProperty(Fake, 'permission', { get: () => permission });
    (Fake as any).requestPermission = vi.fn(() => {
      permission = 'granted';
      return Promise.resolve('granted');
    });
    vi.stubGlobal('Notification', Fake);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    permission = 'default';
  });

  it('requestPermission asks the browser instead of answering false', async () => {
    expect(await requestPermission()).toBe(true);
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('enabling web notifications is not turned off by the stub (nothing false is persisted)', async () => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    const initial = cloneDeep(INITIAL_GLOBAL_STATE);
    setGlobal(
      {
        ...initial,
        byTabId: { [tabId]: tab },
        settings: { ...initial.settings, byKey: { ...initial.settings.byKey, hasWebNotifications: false } },
      },
      { forceOutdated: true },
    );
    await getPromiseActions().updateWebNotificationSettings({ hasWebNotifications: true });
    expect(getGlobal().settings.byKey.hasWebNotifications).toBe(true);
  });
});

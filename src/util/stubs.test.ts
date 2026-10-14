// Review m4/m5: the FOUNDATION STUB of util/notifications must be inert. It may not write wrong data into the global
// (a notification permission that is always `false`). The localization stub of the same review is gone with the real
// runtime (util/localization, covered by util/localization/localization.test.ts).
import '../global/actions/all';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, getPromiseActions, setGlobal } from '../global';

import type { TabState } from '../global/types';

import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../global/initialState';
import { getCurrentTabId } from './establishMultitabRole';
import { cloneDeep } from './iteratees';
import { requestPermission } from './notifications';

const tabId = getCurrentTabId();

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

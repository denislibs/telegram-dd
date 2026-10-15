// Original test (not in telegram-tt): an unread-counter change rebuilds only the tab of its folder, and a rebuilt tab keeps
// the same title function (a rebuilt title would re-create its nodes: custom emoji restart).
import { createRoot, createSignal } from 'frameact';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../global';

import type { ApiChatFolder } from '../api/types';

import { INITIAL_GLOBAL_STATE } from '../global/initialState';
import { cloneDeep } from '../util/iteratees';
import useFolderTabs from './useFolderTabs';

type Counters = Record<number, { chatsCount: number; notificationsCount: number }>;
const [counters, setCounters] = createSignal<Counters>(
  { 0: { chatsCount: 1, notificationsCount: 0 } },
  { equals: false },
);
const [unreadChats] = createSignal<Record<number, string[]>>({});

vi.mock('./useFolderManager', () => ({
  useFolderManagerForUnreadCounters: () => counters,
  useFolderManagerForUnreadChatsByFolder: () => unreadChats,
}));

const folder = (id: number, text: string): ApiChatFolder => ({
  id,
  title: { text },
  includedChatIds: [],
  excludedChatIds: [],
});

describe('useFolderTabs', () => {
  beforeAll(() => {
    setGlobal(cloneDeep(INITIAL_GLOBAL_STATE), { forceOutdated: true });
  });

  it('a counter change replaces only the tab of its folder and keeps every title function', () => {
    createRoot((dispose) => {
      const chatFoldersById = { 5: folder(5, 'Work'), 6: folder(6, 'Family') };
      const { folderTabs } = useFolderTabs({
        sidebarMode: false,
        orderedFolderIds: [0, 5, 6],
        chatFoldersById,
        maxFolders: 10,
        maxChatLists: 10,
        folderInvitesById: {},
        maxFolderInvites: 10,
      });

      const before = folderTabs()!;
      expect(before.map((tab) => tab.id)).toEqual([0, 5, 6]);

      setCounters({
        0: { chatsCount: 1, notificationsCount: 0 },
        5: { chatsCount: 3, notificationsCount: 1 },
      });
      const after = folderTabs()!;

      expect(after[2]).toBe(before[2]); // nothing changed in "Family"
      expect(after[0]).toBe(before[0]); // nor in "All chats"
      expect(after[1]).not.toBe(before[1]); // the badge of "Work"
      expect(after[1].badgeCount).toBe(3);
      expect(after.map((tab) => tab.title)).toEqual(before.map((tab) => tab.title)); // the same title functions
      dispose();
    });
  });
});

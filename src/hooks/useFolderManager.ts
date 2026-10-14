import { type Accessor, createEffect, createSignal, onCleanup } from 'frameact';

import {
  addChatsCountCallback,
  addOrderedIdsCallback,
  addUnreadChatsByFolderIdCallback,
  addUnreadCountersCallback,
  getChatsCount,
  getOrderedIds,
  getUnreadChatsByFolderId,
  getUnreadCounters,
} from '../util/folderManager';

// Deviation: frameact components run once, so there is no `useForceUpdate` to re-run the body. Each hook returns an
// accessor backed by a signal that the folderManager callbacks set; folderManager itself is tt's code (it compares the
// committed global with the previous one, and the callbacks fire only on a change, so the signals always notify).
type MaybeAccessor<T> = T | Accessor<T>;
const read = <T>(value: MaybeAccessor<T>): T => (typeof value === 'function' ? (value as Accessor<T>)() : value);

export function useFolderManagerForOrderedIds(folderId: MaybeAccessor<number>) {
  const [orderedIds, setOrderedIds] = createSignal(getOrderedIds(read(folderId)), { equals: false });

  createEffect(
    () => read(folderId),
    (id) => {
      setOrderedIds(getOrderedIds(id));

      return addOrderedIdsCallback(id, () => setOrderedIds(getOrderedIds(id)));
    },
  );

  return orderedIds;
}

export function useFolderManagerForUnreadCounters() {
  const [unreadCounters, setUnreadCounters] = createSignal(getUnreadCounters(), { equals: false });

  onCleanup(addUnreadCountersCallback(() => setUnreadCounters(getUnreadCounters())));

  return unreadCounters;
}

export function useFolderManagerForChatsCount() {
  const [chatsCount, setChatsCount] = createSignal(getChatsCount(), { equals: false });

  onCleanup(addChatsCountCallback(() => setChatsCount(getChatsCount())));

  return chatsCount;
}

export function useFolderManagerForUnreadChatsByFolder() {
  const [unreadChats, setUnreadChats] = createSignal(getUnreadChatsByFolderId(), { equals: false });

  onCleanup(addUnreadChatsByFolderIdCallback(() => setUnreadChats(getUnreadChatsByFolderId())));

  return unreadChats;
}

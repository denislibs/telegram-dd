import { createEffect, createMemo, createSignal, onMount } from 'frameact';
import { useGlobal } from '../global';

import type { ApiUser } from '../api/types';

import { SESSION_ACCOUNT_PREFIX } from '../config';
import { getChatAvatarHash } from '../global/helpers';
import { selectIsSynced } from '../global/selectors';
import { type MaybeAccessor, read } from '../util/accessors';
import { preloadImage } from '../util/files';
import { resizeImage } from '../util/imageResize';
import { ACCOUNT_SLOT, getAccountsInfo, storeAccountData } from '../util/multiaccount';
import { addSessionStoreChangeListener } from '../util/passcode/sessionStore';
import useSelector from './data/useSelector';
import useInterval from './schedulers/useInterval';
import useMedia from './useMedia';
import useThrottledCallback from './useThrottledCallback';

const LOCAL_STORAGE_LISTENING_THROTTLE = 1000;
const REFRESH_INTERVAL = 1000 * 60;
const PREVIEW_SIZE = 72;

export default function useMultiaccountInfo(userArg?: MaybeAccessor<ApiUser | undefined>) {
  const global = useGlobal();
  const isUpdater = createMemo(() => Boolean(read(userArg)) && global.auth.rememberMe);
  const isSynced = useSelector(selectIsSynced);

  const [accountsInfo, setAccountsInfo] = createSignal(getAccountsInfo());

  const avatarHash = () => {
    const currentUser = read(userArg);
    return currentUser && getChatAvatarHash(currentUser);
  };
  const avatarUrl = useMedia(avatarHash, () => !isUpdater());

  const refresh = useThrottledCallback(
    () => {
      setAccountsInfo(getAccountsInfo());
    },
    [],
    LOCAL_STORAGE_LISTENING_THROTTLE,
  );

  createEffect(
    () => {
      const currentUser = read(userArg);
      return [
        isUpdater(),
        currentUser?.emojiStatus?.documentId,
        currentUser?.firstName,
        currentUser?.id,
        currentUser?.lastName,
        currentUser?.color,
        currentUser?.isPremium,
        currentUser?.phoneNumber,
        refresh,
        isSynced(),
      ] as const;
    },
    ([isUpdater2, , , , , , , , , isSynced2]) => {
      if (!isUpdater2 || !isSynced2) return;
      const currentUser = read(userArg)!;
      const color = currentUser.color?.type === 'regular' ? currentUser.color.color : undefined;
      storeAccountData(ACCOUNT_SLOT, {
        userId: currentUser.id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        emojiStatusId: currentUser.emojiStatus?.documentId,
        color,
        isPremium: currentUser.isPremium,
        phone: currentUser.phoneNumber,
      });

      refresh();
    },
  );

  const updateAvatar = async (url: string, abortSignal?: AbortSignal) => {
    const resizedAvatar = await resizeImage(url, PREVIEW_SIZE, PREVIEW_SIZE);
    const img = await preloadImage(resizedAvatar);
    if (abortSignal?.aborted) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    storeAccountData(ACCOUNT_SLOT, { avatarUri: dataUrl });

    refresh();
  };

  createEffect(
    () => [avatarUrl(), isSynced(), isUpdater()] as const,
    ([avatarUrl2, isSynced2, isUpdater2]) => {
      if (!avatarUrl2 || !isUpdater2 || !isSynced2) return undefined;
      const controller = new AbortController();
      updateAvatar(avatarUrl2, controller.signal);

      return () => {
        controller.abort();
      };
    },
  );

  // Storage event only thrown when other tabs change the storage
  useInterval(refresh, REFRESH_INTERVAL);
  onMount(() => {
    function handleStorageChange(e: StorageEvent) {
      if (!e.key?.startsWith(SESSION_ACCOUNT_PREFIX)) return;
      refresh();
    }

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  });

  onMount(() => addSessionStoreChangeListener(refresh));

  return accountsInfo;
}

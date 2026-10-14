import { createEffect, createMemo } from 'frameact';
import { Show } from 'frameact/dom';

import { ALL_FOLDER_ID } from '../../config';
import { updateAppBadge } from '../../util/appBadge';
import { depsOf } from '../../util/effectDeps';
import { formatIntegerCompact } from '../../util/textFormat';

import { useFolderManagerForUnreadCounters } from '../../hooks/useFolderManager';
import useLang from '../../hooks/useLang';

interface OwnProps {
  isForAppBadge?: boolean;
}

const UnreadCounter = (props: OwnProps) => {
  const unreadCounters = useFolderManagerForUnreadCounters();
  const unreadNotificationsCount = createMemo(() => unreadCounters()[ALL_FOLDER_ID]?.notificationsCount || 0);

  const lang = useLang();

  createEffect(
    depsOf(() => [props.isForAppBadge, unreadNotificationsCount()] as const),
    ([isForAppBadge, count]) => {
      if (isForAppBadge) {
        updateAppBadge(count);
      }
    },
  );

  return (
    <Show when={!(props.isForAppBadge || !unreadNotificationsCount())}>
      <div class="unread-count active">{formatIntegerCompact(lang, unreadNotificationsCount())}</div>
    </Show>
  );
};

export default UnreadCounter;

import { createEffect, createMemo } from 'frameact';
import { getActions, getGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { GlobalState } from '../../../global/types';
import type { CustomPeer } from '../../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { ANIMATION_LEVEL_MIN, ARCHIVED_FOLDER_ID } from '../../../config';
import { getChatTitle } from '../../../global/helpers';
import { selectChat } from '../../../global/selectors';
import { selectAnimationLevel } from '../../../global/selectors/sharedState';
import { selectThreadReadState } from '../../../global/selectors/threads';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { waitForTransitionEnd } from '../../../util/cssAnimationEndListeners';
import { compact } from '../../../util/iteratees';
import { formatIntegerCompact } from '../../../util/textFormat';
import renderText from '../../common/helpers/renderText';
import { ChatAnimationTypes } from './hooks';

import useSelector from '../../../hooks/data/useSelector';
import { useFolderManagerForOrderedIds, useFolderManagerForUnreadCounters } from '../../../hooks/useFolderManager';
import useLang from '../../../hooks/useLang';

import Avatar from '../../common/Avatar';
import Icon from '../../common/icons/Icon';
import Badge from '../../ui/Badge';
import ListItem, { type MenuItemContextAction } from '../../ui/ListItem';

import styles from './Archive.module.scss';

type OwnProps = {
  archiveSettings: GlobalState['archiveSettings'];
  isFoldersSidebarShown?: boolean;
  offsetTop?: number;
  animationType: ChatAnimationTypes;
  onClick?: NoneToVoidFunction;
};

const PREVIEW_SLICE = 5;
const ARCHIVE_CUSTOM_PEER: CustomPeer = {
  isCustomPeer: true,
  title: 'Archived Chats',
  avatarIcon: 'archive-filled',
  customPeerAvatarColor: '#9EAAB5',
};

const ANIMATION_RESET_DELAY = 200;

const Archive = (props: OwnProps) => {
  const { updateArchiveSettings } = getActions();

  let ref!: HTMLDivElement;

  const animationLevel = useSelector(selectAnimationLevel);
  let shouldAnimateRef = animationLevel() !== ANIMATION_LEVEL_MIN;
  const lang = useLang();

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [props.animationType, animationLevel()] as const),
    ([animationType2, animationLevel2]) => {
      if (animationLevel2 === ANIMATION_LEVEL_MIN) {
        shouldAnimateRef = false;
        return undefined;
      }

      if (animationType2 !== ChatAnimationTypes.None) {
        shouldAnimateRef = true;
        return undefined;
      }

      // Keep animation alive slightly longer to avoid jumps
      const timeout = setTimeout(() => {
        shouldAnimateRef = false;
      }, ANIMATION_RESET_DELAY);

      const element = ref;
      if (element) {
        waitForTransitionEnd(
          element,
          () => {
            shouldAnimateRef = false;
          },
          'transform',
        );
      }

      return () => clearTimeout(timeout);
    },
  );

  const orderedChatIds = useFolderManagerForOrderedIds(ARCHIVED_FOLDER_ID);
  const unreadCounters = useFolderManagerForUnreadCounters();
  const archiveUnreadCount = unreadCounters[ARCHIVED_FOLDER_ID]?.chatsCount;

  const previewItems = createMemo(() => {
    if (!orderedChatIds?.length) return lang('Loading');

    // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
    const global = getGlobal();

    return orderedChatIds.slice(0, PREVIEW_SLICE).map((chatId, i, arr) => {
      const isLast = i === arr.length - 1;
      const chat = selectChat(global, chatId);
      const readState = selectThreadReadState(global, chatId, MAIN_THREAD_ID);
      if (!chat) {
        return undefined;
      }

      const title = getChatTitle(lang, chat);

      return (
        <>
          <span class={buildClassName(styles.chat, archiveUnreadCount && readState?.unreadCount && styles.unread)}>
            {renderText(title)}
          </span>
          {isLast ? '' : ', '}
        </>
      );
    });
  });

  const contextActions = createMemo(() => {
    const actionMinimize =
      !props.archiveSettings.isMinimized &&
      ({
        title: lang('ContextArchiveCollapse'),
        icon: 'collapse',
        handler: () => {
          updateArchiveSettings({ isMinimized: true });
        },
      } satisfies MenuItemContextAction);

    const actionExpand =
      props.archiveSettings.isMinimized &&
      ({
        title: lang('ContextArchiveExpand'),
        icon: 'expand',
        handler: () => {
          updateArchiveSettings({ isMinimized: false });
        },
      } satisfies MenuItemContextAction);

    const actionHide = {
      title: lang('ContextArchiveToMenu'),
      icon: 'archive-to-main',
      handler: () => {
        updateArchiveSettings({ isHidden: true });
      },
    } satisfies MenuItemContextAction;

    return compact([actionMinimize, actionExpand, actionHide]);
  });

  function renderCollapsed() {
    return (
      <div class={buildClassName(styles.info, 'info')}>
        <div class="info-row">
          <div class={buildClassName('title', styles.title)}>
            <h3 dir="auto" class={buildClassName(styles.name, 'fullName')}>
              <Icon name="archive-filled" className={styles.icon} />
              {lang('ArchivedChats')}
            </h3>
          </div>
          <Badge
            className={styles.unreadCount}
            text={archiveUnreadCount ? formatIntegerCompact(lang, archiveUnreadCount) : undefined}
          />
        </div>
      </div>
    );
  }

  function renderRegular() {
    return (
      <>
        <div class={buildClassName('status', styles.avatarWrapper)}>
          <Avatar peer={ARCHIVE_CUSTOM_PEER} />
        </div>
        <div class={buildClassName(styles.info, 'info')}>
          <div class="info-row">
            <div class={buildClassName('title', styles.title)}>
              <h3 dir="auto" class={buildClassName(styles.name, 'fullName')}>
                {lang('ArchivedChats')}
              </h3>
            </div>
          </div>
          <div class="subtitle">
            <div class={buildClassName('status', styles.chatsPreview)}>{previewItems()}</div>
            <Badge
              className={styles.unreadCount}
              text={archiveUnreadCount ? formatIntegerCompact(lang, archiveUnreadCount) : undefined}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <ListItem
      ref={ref}
      onClick={props.onClick}
      onFileHoverOpen={props.onClick}
      className={buildClassName(
        styles.root,
        props.archiveSettings.isMinimized && styles.minimized,
        props.isFoldersSidebarShown && props.archiveSettings.isMinimized && styles.noMarginTop,
        !shouldAnimateRef && styles.noAnimation,
        props.offsetTop && styles.noMarginTop,
        'chat-item-clickable',
        'chat-item-archive',
      )}
      style={buildStyle(Boolean(props.offsetTop) && `transform: translateY(${props.offsetTop}px)`)}
      buttonClassName={styles.button}
      contextActions={contextActions()}
      withPortalForMenu
    >
      {props.archiveSettings.isMinimized ? renderCollapsed() : renderRegular()}
    </ListItem>
  );
};

export default Archive;

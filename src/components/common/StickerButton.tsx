import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createMemo, onMount } from 'frameact';
import { getActions } from '../../global';

import type { ApiBotInlineMediaResult, ApiSticker } from '../../api/types';

import { IS_TOUCH_ENV } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { getServerTime } from '../../util/serverTime';
import { preventMessageInputBlurWithBubbling } from '../middle/helpers/preventMessageInputBlur';

import useDynamicColorListener from '../../hooks/stickers/useDynamicColorListener';
import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import { useIsIntersecting } from '../../hooks/useIntersectionObserver';
import useOldLang from '../../hooks/useOldLang';

import Button from '../ui/Button';
import Menu from '../ui/Menu';
import MenuItem from '../ui/MenuItem';
import Icon from './icons/Icon';
import StickerView from './StickerView';

import './StickerButton.scss';

type OwnProps<T> = {
  sticker: ApiSticker;
  size: number;
  noPlay?: boolean;
  title?: string;
  className?: string;
  noContextMenu?: boolean;
  isSavedMessages?: boolean;
  isStatusPicker?: boolean;
  canViewSet?: boolean;
  isSelected?: boolean;
  isCurrentUserPremium?: boolean;
  shouldIgnorePremium?: boolean;
  sharedCanvasRef?: (el: HTMLCanvasElement) => void;
  withTranslucentThumb?: boolean;
  forcePlayback?: boolean;
  isEffectEmoji?: boolean;
  noShowPremium?: boolean;
  noIcons?: boolean;
  clickArg: T;
  onClick?: (arg: OwnProps<T>['clickArg'], isSilent?: boolean, shouldSchedule?: boolean) => void;
  observeIntersection: ObserveFn;
  observeIntersectionForShowing?: ObserveFn;
  onFaveClick?: (sticker: ApiSticker) => void;
  onUnfaveClick?: (sticker: ApiSticker) => void;
  onRemoveRecentClick?: (sticker: ApiSticker) => void;
  onDismiss?: NoneToVoidFunction;
};

const contentForStatusMenuContext = [
  { title: 'SetTimeoutFor.Hours', value: 1, arg: 3600 },
  { title: 'SetTimeoutFor.Hours', value: 2, arg: 7200 },
  { title: 'SetTimeoutFor.Hours', value: 8, arg: 28800 },
  { title: 'SetTimeoutFor.Days', value: 1, arg: 86400 },
  { title: 'SetTimeoutFor.Days', value: 2, arg: 172800 },
];

const StickerButton = <T extends number | ApiSticker | ApiBotInlineMediaResult | undefined = undefined>(
  props: OwnProps<T>,
) => {
  const { openStickerSet, setEmojiStatus, showNotification } = getActions();
  let ref!: HTMLDivElement;
  let menuRef!: HTMLDivElement;
  const lang = useOldLang();
  const hasCustomColor = createMemo(() => props.sticker.shouldUseTextColor);
  const customColor = useDynamicColorListener(
    () => ref,
    undefined,
    () => !hasCustomColor(),
  );

  const id = () => props.sticker.id;
  const stickerSetInfo = () => props.sticker.stickerSetInfo;
  const isPremium = createMemo(() => !props.sticker.isFree || props.sticker.hasEffect);
  const isCustomEmoji = createMemo(() => props.sticker.isCustomEmoji || props.isEffectEmoji);
  const isPremiumSticker = createMemo(() => !isCustomEmoji() && isPremium());
  const isLocked = createMemo(
    () => !props.isCurrentUserPremium && isPremium() && !props.shouldIgnorePremium && !props.isSavedMessages,
  );

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );
  const shouldLoad = isIntersecting;
  const shouldPlay = createMemo(() => isIntersecting && !props.noPlay);

  const isIntesectingForShowing = useIsIntersecting(
    () => ref,
    () => props.observeIntersectionForShowing,
  );

  const {
    isContextMenuOpen,
    contextMenuAnchor,
    handleBeforeContextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleContextMenuHide,
  } = useContextMenuHandlers(() => ref);
  const shouldRenderContextMenu = createMemo(() => Boolean(!props.noContextMenu && contextMenuAnchor));

  const getTriggerElement = () => ref;
  const getRootElement = () => ref!.closest('.custom-scroll, .no-scrollbar');
  const getMenuElement = () => {
    return props.isStatusPicker ? menuRef : ref!.querySelector('.sticker-context-menu .bubble');
  };
  const getLayout = () => ({ withPortal: props.isStatusPicker, shouldAvoidNegativePosition: true });

  onMount(() => {
    if (!isIntersecting) handleContextMenuClose();
  });

  const handleClick = () => {
    if (isContextMenuOpen) return;
    if (isLocked()) {
      const initialSection = props.isEffectEmoji ? 'effects' : isCustomEmoji() ? 'animated_emoji' : 'premium_stickers';
      showNotification({
        message: { key: isCustomEmoji() || props.isEffectEmoji ? 'PremiumUnlockEmoji' : 'PremiumUnlockStickers' },
        actionText: { key: 'PremiumMore' },
        action: {
          action: 'openPremiumModal',
          payload: { initialSection },
        },
      });
      return;
    }
    props.onClick?.(props.clickArg);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    preventMessageInputBlurWithBubbling(e);
    handleBeforeContextMenu(e);
  };

  const handleRemoveClick = (e: ReactMouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    e.preventDefault();

    props.onRemoveRecentClick!(props.sticker);
  };

  const handleContextRemoveRecent = () => {
    props.onRemoveRecentClick!(props.sticker);
  };

  const handleContextUnfave = () => {
    props.onUnfaveClick!(props.sticker);
  };

  const handleContextFave = () => {
    props.onFaveClick!(props.sticker);
  };

  const handleSendQuiet = () => {
    props.onClick?.(props.clickArg, true);
  };

  const handleSendScheduled = () => {
    props.onClick?.(props.clickArg, undefined, true);
  };

  const handleOpenSet = () => {
    openStickerSet({ stickerSetInfo: stickerSetInfo() });
  };

  const handleEmojiStatusExpiresClick = (e: React.SyntheticEvent, duration = 0) => {
    e.preventDefault();
    e.stopPropagation();

    handleContextMenuClose();
    props.onDismiss?.();
    setEmojiStatus({
      emojiStatus: { type: 'regular', documentId: props.sticker.id, until: getServerTime() + duration },
    });
  };

  const shouldShowCloseButton = createMemo(() => !IS_TOUCH_ENV && props.onRemoveRecentClick);

  const fullClassName = createMemo(() =>
    buildClassName(
      'StickerButton',
      props.onClick && 'interactive',
      props.isSelected && 'selected',
      isCustomEmoji() && 'custom-emoji',
      props.isEffectEmoji && 'effect-emoji',
      props.className,
    ),
  );

  const contextMenuItems = createMemo(() => {
    if (!shouldRenderContextMenu() || props.noContextMenu || (isCustomEmoji() && !props.isStatusPicker)) return [];

    const items: ReactNode[] = [];

    if (isCustomEmoji()) {
      contentForStatusMenuContext.forEach((item) => {
        items.push(
          <MenuItem onClick={handleEmojiStatusExpiresClick} clickArg={item.arg}>
            {lang(item.title, item.value, 'i')}
          </MenuItem>,
        );
      });

      return items;
    }

    if (props.onUnfaveClick) {
      items.push(
        <MenuItem icon="star-regular" onClick={handleContextUnfave}>
          {lang('Stickers.RemoveFromFavorites')}
        </MenuItem>,
      );
    }

    if (props.onFaveClick) {
      items.push(
        <MenuItem icon="star-regular" onClick={handleContextFave}>
          {lang('Stickers.AddToFavorites')}
        </MenuItem>,
      );
    }

    if (!isLocked() && props.onClick) {
      if (!props.isSavedMessages) {
        items.push(
          <MenuItem onClick={handleSendQuiet} icon="muted">
            {lang('SendWithoutSound')}
          </MenuItem>,
        );
      }
      items.push(
        <MenuItem onClick={handleSendScheduled} icon="calendar">
          {lang(props.isSavedMessages ? 'SetReminder' : 'ScheduleMessage')}
        </MenuItem>,
      );
    }

    if (props.canViewSet) {
      items.push(
        <MenuItem onClick={handleOpenSet} icon="stickers">
          {lang('ViewPackPreview')}
        </MenuItem>,
      );
    }
    if (props.onRemoveRecentClick) {
      items.push(
        <MenuItem icon="delete" onClick={handleContextRemoveRecent}>
          {lang('DeleteFromRecent')}
        </MenuItem>,
      );
    }
    return items;
  });

  return (
    <div
      ref={ref}
      class={fullClassName()}
      title={props.title || props.sticker?.emoji}
      data-sticker-id={id()}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {isIntesectingForShowing ? (
        <StickerView
          containerRef={(el) => {
            ref = el;
          }}
          sticker={props.sticker}
          isSmall
          size={props.size}
          shouldLoop
          shouldPreloadPreview
          noLoad={!shouldLoad}
          noPlay={!shouldPlay()}
          noVideoOnMobile
          withSharedAnimation
          sharedCanvasRef={props.sharedCanvasRef}
          withTranslucentThumb={props.withTranslucentThumb}
          customColor={customColor}
          forceAlways={props.forcePlayback}
        />
      ) : (
        isIntersecting &&
        props.sticker.thumbnail?.dataUri && (
          <img src={props.sticker.thumbnail.dataUri} class="sticker-media" alt="" draggable={false} />
        )
      )}
      {!props.noIcons && !props.noShowPremium && isLocked() && (
        <div class="sticker-locked">
          <Icon name="lock-filled" />
        </div>
      )}
      {!props.noIcons && !props.noShowPremium && isPremiumSticker() && !isLocked() && (
        <div class="sticker-premium">
          <Icon name="star" />
        </div>
      )}
      {shouldShowCloseButton() && (
        <Button
          className="sticker-remove-button"
          color="dark"
          round
          noFastClick
          onClick={handleRemoveClick}
          iconName="close"
        />
      )}
      {Boolean(contextMenuItems().length) && (
        <Menu
          ref={menuRef}
          isOpen={isContextMenuOpen}
          anchor={contextMenuAnchor}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          className="sticker-context-menu"
          autoClose
          withPortal={props.isStatusPicker}
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
        >
          {contextMenuItems()}
        </Menu>
      )}
    </div>
  );
};

export default StickerButton;

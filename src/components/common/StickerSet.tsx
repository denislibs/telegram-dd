import { createEffect, createMemo, createSignal, onMount } from 'frameact';
import { getActions, getGlobal, withGlobal } from '../../global';
import { createMediaTransition } from '../../lib/kit';
import { depsOf } from '../../util/effectDeps';
import type { GlobalState } from '../../global/types';

import type { ApiAvailableReaction, ApiEmojiStatusType, ApiReactionWithPaid, ApiSticker } from '../../api/types';
import type { StickerSetOrReactionsSetOrRecent } from '../../types';

import {
  COLLECTIBLE_STATUS_SET_ID,
  DEFAULT_STATUS_ICON_ID,
  DEFAULT_TOPIC_ICON_STICKER_ID,
  EFFECT_EMOJIS_SET_ID,
  EFFECT_STICKERS_SET_ID,
  EMOJI_SIZE_PICKER,
  FAVORITE_SYMBOL_SET_ID,
  POPULAR_SYMBOL_SET_ID,
  RECENT_SYMBOL_SET_ID,
  STICKER_SIZE_PICKER,
} from '../../config';
import { getReactionKey } from '../../global/helpers';
import { selectIsAlwaysHighPriorityEmoji, selectIsSetPremium } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';

import useAppLayout from '../../hooks/useAppLayout';
import useFlag from '../../hooks/useFlag';
import { useIsIntersecting } from '../../hooks/useIntersectionObserver';
import useOldLang from '../../hooks/useOldLang';
import useResizeObserver from '../../hooks/useResizeObserver';
import useWindowSize from '../../hooks/window/useWindowSize';

import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import GiftEffectWrapper from './gift/GiftEffectWrapper';
import Icon from './icons/Icon';
import ReactionEmoji from './reactions/ReactionEmoji';
import StickerButton from './StickerButton';

import grey from '../../assets/icons/forumTopic/grey.svg';

type OwnProps = {
  stickerSet: StickerSetOrReactionsSetOrRecent;
  loadAndPlay: boolean;
  index: number;
  idPrefix: string;
  isNearActive: boolean;
  favoriteStickers?: ApiSticker[];
  isSavedMessages?: boolean;
  isStatusPicker?: boolean;
  isReactionPicker?: boolean;
  isCurrentUserPremium?: boolean;
  shouldHideHeader?: boolean;
  selectedReactionIds?: string[];
  withDefaultTopicIcon?: boolean;
  withDefaultStatusIcon?: boolean;
  isChatEmojiSet?: boolean;
  isChatStickerSet?: boolean;
  isTranslucent?: boolean;
  noContextMenus?: boolean;
  noAddButton?: boolean;
  forcePlayback?: boolean;
  observeIntersection?: ObserveFn;
  observeIntersectionForPlayingItems: ObserveFn;
  observeIntersectionForShowingItems: ObserveFn;
  availableReactions?: ApiAvailableReaction[];
  onStickerSelect?: (sticker: ApiSticker, isSilent?: boolean, shouldSchedule?: boolean) => void;
  onReactionSelect?: (reaction: ApiReactionWithPaid) => void;
  onReactionContext?: (reaction: ApiReactionWithPaid) => void;
  onStickerUnfave?: (sticker: ApiSticker) => void;
  onStickerFave?: (sticker: ApiSticker) => void;
  onStickerRemoveRecent?: (sticker: ApiSticker) => void;
  onDismiss?: NoneToVoidFunction;
};

type StateProps = {
  collectibleStatuses?: ApiEmojiStatusType[];
};

const ITEMS_PER_ROW_FALLBACK = 8;
const ITEMS_MOBILE_PER_ROW_FALLBACK = 7;
const ITEMS_MINI_MOBILE_PER_ROW_FALLBACK = 6;
const MOBILE_WIDTH_THRESHOLD_PX = 440;
const MINI_MOBILE_WIDTH_THRESHOLD_PX = 362;

const StickerSet = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    clearRecentStickers,
    clearRecentCustomEmoji,
    clearRecentReactions,
    openPremiumModal,
    toggleStickerSet,
    loadStickers,
  } = getActions();

  let ref!: HTMLDivElement;

  let sharedCanvasRef!: HTMLCanvasElement;
  let sharedCanvasHqRef!: HTMLCanvasElement;

  const lang = useOldLang();
  const { width: windowWidth } = useWindowSize();
  const [isConfirmModalOpen, openConfirmModal, closeConfirmModal] = useFlag();
  const { isMobile } = useAppLayout();

  const [itemsPerRow, setItemsPerRow] = createSignal((() => getItemsPerRowFallback(windowWidth))());

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection ?? props.observeIntersectionForShowingItems,
  );
  // TODO(codemod): useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element
  const transitionClassNames = createMemo(() =>
    createMediaTransition({ hasMediaData: () => Boolean(isIntersecting || props.isNearActive) }),
  );

  // `isNearActive` is set in advance during animation, but it is not reliable for short sets
  const shouldRender = createMemo(() => props.isNearActive || isIntersecting);

  const stickerMarginPx = isMobile ? 8 : 4;
  const emojiMarginPx = isMobile ? 8 : 10;
  const emojiVerticalMarginPx = isMobile ? 8 : 4;
  const isRecent = createMemo(() => props.stickerSet.id === RECENT_SYMBOL_SET_ID);
  const isStatusCollectible = createMemo(() => props.stickerSet.id === COLLECTIBLE_STATUS_SET_ID);
  const isFavorite = createMemo(() => props.stickerSet.id === FAVORITE_SYMBOL_SET_ID);
  const isPopular = createMemo(() => props.stickerSet.id === POPULAR_SYMBOL_SET_ID);
  const isEmoji = createMemo(() => props.stickerSet.isEmoji);
  const isPremiumSet = createMemo(() => !isRecent() && selectIsSetPremium(props.stickerSet));

  const handleClearRecent = () => {
    if (props.isReactionPicker) {
      clearRecentReactions();
    } else if (isEmoji()) {
      clearRecentCustomEmoji();
    } else {
      clearRecentStickers();
    }
    closeConfirmModal();
  };

  const handleAddClick = () => {
    if (isPremiumSet() && !props.isCurrentUserPremium) {
      openPremiumModal({
        initialSection: 'animated_emoji',
      });
    } else {
      toggleStickerSet({
        stickerSetId: props.stickerSet.id,
      });
    }
  };

  const handleDefaultTopicIconClick = () => {
    props.onStickerSelect?.({
      mediaType: 'sticker',
      id: DEFAULT_TOPIC_ICON_STICKER_ID,
      isLottie: false,
      isVideo: false,
      stickerSetInfo: {
        shortName: 'dummy',
      },
    } satisfies ApiSticker);
  };

  const handleDefaultStatusIconClick = () => {
    props.onStickerSelect?.({
      mediaType: 'sticker',
      id: DEFAULT_STATUS_ICON_ID,
      isLottie: false,
      isVideo: false,
      stickerSetInfo: {
        shortName: 'dummy',
      },
    } satisfies ApiSticker);
  };

  const itemSize = createMemo(() => (isEmoji() ? EMOJI_SIZE_PICKER : STICKER_SIZE_PICKER));
  const margin = createMemo(() => (isEmoji() ? emojiMarginPx : stickerMarginPx));
  const verticalMargin = createMemo(() => (isEmoji() ? emojiVerticalMarginPx : stickerMarginPx));

  const calculateItemsPerRow = (width: number) => {
    if (!width) {
      return getItemsPerRowFallback(windowWidth);
    }

    return Math.floor((width + margin()) / (itemSize() + margin()));
  };

  const handleResize = (entry: ResizeObserverEntry) => {
    setItemsPerRow(calculateItemsPerRow(entry.contentRect.width));
  };

  useResizeObserver(() => ref, handleResize);

  onMount(() => {
    if (!ref) return;
    setItemsPerRow(calculateItemsPerRow(ref.clientWidth));
  });

  createEffect(
    depsOf(() => [shouldRender(), loadStickers, props.stickerSet] as const),
    ([shouldRender2, , stickerSet2]) => {
      if (shouldRender2 && !stickerSet2.stickers?.length && !stickerSet2.reactions?.length && stickerSet2.accessHash) {
        loadStickers({
          stickerSetInfo: {
            id: stickerSet2.id,
            accessHash: stickerSet2.accessHash,
          },
        });
      }
    },
  );

  const isLocked = createMemo(
    () => !props.isSavedMessages && !props.isCurrentUserPremium && isPremiumSet() && !props.isChatEmojiSet,
  );

  const isInstalled = createMemo(() => props.stickerSet.installedDate && !props.stickerSet.isArchived);

  const canCut = createMemo(
    () =>
      !isInstalled() &&
      props.stickerSet.id !== RECENT_SYMBOL_SET_ID &&
      props.stickerSet.id !== POPULAR_SYMBOL_SET_ID &&
      props.stickerSet.id !== EFFECT_EMOJIS_SET_ID &&
      props.stickerSet.id !== EFFECT_STICKERS_SET_ID &&
      !props.isChatEmojiSet &&
      !props.isChatStickerSet,
  );

  const [isCut, , expand] = useFlag(canCut());
  const itemsBeforeCutout = createMemo(() => itemsPerRow() * 3 - 1);
  const totalItemsCount = createMemo(() =>
    props.withDefaultTopicIcon || props.withDefaultStatusIcon ? props.stickerSet.count + 1 : props.stickerSet.count,
  );

  const itemHeight = createMemo(() => itemSize() + verticalMargin());
  const heightWhenCut = createMemo(
    () => Math.ceil(Math.min(itemsBeforeCutout(), totalItemsCount()) / itemsPerRow()) * itemHeight() - verticalMargin(),
  );
  const height = createMemo(() =>
    isCut() ? heightWhenCut() : Math.ceil(totalItemsCount() / itemsPerRow()) * itemHeight() - verticalMargin(),
  );

  const favoriteStickerIdsSet = createMemo(() =>
    props.favoriteStickers ? new Set(props.favoriteStickers.map(({ id }) => id)) : undefined,
  );
  const collectibleEmojiIdsSet = createMemo(() =>
    props.collectibleStatuses ? new Set(props.collectibleStatuses.map(({ documentId }) => documentId)) : undefined,
  );
  const withAddSetButton = createMemo(
    () =>
      !props.noAddButton &&
      !props.shouldHideHeader &&
      !isRecent() &&
      !isStatusCollectible() &&
      isEmoji() &&
      !isPopular() &&
      !props.isChatEmojiSet &&
      (!isInstalled() || (!props.isCurrentUserPremium && !props.isSavedMessages)),
  );
  const addSetButtonText = createMemo(() => {
    if (isLocked()) {
      if (isInstalled()) return lang('lng_emoji_premium_restore');
      return lang('Unlock');
    }

    return lang('Add');
  });

  return (
    // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{(key) => …}</Show> (the callback MUST take an argument, a zero-argument child is a plain child and never remounts; a falsy key such as 0 renders nothing: use when={{ id: key }})
    <div
      ref={ref}
      key={props.stickerSet.id}
      id={`${props.idPrefix}-${props.index}`}
      class={buildClassName('symbol-set', isLocked() && 'symbol-set-locked')}
    >
      {!props.shouldHideHeader && (
        <div class="symbol-set-header">
          <p class={buildClassName('symbol-set-title', withAddSetButton() && 'symbol-set-title-external')}>
            {isLocked() && <Icon name="lock-filled" className="symbol-set-locked-icon" />}
            <span class="symbol-set-name">{props.stickerSet.title}</span>
            {(props.isChatEmojiSet || props.isChatStickerSet) && (
              <span class="symbol-set-chat">{lang(props.isChatEmojiSet ? 'GroupEmoji' : 'GroupStickers')}</span>
            )}
            {withAddSetButton() && Boolean(props.stickerSet.stickers) && (
              <span class="symbol-set-amount">
                {lang(isEmoji() ? 'EmojiCount' : 'Stickers', props.stickerSet.stickers.length, 'i')}
              </span>
            )}
          </p>
          {isRecent() && <Icon className="symbol-set-remove" name="close" onClick={openConfirmModal} />}
          {withAddSetButton() && (
            <Button
              className="symbol-set-add-button"
              withPremiumGradient={isPremiumSet() && !props.isCurrentUserPremium}
              onClick={handleAddClick}
              pill
              size="tiny"
              fluid
            >
              {addSetButtonText()}
            </Button>
          )}
        </div>
      )}
      <div
        class={buildClassName(
          'symbol-set-container shared-canvas-container',
          transitionClassNames(),
          props.stickerSet.id === EFFECT_EMOJIS_SET_ID && 'effect-emojis',
        )}
        style={`height: ${height()}px;`}
      >
        <canvas
          ref={sharedCanvasRef}
          class="shared-canvas"
          style={canCut() ? `height: ${heightWhenCut()}px;` : undefined}
        />
        {(isRecent() || isFavorite() || canCut()) && <canvas ref={sharedCanvasHqRef} class="shared-canvas" />}
        {props.withDefaultTopicIcon && (
          <Button className="StickerButton custom-emoji" color="translucent" onClick={handleDefaultTopicIconClick}>
            <img src={grey} alt="Reset" class="sticker-media" draggable={false} />
          </Button>
        )}
        {props.withDefaultStatusIcon && (
          <Button
            className="StickerButton custom-emoji status-default"
            color="translucent"
            onClick={handleDefaultStatusIconClick}
            iconName="star"
          />
        )}
        {shouldRender() &&
          props.stickerSet.reactions?.map((reaction) => {
            const reactionId = getReactionKey(reaction);
            const isSelected = reactionId ? props.selectedReactionIds?.includes(reactionId) : undefined;

            return (
              // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{(key) => …}</Show> (the callback MUST take an argument, a zero-argument child is a plain child and never remounts; a falsy key such as 0 renders nothing: use when={{ id: key }})
              <ReactionEmoji
                key={`${props.stickerSet.id}_${reactionId}`}
                reaction={reaction}
                isSelected={isSelected}
                loadAndPlay={props.loadAndPlay}
                availableReactions={props.availableReactions}
                observeIntersection={props.observeIntersectionForPlayingItems}
                onClick={props.onReactionSelect!}
                onContextMenu={props.onReactionContext}
                sharedCanvasRef={(el) => {
                  sharedCanvasRef = el;
                }}
                sharedCanvasHqRef={(el) => {
                  sharedCanvasHqRef = el;
                }}
                forcePlayback={props.forcePlayback}
              />
            );
          })}
        {/* TODO(codemod): "sharedCanvasRef" was a ref object passed as a value: pass an accessor (() => sharedCanvasRef) or a callback ref */}
        {shouldRender() &&
          props.stickerSet.stickers
            ?.slice(0, isCut() ? itemsBeforeCutout() : props.stickerSet.stickers.length)
            .map((sticker, i) => {
              const isHqEmoji =
                (isRecent() || isFavorite()) && selectIsAlwaysHighPriorityEmoji(getGlobal(), sticker.stickerSetInfo);
              const canvasRef =
                (canCut() && i >= itemsBeforeCutout()) || isHqEmoji ? sharedCanvasHqRef : sharedCanvasRef;
              const reactionId = sticker.isCustomEmoji ? sticker.id : sticker.emoji;
              const isSelected = reactionId ? props.selectedReactionIds?.includes(reactionId) : undefined;

              const withSparkles =
                props.stickerSet.id === COLLECTIBLE_STATUS_SET_ID || collectibleEmojiIdsSet()?.has(sticker.id);

              const component = (
                <StickerButton
                  sticker={sticker}
                  size={itemSize()}
                  observeIntersection={props.observeIntersectionForPlayingItems}
                  observeIntersectionForShowing={props.observeIntersectionForShowingItems}
                  noPlay={!props.loadAndPlay}
                  isSavedMessages={props.isSavedMessages}
                  isStatusPicker={props.isStatusPicker}
                  canViewSet
                  noContextMenu={props.noContextMenus}
                  isCurrentUserPremium={props.isCurrentUserPremium}
                  shouldIgnorePremium={props.isChatEmojiSet}
                  sharedCanvasRef={canvasRef}
                  withTranslucentThumb={props.isTranslucent}
                  onClick={props.onStickerSelect}
                  clickArg={sticker}
                  noIcons={isEmoji() && !isRecent()}
                  isSelected={isSelected}
                  onUnfaveClick={
                    isFavorite() && favoriteStickerIdsSet()?.has(sticker.id) ? props.onStickerUnfave : undefined
                  }
                  onFaveClick={!favoriteStickerIdsSet()?.has(sticker.id) ? props.onStickerFave : undefined}
                  onRemoveRecentClick={isRecent() ? props.onStickerRemoveRecent : undefined}
                  onDismiss={props.onDismiss}
                  forcePlayback={props.forcePlayback}
                  isEffectEmoji={props.stickerSet.id === EFFECT_EMOJIS_SET_ID}
                  noShowPremium={
                    props.isCurrentUserPremium &&
                    (props.stickerSet.id === EFFECT_STICKERS_SET_ID || props.stickerSet.id === EFFECT_EMOJIS_SET_ID)
                  }
                />
              );

              if (withSparkles) {
                return (
                  <GiftEffectWrapper className="gift-effect-wrapper" withSparkles>
                    {component}
                  </GiftEffectWrapper>
                );
              }

              return component;
            })}
        {isCut() && totalItemsCount() > itemsBeforeCutout() && (
          <Button className="StickerButton custom-emoji set-expand" round color="translucent" onClick={expand}>
            +{totalItemsCount() - itemsBeforeCutout()}
          </Button>
        )}
      </div>

      {isRecent() && (
        <ConfirmDialog
          text={lang(props.isReactionPicker ? 'ClearRecentReactionsAlertMessage' : 'ClearRecentStickersAlertMessage')}
          isOpen={isConfirmModalOpen()}
          onClose={closeConfirmModal}
          confirmHandler={handleClearRecent}
          confirmIsDestructive
        />
      )}
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const collectibleStatuses = global.collectibleEmojiStatuses?.statuses;

  return { collectibleStatuses };
};

export default StickerSet;

function getItemsPerRowFallback(windowWidth: number): number {
  return windowWidth > MOBILE_WIDTH_THRESHOLD_PX
    ? ITEMS_PER_ROW_FALLBACK
    : windowWidth < MINI_MOBILE_WIDTH_THRESHOLD_PX
      ? ITEMS_MINI_MOBILE_PER_ROW_FALLBACK
      : ITEMS_MOBILE_PER_ROW_FALLBACK;
}

import { createEffect, createMemo, createMutationEffect, createSignal, requestMutation } from 'frameact';
import { Show, splitProps } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type { ApiSticker, ApiVideo } from '../../../api/types';
import type { GlobalActions } from '../../../global';
import type { GlobalState } from '../../../global/types';
import type { TransitionSlide } from '../../../lib/kit';
import type { AnimationLevel, ThreadId } from '../../../types';
import type { MenuPositionOptions } from '../../ui/Menu';

import { createShowTransition } from '../../../lib/kit';
import { selectIsContextMenuTranslucent, selectTabState } from '../../../global/selectors';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import { resolveTransitionName } from '../../../util/resolveTransitionName';

import useAppLayout from '../../../hooks/useAppLayout';
import useOldLang from '../../../hooks/useOldLang';

import Button from '../../ui/Button';
import Menu from '../../ui/Menu';
import Portal from '../../ui/Portal';
import Transition from '../../ui/Transition';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import StickerPicker from './StickerPicker';
import SymbolMenuFooter, { SYMBOL_MENU_TAB_TITLES, SymbolMenuTabs } from './SymbolMenuFooter';

import './SymbolMenu.scss';

const ANIMATION_DURATION = 350;

export type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  isOpen: boolean;
  canSendStickers?: boolean;
  canSendGifs?: boolean;
  isMessageComposer?: boolean;
  idPrefix: string;
  onLoad: () => void;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
  onCustomEmojiSelect: (emoji: ApiSticker) => void;
  onStickerSelect?: (
    sticker: ApiSticker,
    isSilent?: boolean,
    shouldSchedule?: boolean,
    shouldPreserveInput?: boolean,
    canUpdateStickerSetsOrder?: boolean,
  ) => void;
  onGifSelect?: (gif: ApiVideo, isSilent?: boolean, shouldSchedule?: boolean) => void;
  onGifAddCaption?: (gif: ApiVideo) => void;
  onRemoveSymbol: () => void;
  addRecentEmoji: GlobalActions['addRecentEmoji'];
  addRecentCustomEmoji: GlobalActions['addRecentCustomEmoji'];
  className?: string;
  isAttachmentModal?: boolean;
  canSendPlainText?: boolean;
  onMouseEnter?: NoneToVoidFunction;
  onMouseLeave?: NoneToVoidFunction;
} & MenuPositionOptions;

type StateProps = {
  isLeftColumnShown: boolean;
  isBackgroundTranslucent?: boolean;
  animationLevel: AnimationLevel;
};

let isActivated = false;

const SymbolMenu = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const [, menuPositionOptions] = splitProps(props, [
    'chatId',
    'threadId',
    'isOpen',
    'canSendStickers',
    'canSendGifs',
    'isMessageComposer',
    'idPrefix',
    'isAttachmentModal',
    'canSendPlainText',
    'className',
    'onLoad',
    'onClose',
    'onEmojiSelect',
    'onCustomEmojiSelect',
    'onStickerSelect',
    'onGifSelect',
    'onGifAddCaption',
    'onRemoveSymbol',
    'addRecentEmoji',
    'addRecentCustomEmoji',
    'isLeftColumnShown',
    'isBackgroundTranslucent',
    'animationLevel',
    'onMouseEnter',
    'onMouseLeave',
  ]);
  const { loadEmojiSearchGroups, loadEmojiStickerGroups } = getActions();

  const [activeTab, setActiveTab] = createSignal<SymbolMenuTabs>(SymbolMenuTabs.Emoji);
  const [recentEmojis, setRecentEmojis] = createSignal<string[]>([]);
  const [recentCustomEmojis, setRecentCustomEmojis] = createSignal<string[]>([]);
  const { isMobile } = useAppLayout();

  // Deviation: the transition classes of the mobile menu are written through the element ref (`t.ref`).
  const transition = createShowTransition({
    isOpen: () => props.isOpen,
    onCloseAnimationEnd: () => props.onClose(),
    className: false,
  });

  const lang = useOldLang();

  // Deviation: tt set the module flag during the render; here it is read through a memo (the flag stays set for every
  // later instance, as in tt).
  const shouldRenderTabs = createMemo(() => {
    if (!isActivated && props.isOpen) {
      isActivated = true;
    }

    return isActivated;
  });

  createEffect(
    () => props.onLoad,
    (onLoad2) => {
      onLoad2();
    },
  );

  createEffect(
    () => props.isOpen,
    (isOpen2) => {
      if (isOpen2) {
        loadEmojiSearchGroups();
        loadEmojiStickerGroups();
      }
    },
  );

  // If we can't send plain text, we should always show the stickers tab
  createEffect(
    () => props.canSendPlainText,
    (canSendPlainText2) => {
      if (canSendPlainText2) return;
      setActiveTab(SymbolMenuTabs.Stickers);
    },
  );

  createMutationEffect(
    depsOf(() => [props.isAttachmentModal, isMobile(), props.isOpen] as const),
    ([isAttachmentModal2, isMobile2, isOpen2]) => {
      if (!isMobile2 || !isOpen2 || isAttachmentModal2) {
        return undefined;
      }

      document.body.classList.add('enable-symbol-menu-transforms');
      document.body.classList.add('is-symbol-menu-open');

      return () => {
        document.body.classList.remove('is-symbol-menu-open');

        setTimeout(() => {
          requestMutation(() => {
            document.body.classList.remove('enable-symbol-menu-transforms');
          });
        }, ANIMATION_DURATION);
      };
    },
  );

  createEffect(
    depsOf(() => [props.isOpen, props.addRecentEmoji] as const),
    ([isOpen2, addRecentEmoji2]) => {
      // The list is read when the menu closes (tt kept the latest list in a ref).
      const recentEmojis2 = recentEmojis();
      if (!recentEmojis2.length || isOpen2) {
        return;
      }

      recentEmojis2.forEach((name) => {
        addRecentEmoji2({ emoji: name });
      });

      setRecentEmojis([]);
    },
  );

  const handleEmojiSelect = (emoji: string, name: string) => {
    setRecentEmojis((emojis) => [...emojis, name]);

    props.onEmojiSelect(emoji);
  };

  createEffect(
    depsOf(() => [props.isOpen, props.addRecentCustomEmoji] as const),
    ([isOpen2, addRecentCustomEmoji2]) => {
      const recentCustomEmojis2 = recentCustomEmojis();
      if (!recentCustomEmojis2.length || isOpen2) {
        return;
      }

      recentCustomEmojis2.forEach((documentId) => {
        addRecentCustomEmoji2({
          documentId,
        });
      });

      setRecentCustomEmojis([]);
    },
  );

  const handleCustomEmojiSelect = (emoji: ApiSticker) => {
    setRecentCustomEmojis((ids) => [...ids, emoji.id]);

    props.onCustomEmojiSelect(emoji);
  };

  const handleStickerSelect = (
    sticker: ApiSticker,
    isSilent?: boolean,
    shouldSchedule?: boolean,
    canUpdateStickerSetsOrder?: boolean,
  ) => {
    props.onStickerSelect?.(sticker, isSilent, shouldSchedule, true, canUpdateStickerSetsOrder);
  };

  // Deviation: a slide renders the tab of its own key (tt called this with the state of the render in which the key was
  // active, i.e. the same thing).
  function renderContent(slide: TransitionSlide) {
    switch (slide.key as SymbolMenuTabs) {
      case SymbolMenuTabs.Emoji:
        return (
          <EmojiPicker
            className="picker-tab"
            isHidden={!props.isOpen || !slide.isActive()}
            idPrefix={props.idPrefix}
            loadAndPlay={props.isOpen && (slide.isActive() || slide.isFrom())}
            chatId={props.chatId}
            isTranslucent={!isMobile() && props.isBackgroundTranslucent}
            onEmojiSelect={handleEmojiSelect}
            onCustomEmojiSelect={handleCustomEmojiSelect}
          />
        );
      case SymbolMenuTabs.Stickers:
        return (
          <StickerPicker
            className="picker-tab"
            isHidden={!props.isOpen || !slide.isActive()}
            loadAndPlay={props.canSendStickers ? props.isOpen && (slide.isActive() || slide.isFrom()) : false}
            idPrefix={props.idPrefix}
            canSendStickers={props.canSendStickers}
            noContextMenus={!props.isMessageComposer}
            chatId={props.chatId}
            threadId={props.threadId}
            isTranslucent={!isMobile() && props.isBackgroundTranslucent}
            onStickerSelect={handleStickerSelect}
          />
        );
      case SymbolMenuTabs.GIFs:
        return (
          <GifPicker
            className="picker-tab"
            loadAndPlay={props.canSendGifs ? props.isOpen && (slide.isActive() || slide.isFrom()) : false}
            canSendGifs={props.canSendGifs}
            onGifSelect={props.onGifSelect}
            onGifAddCaption={props.onGifAddCaption}
          />
        );
    }

    return undefined;
  }

  function stopPropagation(event: Event) {
    event.stopPropagation();
  }

  // Deviation: a function (tt had a constant): the content is rendered in one of two places, mobile or the menu.
  const renderMenuContent = () => (
    <>
      <div class="SymbolMenu-main" onClick={stopPropagation}>
        <Show when={shouldRenderTabs()}>
          <Transition
            name={resolveTransitionName('slide', props.animationLevel)}
            activeKey={activeTab()}
            renderCount={Object.values(SYMBOL_MENU_TAB_TITLES).length}
          >
            {renderContent}
          </Transition>
        </Show>
      </div>
      <Show when={isMobile()}>
        <Button
          round
          faded
          color="translucent"
          ariaLabel={lang('Close')}
          className="symbol-close-button"
          size="tiny"
          onClick={() => props.onClose()}
          iconName="close"
        />
      </Show>
      <SymbolMenuFooter
        activeTab={activeTab()}
        onSwitchTab={(tab) => setActiveTab(tab)}
        onRemoveSymbol={() => props.onRemoveSymbol()}
        isAttachmentModal={props.isAttachmentModal}
        canSendPlainText={props.canSendPlainText}
      />
    </>
  );

  const mobileClassName = createMemo(() =>
    buildClassName(
      'SymbolMenu mobile-menu',
      props.isLeftColumnShown && 'left-column-open',
      props.isAttachmentModal && 'in-attachment-modal',
      props.isMessageComposer && 'in-middle-column',
    ),
  );

  const positionOptions = createMemo<MenuPositionOptions>(() =>
    props.isAttachmentModal ? menuPositionOptions : { positionX: 'right', positionY: 'bottom' },
  );

  const renderMobileMenu = () => (
    <div ref={transition.ref} class={mobileClassName()}>
      {renderMenuContent()}
    </div>
  );

  return (
    <Show
      when={isMobile()}
      fallback={
        <Menu
          isOpen={props.isOpen}
          onClose={() => props.onClose()}
          withPortal={props.isAttachmentModal}
          className={buildClassName('SymbolMenu', props.className)}
          onCloseAnimationEnd={() => props.onClose()}
          onMouseEnter={!IS_TOUCH_ENV ? props.onMouseEnter : undefined}
          onMouseLeave={!IS_TOUCH_ENV ? props.onMouseLeave : undefined}
          noCloseOnBackdrop={!IS_TOUCH_ENV}
          noCompact
          {...positionOptions()}
        >
          {renderMenuContent()}
        </Menu>
      }
    >
      <Show when={transition.shouldRender()}>
        <Show when={!props.isAttachmentModal} fallback={renderMobileMenu()}>
          <Portal>{renderMobileMenu()}</Portal>
        </Show>
      </Show>
    </Show>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  return {
    isLeftColumnShown: selectTabState(global).isLeftColumnShown,
    isBackgroundTranslucent: selectIsContextMenuTranslucent(global),
    animationLevel: selectSharedSettings(global).animationLevel,
  };
};

export default SymbolMenu;

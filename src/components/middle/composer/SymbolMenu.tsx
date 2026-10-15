import { createEffect, createMemo, createMutationEffect, createSignal, requestMutation } from 'frameact';
import { splitProps } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';
import { createShowTransition } from '../../../lib/kit';
import { depsOf } from '../../../util/effectDeps';
import type { GlobalState } from '../../../global/types';

import type { ApiSticker, ApiVideo } from '../../../api/types';
import type { GlobalActions } from '../../../global';
import type { AnimationLevel, ThreadId } from '../../../types';
import type { MenuPositionOptions } from '../../ui/Menu';

import { selectIsContextMenuTranslucent, selectTabState } from '../../../global/selectors';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
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

  // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
  const { shouldRender, transitionClassNames } = createShowTransition({
    isOpen: () => props.isOpen,
    onCloseAnimationEnd: props.onClose,
    noMountTransition: false,
    className: false,
  });

  const lang = useOldLang();

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (!isActivated && props.isOpen) {
    isActivated = true;
  }

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
    depsOf(() => [props.isAttachmentModal, isMobile, props.isOpen] as const),
    ([isAttachmentModal2, , isOpen2]) => {
      if (!isMobile || !isOpen2 || isAttachmentModal2) {
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

  let recentEmojisRef = recentEmojis();
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  recentEmojisRef = recentEmojis();
  // TODO(codemod): dependency on a container (addRecentEmoji) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(
    depsOf(() => [props.isOpen, props.addRecentEmoji] as const),
    ([isOpen2, addRecentEmoji2]) => {
      if (!recentEmojisRef.length || isOpen2) {
        return;
      }

      recentEmojisRef.forEach((name) => {
        addRecentEmoji2({ emoji: name });
      });

      setRecentEmojis([]);
    },
  );

  const handleEmojiSelect = (emoji: string, name: string) => {
    setRecentEmojis((emojis) => [...emojis, name]);

    props.onEmojiSelect(emoji);
  };

  let recentCustomEmojisRef = recentCustomEmojis();
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  recentCustomEmojisRef = recentCustomEmojis();
  // TODO(codemod): dependency on a container (addRecentCustomEmoji) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(
    depsOf(() => [props.isOpen, props.addRecentCustomEmoji] as const),
    ([isOpen2, addRecentCustomEmoji2]) => {
      if (!recentCustomEmojisRef.length || isOpen2) {
        return;
      }

      recentCustomEmojisRef.forEach((documentId) => {
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

  function renderContent(isActive: boolean, isFrom: boolean) {
    switch (activeTab()) {
      case SymbolMenuTabs.Emoji:
        return (
          <EmojiPicker
            className="picker-tab"
            isHidden={!props.isOpen || !isActive}
            idPrefix={props.idPrefix}
            loadAndPlay={props.isOpen && (isActive || isFrom)}
            chatId={props.chatId}
            isTranslucent={!isMobile && props.isBackgroundTranslucent}
            onEmojiSelect={handleEmojiSelect}
            onCustomEmojiSelect={handleCustomEmojiSelect}
          />
        );
      case SymbolMenuTabs.Stickers:
        return (
          <StickerPicker
            className="picker-tab"
            isHidden={!props.isOpen || !isActive}
            loadAndPlay={props.canSendStickers ? props.isOpen && (isActive || isFrom) : false}
            idPrefix={props.idPrefix}
            canSendStickers={props.canSendStickers}
            noContextMenus={!props.isMessageComposer}
            chatId={props.chatId}
            threadId={props.threadId}
            isTranslucent={!isMobile && props.isBackgroundTranslucent}
            onStickerSelect={handleStickerSelect}
          />
        );
      case SymbolMenuTabs.GIFs:
        return (
          <GifPicker
            className="picker-tab"
            loadAndPlay={props.canSendGifs ? props.isOpen && (isActive || isFrom) : false}
            canSendGifs={props.canSendGifs}
            onGifSelect={props.onGifSelect}
            onGifAddCaption={props.onGifAddCaption}
          />
        );
    }

    return undefined;
  }

  function stopPropagation(event: any) {
    event.stopPropagation();
  }

  const content = (
    <>
      <div class="SymbolMenu-main" onClick={stopPropagation}>
        {isActivated && (
          // TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6)
          <Transition
            name={resolveTransitionName('slide', props.animationLevel)}
            activeKey={activeTab()}
            renderCount={Object.values(SYMBOL_MENU_TAB_TITLES).length}
          >
            {renderContent}
          </Transition>
        )}
      </div>
      {isMobile && (
        <Button
          round
          faded
          color="translucent"
          ariaLabel={lang('Close')}
          className="symbol-close-button"
          size="tiny"
          onClick={props.onClose}
          iconName="close"
        />
      )}
      <SymbolMenuFooter
        activeTab={activeTab()}
        onSwitchTab={setActiveTab}
        onRemoveSymbol={props.onRemoveSymbol}
        isAttachmentModal={props.isAttachmentModal}
        canSendPlainText={props.canSendPlainText}
      />
    </>
  );

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (isMobile) {
    if (!shouldRender()) {
      return undefined;
    }

    const mobileClassName = buildClassName(
      'SymbolMenu mobile-menu',
      transitionClassNames,
      props.isLeftColumnShown && 'left-column-open',
      props.isAttachmentModal && 'in-attachment-modal',
      props.isMessageComposer && 'in-middle-column',
    );

    if (props.isAttachmentModal) {
      return <div class={mobileClassName}>{content}</div>;
    }

    return (
      <Portal>
        <div class={mobileClassName}>{content}</div>
      </Portal>
    );
  }

  const positionOptions = createMemo<MenuPositionOptions>(() =>
    props.isAttachmentModal ? menuPositionOptions : { positionX: 'right', positionY: 'bottom' },
  );

  return (
    <Menu
      isOpen={props.isOpen}
      onClose={props.onClose}
      withPortal={props.isAttachmentModal}
      className={buildClassName('SymbolMenu', props.className)}
      onCloseAnimationEnd={props.onClose}
      onMouseEnter={!IS_TOUCH_ENV ? props.onMouseEnter : undefined}
      onMouseLeave={!IS_TOUCH_ENV ? props.onMouseLeave : undefined}
      noCloseOnBackdrop={!IS_TOUCH_ENV}
      noCompact
      {...positionOptions()}
    >
      {content}
    </Menu>
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

import { createEffect, createMemo, createSignal } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { getActions } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { ApiSticker, ApiVideo } from '../../../api/types';
import type { IAnchorPosition, ThreadId } from '../../../types';

import { EDITABLE_INPUT_CSS_SELECTOR, EDITABLE_INPUT_MODAL_CSS_SELECTOR } from '../../../config';
import buildClassName from '../../../util/buildClassName';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useMouseInside from '../../../hooks/useMouseInside';

import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import ResponsiveHoverButton from '../../ui/ResponsiveHoverButton';
import Spinner from '../../ui/Spinner';
import SymbolMenu from './SymbolMenu.async';

const MOBILE_KEYBOARD_HIDE_DELAY_MS = 100;

type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  isMobile?: boolean;
  isReady?: boolean;
  isSymbolMenuOpen?: boolean;
  canSendGifs?: boolean;
  canSendStickers?: boolean;
  isMessageComposer?: boolean;
  idPrefix: string;
  forceDarkTheme?: boolean;
  openSymbolMenu: VoidFunction;
  closeSymbolMenu: VoidFunction;
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
  onRemoveSymbol: VoidFunction;
  onEmojiSelect: (emoji: string) => void;
  closeBotCommandMenu?: VoidFunction;
  closeSendAsMenu?: VoidFunction;
  isSymbolMenuForced?: boolean;
  isAttachmentModal?: boolean;
  canSendPlainText?: boolean;
  className?: string;
  inputCssSelector?: string;
};

const SymbolMenuButton = (rawProps: OwnProps) => {
  const props = mergeProps({ inputCssSelector: EDITABLE_INPUT_CSS_SELECTOR }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'inputCssSelector'>>;
  const { addRecentEmoji, addRecentCustomEmoji } = getActions();

  let triggerRef!: HTMLDivElement;

  const [isSymbolMenuLoaded, onSymbolMenuLoadingComplete] = useFlag();
  const [contextMenuAnchor, setContextMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);

  const lang = useLang();

  const isMenuOpen = createMemo(() => props.isSymbolMenuOpen || Boolean(props.isSymbolMenuForced));
  const [handleMouseEnter, handleMouseLeave, markMouseInside] = useMouseInside(
    () => isMenuOpen(),
    props.closeSymbolMenu,
    undefined,
    () => props.isMobile,
  );

  createEffect(
    depsOf(() => [isMenuOpen(), markMouseInside] as const),
    ([isMenuOpen2, markMouseInside2]) => {
      if (isMenuOpen2) {
        markMouseInside2();
      }
    },
  );

  const symbolMenuButtonClassName = createMemo(() =>
    buildClassName(
      'composer-action-button mobile-symbol-menu-button',
      !props.isReady && 'not-ready',
      isSymbolMenuLoaded() ? props.isSymbolMenuOpen && 'menu-opened' : props.isSymbolMenuOpen && 'is-loading',
    ),
  );

  const handleActivateSymbolMenu = () => {
    props.closeBotCommandMenu?.();
    props.closeSendAsMenu?.();
    props.openSymbolMenu();
    const triggerEl = triggerRef;
    if (!triggerEl) return;
    const { x, y } = triggerEl.getBoundingClientRect();
    setContextMenuAnchor({ x, y });
  };

  const handleSymbolMenuOpen = () => {
    const messageInput = document.querySelector<HTMLDivElement>(
      props.isAttachmentModal ? EDITABLE_INPUT_MODAL_CSS_SELECTOR : props.inputCssSelector,
    );

    if (!props.isMobile || messageInput !== document.activeElement) {
      props.openSymbolMenu();
      return;
    }

    messageInput?.blur();
    setTimeout(() => {
      props.closeBotCommandMenu?.();
      props.openSymbolMenu();
    }, MOBILE_KEYBOARD_HIDE_DELAY_MS);
  };

  const getTriggerElement = () => triggerRef;
  const getRootElement = () => triggerRef?.closest('.custom-scroll, .no-scrollbar');
  const getMenuElement = () => document.querySelector('#portals .SymbolMenu .bubble');
  const getLayout = () => ({ withPortal: true });

  return (
    <>
      <SymbolMenu
        chatId={props.chatId}
        threadId={props.threadId}
        isOpen={props.isSymbolMenuOpen || Boolean(props.isSymbolMenuForced)}
        canSendGifs={props.canSendGifs}
        canSendStickers={props.canSendStickers}
        isMessageComposer={props.isMessageComposer}
        idPrefix={props.idPrefix}
        onLoad={onSymbolMenuLoadingComplete}
        onClose={props.closeSymbolMenu}
        onEmojiSelect={props.onEmojiSelect}
        onStickerSelect={props.onStickerSelect}
        onCustomEmojiSelect={props.onCustomEmojiSelect}
        onGifSelect={props.onGifSelect}
        onGifAddCaption={props.onGifAddCaption}
        onRemoveSymbol={props.onRemoveSymbol}
        addRecentEmoji={addRecentEmoji}
        addRecentCustomEmoji={addRecentCustomEmoji}
        isAttachmentModal={props.isAttachmentModal}
        canSendPlainText={props.canSendPlainText}
        className={buildClassName(props.className, props.forceDarkTheme && 'component-theme-dark')}
        anchor={props.isAttachmentModal ? contextMenuAnchor() : undefined}
        getTriggerElement={props.isAttachmentModal ? getTriggerElement : undefined}
        getRootElement={props.isAttachmentModal ? getRootElement : undefined}
        getMenuElement={props.isAttachmentModal ? getMenuElement : undefined}
        getLayout={props.isAttachmentModal ? getLayout : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {props.isMobile ? (
        <Button
          className={symbolMenuButtonClassName()}
          round
          color="translucent"
          onClick={props.isSymbolMenuOpen ? props.closeSymbolMenu : handleSymbolMenuOpen}
          ariaLabel={lang('AriaOpenSymbolMenu')}
        >
          <Icon name="smile" />
          <Icon name="keyboard" />
          {props.isSymbolMenuOpen && !isSymbolMenuLoaded() && <Spinner color="gray" />}
        </Button>
      ) : (
        <ResponsiveHoverButton
          className={buildClassName('composer-action-button symbol-menu-button', props.isSymbolMenuOpen && 'activated')}
          round
          color="translucent"
          onActivate={handleActivateSymbolMenu}
          ariaLabel={lang('AriaOpenSymbolMenu')}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={isMenuOpen() ? handleMouseLeave : undefined}
        >
          <div ref={triggerRef} class="symbol-menu-trigger" />
          <Icon name="smile" />
        </ResponsiveHoverButton>
      )}
    </>
  );
};

export default SymbolMenuButton;

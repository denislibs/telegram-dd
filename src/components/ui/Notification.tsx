import { createEffect, createMemo, createSignal } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions } from '../../global';

import type { ApiNotification } from '../../api/types';
import { isLangFnParam } from '../../util/localization/types';

import { ANIMATION_END_DELAY } from '../../config';
import { createShowTransition } from '../../lib/kit';
import buildClassName from '../../util/buildClassName';
import captureEscKeyListener from '../../util/captureEscKeyListener';
import { depsOf } from '../../util/effectDeps';
import { REM } from '../common/helpers/mediaDimensions';
import renderText from '../common/helpers/renderText';
import { renderTextWithEntities } from '../common/helpers/renderTextWithEntities';

import useLang from '../../hooks/useLang';

import CustomEmoji from '../common/CustomEmoji';
import Icon from '../common/icons/Icon';
import StarIcon from '../common/icons/StarIcon';
import Button from './Button';
import Portal from './Portal';
import RoundTimer from './RoundTimer';

import './Notification.scss';

const OPEN_DIALOG_SELECTOR = 'dialog[open]';

type OwnProps = {
  notification: ApiNotification;
};

const DEFAULT_DURATION = 3000;
const ANIMATION_DURATION = 150;
const CUSTOM_EMOJI_SIZE = 1.75 * REM;

const Notification = (props: OwnProps) => {
  const actions = getActions();

  const lang = useLang();

  const localId = () => props.notification.localId;
  const message = () => props.notification.message;
  const action = () => props.notification.action;
  const actionText = () => props.notification.actionText;
  const cacheBreaker = () => props.notification.cacheBreaker;
  const className = () => props.notification.className;
  const disableClickDismiss = () => props.notification.disableClickDismiss;
  const dismissAction = () => props.notification.dismissAction;
  const duration = () => (props.notification.duration === undefined ? DEFAULT_DURATION : props.notification.duration);
  const icon = () => props.notification.icon;
  const shouldUseCustomIcon = () => props.notification.shouldUseCustomIcon;
  const customEmojiIconId = () => props.notification.customEmojiIconId;
  const shouldShowTimer = () => props.notification.shouldShowTimer;
  const title = () => props.notification.title;
  const containerSelector = () => props.notification.containerSelector;

  const [isOpen, setIsOpen] = createSignal(true);

  // A modal `<dialog>` sits in the top layer, so a toast over it has to render inside the topmost one.
  // Picked once, on mount: moving the toast to another portal would restart its animation.
  const [portalElement, setPortalElement] = createSignal(
    (() => {
      if (containerSelector()) return undefined;

      const dialogs = document.querySelectorAll<HTMLDialogElement>(OPEN_DIALOG_SELECTOR);

      return dialogs[dialogs.length - 1];
    })(),
  );

  // The dialog would take the toast away with it when it closes, so the toast moves to the regular portal
  createEffect(
    () => portalElement(),
    (dialog) => {
      if (!dialog) return undefined;

      const handleDialogClose = () => setPortalElement(undefined);
      dialog.addEventListener('close', handleDialogClose);

      return () => dialog.removeEventListener('close', handleDialogClose);
    },
  );

  let actionActivationRef = false;
  let timerRef: number | undefined;
  const { ref: transitionRef } = createShowTransition({ isOpen: () => isOpen() });

  const handleDismiss = () => {
    actions.dismissNotification({ localId: localId() });
  };

  const closeAndDismiss = (force?: boolean) => {
    if (!force && disableClickDismiss()) return;
    setIsOpen(false);
    setTimeout(handleDismiss, ANIMATION_DURATION + ANIMATION_END_DELAY);
    if (dismissAction()) {
      // @ts-ignore
      actions[dismissAction().action](dismissAction().payload);
    }
  };

  const handleActionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (action() && !actionActivationRef) {
      actionActivationRef = true;
      if (Array.isArray(action())) {
        // @ts-ignore
        action().forEach((cb) => actions[cb.action](cb.payload));
      } else {
        // @ts-ignore
        actions[action().action](action().payload);
      }
    }
    if (disableClickDismiss()) {
      setIsOpen(false);
      setTimeout(handleDismiss, ANIMATION_DURATION + ANIMATION_END_DELAY);
    }
    closeAndDismiss();
  };

  const handleClick = () => {
    if (action() && !actionActivationRef) {
      actionActivationRef = true;
      if (Array.isArray(action())) {
        // @ts-ignore
        action().forEach((cb) => actions[cb.action](cb.payload));
      } else {
        // @ts-ignore
        actions[action().action](action().payload);
      }
    }
    closeAndDismiss();
  };

  createEffect(
    depsOf(() => [isOpen(), closeAndDismiss]),
    ([isOpened]) => (isOpened ? captureEscKeyListener(closeAndDismiss) : undefined),
  );

  createEffect(
    depsOf(() => [duration(), cacheBreaker()] as const),
    ([delay]) => {
      timerRef = window.setTimeout(() => closeAndDismiss(true), delay);

      return () => {
        if (timerRef) {
          clearTimeout(timerRef);
          timerRef = undefined;
        }
      };
    },
  ); // Reset timer if `cacheBreaker` changes

  const handleMouseEnter = () => {
    if (disableClickDismiss()) return;
    if (timerRef) {
      clearTimeout(timerRef);
      timerRef = undefined;
    }
  };

  const handleMouseLeave = () => {
    if (disableClickDismiss()) return;
    if (timerRef) {
      clearTimeout(timerRef);
    }
    timerRef = window.setTimeout(closeAndDismiss, duration());
  };

  const renderedTitle = createMemo(() => {
    const currentTitle = title();
    if (!currentTitle) return undefined;
    if (isLangFnParam(currentTitle)) {
      return lang.with(currentTitle);
    }

    return renderText(currentTitle, ['simple_markdown', 'emoji', 'br', 'links']);
  });

  const renderedMessage = createMemo(() => {
    const currentMessage = message();
    if (isLangFnParam(currentMessage)) {
      return lang.with(currentMessage);
    }

    if (typeof currentMessage === 'string') {
      if (props.notification.messageEntities) {
        return renderTextWithEntities({
          text: currentMessage,
          entities: props.notification.messageEntities,
        });
      }
      return renderText(currentMessage, ['simple_markdown', 'emoji', 'br', 'links']);
    }

    return currentMessage;
  });

  const renderedActionText = createMemo(() => {
    const currentActionText = actionText();
    if (!currentActionText) return undefined;
    if (isLangFnParam(currentActionText)) {
      return lang.with(currentActionText);
    }

    return currentActionText;
  });

  const renderedIcon = createMemo(() => {
    const documentId = customEmojiIconId();
    if (documentId) {
      return (
        <CustomEmoji className="notification-emoji-icon" forceAlways size={CUSTOM_EMOJI_SIZE} documentId={documentId} />
      );
    }

    if (shouldUseCustomIcon()) {
      if (icon() === 'star') {
        return <StarIcon type="gold" className={buildClassName('notification-icon')} size="adaptive" />;
      }
    }
    return <Icon name={icon() || 'info-filled'} className="notification-icon" />;
  });

  return (
    <Portal
      className={buildClassName('Notification-container', portalElement() && 'in-dialog')}
      containerSelector={containerSelector()}
      containerElement={portalElement()}
    >
      <div
        ref={transitionRef}
        class={buildClassName('Notification', className())}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {renderedIcon()}
        <div class="content">
          {Boolean(renderedTitle()) && <div class="notification-title">{renderedTitle()}</div>}
          {renderedMessage()}
        </div>
        {Boolean(renderedActionText()) && (
          <Button color="translucent-white" onClick={handleActionClick} className="notification-button">
            {renderedActionText()}
          </Button>
        )}
        {shouldShowTimer() && (
          // Deviation: `key={cacheBreaker}` remounts the timer; a fresh array per `cacheBreaker` change is the key.
          <Show when={[cacheBreaker()]} keyed>
            {() => <RoundTimer className="notification-timer" duration={Math.ceil(duration() / 1000)} />}
          </Show>
        )}
      </div>
    </Portal>
  );
};

export default Notification;

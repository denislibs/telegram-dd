import { createEffect, createMemo, createSignal } from 'frameact';
import { getActions } from '../../global';
import { createShowTransition } from '../../lib/kit';

import type { ApiNotification } from '../../api/types';
import { isLangFnParam } from '../../util/localization/types';

import { ANIMATION_END_DELAY } from '../../config';
import buildClassName from '../../util/buildClassName';
import captureEscKeyListener from '../../util/captureEscKeyListener';
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
  const isMessageLangFnParam = createMemo(() => isLangFnParam(message()));

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
    (portalElement) => {
      if (!portalElement) return undefined;

      const handleDialogClose = () => setPortalElement(undefined);
      portalElement.addEventListener('close', handleDialogClose);

      return () => portalElement.removeEventListener('close', handleDialogClose);
    },
  );

  let actionActivationRef = false;
  let timerRef: number | undefined;
  // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
  const { transitionClassNames } = createShowTransition({ isOpen: () => isOpen() });

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
    () => [isOpen(), closeAndDismiss],
    ([isOpen]) => (isOpen ? captureEscKeyListener(closeAndDismiss) : undefined),
  );

  createEffect(
    () => [duration(), cacheBreaker()],
    ([duration, cacheBreaker]) => {
      timerRef = window.setTimeout(() => closeAndDismiss(true), duration);

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
    if (!title()) return undefined;
    if (isLangFnParam(title())) {
      return lang.with(title());
    }

    return renderText(title(), ['simple_markdown', 'emoji', 'br', 'links']);
    // @ts-expect-error -- Lang Parameters are too complex
  });

  const renderedMessage = createMemo(() => {
    if (isMessageLangFnParam()) {
      return lang.with(message());
    }

    if (typeof message() === 'string') {
      if (props.notification.messageEntities) {
        return renderTextWithEntities({
          text: message(),
          entities: props.notification.messageEntities,
        });
      }
      return renderText(message(), ['simple_markdown', 'emoji', 'br', 'links']);
    }

    return message();
    // @ts-expect-error -- Lang Parameters are too complex
  });

  const renderedActionText = createMemo(() => {
    if (!actionText()) return undefined;
    if (isLangFnParam(actionText())) {
      return lang.with(actionText());
    }

    return actionText();
  });

  const renderedIcon = createMemo(() => {
    if (customEmojiIconId()) {
      return (
        <CustomEmoji
          className="notification-emoji-icon"
          forceAlways
          size={CUSTOM_EMOJI_SIZE}
          documentId={customEmojiIconId()}
        />
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
        class={buildClassName('Notification', transitionClassNames, className())}
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
          // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
          <RoundTimer className="notification-timer" key={cacheBreaker()} duration={Math.ceil(duration() / 1000)} />
        )}
      </div>
    </Portal>
  );
};

export default Notification;

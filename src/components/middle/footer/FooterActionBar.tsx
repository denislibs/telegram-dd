import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions } from '../../../global';

import type { IconName } from '../../../types/icons';

import { MUTE_INDEFINITE_TIMESTAMP, UNMUTE_TIMESTAMP } from '../../../config';
import buildClassName from '../../../util/buildClassName';

import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';

import styles from './FooterActionBar.module.scss';

type OwnProps = {
  chatId: string;
  isChannel?: boolean;
  canSubscribe?: boolean;
  shouldJoinToSend?: boolean;
  shouldSendJoinRequest?: boolean;
  canStartBot?: boolean;
  canRestartBot?: boolean;
  canUnblock?: boolean;
  isChannelMuteBar?: boolean;
  isMuted?: boolean;
  linkedMonoforumId?: string;
  areGiftsAvailable?: boolean;
  canUnpinAll?: boolean;
  pinnedMessagesCount?: number;
  canOpenSavedChat?: boolean;
  savedChatId?: string;
  onUnpinAll?: NoneToVoidFunction;
};

type MainButton = {
  key: string;
  label: string;
  iconName?: IconName;
  isPrimary: boolean;
  onClick: NoneToVoidFunction;
};

const FooterActionBar = (props: OwnProps) => {
  const { joinChannel, sendBotCommand, restartBot, unblockUser, updateChatMutedState, openChat, openGiftModal } =
    getActions();

  const lang = useLang();

  const handleSubscribeClick = () => {
    joinChannel({ chatId: props.chatId });
  };

  const handleStartBot = () => {
    sendBotCommand({ command: '/start' });
  };

  const handleRestartBot = () => {
    restartBot({ chatId: props.chatId });
  };

  const handleUnblock = () => {
    unblockUser({ userId: props.chatId });
  };

  const handleToggleMute = () => {
    updateChatMutedState({
      chatId: props.chatId,
      mutedUntil: props.isMuted ? UNMUTE_TIMESTAMP : MUTE_INDEFINITE_TIMESTAMP,
    });
  };

  const handleOpenDirect = () => {
    openChat({ id: props.linkedMonoforumId });
  };

  const handleOpenGift = () => {
    openGiftModal({ forUserId: props.chatId });
  };

  const handleOpenSavedChat = () => {
    openChat({ id: props.savedChatId! });
  };

  const mainButton = createMemo((): MainButton | undefined => {
    if (props.canUnpinAll) {
      return {
        key: 'unpinAll',
        label: lang(
          'ChatPinnedUnpinAll',
          { count: props.pinnedMessagesCount! },
          {
            pluralValue: props.pinnedMessagesCount!,
          },
        ),
        iconName: 'unpin',
        isPrimary: false,
        onClick: () => props.onUnpinAll!(),
      };
    }
    if (props.canOpenSavedChat) {
      return {
        key: 'openSavedChat',
        label: lang('SavedOpenChat'),
        isPrimary: true,
        onClick: handleOpenSavedChat,
      };
    }
    if (props.shouldSendJoinRequest) {
      return {
        key: 'ChannelJoinRequest',
        label: lang('ChannelJoinRequest'),
        isPrimary: true,
        onClick: handleSubscribeClick,
      };
    }
    if (props.canSubscribe || props.shouldJoinToSend) {
      return {
        key: props.isChannel ? 'ProfileJoinChannel' : 'ProfileJoinGroup',
        label: lang(props.isChannel ? 'ProfileJoinChannel' : 'ProfileJoinGroup'),
        isPrimary: true,
        onClick: handleSubscribeClick,
      };
    }
    if (props.canStartBot) {
      return { key: 'BotStart', label: lang('BotStart'), isPrimary: true, onClick: handleStartBot };
    }
    if (props.canRestartBot) {
      return { key: 'BotRestart', label: lang('BotRestart'), isPrimary: true, onClick: handleRestartBot };
    }
    if (props.canUnblock) {
      return { key: 'Unblock', label: lang('Unblock'), isPrimary: true, onClick: handleUnblock };
    }
    if (props.isChannelMuteBar) {
      return {
        key: props.isMuted ? 'ChatsUnmute' : 'ChatsMute',
        label: lang(props.isMuted ? 'ChatsUnmute' : 'ChatsMute'),
        isPrimary: false,
        onClick: handleToggleMute,
      };
    }

    return undefined;
  });
  // Deviation: tt gave the main button `key={mainButton.key}`: it is a new button when the key changes (and only then)
  const mainButtonKey = createMemo(() => mainButton()?.key);

  const withChannelSideActions = createMemo(() => !props.canUnpinAll && !props.canOpenSavedChat);
  const withDirect = createMemo(() => Boolean(withChannelSideActions() && props.isChannel && props.linkedMonoforumId));
  const withGift = createMemo(() => Boolean(withChannelSideActions() && props.isChannel && props.areGiftsAvailable));

  // Deviation: the "was it there on mount" refs are the values at the creation of the component (the appearing animation
  // plays only for a side button that comes later)
  const hadDirectOnMount = withDirect();
  const hadGiftOnMount = withGift();

  const directClassName = createMemo(() => buildClassName(styles.sideButton, !hadDirectOnMount && styles.appearing));
  const giftClassName = createMemo(() => buildClassName(styles.sideButton, !hadGiftOnMount && styles.appearing));

  return (
    <Show when={mainButton()}>
      <div class={styles.root} data-footer-action-bar dir={lang.isRtl ? 'rtl' : undefined}>
        <div class={styles.plate}>
          <Show when={withDirect()}>
            <div class={styles.sideSlot}>
              <Button
                round
                color="translucent"
                className={directClassName()}
                ariaLabel={lang('ChannelSendMessage')}
                iconName="direct"
                onClick={handleOpenDirect}
              />
            </div>
          </Show>
          <Show when={mainButtonKey()} keyed>
            {(_key) => (
              <Button
                fluid
                ripple
                color={mainButton()!.isPrimary ? 'primary' : 'secondary'}
                className={styles.centerButton}
                size="smaller"
                iconName={mainButton()!.iconName}
                noForcedUpperCase
                onClick={() => mainButton()!.onClick()}
              >
                {mainButton()!.label}
              </Button>
            )}
          </Show>
          <Show when={withGift()}>
            <div class={styles.sideSlot}>
              <Button
                round
                color="translucent"
                className={giftClassName()}
                ariaLabel={lang('ProfileSendAGift')}
                iconName="gift"
                onClick={handleOpenGift}
              />
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default FooterActionBar;

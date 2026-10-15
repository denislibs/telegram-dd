import { createEffect, createMemo } from 'frameact';
import { getActions, withGlobal } from '../../../global';

import type { ApiChatMember, ApiMessage, ApiPeer } from '../../../api/types';
import type { GlobalState } from '../../../global/types';

import { EDITABLE_INPUT_CSS_SELECTOR, MESSAGE_APPEARANCE_DELAY } from '../../../config';
import { createShowTransition } from '../../../lib/kit';
import {
  getMainUsername,
  isAnonymousForwardsChat,
  isAnonymousOwnMessage,
  isChatBasicGroup,
  isChatChannel,
  isSystemBot,
} from '../../../global/helpers';
import { isApiPeerUser } from '../../../global/helpers/peers';
import {
  selectCanBanUsers,
  selectChat,
  selectChatFullInfo,
  selectForwardedSender,
  selectIsChatWithSelf,
  selectSender,
} from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';

import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';

import Avatar from '../../common/Avatar';
import Menu from '../../ui/Menu';
import MenuItem from '../../ui/MenuItem';

import styles from './SenderGroupContainer.module.scss';

type OwnProps = {
  message: ApiMessage;
  withAvatar?: boolean;
  children: React.ReactNode;
  id: string;
  appearanceOrder: number;
  canPost?: boolean;
};

type StateProps = {
  sender?: ApiPeer;
  canShowSender: boolean;
  originSender?: ApiPeer;
  isChatWithSelf?: boolean;
  isRepliesChat?: boolean;
  isAnonymousForwards?: boolean;
  isChannel?: boolean;
  canRemoveSender?: boolean;
  kickedMembers?: ApiChatMember[];
  chatMembers?: ApiChatMember[];
};

const SenderGroupContainer = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { openChat, updateInsertingPeerIdMention, openMiddleSearch, openDeleteMemberModal } = getActions();

  const forwardInfo = () => props.message.forwardInfo;

  const messageSender = createMemo(() => (props.canShowSender ? props.sender : undefined));
  const lang = useLang();

  const canBanSender = createMemo(() => {
    const sender = props.sender;
    if (!props.canRemoveSender || !sender) {
      return false;
    }

    const isRemoved =
      props.kickedMembers?.some((m) => m.userId === sender.id) ||
      (props.chatMembers && isApiPeerUser(sender) && !props.chatMembers.some((m) => m.userId === sender.id));

    return !isRemoved;
  });

  const noAppearanceAnimation = createMemo(() => props.appearanceOrder <= 0);
  const [isShown, markShown] = useFlag(noAppearanceAnimation());
  createEffect(
    depsOf(() => [props.appearanceOrder, noAppearanceAnimation()] as const),
    ([appearanceOrder2, noAppearanceAnimation2]) => {
      if (noAppearanceAnimation2) {
        return;
      }

      // Message appearance animation works only if this timeout is not cleared
      setTimeout(markShown, appearanceOrder2 * MESSAGE_APPEARANCE_DELAY);
    },
  );

  const shouldPreferOriginSender = createMemo(
    () =>
      forwardInfo() && (props.isChatWithSelf || props.isRepliesChat || props.isAnonymousForwards || !messageSender()),
  );
  const avatarPeer = createMemo(() => (shouldPreferOriginSender() ? props.originSender : messageSender()));
  const isAvatarPeerUser = createMemo(() => {
    const peer = avatarPeer();
    return peer && isApiPeerUser(peer);
  });

  const handleOpenChat = () => {
    const peer = avatarPeer();
    if (!peer) {
      return;
    }

    openChat({ id: peer.id });
  };

  const handleMention = () => {
    const peer = avatarPeer();
    if (!peer) {
      return;
    }

    const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
    if (messageInput) {
      updateInsertingPeerIdMention({ peerId: peer.id });
    }
  };

  const handleSearchMessages = () => {
    const peer = avatarPeer();
    if (!peer) {
      return;
    }

    openMiddleSearch({ fromPeerId: peer.id });
  };

  const handleBanClick = () => {
    const sender = props.sender;
    if (!sender) {
      return;
    }

    openDeleteMemberModal({ chatId: props.message.chatId, peerId: sender.id });
  };

  const handleAvatarClick = () => {
    handleOpenChat();
  };

  // Deviation: the avatar element is kept in a variable (`avatarRef` is the transition's callback ref here) for the
  // context menu handlers and the menu trigger.
  let avatarElement: HTMLDivElement | undefined;

  const { ref: avatarTransitionRef, shouldRender } = createShowTransition({
    isOpen: () => props.withAvatar && isShown(),
    noMountTransition: isShown(),
  });

  const { isContextMenuOpen, contextMenuAnchor, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(() => avatarElement);

  const getTriggerElement = () => avatarElement;
  const getRootElement = () => document.querySelector<HTMLElement>('.Transition_slide-active > .MessageList');
  const getMenuElement = () =>
    document.querySelector('#portals')?.querySelector<HTMLElement>(`.${styles.contextMenu} .bubble`);
  const getLayout = () => ({ withPortal: true });

  const canMention = createMemo(() => {
    const peer = avatarPeer();
    return props.canPost && peer && (isAvatarPeerUser() || Boolean(getMainUsername(peer)));
  });
  const canSearch = createMemo(() => !props.isChannel);
  const shouldRenderContextMenu = createMemo(
    () => Boolean(contextMenuAnchor()) && (isAvatarPeerUser() || canMention() || canSearch() || canBanSender()),
  );

  function renderContextMenu() {
    return (
      <Menu
        isOpen={isContextMenuOpen()}
        anchor={contextMenuAnchor()}
        getTriggerElement={getTriggerElement}
        getRootElement={getRootElement}
        getLayout={getLayout}
        getMenuElement={getMenuElement}
        className={styles.contextMenu}
        onClose={handleContextMenuClose}
        onCloseAnimationEnd={handleContextMenuHide}
        withPortal
        autoClose
      >
        <>
          {isAvatarPeerUser() && (
            <MenuItem icon="message" onClick={handleOpenChat}>
              {lang('SendMessage')}
            </MenuItem>
          )}
          {canMention() && (
            <MenuItem icon="mention" onClick={handleMention}>
              {lang('ContextMenuItemMention')}
            </MenuItem>
          )}
          {canSearch() && (
            <MenuItem icon="search" onClick={handleSearchMessages}>
              {lang('Search')}
            </MenuItem>
          )}
          {canBanSender() && (
            <MenuItem icon="delete-user" destructive onClick={handleBanClick}>
              {lang('ContextRemoveFromGroup')}
            </MenuItem>
          )}
        </>
      </Menu>
    );
  }

  // Deviation: tt built the avatar element on each render. Here `renderAvatar` reads nothing (the props of `Avatar` are getters),
  // so the element stays when the profile of the sender is updated (`avatarPeer()` is the store object of the user)
  const hiddenName = createMemo(() => (!avatarPeer() && forwardInfo() ? forwardInfo()!.hiddenUserName : undefined));

  function renderAvatar() {
    return (
      <Avatar
        size="small"
        className={styles.senderAvatar}
        peer={avatarPeer()}
        text={hiddenName()}
        onClick={avatarPeer() ? handleAvatarClick : undefined}
        onContextMenu={handleContextMenu}
      />
    );
  }

  const className = buildClassName('sender-group-container', styles.root);

  return (
    <div id={props.id} class={className}>
      {shouldRender() && (
        <div
          ref={(el) => {
            avatarElement = el;
            avatarTransitionRef(el);
          }}
          class={styles.avatarContainer}
        >
          {renderAvatar()}
          {shouldRenderContextMenu() && renderContextMenu()}
        </div>
      )}
      {props.children}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, ownProps: OwnProps): Complete<StateProps> => {
  const { message, withAvatar } = ownProps;
  const { chatId } = message;

  const chat = selectChat(global, chatId);
  const isChatWithSelf = selectIsChatWithSelf(global, chatId);
  const isSystemBotChat = isSystemBot(chatId);
  const isAnonymousForwards = isAnonymousForwardsChat(chatId);

  const forceSenderName = !isChatWithSelf && isAnonymousOwnMessage(message);
  const canShowSender = withAvatar || forceSenderName;
  const sender = selectSender(global, message);
  const originSender = selectForwardedSender(global, message);

  const fullInfo = selectChatFullInfo(global, chatId);
  const canBanUsers = selectCanBanUsers(global, chatId);
  const isSenderAdmin = Boolean(sender && fullInfo?.adminMembersById?.[sender.id]);
  const canBanTarget = chat?.isOwner || (Boolean(fullInfo?.adminMembersById) && !isSenderAdmin);
  const isSenderRemovable = Boolean(
    sender && sender.id !== chatId && sender.id !== fullInfo?.linkedChatId && sender.id !== chat?.linkedMonoforumId,
  );
  const canRemoveSender = Boolean(
    sender &&
    sender.id !== global.currentUserId &&
    chat &&
    !isChatChannel(chat) &&
    !isChatWithSelf &&
    isSenderRemovable &&
    canBanUsers &&
    canBanTarget,
  );

  const members = fullInfo?.members;
  const isMemberListComplete = Boolean(
    chat &&
    members &&
    (isChatBasicGroup(chat) || (chat.membersCount !== undefined && members.length >= chat.membersCount)),
  );

  return {
    sender,
    canShowSender,
    originSender,
    isChatWithSelf,
    isRepliesChat: isSystemBotChat,
    isAnonymousForwards,
    isChannel: chat && isChatChannel(chat),
    canRemoveSender,
    kickedMembers: canRemoveSender ? fullInfo?.kickedMembers : undefined,
    chatMembers: canRemoveSender && isMemberListComplete ? members : undefined,
  };
};

export default SenderGroupContainer;

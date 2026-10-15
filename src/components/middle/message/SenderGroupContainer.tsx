import { createEffect, createMemo } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import { createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type { ApiChatMember, ApiMessage, ApiPeer } from '../../../api/types';

import { EDITABLE_INPUT_CSS_SELECTOR, MESSAGE_APPEARANCE_DELAY } from '../../../config';
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

  const source = createMemo(() => props.message);
  const forwardInfo = () => source().forwardInfo;

  const messageSender = createMemo(() => props.canShowSender ? props.sender : undefined);
  const lang = useLang();

  const canBanSender = createMemo(() => {
    if (!props.canRemoveSender || !props.sender) {
      return false;
    }

    const isRemoved =
      props.kickedMembers?.some((m) => m.userId === props.sender.id) ||
      (props.chatMembers && isApiPeerUser(props.sender) && !props.chatMembers.some((m) => m.userId === props.sender.id));

    return !isRemoved;
  });

  const noAppearanceAnimation = createMemo(() => props.appearanceOrder <= 0);
  const [isShown, markShown] = useFlag(noAppearanceAnimation());
  createEffect(depsOf(() => [props.appearanceOrder, noAppearanceAnimation()] as const), ([appearanceOrder2, noAppearanceAnimation2]) => {
    if (noAppearanceAnimation2) {
      return;
    }

    // Message appearance animation works only if this timeout is not cleared
    setTimeout(markShown, appearanceOrder2 * MESSAGE_APPEARANCE_DELAY);
  });

  const shouldPreferOriginSender =
    createMemo(() => forwardInfo() && (props.isChatWithSelf || props.isRepliesChat || props.isAnonymousForwards || !messageSender()));
  const avatarPeer = createMemo(() => shouldPreferOriginSender() ? props.originSender : messageSender());
  const isAvatarPeerUser = createMemo(() => avatarPeer() && isApiPeerUser(avatarPeer()));

  const handleOpenChat = () => {
    if (!avatarPeer()) {
      return;
    }

    openChat({ id: avatarPeer().id });
  };

  const handleMention = () => {
    if (!avatarPeer()) {
      return;
    }

    const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
    if (messageInput) {
      updateInsertingPeerIdMention({ peerId: avatarPeer().id });
    }
  };

  const handleSearchMessages = () => {
    if (!avatarPeer()) {
      return;
    }

    openMiddleSearch({ fromPeerId: avatarPeer().id });
  };

  const handleBanClick = () => {
    if (!props.sender) {
      return;
    }

    openDeleteMemberModal({ chatId: props.message.chatId, peerId: props.sender.id });
  };

  const handleAvatarClick = () => {
    handleOpenChat();
  };

  const { ref: avatarRef, shouldRender } = createShowTransition({
    isOpen: () => props.withAvatar && isShown(),
    noMountTransition: isShown(),
  });

  const { isContextMenuOpen, contextMenuAnchor, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(avatarRef);

  // TODO(codemod): avatarRef is a callback ref now: keep the element in a let assigned from ref={(el) => { avatarRef(el); element = el; }}
  const getTriggerElement = () => avatarRef.current;
  const getRootElement = () => document.querySelector('.Transition_slide-active > .MessageList');
  const getMenuElement = () =>
    document.querySelector('#portals')?.querySelector(`.${styles.contextMenu} .bubble`);
  const getLayout = () => ({ withPortal: true });

  const canMention = createMemo(() => props.canPost && avatarPeer() && (isAvatarPeerUser() || Boolean(getMainUsername(avatarPeer()))));
  const canSearch = createMemo(() => !props.isChannel);
  const shouldRenderContextMenu =
    createMemo(() => Boolean(contextMenuAnchor) && (isAvatarPeerUser() || canMention() || canSearch() || canBanSender()));

  function renderContextMenu() {
    return (
      <Menu
        isOpen={isContextMenuOpen}
        anchor={contextMenuAnchor}
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

  function renderAvatar() {
    const hiddenName = !avatarPeer() && forwardInfo() ? forwardInfo().hiddenUserName : undefined;

    return (
      <Avatar
        size="small"
        className={styles.senderAvatar}
        peer={avatarPeer()}
        text={hiddenName}
        onClick={avatarPeer() ? handleAvatarClick : undefined}
        onContextMenu={handleContextMenu}
      />
    );
  }

  const className = buildClassName('sender-group-container', styles.root);

  return (
    <div id={props.id} class={className}>
      {shouldRender() && (
        <div ref={avatarRef} class={styles.avatarContainer}>
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

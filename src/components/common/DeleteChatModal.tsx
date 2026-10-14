import { createMemo } from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import type { GlobalState } from '../../global/types';

import {
  getChatTitle,
  getUserFirstOrLastName,
  isChatBasicGroup,
  isChatChannel,
  isChatSuperGroup,
  isUserBot,
} from '../../global/helpers';
import { selectIsChatWithSelf, selectUser } from '../../global/selectors';
import { isUserId } from '../../util/entities/ids';
import renderText from './helpers/renderText';

import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';

import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Avatar from './Avatar';

import './DeleteChatModal.scss';

export type OwnProps = {
  isOpen: boolean;
  chat: ApiChat;
  isSavedDialog?: boolean;
  onClose: () => void;
  onCloseAnimationEnd?: () => void;
};

type StateProps = {
  isChannel: boolean;
  isChatWithSelf?: boolean;
  isBot?: boolean;
  isPrivateChat: boolean;
  isBasicGroup: boolean;
  isSuperGroup: boolean;
  currentUserId: string | undefined;
  canDeleteForAll?: boolean;
  contactName?: string;
};

const DeleteChatModal = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    leaveChannel,
    leaveBasicGroup,
    deleteHistory,
    deleteSavedHistory,
    deleteChannel,
    deleteChatUser,
    blockUser,
    deleteChat,
  } = getActions();

  const oldLang = useOldLang();
  const lang = useLang();
  const chatTitle = createMemo(() => getChatTitle(lang, props.chat));

  const handleDeleteForAll = () => {
    deleteHistory({ chatId: props.chat.id, shouldDeleteForAll: true });

    props.onClose();
  };

  const handleDeleteAndStop = () => {
    deleteHistory({ chatId: props.chat.id, shouldDeleteForAll: true });
    blockUser({ userId: props.chat.id });

    props.onClose();
  };

  const handleDeleteChat = () => {
    if (props.isSavedDialog) {
      deleteSavedHistory({ chatId: props.chat.id });
    } else if (props.isPrivateChat) {
      deleteHistory({ chatId: props.chat.id, shouldDeleteForAll: false });
    } else if (props.isBasicGroup) {
      if (props.chat.isOwner) {
        deleteHistory({ chatId: props.chat.id, shouldDeleteForAll: true });
        deleteChat({ chatId: props.chat.id });
      } else {
        deleteHistory({ chatId: props.chat.id, shouldDeleteForAll: false });
        deleteChatUser({ chatId: props.chat.id, userId: props.currentUserId! });
      }
    } else if ((props.isChannel || props.isSuperGroup) && !props.chat.isOwner) {
      leaveChannel({ chatId: props.chat.id });
    } else if ((props.isChannel || props.isSuperGroup) && props.chat.isOwner) {
      deleteChannel({ chatId: props.chat.id });
    }
    props.onClose();
  };

  const handleLeaveChat = () => {
    if (props.isChannel || props.isSuperGroup) {
      leaveChannel({ chatId: props.chat.id });
      props.onClose();
    } else if (props.isBasicGroup && props.chat.isOwner) {
      leaveBasicGroup({ chatId: props.chat.id });
      props.onClose();
    } else {
      handleDeleteChat();
    }
  };

  function renderHeader() {
    return (
      <div class="modal-header" dir={lang.isRtl ? 'rtl' : undefined}>
        <Avatar size="tiny" peer={props.chat} isSavedMessages={props.isChatWithSelf} />
        <h3 class="modal-title">{oldLang(renderTitle())}</h3>
      </div>
    );
  }

  function renderTitle() {
    if (props.isSavedDialog) {
      return props.isChatWithSelf ? 'ClearHistoryMyNotesTitle' : 'ClearHistoryTitleSingle2';
    }

    if (props.isChannel && !props.chat.isOwner) {
      return 'LeaveChannel';
    }

    if (props.isChannel && props.chat.isOwner) {
      return 'ChannelDelete';
    }

    if (props.isBasicGroup || props.isSuperGroup) {
      return 'Group.LeaveGroup';
    }

    return 'DeleteChatUser';
  }

  function renderContent() {
    if (props.isSavedDialog) {
      return (
        <p>
          {renderText(
            props.isChatWithSelf
              ? oldLang('ClearHistoryMyNotesMessage')
              : oldLang('ClearHistoryMessageSingle', chatTitle()),
            ['simple_markdown', 'emoji'],
          )}
        </p>
      );
    }
    if (props.isChannel && props.chat.isOwner) {
      return (
        <p>
          {renderText(oldLang('ChatList.DeleteAndLeaveGroupConfirmation', chatTitle()), ['simple_markdown', 'emoji'])}
        </p>
      );
    }

    if ((props.isChannel && !props.chat.isOwner) || props.isBasicGroup || props.isSuperGroup) {
      return <p>{renderText(oldLang('ChannelLeaveAlertWithName', chatTitle()), ['simple_markdown', 'emoji'])}</p>;
    }

    return (
      <p>{renderText(oldLang('ChatList.DeleteChatConfirmation', props.contactName), ['simple_markdown', 'emoji'])}</p>
    );
  }

  function renderActionText() {
    if (props.isSavedDialog) {
      return 'Delete';
    }

    if (props.isChannel && !props.chat.isOwner) {
      return 'LeaveChannel';
    }
    if (props.isChannel && props.chat.isOwner) {
      return 'Chat.Input.Delete';
    }

    if (props.isBasicGroup || props.isSuperGroup) {
      return 'Group.LeaveGroup';
    }

    return props.canDeleteForAll ? 'ChatList.DeleteForCurrentUser' : 'Delete';
  }

  return (
    <Modal
      isOpen={props.isOpen}
      className="DeleteChatModal"
      header={renderHeader()}
      onClose={props.onClose}
      onCloseAnimationEnd={props.onCloseAnimationEnd}
    >
      {renderContent()}
      <div class="dialog-buttons-column">
        {props.isBot && !props.isSavedDialog && (
          <Button color="danger" className="confirm-dialog-button" isText onClick={handleDeleteAndStop}>
            {oldLang('DeleteAndStop')}
          </Button>
        )}
        {props.canDeleteForAll && (
          <Button color="danger" className="confirm-dialog-button" isText onClick={handleDeleteForAll}>
            {props.contactName
              ? renderText(oldLang('ChatList.DeleteForEveryone', props.contactName))
              : oldLang('DeleteForAll')}
          </Button>
        )}
        {!props.isPrivateChat && props.chat.isOwner && !props.isSavedDialog && (
          <Button color="danger" className="confirm-dialog-button" isText onClick={handleDeleteChat}>
            {oldLang('DeleteForAll')}
          </Button>
        )}
        <Button
          color="danger"
          className="confirm-dialog-button"
          isText
          onClick={props.isPrivateChat || props.isSavedDialog ? handleDeleteChat : handleLeaveChat}
        >
          {oldLang(renderActionText())}
        </Button>
        <Button className="confirm-dialog-button" isText onClick={props.onClose}>
          {oldLang('Cancel')}
        </Button>
      </div>
    </Modal>
  );
};

const mapStateToProps = (global: GlobalState, { chat, isSavedDialog }: OwnProps): Complete<StateProps> => {
  const isPrivateChat = isUserId(chat.id);
  const isChatWithSelf = selectIsChatWithSelf(global, chat.id);
  const user = selectUser(global, chat.id);
  const isBot = user && isUserBot(user) && !chat.isSupport;
  const canDeleteForAll = isPrivateChat && !isChatWithSelf && !isBot && !isSavedDialog;
  const contactName = isPrivateChat ? getUserFirstOrLastName(user) : undefined;

  return {
    isPrivateChat,
    isChatWithSelf,
    isBot,
    isChannel: isChatChannel(chat),
    isBasicGroup: isChatBasicGroup(chat),
    isSuperGroup: isChatSuperGroup(chat),
    currentUserId: global.currentUserId,
    canDeleteForAll,
    contactName,
  };
};

export default DeleteChatModal;

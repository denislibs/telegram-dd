import { createEffect, createMemo, currentOrPrev, frozenWhile } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, getGlobal, trackGlobal, withGlobal } from '../../../global';

import type {
  ApiChat,
  ApiInputDraftReplyInfo,
  ApiInputSuggestedPostInfo,
  ApiMessage,
  ApiPeer,
} from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { MessageListType, ThemeKey, ThreadId } from '../../../types/index';

import { createShowTransition } from '../../../lib/kit';
import { canEditMediaInEditor, isChatChannel, stripCustomEmoji } from '../../../global/helpers';
import {
  selectCanAnimateInterface,
  selectChat,
  selectChatMessage,
  selectChatMessageOrEphemeral,
  selectEditingMessage,
  selectEphemeralMessage,
  selectForwardedSender,
  selectIsChatWithSelf,
  selectIsCurrentUserPremium,
  selectSender,
  selectTabState,
  selectTheme,
} from '../../../global/selectors';
import { selectIsMediaNsfw } from '../../../global/selectors/media';
import { selectDraft, selectEditingId, selectEditingScheduledId } from '../../../global/selectors/threads';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { depsOf } from '../../../util/effectDeps';
import { unique } from '../../../util/iteratees';

import useAppLayout from '../../../hooks/useAppLayout';
import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';
import usePeerColor from '../../../hooks/usePeerColor';

import EmbeddedMessage from '../../common/embedded/EmbeddedMessage';
import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import Menu from '../../ui/Menu';
import MenuItem from '../../ui/MenuItem';
import MenuSeparator from '../../ui/MenuSeparator';

import './ComposerEmbeddedMessage.scss';

type StateProps = {
  replyInfo?: ApiInputDraftReplyInfo;
  suggestedPostInfo?: ApiInputSuggestedPostInfo;
  editingId?: number;
  message?: ApiMessage;
  sender?: ApiPeer;
  shouldAnimate?: boolean;
  forwardedMessagesCount?: number;
  noAuthors?: boolean;
  noCaptions?: boolean;
  forwardsHaveCaptions?: boolean;
  isCurrentUserPremium?: boolean;
  isContextMenuDisabled?: boolean;
  isReplyToDiscussion?: boolean;
  isInChangingRecipientMode?: boolean;
  shouldPreventComposerAnimation?: boolean;
  senderChat?: ApiChat;
  isSenderChannel?: boolean;
  currentUserId?: string;
  forwardMessageIds?: number[];
  fromChatId?: string;
  isMediaNsfw?: boolean;
  theme: ThemeKey;
};

type OwnProps = {
  shouldForceShowEditing?: boolean;
  isHidden?: boolean;
  chatId: string;
  threadId: ThreadId;
  messageListType: MessageListType;
  // `wasEditing`: whether a message was being edited when the bar was cleared (the store no longer says so once the
  // editing id has been reset right below, tt's closure still did).
  onClear?: (wasEditing: boolean) => void;
  onIsOpenChange?: (isOpen: boolean) => void;
};

const CLOSE_DURATION = 350;

const ComposerEmbeddedMessage = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);

  const {
    resetDraftReplyInfo,
    resetDraftSuggestedPostInfo,
    updateDraftReplyInfo,
    setEditingId,
    focusMessage,
    changeRecipient,
    openChatOrTopicWithReplyInDraft,
    setForwardNoAuthors,
    setForwardNoCaptions,
    exitForwardMode,
    setShouldPreventComposerAnimation,
    openSuggestMessageModal,
    requestMessageMediaEditor,
  } = getActions();
  let ref: HTMLDivElement | undefined;
  const oldLang = useOldLang();
  const lang = useLang();
  const { isMobile } = useAppLayout();

  const isReplyToTopicStart = createMemo(() => props.message?.content.action?.type === 'topicCreate');
  const isShowingSuggestedPost = createMemo(() => Boolean(props.suggestedPostInfo) && !props.shouldForceShowEditing);
  const isForwarding = createMemo(() => Boolean(props.forwardedMessagesCount));

  const selectSenderFromForwardedMessage = (forwardedMessage: ApiMessage) => {
    const global = getGlobal();
    let localSender = selectForwardedSender(global, forwardedMessage);
    if (!localSender) {
      localSender = selectSender(global, forwardedMessage);
    }
    return localSender;
  };

  // Deviation: `trackGlobal` makes the `getGlobal()` reads subscribe the memo to the messages and senders it touches
  // (tt re-ran it only when `forwardMessageIds`/`fromChatId` changed).
  const forwardSenders = createMemo(() =>
    trackGlobal(() => {
      if (!isForwarding()) return undefined;
      const forwardedMessages = props.forwardMessageIds
        ?.map((id) => selectChatMessageOrEphemeral(getGlobal(), props.fromChatId!, id))
        .filter(Boolean);
      const senders = forwardedMessages?.map((m) => selectSenderFromForwardedMessage(m)).filter(Boolean);
      return senders ? unique(senders) : undefined;
    }),
  );

  const isShown = createMemo(() => {
    if (props.isInChangingRecipientMode) return false;
    if (props.message && (props.replyInfo || props.editingId)) return true;
    if (props.replyInfo?.type === 'ephemeral') return true;
    if (forwardSenders() && isForwarding()) return true;
    if (isShowingSuggestedPost()) return true;
    return false;
  });
  const isOpen = createMemo(() => isShown() && !isReplyToTopicStart() && !props.isReplyToDiscussion && !props.isHidden);

  createEffect(
    depsOf(() => [isOpen(), props.onIsOpenChange] as const),
    ([isOpen2, onIsOpenChange2]) => {
      onIsOpenChange2?.(isOpen2);
      return () => onIsOpenChange2?.(false);
    },
  );

  // Deviation: `useShowTransitionDeprecated` is `createShowTransition`: it writes the state classes (`opacity-transition
  // fast shown open ...`) through its `ref` instead of returning `transitionClassNames`.
  const {
    ref: transitionRef,
    shouldRender,
    isClosing,
  } = createShowTransition({
    isOpen,
    noMountTransition: !props.shouldAnimate,
    noCloseTransition: () => !props.shouldAnimate,
    closeDuration: CLOSE_DURATION,
    noOpenTransition: () => !props.shouldAnimate,
  });

  // Deviation: `useFrozenProps(props, isClosing)` is `frozenWhile` over a snapshot of the props the component freezes.
  const frozen = frozenWhile(
    () => ({
      chatId: props.chatId,
      currentUserId: props.currentUserId,
      theme: props.theme,
      onClear: props.onClear,
      isCurrentUserPremium: props.isCurrentUserPremium,
      isContextMenuDisabled: props.isContextMenuDisabled,
      shouldPreventComposerAnimation: props.shouldPreventComposerAnimation,
      sender: props.sender,
      senderChat: props.senderChat,
      isMediaNsfw: props.isMediaNsfw,
      noAuthors: props.noAuthors,
      noCaptions: props.noCaptions,
      forwardsHaveCaptions: props.forwardsHaveCaptions,
      forwardedMessagesCount: props.forwardedMessagesCount,
      message: props.message,
      shouldForceShowEditing: props.shouldForceShowEditing,
      suggestedPostInfo: props.suggestedPostInfo,
      replyInfo: props.replyInfo,
      editingId: props.editingId,
      isSenderChannel: props.isSenderChannel,
    }),
    isClosing,
  );
  const chatId = () => frozen().chatId;
  const currentUserId = () => frozen().currentUserId;
  const theme = () => frozen().theme;
  const onClear = () => frozen().onClear;
  const isCurrentUserPremium = () => frozen().isCurrentUserPremium;
  const isContextMenuDisabled = () => frozen().isContextMenuDisabled;
  const shouldPreventComposerAnimation = () => frozen().shouldPreventComposerAnimation;
  const sender = () => frozen().sender;
  const senderChat = () => frozen().senderChat;
  const isMediaNsfw = () => frozen().isMediaNsfw;
  const noAuthors = () => frozen().noAuthors;
  const noCaptions = () => frozen().noCaptions;
  const forwardsHaveCaptions = () => frozen().forwardsHaveCaptions;
  const frozenForwardedMessagesCount = () => frozen().forwardedMessagesCount;
  const frozenMessage = () => frozen().message;
  const frozenShouldForceShowEditing = () => frozen().shouldForceShowEditing;
  const frozenSuggestedPostInfo = () => frozen().suggestedPostInfo;
  const frozenReplyInfo = () => frozen().replyInfo;
  const frozenEditingId = () => frozen().editingId;
  const isSenderChannel = () => frozen().isSenderChannel;

  const isForwardingRendering = createMemo(() => Boolean(frozenForwardedMessagesCount()));
  const hasManyForwardedMessages = () => (frozenForwardedMessagesCount() ?? 0) > 1;
  const isShowingReplyRendering = createMemo(() => Boolean(frozenReplyInfo()) && !frozenShouldForceShowEditing());
  const frozenReplyQuoteText = createMemo(() => {
    const replyInfo = frozenReplyInfo();
    return replyInfo?.type === 'message' ? replyInfo.quoteText : undefined;
  });
  const isReplyWithQuoteRendering = createMemo(() => Boolean(frozenReplyQuoteText()));
  const isShowingSuggestedPostRendering = createMemo(
    () => Boolean(frozenSuggestedPostInfo()) && !frozenShouldForceShowEditing(),
  );

  const canMediaBeEdited = createMemo(() => {
    const message = frozenMessage();
    return Boolean(message && canEditMediaInEditor(message) && !isMobile());
  });

  // tt ran this effect after every render; it depends on the (frozen) flag it reads.
  createEffect(
    () => shouldPreventComposerAnimation(),
    (shouldPreventComposerAnimation2) => {
      if (shouldPreventComposerAnimation2) {
        setShouldPreventComposerAnimation({ shouldPreventComposerAnimation: false });
      }
    },
  );

  const clearEmbedded = () => {
    const wasEditing = Boolean(frozenEditingId());
    if (wasEditing) {
      setEditingId({ messageId: undefined });
    } else if (frozenForwardedMessagesCount()) {
      exitForwardMode();
    } else if (isShowingSuggestedPostRendering()) {
      resetDraftSuggestedPostInfo();
      resetDraftReplyInfo();
    } else if (frozenReplyInfo() && !frozenShouldForceShowEditing()) {
      resetDraftReplyInfo();
    }
    onClear()?.(wasEditing);
  };

  createEffect(
    depsOf(() => [isShown(), props.isHidden] as const),
    ([isShown2, isHidden2]) => (isShown2 && !isHidden2 ? captureEscKeyListener(clearEmbedded) : undefined),
  );

  const { isContextMenuOpen, contextMenuAnchor, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(() => ref);

  const focusMessageFromDraft = () => {
    const message = frozenMessage()!;
    focusMessage({ chatId: message.chatId, messageId: message.id, noForumTopicPanel: true });
  };
  const handleMessageClick = (e: React.MouseEvent): void => {
    if (frozenSuggestedPostInfo()) {
      openSuggestMessageModal({ chatId: chatId() });
      return;
    }
    handleContextMenu(e);
  };

  const handlePictogramClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const message = frozenMessage();
    if (message && (frozenEditingId() || frozenReplyInfo()?.type === 'message') && canMediaBeEdited()) {
      requestMessageMediaEditor({ chatId: message.chatId, messageId: message.id });
      return;
    }
  };

  const handleClearClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
    e.stopPropagation();
    clearEmbedded();
    handleContextMenuHide();
  };
  const buildAutoCloseMenuItemHandler = (action: NoneToVoidFunction) => {
    return () => {
      handleContextMenuClose();
      action();
    };
  };
  const handleForwardToAnotherChatClick = buildAutoCloseMenuItemHandler(changeRecipient);
  const handleShowMessageClick = buildAutoCloseMenuItemHandler(focusMessageFromDraft);
  const handleRemoveQuoteClick = buildAutoCloseMenuItemHandler(() => updateDraftReplyInfo({ quoteText: undefined }));
  const handleChangeReplyRecipientClick = buildAutoCloseMenuItemHandler(changeRecipient);
  const handleReplyInSenderChat = () => {
    handleContextMenuClose();
    const sender2 = sender();
    if (!sender2) return;
    openChatOrTopicWithReplyInDraft({ chatId: sender2.id });
  };
  const handleDoNotReplyClick = buildAutoCloseMenuItemHandler(clearEmbedded);

  const handleIconKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleContextMenu(e as unknown as React.MouseEvent);
    }
  };

  const getTriggerElement = () => ref;
  const getRootElement = () => ref!;
  const getMenuElement = () => ref!.querySelector<HTMLElement>('.forward-context-menu .bubble');

  createEffect(
    () => shouldRender(),
    (shouldRender2) => {
      if (!shouldRender2) {
        handleContextMenuClose();
        handleContextMenuHide();
      }
    },
  );

  const peerColor = usePeerColor({
    peer: sender,
    theme,
  });
  const innerClassName = createMemo(() => buildClassName('ComposerEmbeddedMessage_inner', peerColor().className));

  const leftIcon = createMemo(() => {
    if (frozenEditingId()) {
      return 'edit';
    }
    if (isShowingSuggestedPostRendering()) {
      return 'cash-circle';
    }
    if (isForwardingRendering()) {
      return 'forward';
    }
    if (isShowingReplyRendering()) {
      return 'reply';
    }

    return undefined;
  });

  const customText = createMemo(() =>
    !frozenMessage() && frozenReplyInfo()?.type === 'ephemeral'
      ? lang('EphemeralReplyUnavailable')
      : hasManyForwardedMessages()
        ? oldLang('ForwardedMessageCount', frozenForwardedMessagesCount())
        : undefined,
  );

  const strippedMessage = createMemo(() => {
    const message = frozenMessage();
    if (!message || !isForwardingRendering() || !message.content.text || !noAuthors() || isCurrentUserPremium()) {
      return message;
    }

    const strippedText = stripCustomEmoji(message.content.text);
    return {
      ...message,
      content: {
        ...message.content,
        text: strippedText,
      },
    };
  });

  const renderingLeftIcon = currentOrPrev(leftIcon, { skipUndefined: true });

  const canReplyInSenderChat = createMemo(() => {
    const sender2 = sender();
    return Boolean(sender2 && !isSenderChannel() && chatId() !== sender2.id && sender2.id !== currentUserId());
  });

  return (
    <Show when={shouldRender()}>
      <div
        class="ComposerEmbeddedMessage"
        ref={(el) => {
          ref = el;
          transitionRef(el);
        }}
        onContextMenu={handleContextMenu}
      >
        <div class={innerClassName()} style={peerColor().style}>
          <div
            class="embedded-left-icon"
            role="button"
            tabIndex={0}
            onClick={handleContextMenu}
            onKeyDown={handleIconKeyDown}
          >
            <Show when={renderingLeftIcon()}>
              <Icon name={renderingLeftIcon()!} />
            </Show>
            <Show when={Boolean(frozenReplyQuoteText())}>
              <Icon name="quote" className="quote-reply" />
            </Show>
          </div>
          <EmbeddedMessage
            isOpen={isShown()}
            className="inside-input"
            replyInfo={frozenReplyInfo()}
            suggestedPostInfo={frozenSuggestedPostInfo()}
            isMediaNsfw={isMediaNsfw()}
            isInComposer
            message={strippedMessage()}
            sender={!noAuthors() ? sender() : undefined}
            composerForwardSenders={forwardSenders()}
            customText={customText()}
            noCaptions={noCaptions()}
            title={
              frozenEditingId() && !isShowingReplyRendering()
                ? oldLang('EditMessage')
                : noAuthors()
                  ? oldLang('HiddenSendersNameDescription')
                  : undefined
            }
            onClick={handleMessageClick}
            onPictogramClick={canMediaBeEdited() ? handlePictogramClick : undefined}
            pictogramActionIcon={canMediaBeEdited() ? 'edit' : undefined}
            senderChat={senderChat()}
          />
          <Button
            className="embedded-cancel"
            round
            faded
            color="translucent"
            ariaLabel={oldLang('Cancel')}
            onClick={handleClearClick}
            iconName="close"
          />
          <Show when={(isShowingReplyRendering() || isForwardingRendering()) && !isContextMenuDisabled()}>
            <Menu
              isOpen={isContextMenuOpen()}
              anchor={contextMenuAnchor()}
              getTriggerElement={getTriggerElement}
              getRootElement={getRootElement}
              getMenuElement={getMenuElement}
              className="forward-context-menu"
              onClose={handleContextMenuClose}
              onCloseAnimationEnd={handleContextMenuHide}
            >
              <Show when={isForwardingRendering()}>
                <MenuItem
                  icon={!noAuthors() ? 'check' : undefined}
                  customIcon={noAuthors() ? <Icon name="placeholder" /> : undefined}
                  onClick={() =>
                    setForwardNoAuthors({
                      noAuthors: false,
                    })
                  }
                >
                  {oldLang(hasManyForwardedMessages() ? 'ShowSenderNames' : 'ShowSendersName')}
                </MenuItem>
                <MenuItem
                  icon={noAuthors() ? 'check' : undefined}
                  customIcon={!noAuthors() ? <Icon name="placeholder" /> : undefined}
                  onClick={() =>
                    setForwardNoAuthors({
                      noAuthors: true,
                    })
                  }
                >
                  {oldLang(hasManyForwardedMessages() ? 'HideSenderNames' : 'HideSendersName')}
                </MenuItem>
                <Show when={forwardsHaveCaptions()}>
                  <MenuSeparator />
                  <MenuItem
                    icon={!noCaptions() ? 'check' : undefined}
                    customIcon={noCaptions() ? <Icon name="placeholder" /> : undefined}
                    onClick={() =>
                      setForwardNoCaptions({
                        noCaptions: false,
                      })
                    }
                  >
                    {oldLang(hasManyForwardedMessages() ? 'Conversation.ForwardOptions.ShowCaption' : 'ShowCaption')}
                  </MenuItem>
                  <MenuItem
                    icon={noCaptions() ? 'check' : undefined}
                    customIcon={!noCaptions() ? <Icon name="placeholder" /> : undefined}
                    onClick={() =>
                      setForwardNoCaptions({
                        noCaptions: true,
                      })
                    }
                  >
                    {oldLang(hasManyForwardedMessages() ? 'Conversation.ForwardOptions.HideCaption' : 'HideCaption')}
                  </MenuItem>
                </Show>
                <MenuSeparator />
                <MenuItem icon="replace" onClick={handleForwardToAnotherChatClick}>
                  {oldLang('ForwardAnotherChat')}
                </MenuItem>
              </Show>
              <Show when={isShowingReplyRendering()}>
                <MenuItem icon="show-message" onClick={handleShowMessageClick}>
                  {oldLang('Message.Context.Goto')}
                </MenuItem>
                <Show when={isReplyWithQuoteRendering()}>
                  <MenuItem icon="remove-quote" onClick={handleRemoveQuoteClick}>
                    {oldLang('RemoveQuote')}
                  </MenuItem>
                </Show>
                <Show when={canReplyInSenderChat()}>
                  <MenuItem icon="user" onClick={handleReplyInSenderChat}>
                    {lang('ReplyInPrivateMessage')}
                  </MenuItem>
                </Show>
                <MenuItem icon="replace" onClick={handleChangeReplyRecipientClick}>
                  {oldLang('ReplyToAnotherChat')}
                </MenuItem>
                <MenuItem icon="delete" onClick={handleDoNotReplyClick}>
                  {oldLang('DoNotReply')}
                </MenuItem>
              </Show>
            </Menu>
          </Show>
        </div>
      </div>
    </Show>
  );
};

const mapStateToProps = (
  global: GlobalState,
  { shouldForceShowEditing, chatId, threadId, messageListType }: OwnProps,
): Complete<StateProps> => {
  const {
    forwardMessages: { fromChatId, toChatId, messageIds: forwardMessageIds, noAuthors, noCaptions },
    isShareMessageModalShown: isModalShown,
    shouldPreventComposerAnimation,
  } = selectTabState(global);

  const editingId =
    messageListType === 'scheduled'
      ? selectEditingScheduledId(global, chatId)
      : selectEditingId(global, chatId, threadId);
  const shouldAnimate = selectCanAnimateInterface(global) && !shouldPreventComposerAnimation;
  const isForwarding = toChatId === chatId;
  const forwardedMessages = forwardMessageIds
    ?.map((id) => selectChatMessageOrEphemeral(global, fromChatId!, id))
    .filter(Boolean);

  const draft = selectDraft(global, chatId, threadId);
  const replyInfo = draft?.replyInfo;
  const suggestedPostInfo = draft?.suggestedPostInfo;
  const replyToPeerId = replyInfo?.type === 'message' ? replyInfo.replyToPeerId : undefined;
  const senderChat = replyToPeerId ? selectChat(global, replyToPeerId) : undefined;

  let message: ApiMessage | undefined;
  if (editingId) {
    message = selectEditingMessage(global, chatId, threadId, messageListType);
  } else if (isForwarding && forwardMessageIds!.length === 1) {
    message = forwardedMessages?.[0];
  } else if (replyInfo && !shouldForceShowEditing) {
    message =
      replyInfo.type === 'ephemeral'
        ? selectEphemeralMessage(global, chatId, replyInfo.replyToMsgId)
        : selectChatMessage(global, replyInfo.replyToPeerId || chatId, replyInfo.replyToMsgId);
  }

  let sender: ApiPeer | undefined;

  const selectSenderFromForwardedMessage = (forwardedMessage: ApiMessage) => {
    sender = selectForwardedSender(global, forwardedMessage);
    if (!sender) {
      sender = selectSender(global, forwardedMessage);
    }
    return sender;
  };

  if (editingId && message) {
    sender = selectSender(global, message);
  } else if (isForwarding) {
    let forwardSenders = forwardedMessages?.map((m) => selectSenderFromForwardedMessage(m)).filter(Boolean);
    forwardSenders = forwardSenders ? unique(forwardSenders) : undefined;
    sender = forwardSenders?.length === 1 ? forwardSenders?.[0] : undefined;
  } else if (replyInfo && message && !shouldForceShowEditing) {
    const { forwardInfo } = message;
    const isChatWithSelf = selectIsChatWithSelf(global, chatId);
    if (forwardInfo && (forwardInfo.isChannelPost || isChatWithSelf)) {
      sender = selectForwardedSender(global, message);
    }

    const quoteText = replyInfo.type === 'message' ? replyInfo.quoteText : undefined;
    if (!sender && (!forwardInfo?.hiddenUserName || Boolean(quoteText))) {
      sender = selectSender(global, message);
    }
  }

  const chat = sender && selectChat(global, sender.id);
  const isSenderChannel = chat && isChatChannel(chat);

  const forwardsHaveCaptions = forwardedMessages?.some(
    (forward) => forward?.content.text && Object.keys(forward.content).length > 1,
  );

  const isContextMenuDisabled =
    replyInfo?.type === 'ephemeral' ||
    (isForwarding && forwardMessageIds!.length === 1 && Boolean(message?.content.storyData));

  const isReplyToDiscussion = replyInfo?.type !== 'ephemeral' && replyInfo?.replyToMsgId === threadId && !replyToPeerId;

  const isMediaNsfw = message && selectIsMediaNsfw(global, message);

  return {
    replyInfo,
    suggestedPostInfo,
    editingId,
    message,
    sender,
    shouldAnimate,
    forwardedMessagesCount: isForwarding ? forwardMessageIds!.length : undefined,
    noAuthors,
    noCaptions,
    forwardsHaveCaptions,
    isCurrentUserPremium: selectIsCurrentUserPremium(global),
    isContextMenuDisabled,
    isReplyToDiscussion,
    isInChangingRecipientMode: isModalShown,
    shouldPreventComposerAnimation,
    senderChat,
    currentUserId: global.currentUserId,
    isSenderChannel,
    forwardMessageIds,
    fromChatId,
    isMediaNsfw,
    theme: selectTheme(global),
  };
};

export default ComposerEmbeddedMessage;

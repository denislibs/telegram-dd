import { createEffect, createMemo, currentOrPrev, frozenWhile } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, getGlobal, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import { createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type {
  ApiChat,
  ApiInputDraftReplyInfo,
  ApiInputSuggestedPostInfo,
  ApiMessage,
  ApiPeer,
} from '../../../api/types';
import type { MessageListType, ThemeKey, ThreadId } from '../../../types/index';

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
  onClear?: NoneToVoidFunction;
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
  let ref!: HTMLDivElement;
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

  const forwardSenders = createMemo(() => {
    if (!isForwarding()) return undefined;
    const forwardedMessages = props.forwardMessageIds
      // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
      ?.map((id) => selectChatMessageOrEphemeral(getGlobal(), props.fromChatId!, id))
      .filter(Boolean);
    const senders = forwardedMessages?.map((m) => selectSenderFromForwardedMessage(m)).filter(Boolean);
    return senders ? unique(senders) : undefined;
  });

  const isShown = createMemo(() =>
    (() => {
      if (props.isInChangingRecipientMode) return false;
      if (props.message && (props.replyInfo || props.editingId)) return true;
      if (props.replyInfo?.type === 'ephemeral') return true;
      if (forwardSenders() && isForwarding()) return true;
      if (isShowingSuggestedPost()) return true;
      return false;
    })(),
  );
  const isOpen = createMemo(() => isShown() && !isReplyToTopicStart() && !props.isReplyToDiscussion && !props.isHidden);

  createEffect(
    depsOf(() => [isOpen(), props.onIsOpenChange] as const),
    ([isOpen2, onIsOpenChange2]) => {
      onIsOpenChange2?.(isOpen2);
      return () => onIsOpenChange2?.(false);
    },
  );

  // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
  const { shouldRender, transitionClassNames, isClosing } = createShowTransition({
    isOpen: () => isOpen(),
    noMountTransition: !props.shouldAnimate,
    noCloseTransition: () => !props.shouldAnimate,
    closeDuration: CLOSE_DURATION,
    noOpenTransition: () => !props.shouldAnimate,
  });

  const frozen = frozenWhile(
    () => props,
    () => isClosing(),
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
  const isShowingReplyRendering = createMemo(() => Boolean(frozenReplyInfo()) && !frozenShouldForceShowEditing());
  const frozenReplyQuoteText = createMemo(() =>
    frozenReplyInfo()?.type === 'message' ? frozenReplyInfo().quoteText : undefined,
  );
  const isReplyWithQuoteRendering = createMemo(() => Boolean(frozenReplyQuoteText()));
  const isShowingSuggestedPostRendering = createMemo(
    () => Boolean(frozenSuggestedPostInfo()) && !frozenShouldForceShowEditing(),
  );

  const canMediaBeEdited = createMemo(() => frozenMessage() && canEditMediaInEditor(frozenMessage()) && !isMobile);

  // TODO(codemod): useEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
    () => {
      if (shouldPreventComposerAnimation()) {
        setShouldPreventComposerAnimation({ shouldPreventComposerAnimation: false });
      }
    },
  );

  const clearEmbedded = () => {
    if (frozenEditingId()) {
      setEditingId({ messageId: undefined });
    } else if (frozenForwardedMessagesCount()) {
      exitForwardMode();
    } else if (isShowingSuggestedPostRendering()) {
      resetDraftSuggestedPostInfo();
      resetDraftReplyInfo();
    } else if (frozenReplyInfo() && !frozenShouldForceShowEditing()) {
      resetDraftReplyInfo();
    }
    onClear()?.();
  };

  createEffect(
    depsOf(() => [isShown(), props.isHidden, clearEmbedded] as const),
    ([isShown2, isHidden2]) => (isShown2 && !isHidden2 ? captureEscKeyListener(clearEmbedded) : undefined),
  );

  const { isContextMenuOpen, contextMenuAnchor, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(() => ref);

  const focusMessageFromDraft = () => {
    focusMessage({ chatId: frozenMessage()!.chatId, messageId: frozenMessage()!.id, noForumTopicPanel: true });
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
    if ((frozenEditingId() || frozenReplyInfo()?.type === 'message') && canMediaBeEdited()) {
      requestMessageMediaEditor({ chatId: frozenMessage().chatId, messageId: frozenMessage().id });
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
    if (!sender()) return;
    openChatOrTopicWithReplyInDraft({ chatId: sender().id });
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
  const getMenuElement = () => ref!.querySelector('.forward-context-menu .bubble');

  createEffect(
    depsOf(() => [handleContextMenuClose, handleContextMenuHide, shouldRender()] as const),
    ([, , shouldRender2]) => {
      if (!shouldRender2) {
        handleContextMenuClose();
        handleContextMenuHide();
      }
    },
  );

  const className = buildClassName('ComposerEmbeddedMessage', transitionClassNames);

  const peerColorResult = createMemo(() =>
    usePeerColor({
      peer: sender(),
      theme: theme(),
    }),
  );
  const peerColorClass = () => peerColorResult().className;
  const peerColorStyle = () => peerColorResult().style;
  const innerClassName = createMemo(() => buildClassName('ComposerEmbeddedMessage_inner', peerColorClass()));

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
      : frozenForwardedMessagesCount() && frozenForwardedMessagesCount() > 1
        ? oldLang('ForwardedMessageCount', frozenForwardedMessagesCount())
        : undefined,
  );

  const strippedMessage = createMemo(() => {
    if (
      !frozenMessage() ||
      !isForwardingRendering() ||
      !frozenMessage().content.text ||
      !noAuthors() ||
      isCurrentUserPremium()
    )
      return frozenMessage();

    const strippedText = stripCustomEmoji(frozenMessage().content.text);
    return {
      ...frozenMessage(),
      content: {
        ...frozenMessage().content,
        text: strippedText,
      },
    };
  });

  const renderingLeftIcon = currentOrPrev(() => leftIcon(), { skipUndefined: true });

  const canReplyInSenderChat = createMemo(
    () => sender() && !isSenderChannel() && chatId() !== sender().id && sender().id !== currentUserId(),
  );

  return (
    <Show when={shouldRender()}>
      <div class={className} ref={ref} onContextMenu={handleContextMenu}>
        <div class={innerClassName()} style={peerColorStyle()}>
          <div
            class="embedded-left-icon"
            role="button"
            tabIndex={0}
            onClick={handleContextMenu}
            onKeyDown={handleIconKeyDown}
          >
            {renderingLeftIcon() && <Icon name={renderingLeftIcon()} />}
            {Boolean(frozenReplyQuoteText()) && <Icon name="quote" className="quote-reply" />}
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
          {(isShowingReplyRendering() || isForwardingRendering()) && !isContextMenuDisabled() && (
            <Menu
              isOpen={isContextMenuOpen}
              anchor={contextMenuAnchor}
              getTriggerElement={getTriggerElement}
              getRootElement={getRootElement}
              getMenuElement={getMenuElement}
              className="forward-context-menu"
              onClose={handleContextMenuClose}
              onCloseAnimationEnd={handleContextMenuHide}
            >
              {isForwardingRendering() && (
                <>
                  <MenuItem
                    icon={!noAuthors() ? 'check' : undefined}
                    customIcon={noAuthors() ? <Icon name="placeholder" /> : undefined}

                    onClick={() =>
                      setForwardNoAuthors({
                        noAuthors: false,
                      })
                    }
                  >
                    {oldLang(frozenForwardedMessagesCount() > 1 ? 'ShowSenderNames' : 'ShowSendersName')}
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
                    {oldLang(frozenForwardedMessagesCount() > 1 ? 'HideSenderNames' : 'HideSendersName')}
                  </MenuItem>
                  {forwardsHaveCaptions() && (
                    <>
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
                        {oldLang(
                          frozenForwardedMessagesCount() > 1
                            ? 'Conversation.ForwardOptions.ShowCaption'
                            : 'ShowCaption',
                        )}
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
                        {oldLang(
                          frozenForwardedMessagesCount() > 1
                            ? 'Conversation.ForwardOptions.HideCaption'
                            : 'HideCaption',
                        )}
                      </MenuItem>
                    </>
                  )}
                  <MenuSeparator />
                  <MenuItem icon="replace" onClick={handleForwardToAnotherChatClick}>
                    {oldLang('ForwardAnotherChat')}
                  </MenuItem>
                </>
              )}
              {isShowingReplyRendering() && (
                <>
                  <MenuItem icon="show-message" onClick={handleShowMessageClick}>
                    {oldLang('Message.Context.Goto')}
                  </MenuItem>
                  {isReplyWithQuoteRendering() && (
                    <MenuItem icon="remove-quote" onClick={handleRemoveQuoteClick}>
                      {oldLang('RemoveQuote')}
                    </MenuItem>
                  )}
                  {canReplyInSenderChat() && (
                    <MenuItem icon="user" onClick={handleReplyInSenderChat}>
                      {lang('ReplyInPrivateMessage')}
                    </MenuItem>
                  )}
                  <MenuItem icon="replace" onClick={handleChangeReplyRecipientClick}>
                    {oldLang('ReplyToAnotherChat')}
                  </MenuItem>
                  <MenuItem icon="delete" onClick={handleDoNotReplyClick}>
                    {oldLang('DoNotReply')}
                  </MenuItem>
                </>
              )}
            </Menu>
          )}
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

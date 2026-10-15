import { createEffect, createMemo, createSignal, requestMeasure, requestNextMutation } from 'frameact';
import { getActions } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';

import type { ApiDraft, ApiInputRichMessage, ApiMessage } from '../../../../api/types';
import type { EditingDraft, MessageListType, ThreadId } from '../../../../types';
import { ApiMessageEntityTypes } from '../../../../api/types';

import { EDITABLE_INPUT_CSS_SELECTOR } from '../../../../config';
import { hasMessageMedia } from '../../../../global/helpers';
import focusEditableElement from '../../../../util/focusEditableElement';
import { buildRichMessageFromFormatted, getRichInputAsFormatted } from '../../../ui/textInput/richText';

import { useDebouncedResolver } from '../../../../hooks/useAsyncResolvers';
import useBackgroundMode from '../../../../hooks/window/useBackgroundMode';
import useBeforeUnload from '../../../../hooks/window/useBeforeUnload';

const URL_ENTITIES = new Set<string>([ApiMessageEntityTypes.TextUrl, ApiMessageEntityTypes.Url]);
const DEBOUNCE_MS = 300;

// TODO(codemod): useEditing: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useEditing = (
  richMessage: ApiInputRichMessage | undefined,
  replaceRichMessage: (richMessage?: ApiInputRichMessage) => void,
  editedMessage: ApiMessage | undefined,
  resetComposer: (shouldPreserveInput?: boolean, shouldSkipCollapseLatch?: boolean) => void,
  validateTextLength: (text: string) => boolean,
  chatId: string,
  threadId: ThreadId,
  type: MessageListType,
  draft?: ApiDraft,
  editingDraft?: EditingDraft,
): [VoidFunction, VoidFunction, boolean] => {
  const { editMessage, setEditingDraft, toggleMessageWebPage, openDeleteMessageModal } = getActions();
  const [shouldForceShowEditing, setShouldForceShowEditing] = createSignal(false);

  const replyingToId = draft?.replyInfo?.replyToMsgId;

  createEffect(
    depsOf(() => [editedMessage, replyingToId, editingDraft, replaceRichMessage]),
    (_deps, prev) => {
      const [prevEditedMessage, prevReplyingToId] = prev ?? [];
      if (!editedMessage) {
        return;
      }

      if (replyingToId && prevReplyingToId !== replyingToId) {
        replaceRichMessage(undefined);
        setShouldForceShowEditing(false);
        return;
      }

      if (prevEditedMessage?.id === editedMessage.id && replyingToId === prevReplyingToId) {
        return;
      }

      const restoredRichMessage =
        editingDraft?.richMessage ||
        (editingDraft?.text?.length ? buildRichMessageFromFormatted(editingDraft) : undefined);
      const nextRichMessage =
        !prevEditedMessage && restoredRichMessage
          ? restoredRichMessage
          : editedMessage.content.richMessage || buildRichMessageFromFormatted(editedMessage.content.text);

      replaceRichMessage(nextRichMessage);
      setShouldForceShowEditing(true);

      requestNextMutation(() => {
        const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
        if (messageInput) {
          focusEditableElement(messageInput, true);
        }
      });
    },
  );

  createEffect(
    depsOf(() => [chatId, threadId, editedMessage]),
    () => {
      if (!editedMessage) {
        return;
      }

      const shouldSetNoWebPage =
        !('webPage' in editedMessage.content) &&
        editedMessage.content.text?.entities?.some((entity) => URL_ENTITIES.has(entity.type));

      toggleMessageWebPage({
        chatId,
        threadId,
        noWebPage: shouldSetNoWebPage,
      });
    },
  );

  const saveEditingDraft = (scopedChatId: string, scopedThreadId: ThreadId, scopedType: MessageListType) => {
    setEditingDraft({
      chatId: scopedChatId,
      threadId: scopedThreadId,
      type: scopedType,
      draft: buildEditingDraft(richMessage),
    });
  };

  createEffect(
    depsOf(() => [chatId, editedMessage, threadId, type]),
    () => (editedMessage ? () => saveEditingDraft(chatId, threadId, type) : undefined),
  );

  const detectLinkDebounced = useDebouncedResolver(
    () => {
      if (!editedMessage) return false;

      const edited = richMessage ? getRichInputAsFormatted(richMessage) : undefined;
      return (
        !('webPage' in editedMessage.content) &&
        editedMessage.content.text?.entities?.some((entity) => URL_ENTITIES.has(entity.type)) &&
        !edited?.entities?.some((entity) => URL_ENTITIES.has(entity.type))
      );
    },
    [editedMessage, richMessage],
    DEBOUNCE_MS,
    true,
  );

  const getShouldResetNoWebPageDebounced = createMemo(detectLinkDebounced);

  createEffect(
    depsOf(() => [editedMessage, chatId, threadId, getShouldResetNoWebPageDebounced()]),
    (_deps, prev) => {
      const [prevEditedMessage] = prev ?? [];
      if (!editedMessage || prevEditedMessage?.id !== editedMessage.id) {
        return;
      }

      if (getShouldResetNoWebPageDebounced()()) {
        toggleMessageWebPage({
          chatId,
          threadId,
          noWebPage: false,
        });
      }
    },
  );

  const restoreNewDraftAfterEditing = () => {
    if (!draft) return;

    // Run one frame after editing draft reset
    requestMeasure(() => {
      replaceRichMessage(draft.richMessage || buildRichMessageFromFormatted(draft.text));

      // Wait one more frame until new editor content is rendered
      requestNextMutation(() => {
        const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
        if (messageInput) {
          focusEditableElement(messageInput, true);
        }
      });
    });
  };

  const handleEditCancel = () => {
    resetComposer(false, true);
    setEditingDraft({ chatId, threadId, type, draft: undefined });
    restoreNewDraftAfterEditing();
  };

  const handleEditComplete = () => {
    const { text, entities } = richMessage ? getRichInputAsFormatted(richMessage) || { text: '' } : { text: '' };

    if (!editedMessage) {
      return;
    }

    if (!text && !hasMessageMedia(editedMessage)) {
      openDeleteMessageModal({
        chatId,
        messageIds: [editedMessage.id],
        isSchedule: type === 'scheduled',
      });
      return;
    }

    if (text && !validateTextLength(text)) {
      return;
    }

    editMessage({
      messageList: { chatId, threadId, type },
      text,
      entities,
    });

    resetComposer(false, true);
    setEditingDraft({ chatId, threadId, type, draft: undefined });
    restoreNewDraftAfterEditing();
  };

  const handleBlur = () => {
    if (!editedMessage) return;

    setEditingDraft({
      chatId,
      threadId,
      type,
      draft: buildEditingDraft(richMessage),
    });
  };

  useBackgroundMode(handleBlur);
  useBeforeUnload(handleBlur);

  return [handleEditComplete, handleEditCancel, shouldForceShowEditing];
};

function buildEditingDraft(richMessage: ApiInputRichMessage | undefined): EditingDraft | undefined {
  if (!richMessage) return undefined;

  const formattedMessage = getRichInputAsFormatted(richMessage);
  if (formattedMessage?.text.length) return formattedMessage;
  if (formattedMessage || !richMessage.blocks.length) return undefined;

  return {
    richMessage,
  };
}

export default useEditing;

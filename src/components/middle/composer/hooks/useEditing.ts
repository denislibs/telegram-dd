import { type Accessor, createEffect, createSignal, requestMeasure, requestNextMutation } from 'frameact';
import { forceMeasure } from 'frameact/stricterdom';
import { getActions } from '../../../../global';

import type { ApiDraft, ApiInputRichMessage, ApiMessage } from '../../../../api/types';
import type { EditingDraft, MessageListType, ThreadId } from '../../../../types';
import type { ComposerScope } from './useDraft';
import { ApiMessageEntityTypes } from '../../../../api/types';

import { EDITABLE_INPUT_CSS_SELECTOR } from '../../../../config';
import { hasMessageMedia } from '../../../../global/helpers';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';
import focusEditableElement from '../../../../util/focusEditableElement';
import { buildRichMessageFromFormatted, getRichInputAsFormatted } from '../../../ui/textInput/richText';

import { useDebouncedResolver } from '../../../../hooks/useAsyncResolvers';
import useBackgroundMode from '../../../../hooks/window/useBackgroundMode';
import useBeforeUnload from '../../../../hooks/window/useBeforeUnload';

const URL_ENTITIES = new Set<string>([ApiMessageEntityTypes.TextUrl, ApiMessageEntityTypes.Url]);
const DEBOUNCE_MS = 300;
const NO_OP = () => undefined;

// Deviation: a hook runs once. The parameters that can change (`richMessage`, `editedMessage`, `chatId`, `threadId`, `type`,
// `draft`, `editingDraft`) are values or accessors (`read`), the callbacks are plain functions (they read accessors when called),
// and `shouldForceShowEditing` is returned as an accessor.
const useEditing = (
  richMessage: MaybeAccessor<ApiInputRichMessage | undefined>,
  replaceRichMessage: (richMessage?: ApiInputRichMessage) => void,
  editedMessage: MaybeAccessor<ApiMessage | undefined>,
  resetComposer: (shouldPreserveInput?: boolean, shouldSkipCollapseLatch?: boolean) => void,
  validateTextLength: (text: string) => boolean,
  chatId: MaybeAccessor<string>,
  threadId: MaybeAccessor<ThreadId>,
  type: MaybeAccessor<MessageListType>,
  draft?: MaybeAccessor<ApiDraft | undefined>,
  editingDraft?: MaybeAccessor<EditingDraft | undefined>,
  // Deviation: the chat change is owned by the composer (see `useDraft`): `getScope` is the chat the content belongs to,
  // `syncChat` runs a chat change that has not run yet (an effect that is about to write new content calls it first).
  getScope: () => ComposerScope = () => ({
    chatId: read(chatId),
    threadId: read(threadId),
    type: read(type),
    isEditing: Boolean(read(editedMessage)),
    isDisabled: false,
  }),
  syncChat: () => void = NO_OP,
): [VoidFunction, VoidFunction, Accessor<boolean>, (scope: ComposerScope, snapshot?: ApiInputRichMessage) => void] => {
  const { editMessage, setEditingDraft, toggleMessageWebPage, openDeleteMessageModal } = getActions();
  const [shouldForceShowEditing, setShouldForceShowEditing] = createSignal(false);

  const getReplyingToId = () => read(draft)?.replyInfo?.replyToMsgId;

  createEffect(
    depsOf(() => [read(editedMessage), getReplyingToId(), read(editingDraft)] as const),
    ([editedMessage2, replyingToId, editingDraft2], prev) => {
      const [prevEditedMessage, prevReplyingToId] = prev ?? [];
      if (!editedMessage2) {
        return;
      }
      syncChat();

      if (replyingToId && prevReplyingToId !== replyingToId) {
        replaceRichMessage(undefined);
        setShouldForceShowEditing(false);
        return;
      }

      if (prevEditedMessage?.id === editedMessage2.id && replyingToId === prevReplyingToId) {
        return;
      }

      const restoredRichMessage =
        editingDraft2?.richMessage ||
        (editingDraft2?.text?.length ? buildRichMessageFromFormatted(editingDraft2) : undefined);
      const nextRichMessage =
        !prevEditedMessage && restoredRichMessage
          ? restoredRichMessage
          : editedMessage2.content.richMessage || buildRichMessageFromFormatted(editedMessage2.content.text);

      replaceRichMessage(nextRichMessage);
      setShouldForceShowEditing(true);

      requestNextMutation(() => {
        const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
        if (messageInput) {
          // Deviation: `focus()` is a layout read; the next mutation is a mutate-phase task
          forceMeasure(() => focusEditableElement(messageInput, true));
        }
      });
    },
  );

  createEffect(
    depsOf(() => [read(chatId), read(threadId), read(editedMessage)] as const),
    ([chatId2, threadId2, editedMessage2]) => {
      if (!editedMessage2) {
        return;
      }

      const shouldSetNoWebPage =
        !('webPage' in editedMessage2.content) &&
        editedMessage2.content.text?.entities?.some((entity) => URL_ENTITIES.has(entity.type));

      toggleMessageWebPage({
        chatId: chatId2,
        threadId: threadId2,
        noWebPage: shouldSetNoWebPage,
      });
    },
  );

  // tt: the cleanup of the effect below, run when the chat changes. The composer calls it before the input is reset, with
  // the content of the chat being left (`scope` is that chat as it was: the current values are already the next chat's).
  const saveFor = (scope: ComposerScope, snapshot?: ApiInputRichMessage) => {
    if (!scope.isEditing) return;

    setEditingDraft({
      chatId: scope.chatId,
      threadId: scope.threadId,
      type: scope.type,
      draft: buildEditingDraft(snapshot),
    });
  };

  createEffect(
    depsOf(() => [read(chatId), read(editedMessage), read(threadId), read(type)] as const),
    ([chatId2, editedMessage2, threadId2, type2]) =>
      editedMessage2
        ? () => {
            // A chat change has saved the editing draft of the chat being left already, from its own content (`saveFor`),
            // and this cleanup would find the input reset
            const scope = getScope();
            if (scope.chatId !== chatId2 || scope.threadId !== threadId2) return;

            setEditingDraft({
              chatId: chatId2,
              threadId: threadId2,
              type: type2,
              draft: buildEditingDraft(read(richMessage)),
            });
          }
        : undefined,
  );

  // Deviation: tt's async `useDerivedSignal(detectLinkDebounced, [...], true)` is an effect that runs the debounced
  // resolver into a signal (the resolver reads the current values when the debounce fires, as in tt).
  const detectLinkDebounced = useDebouncedResolver(
    () => {
      const editedMessage2 = read(editedMessage);
      if (!editedMessage2) return false;

      const richMessage2 = read(richMessage);
      const edited = richMessage2 ? getRichInputAsFormatted(richMessage2) : undefined;
      return (
        !('webPage' in editedMessage2.content) &&
        editedMessage2.content.text?.entities?.some((entity) => URL_ENTITIES.has(entity.type)) &&
        !edited?.entities?.some((entity) => URL_ENTITIES.has(entity.type))
      );
    },
    [],
    DEBOUNCE_MS,
    true,
  );

  const [getShouldResetNoWebPageDebounced, setShouldResetNoWebPageDebounced] = createSignal<boolean | undefined>(
    undefined,
  );

  createEffect(
    depsOf(() => [read(editedMessage), read(richMessage)] as const),
    () => detectLinkDebounced(setShouldResetNoWebPageDebounced),
  );

  // As in tt, the debounced signal is a dependency: the effect also re-runs when its value changes.
  createEffect(
    depsOf(() => [read(editedMessage), read(chatId), read(threadId), getShouldResetNoWebPageDebounced()] as const),
    ([editedMessage2, chatId2, threadId2, shouldReset], prev) => {
      const [prevEditedMessage] = prev ?? [];
      if (!editedMessage2 || prevEditedMessage?.id !== editedMessage2.id) {
        return;
      }

      if (shouldReset) {
        toggleMessageWebPage({
          chatId: chatId2,
          threadId: threadId2,
          noWebPage: false,
        });
      }
    },
  );

  const restoreNewDraftAfterEditing = () => {
    const draft2 = read(draft);
    if (!draft2) return;

    // Run one frame after editing draft reset
    requestMeasure(() => {
      replaceRichMessage(draft2.richMessage || buildRichMessageFromFormatted(draft2.text));

      // Wait one more frame until new editor content is rendered
      requestNextMutation(() => {
        const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
        if (messageInput) {
          // Deviation: `focus()` is a layout read; the next mutation is a mutate-phase task
          forceMeasure(() => focusEditableElement(messageInput, true));
        }
      });
    });
  };

  const handleEditCancel = () => {
    resetComposer(false, true);
    setEditingDraft({ chatId: read(chatId), threadId: read(threadId), type: read(type), draft: undefined });
    restoreNewDraftAfterEditing();
  };

  const handleEditComplete = () => {
    const richMessage2 = read(richMessage);
    const editedMessage2 = read(editedMessage);
    const chatId2 = read(chatId);
    const threadId2 = read(threadId);
    const type2 = read(type);
    const { text, entities } = richMessage2 ? getRichInputAsFormatted(richMessage2) || { text: '' } : { text: '' };

    if (!editedMessage2) {
      return;
    }

    if (!text && !hasMessageMedia(editedMessage2)) {
      openDeleteMessageModal({
        chatId: chatId2,
        messageIds: [editedMessage2.id],
        isSchedule: type2 === 'scheduled',
      });
      return;
    }

    if (text && !validateTextLength(text)) {
      return;
    }

    editMessage({
      messageList: { chatId: chatId2, threadId: threadId2, type: type2 },
      text,
      entities,
    });

    resetComposer(false, true);
    setEditingDraft({ chatId: chatId2, threadId: threadId2, type: type2, draft: undefined });
    restoreNewDraftAfterEditing();
  };

  const handleBlur = () => {
    if (!read(editedMessage)) return;

    const { chatId: scopedChatId, threadId: scopedThreadId } = getScope();
    setEditingDraft({
      chatId: scopedChatId,
      threadId: scopedThreadId,
      type: read(type),
      draft: buildEditingDraft(read(richMessage)),
    });
  };

  // Deviation: the focus callback is required (`useBackgroundMode` of this port), tt passed none.
  useBackgroundMode(handleBlur, NO_OP);
  useBeforeUnload(handleBlur);

  return [handleEditComplete, handleEditCancel, shouldForceShowEditing, saveFor];
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

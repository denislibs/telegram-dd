import { createEffect, createMutationEffect, requestMeasure, requestNextMutation } from 'frameact';
import { getActions } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';

import type { ApiDraft, ApiMessage } from '../../../../api/types';
import type { ThreadId } from '../../../../types';
import { ApiMessageEntityTypes } from '../../../../api/types';

import { DRAFT_DEBOUNCE, EDITABLE_INPUT_CSS_SELECTOR } from '../../../../config';
import { areDeepEqual } from '../../../../util/areDeepEqual';
import focusEditableElement from '../../../../util/focusEditableElement';
import { buildRichMessageFromFormatted, getRichInputAsFormatted } from '../../../ui/textInput/richText';

import useRunDebounced from '../../../../hooks/useRunDebounced';
import { useStateRef } from '../../../../hooks/useStateRef';
import useBackgroundMode from '../../../../hooks/window/useBackgroundMode';
import useBeforeUnload from '../../../../hooks/window/useBeforeUnload';

let isFrozen = false;

function freeze() {
  isFrozen = true;

  requestMeasure(() => {
    isFrozen = false;
  });
}

// TODO(codemod): useDraft: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useDraft = ({
  draft,
  chatId,
  threadId,
  richMessage,
  replaceRichMessage,
  editedMessage,
  isDisabled,
  hasUnresolvedMedia,
}: {
  draft?: ApiDraft;
  chatId: string;
  threadId: ThreadId;
  richMessage?: ApiDraft['richMessage'];
  replaceRichMessage: (richMessage?: ApiDraft['richMessage']) => void;
  editedMessage?: ApiMessage;
  isDisabled?: boolean;
  hasUnresolvedMedia?: boolean;
}) => {
  const { saveDraft, clearDraft, loadCustomEmojis } = getActions();

  let isTouchedRef = false;

  createEffect(
    depsOf(() => [draft, hasUnresolvedMedia, richMessage]),
    () => {
      if (!hasUnresolvedMedia && areDeepEqual(getDraftRichMessage(draft), richMessage) && !draft?.isLocal) {
        isTouchedRef = false;
      } else {
        isTouchedRef = true;
      }
    },
  );
  createEffect(
    depsOf(() => [chatId, threadId]),
    () => {
      isTouchedRef = false;
    },
  );

  const isEditing = Boolean(editedMessage);

  const updateDraft = (prevState: { chatId?: string; threadId?: ThreadId } = {}) => {
    if (isDisabled || isEditing || !isTouchedRef) return;

    const currentRichMessage = richMessage?.blocks.length ? richMessage : undefined;
    const formattedRichMessage = currentRichMessage ? getRichInputAsFormatted(currentRichMessage) : undefined;

    if (currentRichMessage && !formattedRichMessage) {
      requestMeasure(() => {
        saveDraft({
          chatId: prevState.chatId ?? chatId,
          threadId: prevState.threadId ?? threadId,
          text: undefined,
          richMessage: currentRichMessage,
        });
      });
    } else if (formattedRichMessage?.text) {
      requestMeasure(() => {
        saveDraft({
          chatId: prevState.chatId ?? chatId,
          threadId: prevState.threadId ?? threadId,
          text: formattedRichMessage,
        });
      });
    } else {
      clearDraft({
        chatId: prevState.chatId ?? chatId,
        threadId: prevState.threadId ?? threadId,
        shouldKeepReply: true,
        shouldKeepSuggestedPost: true,
      });
    }
  };

  const runDebouncedForSaveDraft = useRunDebounced(DRAFT_DEBOUNCE, true, undefined, [chatId, threadId]);

  // Restore draft on chat change
  createMutationEffect(
    depsOf(() => [chatId, threadId, draft, replaceRichMessage, editedMessage, isDisabled, hasUnresolvedMedia]),
    (_deps, prev) => {
      const [prevChatId, prevThreadId, prevDraft] = prev ?? [];
      if (isDisabled) {
        return;
      }
      const isTouched = isTouchedRef;
      const shouldUpdateSuggestedPost = draft?.suggestedPostInfo && !prevDraft?.suggestedPostInfo;

      if (chatId === prevChatId && threadId === prevThreadId) {
        // Saved drafts omit unfinished media, so restoring them would discard local uploads
        if (hasUnresolvedMedia) return;
        if (isTouched && !draft) return; // Prevent reset from other client if we have local edits
        if (!draft && prevDraft) {
          replaceRichMessage(undefined);
        }

        if (isTouched && !shouldUpdateSuggestedPost) return;
      }

      if (editedMessage || !draft) {
        return;
      }

      if (draft.richMessage) {
        replaceRichMessage(draft.richMessage);
      } else {
        replaceRichMessage(buildRichMessageFromFormatted(draft.text));
      }

      if (shouldUpdateSuggestedPost) {
        requestNextMutation(() => {
          const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
          if (messageInput) {
            focusEditableElement(messageInput, true);
          }
        });
      }

      if (draft.richMessage) {
        return;
      }

      const customEmojiIds =
        draft.text?.entities
          ?.map((entity) => entity.type === ApiMessageEntityTypes.CustomEmoji && entity.documentId)
          .filter(Boolean) || [];
      if (customEmojiIds.length) loadCustomEmojis({ ids: customEmojiIds });
    },
  );

  // Save draft on chat change. Should be layout effect to read correct editor value on cleanup
  createMutationEffect(
    depsOf(() => [chatId, threadId, isEditing, updateDraft, isDisabled]),
    () => {
      if (isDisabled) {
        return undefined;
      }

      return () => {
        if (!isEditing) {
          updateDraft({ chatId, threadId });
        }

        freeze();
      };
    },
  );

  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const chatIdRef = useStateRef(chatId);
  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const threadIdRef = useStateRef(threadId);
  createEffect(
    depsOf(() => [chatIdRef, isDisabled, richMessage, runDebouncedForSaveDraft, threadIdRef, updateDraft]),
    () => {
      if (isDisabled || isFrozen) {
        return;
      }

      if (!richMessage?.blocks.length) {
        updateDraft();

        return;
      }

      const scopedСhatId = chatIdRef.current;
      const scopedThreadId = threadIdRef.current;

      runDebouncedForSaveDraft(() => {
        if (chatIdRef.current === scopedСhatId && threadIdRef.current === scopedThreadId) {
          updateDraft();
        }
      });
    },
  );

  useBackgroundMode(updateDraft);
  useBeforeUnload(updateDraft);
};

export default useDraft;

function getDraftRichMessage(draft?: ApiDraft) {
  if (draft?.richMessage) {
    return draft.richMessage;
  }

  return buildRichMessageFromFormatted(draft?.text);
}

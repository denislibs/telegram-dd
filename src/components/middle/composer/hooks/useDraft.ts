import {
  createEffect,
  createMutationEffect,
  frameForcedReflow,
  requestMeasure,
  requestNextMutation,
  untrack,
} from 'frameact';
import { getActions } from '../../../../global';

import type { ApiDraft, ApiMessage } from '../../../../api/types';
import type { ThreadId } from '../../../../types';
import { ApiMessageEntityTypes } from '../../../../api/types';

import { DRAFT_DEBOUNCE, EDITABLE_INPUT_CSS_SELECTOR } from '../../../../config';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { areDeepEqual } from '../../../../util/areDeepEqual';
import { depsOf } from '../../../../util/effectDeps';
import focusEditableElement from '../../../../util/focusEditableElement';
import { buildRichMessageFromFormatted, getRichInputAsFormatted } from '../../../ui/textInput/richText';

import useRunDebounced from '../../../../hooks/useRunDebounced';
import useBackgroundMode from '../../../../hooks/window/useBackgroundMode';
import useBeforeUnload from '../../../../hooks/window/useBeforeUnload';

const NO_OP = () => undefined;

let isFrozen = false;

function freeze() {
  isFrozen = true;

  requestMeasure(() => {
    isFrozen = false;
  });
}

// Deviation: a hook runs once. Every parameter that can change is a value or an accessor (`read`); `replaceRichMessage`
// is a plain function. The tt effects are placed by phase (see the notes at each one): `useLayoutEffect` is a mutation
// effect, `useEffect` is a forced-reflow effect, so that the effects keep tt's relative order (layout effects of a commit
// run before its effects; a tickEnd or measure effect would run before the mutation ones and read the touched flag too early).
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
  draft?: MaybeAccessor<ApiDraft | undefined>;
  chatId: MaybeAccessor<string>;
  threadId: MaybeAccessor<ThreadId>;
  richMessage?: MaybeAccessor<ApiDraft['richMessage']>;
  replaceRichMessage: (richMessage?: ApiDraft['richMessage']) => void;
  editedMessage?: MaybeAccessor<ApiMessage | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  hasUnresolvedMedia?: MaybeAccessor<boolean | undefined>;
}) => {
  const { saveDraft, clearDraft, loadCustomEmojis } = getActions();

  let isTouchedRef = false;
  // The editor value as of the last settled frame. tt's `updateDraft` read the `richMessage` of the last render, so on a
  // chat change it still saw the value of the chat being left; here the value is a signal, which the restore effect below
  // replaces before (or after, the order of effect runs is not part of the contract) the cleanup of the effect that saves
  // the draft of the chat being left runs.
  let lastRichMessage = untrack(() => read(richMessage));

  createEffect(
    depsOf(() => [read(draft), read(hasUnresolvedMedia), read(richMessage)] as const),
    ([draft2, hasUnresolvedMedia2, richMessage2]) => {
      lastRichMessage = richMessage2;
      if (!hasUnresolvedMedia2 && areDeepEqual(getDraftRichMessage(draft2), richMessage2) && !draft2?.isLocal) {
        isTouchedRef = false;
      } else {
        isTouchedRef = true;
      }
    },
    frameForcedReflow,
  );
  createEffect(
    depsOf(() => [read(chatId), read(threadId)] as const),
    () => {
      isTouchedRef = false;
    },
    frameForcedReflow,
  );

  const getIsEditing = () => Boolean(read(editedMessage));

  const updateDraft = (
    prevState: { chatId?: string; threadId?: ThreadId } = {},
    richMessage2: ApiDraft['richMessage'] = read(richMessage),
  ) => {
    if (read(isDisabled) || getIsEditing() || !isTouchedRef) return;

    const currentRichMessage = richMessage2?.blocks.length ? richMessage2 : undefined;
    const formattedRichMessage = currentRichMessage ? getRichInputAsFormatted(currentRichMessage) : undefined;
    const scopedChatId = prevState.chatId ?? read(chatId);
    const scopedThreadId = prevState.threadId ?? read(threadId);

    if (currentRichMessage && !formattedRichMessage) {
      requestMeasure(() => {
        saveDraft({
          chatId: scopedChatId,
          threadId: scopedThreadId,
          text: undefined,
          richMessage: currentRichMessage,
        });
      });
    } else if (formattedRichMessage?.text) {
      requestMeasure(() => {
        saveDraft({
          chatId: scopedChatId,
          threadId: scopedThreadId,
          text: formattedRichMessage,
        });
      });
    } else {
      clearDraft({
        chatId: scopedChatId,
        threadId: scopedThreadId,
        shouldKeepReply: true,
        shouldKeepSuggestedPost: true,
      });
    }
  };

  // Deviation: one debounced function for the lifetime of the hook (tt re-created it per chat/thread); a call scheduled
  // for the previous chat is dropped by the chat check inside the callback, as in tt.
  const runDebouncedForSaveDraft = useRunDebounced(DRAFT_DEBOUNCE, true, undefined);

  // Restore draft on chat change
  createMutationEffect(
    depsOf(
      () =>
        [
          read(chatId),
          read(threadId),
          read(draft),
          read(editedMessage),
          read(isDisabled),
          read(hasUnresolvedMedia),
        ] as const,
    ),
    ([chatId2, threadId2, draft2, editedMessage2, isDisabled2, hasUnresolvedMedia2], prev) => {
      const [prevChatId, prevThreadId, prevDraft] = prev ?? [];
      if (isDisabled2) {
        return;
      }
      const isTouched = isTouchedRef;
      const shouldUpdateSuggestedPost = draft2?.suggestedPostInfo && !prevDraft?.suggestedPostInfo;

      if (chatId2 === prevChatId && threadId2 === prevThreadId) {
        // Saved drafts omit unfinished media, so restoring them would discard local uploads
        if (hasUnresolvedMedia2) return;
        if (isTouched && !draft2) return; // Prevent reset from other client if we have local edits
        if (!draft2 && prevDraft) {
          replaceRichMessage(undefined);
        }

        if (isTouched && !shouldUpdateSuggestedPost) return;
      }

      if (editedMessage2 || !draft2) {
        return;
      }

      if (draft2.richMessage) {
        replaceRichMessage(draft2.richMessage);
      } else {
        replaceRichMessage(buildRichMessageFromFormatted(draft2.text));
      }

      if (shouldUpdateSuggestedPost) {
        requestNextMutation(() => {
          const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
          if (messageInput) {
            focusEditableElement(messageInput, true);
          }
        });
      }

      if (draft2.richMessage) {
        return;
      }

      const customEmojiIds =
        draft2.text?.entities
          ?.map((entity) => entity.type === ApiMessageEntityTypes.CustomEmoji && entity.documentId)
          .filter(Boolean) || [];
      if (customEmojiIds.length) loadCustomEmojis({ ids: customEmojiIds });
    },
  );

  // Save draft on chat change. Should be layout effect to read correct editor value on cleanup
  createMutationEffect(
    depsOf(() => [read(chatId), read(threadId), getIsEditing(), read(isDisabled)] as const),
    ([chatId2, threadId2, isEditing, isDisabled2]) => {
      if (isDisabled2) {
        return undefined;
      }

      return () => {
        if (!isEditing) {
          updateDraft({ chatId: chatId2, threadId: threadId2 }, lastRichMessage);
        }

        freeze();
      };
    },
  );

  createEffect(
    depsOf(() => [read(isDisabled), read(richMessage)] as const),
    ([isDisabled2, richMessage2]) => {
      if (isDisabled2 || isFrozen) {
        return;
      }

      if (!richMessage2?.blocks.length) {
        updateDraft();

        return;
      }

      const scopedChatId = read(chatId);
      const scopedThreadId = read(threadId);

      runDebouncedForSaveDraft(() => {
        if (read(chatId) === scopedChatId && read(threadId) === scopedThreadId) {
          updateDraft();
        }
      });
    },
    frameForcedReflow,
  );

  // Deviation: this port's `useBackgroundMode` requires the focus callback, tt passed none.
  useBackgroundMode(updateDraft, NO_OP);
  useBeforeUnload(updateDraft);
};

export default useDraft;

function getDraftRichMessage(draft?: ApiDraft) {
  if (draft?.richMessage) {
    return draft.richMessage;
  }

  return buildRichMessageFromFormatted(draft?.text);
}

import {
  createEffect,
  frameForcedReflow,
  onDestroy,
  requestMeasure,
  requestNextMutation,
  untrack,
} from 'frameact';
import { forceMeasure } from 'frameact/stricterdom';
import { getActions } from '../../../../global';

import type { ApiDraft, ApiMessage } from '../../../../api/types';
import type { MessageListType, ThreadId } from '../../../../types';
import { ApiMessageEntityTypes } from '../../../../api/types';

import { DRAFT_DEBOUNCE, EDITABLE_INPUT_CSS_SELECTOR } from '../../../../config';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { areDeepEqual } from '../../../../util/areDeepEqual';
import { depsOf } from '../../../../util/effectDeps';
import focusEditableElement from '../../../../util/focusEditableElement';
import { buildRichMessageFromFormatted, getRichInputAsFormatted } from '../../../ui/textInput/richText';

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

// What the composer's content belongs to: the chat it was restored for. `useDraft` / `useEditing` save under this scope
// (tt saved under the chat of the last render, which is the chat of the content); a chat change replaces it (`Composer`).
export type ComposerScope = {
  chatId: string;
  threadId: ThreadId;
  type: MessageListType;
  isEditing: boolean;
  isDisabled: boolean;
};

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
  getScope,
  syncChat,
}: {
  draft?: MaybeAccessor<ApiDraft | undefined>;
  chatId: MaybeAccessor<string>;
  threadId: MaybeAccessor<ThreadId>;
  richMessage?: MaybeAccessor<ApiDraft['richMessage']>;
  replaceRichMessage: (richMessage?: ApiDraft['richMessage']) => void;
  editedMessage?: MaybeAccessor<ApiMessage | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  hasUnresolvedMedia?: MaybeAccessor<boolean | undefined>;
  // Deviation: the chat change is owned by the composer (see `Composer`): one effect saves the content of the chat being
  // left, resets the input and calls `restoreFor`. `getScope` is the chat the content belongs to, `syncChat` runs that
  // change if it has not run yet (an effect that is about to write new content calls it first).
  getScope: () => ComposerScope;
  syncChat: () => void;
}) => {
  const { saveDraft, clearDraft, loadCustomEmojis } = getActions();

  let isTouchedRef = false;
  // The draft the effect below saw last (tt's `prevDraft` of the restore effect): the one of the chat being left when a
  // chat change restores the new one.
  let lastDraft = untrack(() => read(draft));

  // Deviation: tt had two effects in a commit (touched, then save) and the save one relied on that order. Effects here do
  // not run in creation order, so the save effect computes the flag itself, from the same current values, right before it
  // decides (a reply-only draft is "touched" by `isLocal`, and has to be saved by the empty-input branch of `updateDraft`).
  const updateIsTouched = () => {
    const draft2 = read(draft);
    isTouchedRef = !(
      !read(hasUnresolvedMedia) &&
      areDeepEqual(getDraftRichMessage(draft2), read(richMessage)) &&
      !draft2?.isLocal
    );
  };

  createEffect(
    depsOf(() => [read(draft), read(hasUnresolvedMedia), read(richMessage)] as const),
    updateIsTouched,
    frameForcedReflow,
  );

  const getIsEditing = () => Boolean(read(editedMessage));

  const persistDraft = (scopedChatId: string, scopedThreadId: ThreadId, richMessage2: ApiDraft['richMessage']) => {
    const currentRichMessage = richMessage2?.blocks.length ? richMessage2 : undefined;
    const formattedRichMessage = currentRichMessage ? getRichInputAsFormatted(currentRichMessage) : undefined;

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

  // Saves under the chat the content belongs to (tt: the chat of the last render), not under the current chat prop:
  // the prop is already the next chat while the content is still the previous one when a chat change is held back.
  const updateDraft = () => {
    if (read(isDisabled) || getIsEditing() || !isTouchedRef) return;

    const { chatId: scopedChatId, threadId: scopedThreadId } = getScope();
    persistDraft(scopedChatId, scopedThreadId, read(richMessage));
  };

  // Deviation: one debounce for the lifetime of the hook (tt re-created it per chat/thread); a call scheduled for the
  // previous chat is dropped by the chat check inside the callback, as in tt. It is written out here (tt's `useRunDebounced`
  // timer cannot be cancelled) so that the owner's destruction can flush it: a timer left running keeps the whole editor of
  // a closed composer alive for up to `DRAFT_DEBOUNCE`.
  let pendingSaveTimer: number | undefined;
  let pendingSaveRichMessage: ApiDraft['richMessage'];
  const runDebouncedForSaveDraft = (richMessage2: ApiDraft['richMessage'], callback: NoneToVoidFunction) => {
    if (pendingSaveTimer) {
      clearTimeout(pendingSaveTimer);
    }

    pendingSaveRichMessage = richMessage2;
    pendingSaveTimer = self.setTimeout(() => {
      pendingSaveTimer = undefined;
      pendingSaveRichMessage = undefined;
      callback();
    }, DRAFT_DEBOUNCE);
  };

  // A draft that is still waiting for its debounce when the composer is destroyed is saved now, from the value that was
  // waiting (the owner clears the input as it goes away), and the timer is released.
  onDestroy(() => {
    if (!pendingSaveTimer) return;

    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = undefined;
    const richMessage2 = pendingSaveRichMessage;
    pendingSaveRichMessage = undefined;
    if (read(isDisabled) || getIsEditing() || !isTouchedRef) return;

    const { chatId: scopedChatId, threadId: scopedThreadId } = getScope();
    persistDraft(scopedChatId, scopedThreadId, richMessage2);
  });

  const restoreFromDraft = (draft2: ApiDraft | undefined, shouldUpdateSuggestedPost: boolean) => {
    if (read(editedMessage) || !draft2) {
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
          // Deviation: `focus()` is a layout read; the next mutation is a mutate-phase task
          forceMeasure(() => focusEditableElement(messageInput, true));
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
  };

  // tt: the cleanup of the "save draft on chat change" layout effect. Called by the composer's chat change, before the
  // input is reset, with the content of the chat being left (`scope` is that chat as it was, including whether it was
  // editing or disabled: the current values are already the next chat's).
  const saveFor = (scope: ComposerScope, snapshot: ApiDraft['richMessage']) => {
    if (scope.isDisabled) return;

    if (!scope.isEditing && isTouchedRef) {
      persistDraft(scope.chatId, scope.threadId, snapshot);
    }

    freeze();
  };

  // tt: the "touched" reset effect and the chat-change branch of the "restore draft" layout effect. Called by the
  // composer's chat change after the input was reset, and on mount.
  const restoreFor = () => {
    isTouchedRef = false;
    const draft2 = read(draft);
    const prevDraft = lastDraft;
    lastDraft = draft2;
    if (read(isDisabled)) {
      return;
    }

    restoreFromDraft(draft2, Boolean(draft2?.suggestedPostInfo && !prevDraft?.suggestedPostInfo));
  };

  // Restore draft on a change of the draft itself (the chat change is `restoreFor`). A change of the chat seen here that
  // the composer has not handled yet is handled first (`syncChat` is a no-op once it has run).
  // Deviation: not a mutation effect (tt: a layout effect). It writes the editor value, which the measure effect of
  // `MessageInput` reads, and a write from the mutate phase dirties it for the next frame.
  createEffect(
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
    ([chatId2, threadId2, draft2, , isDisabled2, hasUnresolvedMedia2], prev) => {
      if (!prev) {
        restoreFor();
        return;
      }

      const [prevChatId, prevThreadId, prevDraft] = prev;
      if (chatId2 !== prevChatId || threadId2 !== prevThreadId) {
        syncChat();
        lastDraft = draft2;
        return;
      }

      lastDraft = draft2;
      if (isDisabled2) {
        return;
      }

      const isTouched = isTouchedRef;
      const shouldUpdateSuggestedPost = Boolean(draft2?.suggestedPostInfo && !prevDraft?.suggestedPostInfo);

      // Saved drafts omit unfinished media, so restoring them would discard local uploads
      if (hasUnresolvedMedia2) return;
      if (isTouched && !draft2) return; // Prevent reset from other client if we have local edits
      if (!draft2 && prevDraft) {
        replaceRichMessage(undefined);
      }

      if (isTouched && !shouldUpdateSuggestedPost) return;

      restoreFromDraft(draft2, shouldUpdateSuggestedPost);
    },
  );

  createEffect(
    depsOf(() => [read(isDisabled), read(richMessage)] as const),
    ([isDisabled2, richMessage2]) => {
      if (isDisabled2 || isFrozen) {
        return;
      }

      updateIsTouched();

      if (!richMessage2?.blocks.length) {
        updateDraft();

        return;
      }

      const scopedChatId = getScope().chatId;
      const scopedThreadId = getScope().threadId;

      runDebouncedForSaveDraft(richMessage2, () => {
        const scope = getScope();
        if (scope.chatId === scopedChatId && scope.threadId === scopedThreadId) {
          updateDraft();
        }
      });
    },
    frameForcedReflow,
  );

  // Deviation: this port's `useBackgroundMode` requires the focus callback, tt passed none.
  useBackgroundMode(updateDraft, NO_OP);
  useBeforeUnload(updateDraft);

  return { saveFor, restoreFor };
};

export default useDraft;

function getDraftRichMessage(draft?: ApiDraft) {
  if (draft?.richMessage) {
    return draft.richMessage;
  }

  return buildRichMessageFromFormatted(draft?.text);
}

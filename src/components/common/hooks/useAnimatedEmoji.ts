import { createMeasureEffect, createMemo } from 'frameact';
import { getActions } from '../../../global';

import type { ActiveEmojiInteraction } from '../../../types';

import { type MaybeAccessor, read } from '../../../util/accessors';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import buildStyle from '../../../util/buildStyle';
import { depsOf } from '../../../util/effectDeps';
import safePlay from '../../../util/safePlay';
import { REM } from '../helpers/mediaDimensions';

import useMedia from '../../../hooks/useMedia';

const SIZE = 7 * REM;
const INTERACTION_BUNCH_TIME = 1000;
const MS_DIVIDER = 1000;
const TIME_DEFAULT = 0;

// Deviation: a hook runs once. The parameters are `MaybeAccessor`s; `ref` is a callback ref for the element (tt returned
// a ref object) and `getRef` reads the element; `size` and `style` are accessors.
export default function useAnimatedEmoji(
  chatId?: MaybeAccessor<string | undefined>,
  messageId?: MaybeAccessor<number | undefined>,
  soundId?: MaybeAccessor<string | undefined>,
  activeEmojiInteractions?: MaybeAccessor<ActiveEmojiInteraction[] | undefined>,
  isOwn?: MaybeAccessor<boolean | undefined>,
  emoji?: MaybeAccessor<string | undefined>,
  preferredSize?: number,
) {
  const { interactWithAnimatedEmoji, sendEmojiInteraction, sendWatchingEmojiInteraction } = getActions();

  let element: HTMLDivElement | undefined;
  const ref = (el: HTMLDivElement) => {
    element = el;
  };
  const getRef = () => element;

  let audioRef: HTMLAudioElement | undefined;

  const soundMediaData = useMedia(
    () => (read(soundId) ? `document${read(soundId)}` : undefined),
    () => !read(soundId),
  );

  const size = createMemo(() => preferredSize || SIZE);
  const style = createMemo(() =>
    buildStyle(`width: ${size()}px`, `height: ${size()}px`, read(emoji) && !IS_TAURI && 'cursor: pointer'),
  );

  let interactionsRef: number[] | undefined;
  let startedInteractionsRef: number | undefined;
  const sendInteractionBunch = () => {
    const container = element;

    if (!container) return;

    sendEmojiInteraction({
      chatId: read(chatId)!,
      messageId: read(messageId)!,
      emoji: read(emoji)!,
      interactions: interactionsRef!,
    });
    startedInteractionsRef = undefined;
    interactionsRef = undefined;
  };

  const play = () => {
    const audio = audioRef;
    const soundData = soundMediaData();
    if (soundData) {
      if (audio) {
        audio.pause();
        audio.remove();
      }
      audioRef = new Audio();
      audioRef.src = soundData;
      safePlay(audioRef);
      audioRef.addEventListener(
        'ended',
        () => {
          audioRef = undefined;
        },
        { once: true },
      );
    }
  };

  const handleClick = () => {
    play();

    const container = element;
    const emoji2 = read(emoji);
    const messageId2 = read(messageId);
    const chatId2 = read(chatId);

    if (!emoji2 || !container || !messageId2 || !chatId2) {
      return;
    }

    const { x, y } = container.getBoundingClientRect();

    interactWithAnimatedEmoji({
      emoji: emoji2,
      x,
      y,
      startSize: size(),
      isReversed: !read(isOwn),
    });

    if (!interactionsRef) {
      interactionsRef = [];
      startedInteractionsRef = performance.now();
      setTimeout(sendInteractionBunch, INTERACTION_BUNCH_TIME);
    }

    interactionsRef.push(
      startedInteractionsRef ? (performance.now() - startedInteractionsRef) / MS_DIVIDER : TIME_DEFAULT,
    );
  };

  // Set an end anchor for remote activated interaction
  createMeasureEffect(
    depsOf(
      () => [read(activeEmojiInteractions), read(chatId), read(emoji), read(isOwn), read(messageId), size()] as const,
    ),
    ([activeEmojiInteractions2, chatId2, emoji2, isOwn2, messageId2, size2]) => {
      const container = element;

      if (!container || !activeEmojiInteractions2) return;

      activeEmojiInteractions2.forEach(({ id, startSize, messageId: interactionMessageId }) => {
        if (startSize || messageId2 !== interactionMessageId) {
          return;
        }

        const { x, y } = container.getBoundingClientRect();

        sendWatchingEmojiInteraction({
          id,
          chatId: chatId2!,
          emoticon: emoji2!,
          startSize: size2,
          x,
          y,
          isReversed: !isOwn2,
        });
        play();
      });
    },
  );

  return {
    ref,
    getRef,
    size,
    style,
    handleClick,
  };
}

import { createMeasureEffect } from 'frameact';
import { getActions } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { ActiveEmojiInteraction } from '../../../types';

import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import buildStyle from '../../../util/buildStyle';
import safePlay from '../../../util/safePlay';
import { REM } from '../helpers/mediaDimensions';

import useMedia from '../../../hooks/useMedia';

const SIZE = 7 * REM;
const INTERACTION_BUNCH_TIME = 1000;
const MS_DIVIDER = 1000;
const TIME_DEFAULT = 0;

// TODO(codemod): useAnimatedEmoji: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useAnimatedEmoji(
  chatId?: string,
  messageId?: number,
  soundId?: string,
  activeEmojiInteractions?: ActiveEmojiInteraction[],
  isOwn?: boolean,
  emoji?: string,
  preferredSize?: number,
) {
  const { interactWithAnimatedEmoji, sendEmojiInteraction, sendWatchingEmojiInteraction } = getActions();

  let ref!: HTMLDivElement;

  let audioRef!: HTMLAudioElement | undefined;

  const soundMediaData = useMedia(soundId ? `document${soundId}` : undefined, !soundId);

  const size = preferredSize || SIZE;
  const style = buildStyle(`width: ${size}px`, `height: ${size}px`, emoji && !IS_TAURI && 'cursor: pointer');

  let interactionsRef: number[] | undefined;
  let startedInteractionsRef: number | undefined;
  const sendInteractionBunch = () => {
    const container = ref;

    if (!container) return;

    sendEmojiInteraction({
      chatId: chatId!,
      messageId: messageId!,
      emoji: emoji!,
      interactions: interactionsRef!,
    });
    startedInteractionsRef = undefined;
    interactionsRef = undefined;
  };

  const play = () => {
    const audio = audioRef;
    if (soundMediaData) {
      if (audio) {
        audio.pause();
        audio.remove();
      }
      audioRef = new Audio();
      audioRef.src = soundMediaData;
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

    const container = ref;

    if (!emoji || !container || !messageId || !chatId) {
      return;
    }

    const { x, y } = container.getBoundingClientRect();

    interactWithAnimatedEmoji({
      emoji,
      x,
      y,
      startSize: size,
      isReversed: !isOwn,
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
  createMeasureEffect(depsOf(() => [activeEmojiInteractions, chatId, emoji, isOwn, messageId, play, sendWatchingEmojiInteraction, size]), () => {
    const container = ref;

    if (!container || !activeEmojiInteractions) return;

    activeEmojiInteractions.forEach(({ id, startSize, messageId: interactionMessageId }) => {
      if (startSize || messageId !== interactionMessageId) {
        return;
      }

      const { x, y } = container.getBoundingClientRect();

      sendWatchingEmojiInteraction({
        id,
        chatId: chatId!,
        emoticon: emoji!,
        startSize: size,
        x,
        y,
        isReversed: !isOwn,
      });
      play();
    });
  });

  return {
    // TODO(codemod): "ref" was a ref object passed as a value: pass an accessor (() => ref) or a callback ref
    ref,
    size,
    style,
    handleClick,
  };
}

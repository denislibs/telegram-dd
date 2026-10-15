import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { withGlobal } from '../../../global';

import type { ApiSticker } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ActiveEmojiInteraction } from '../../../types';

import { selectAnimatedEmoji, selectAnimatedEmojiEffect, selectAnimatedEmojiSound } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { getEmojiFitzModifier } from '../../../util/emoji/skinTone';
import { LIKE_STICKER_ID } from '../../common/helpers/mediaDimensions';

import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useAnimatedEmoji from '../../common/hooks/useAnimatedEmoji';

import AnimatedIconFromSticker from '../../common/AnimatedIconFromSticker';

import './AnimatedEmoji.scss';

type OwnProps = {
  emoji: string;
  withEffects?: boolean;
  isOwn?: boolean;
  observeIntersection?: ObserveFn;
  forceLoadPreview?: boolean;
  messageId?: number;
  chatId?: string;
  activeEmojiInteractions?: ActiveEmojiInteraction[];
};

interface StateProps {
  sticker?: ApiSticker;
  effect?: ApiSticker;
  soundId?: string;
}

const QUALITY = 1;

const AnimatedEmoji = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { ref, getRef, size, style, handleClick } = useAnimatedEmoji(
    () => props.chatId,
    () => props.messageId,
    () => props.soundId,
    () => props.activeEmojiInteractions,
    () => props.isOwn,
    () => (props.effect ? props.emoji : undefined),
  );
  const isIntersecting = useIsIntersecting(getRef, () => props.observeIntersection);
  const fitzModifier = createMemo(() => getEmojiFitzModifier(props.emoji));

  return (
    // Deviation: tt's `key={`${sticker?.id}_${fitzModifier}`}` -> a keyed Show
    <Show when={`${props.sticker?.id}_${fitzModifier()}`} keyed>
      {() => (
        <AnimatedIconFromSticker
          sticker={props.sticker}
          fitzModifier={fitzModifier()}
          size={size()}
          quality={QUALITY}
          noLoad={!isIntersecting()}
          forcePreview={props.forceLoadPreview}
          play={isIntersecting()}
          forceAlways
          ref={ref}
          className={buildClassName(
            'AnimatedEmoji media-inner',
            props.sticker?.id === LIKE_STICKER_ID && 'like-sticker-thumb',
          )}
          style={style()}
          onClick={handleClick}
        />
      )}
    </Show>
  );
};

const mapStateToProps = (global: GlobalState, { emoji, withEffects }: OwnProps): Complete<StateProps> => {
  return {
    sticker: selectAnimatedEmoji(global, emoji),
    effect: withEffects ? selectAnimatedEmojiEffect(global, emoji) : undefined,
    soundId: selectAnimatedEmojiSound(global, emoji),
  };
};

export default AnimatedEmoji;

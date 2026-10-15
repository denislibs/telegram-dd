import { createMemo } from 'frameact';
import { withGlobal } from '../../../global';
import type { GlobalState } from '../../../global/types';

import type { ApiSticker } from '../../../api/types';
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
  const animatedEmojiResult = createMemo(() => useAnimatedEmoji(
    () => props.chatId,
    () => props.messageId,
    () => props.soundId,
    () => props.activeEmojiInteractions,
    () => props.isOwn,
    () => props.effect ? props.emoji : undefined,
  ));
  const ref = () => animatedEmojiResult().ref;
  const size = () => animatedEmojiResult().size;
  const style = () => animatedEmojiResult().style;
  const handleClick = () => animatedEmojiResult().handleClick;
  const isIntersecting = useIsIntersecting(() => ref(), () => props.observeIntersection);
  const fitzModifier = createMemo(() => getEmojiFitzModifier(props.emoji));

  return (
    // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
    <AnimatedIconFromSticker
      key={`${props.sticker?.id}_${fitzModifier()}`}
      sticker={props.sticker}
      fitzModifier={fitzModifier()}
      size={size()}
      quality={QUALITY}
      noLoad={!isIntersecting}
      forcePreview={props.forceLoadPreview}
      play={isIntersecting}
      forceAlways
      ref={ref()}
      className={buildClassName('AnimatedEmoji media-inner', props.sticker?.id === LIKE_STICKER_ID && 'like-sticker-thumb')}
      style={style()}
      onClick={handleClick()}
    />
  );
};

const mapStateToProps = (global: GlobalState, { emoji, withEffects }: OwnProps) => {
    return {
      sticker: selectAnimatedEmoji(global, emoji),
      effect: withEffects ? selectAnimatedEmojiEffect(global, emoji) : undefined,
      soundId: selectAnimatedEmojiSound(global, emoji),
    };
  };

export default AnimatedEmoji;

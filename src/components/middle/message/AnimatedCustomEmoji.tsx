import { withGlobal } from '../../../global';

import type { ApiSticker } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ActiveEmojiInteraction } from '../../../types';

import {
  selectAnimatedEmojiEffect,
  selectAnimatedEmojiSound,
  selectCanPlayAnimatedEmojis,
  selectCustomEmoji,
} from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { LIKE_STICKER_ID } from '../../common/helpers/mediaDimensions';
import { getCustomEmojiSize } from '../composer/helpers/customEmoji';

import useAnimatedEmoji from '../../common/hooks/useAnimatedEmoji';

import CustomEmoji from '../../common/CustomEmoji';

import './AnimatedEmoji.scss';

type OwnProps = {
  customEmojiId: string;
  withEffects?: boolean;
  isOwn?: boolean;
  forceLoadPreview?: boolean;
  messageId?: number;
  chatId?: string;
  activeEmojiInteractions?: ActiveEmojiInteraction[];
  observeIntersection?: ObserveFn;
};

interface StateProps {
  sticker?: ApiSticker;
  effect?: ApiSticker;
  soundId?: string;
  noPlay?: boolean;
}

const AnimatedCustomEmoji = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { ref, size, style, handleClick } = useAnimatedEmoji(
    () => props.chatId,
    () => props.messageId,
    () => props.soundId,
    () => props.activeEmojiInteractions,
    () => props.isOwn,
    () => props.effect?.emoji,
    getCustomEmojiSize(1),
  );

  return (
    <CustomEmoji
      ref={ref}
      documentId={props.customEmojiId}
      className={buildClassName(
        'AnimatedEmoji media-inner',
        props.sticker?.id === LIKE_STICKER_ID && 'like-sticker-thumb',
      )}
      style={style()}
      size={size()}
      isBig
      noPlay={props.noPlay}
      withSharedAnimation
      forceOnHeavyAnimation={Boolean(props.effect && props.activeEmojiInteractions?.length)}
      observeIntersectionForLoading={props.observeIntersection}
      onClick={handleClick}
    />
  );
};

const mapStateToProps = (global: GlobalState, { customEmojiId, withEffects }: OwnProps): Complete<StateProps> => {
  const sticker = selectCustomEmoji(global, customEmojiId);

  return {
    sticker,
    effect: sticker?.emoji && withEffects ? selectAnimatedEmojiEffect(global, sticker.emoji) : undefined,
    soundId: sticker?.emoji && selectAnimatedEmojiSound(global, sticker.emoji),
    noPlay: !selectCanPlayAnimatedEmojis(global),
  };
};

export default AnimatedCustomEmoji;

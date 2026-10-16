import { createMemo } from 'frameact';

import type { ApiSticker } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import buildClassName from '../../../util/buildClassName';

import CustomEmoji from '../../common/CustomEmoji';

import './EmojiButton.scss';

const CUSTOM_EMOJI_SIZE = 32;

type OwnProps = {
  emoji: ApiSticker;
  focus?: boolean;
  onClick?: (emoji: ApiSticker) => void;
  observeIntersection?: ObserveFn;
};

const CustomEmojiButton = (props: OwnProps) => {
  const handleClick = (e: MouseEvent) => {
    // Preventing safari from losing focus on Composer MessageInput
    e.preventDefault();

    props.onClick?.(props.emoji);
  };

  const className = createMemo(() => buildClassName('EmojiButton', props.focus && 'focus'));

  return (
    <div class={className()} onMouseDown={handleClick} title={props.emoji.emoji}>
      <CustomEmoji
        documentId={props.emoji.id}
        size={CUSTOM_EMOJI_SIZE}
        withSharedAnimation
        shouldPreloadPreview
        observeIntersectionForPlaying={props.observeIntersection}
      />
    </div>
  );
};

export default CustomEmojiButton;

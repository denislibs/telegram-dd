import { createMemo } from 'frameact';

import { IS_EMOJI_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { handleEmojiLoad, LOADED_EMOJIS } from '../../../util/emoji/emoji';

import './EmojiButton.scss';

type OwnProps = {
  emoji: Emoji;
  focus?: boolean;
  onClick: (emoji: string, name: string) => void;
};

const EmojiButton = (props: OwnProps) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    // Preventing safari from losing focus on Composer MessageInput
    e.preventDefault();

    props.onClick(props.emoji.native, props.emoji.id);
  };

  const className = createMemo(() => buildClassName('EmojiButton', props.focus && 'focus'));

  const src = createMemo(() => `./img-apple-64/${props.emoji.image}.png`);
  const isLoaded = createMemo(() => LOADED_EMOJIS.has(src()));

  return (
    <div class={className()} onMouseDown={handleClick} title={`:${props.emoji.names[0]}:`}>
      {IS_EMOJI_SUPPORTED ? (
        props.emoji.native
      ) : (
        <img
          src={src()}
          class={!isLoaded() ? 'opacity-transition shown' : undefined}
          alt={props.emoji.native}
          loading="lazy"
          data-path={src()}
          onLoad={!isLoaded() ? handleEmojiLoad : undefined}
          draggable={false}
        />
      )}
    </div>
  );
};

export default EmojiButton;

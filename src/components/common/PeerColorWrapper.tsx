import { createMemo } from 'frameact';
import { splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { ApiPeer, ApiTypePeerColor } from '../../api/types';

import { selectTheme } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { REM } from './helpers/mediaDimensions';

import useSelector from '../../hooks/data/useSelector';
import usePeerColor from '../../hooks/usePeerColor';

import CustomEmoji from './CustomEmoji';
import EmojiIconBackground from './embedded/EmojiIconBackground';

import styles from './PeerColorWrapper.module.scss';

// Deviation: `React.HTMLAttributes` -> the JSX attributes of the runtime; `class` is not an own prop (`className` is).
interface OwnProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'children' | 'class'> {
  ref?: (el: HTMLDivElement) => void;
  peer?: ApiPeer;
  peerColor?: ApiTypePeerColor;
  isReply?: boolean;
  noBar?: boolean;
  noUserColors?: boolean;
  shouldReset?: boolean;
  className?: string;
  emojiIconClassName?: string;
  children: JSX.Element;
}

const GIFT_EMOJI_SIZE = 1.25 * REM;

function PeerColorWrapper(props: OwnProps) {
  const [, otherProps] = splitProps(props, [
    'ref',
    'peer',
    'peerColor',
    'isReply',
    'noBar',
    'noUserColors',
    'shouldReset',
    'className',
    'emojiIconClassName',
    'children',
  ]);
  const color = createMemo(() => props.peerColor || props.peer?.color);
  const theme = useSelector(selectTheme);

  const peerColorResult = usePeerColor({
    peer: () => props.peer,
    color,
    noUserColors: () => props.noUserColors,
    shouldReset: () => props.shouldReset,
    theme,
  });
  const style = () => peerColorResult().style;
  const peerColorClassName = () => peerColorResult().className;
  const backgroundEmojiId = () => peerColorResult().backgroundEmojiId;
  const giftEmojiId = () => peerColorResult().giftEmojiId;
  const hasGiftEmoji = createMemo(() => props.isReply && Boolean(giftEmojiId()));

  return (
    <div
      ref={props.ref}
      class={buildClassName(
        styles.root,
        peerColorClassName(),
        hasGiftEmoji() && styles.hasGiftEmoji,
        !props.noBar && styles.withBar,
        props.className,
      )}
      style={style()}
      {...otherProps}
    >
      {backgroundEmojiId() && (
        <EmojiIconBackground
          className={props.emojiIconClassName}
          emojiDocumentId={backgroundEmojiId()!}
          withEmojiSpace={hasGiftEmoji()}
        />
      )}
      {hasGiftEmoji() && (
        <CustomEmoji className={styles.giftEmoji} documentId={giftEmojiId()!} size={GIFT_EMOJI_SIZE} noPlay />
      )}
      {props.children}
    </div>
  );
}

export default PeerColorWrapper;

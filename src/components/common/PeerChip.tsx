import { createMemo } from 'frameact';
import { withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';

import type { ApiPeer } from '../../api/types';
import type { CustomPeer, ThemeKey } from '../../types';
import type { IconName } from '../../types/icons';

import { getPeerTitle, isApiPeerChat } from '../../global/helpers/peers';
import { selectPeer, selectTheme, selectUser } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import { REM } from './helpers/mediaDimensions';

import useLang from '../../hooks/useLang';
import usePeerColor from '../../hooks/usePeerColor';

import Avatar from './Avatar';
import FullNameTitle from './FullNameTitle';
import Icon from './icons/Icon';

import styles from './PeerChip.module.scss';

const CHIP_SIZE_SMALL = 1.875 * REM;
const CHIP_SIZE_MEDIUM = 2 * REM;

export type PeerChipSize = 'small' | 'medium';

type OwnProps<T = undefined> = {
  peerId?: string;
  size?: PeerChipSize;
  forceShowSelf?: boolean;
  customPeer?: CustomPeer;
  mockPeer?: ApiPeer;
  icon?: IconName;
  title?: string;
  isMinimized?: boolean;
  canClose?: boolean;
  isCloseNonDestructive?: boolean;
  className?: string;
  itemClassName?: string;
  withPeerColors?: boolean;
  withEmojiStatus?: boolean;
  clickArg?: T;
  onClick?: (arg: T) => void;
};

type StateProps = {
  peer?: ApiPeer;
  theme: ThemeKey;
  isSavedMessages?: boolean;
};

const PeerChip = <T,>(ownProps: OwnProps<T>) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const lang = useLang();

  const apiPeer = createMemo(() => props.mockPeer || props.peer);
  const anyPeer = createMemo(() => props.customPeer || apiPeer());

  const peerColor = usePeerColor({
    peer: anyPeer,
    theme: () => props.theme,
  });
  const peerColorClass = () => peerColor().className;
  const peerColorStyle = () => peerColor().style;

  const chat = createMemo(() => {
    const peer = apiPeer();
    return peer && isApiPeerChat(peer) ? peer : undefined;
  });

  // Deviation: tt built these in an `if` of the render body; the branches are reactive bindings on booleans, so an
  // edited peer entity updates `Avatar` / `FullNameTitle` in place (they read it through the getter) instead of
  // recreating them.
  const hasIconAndTitle = createMemo(() => Boolean(props.icon && props.title));
  const hasAnyPeer = createMemo(() => Boolean(anyPeer()));

  const iconElement = (
    <>
      {hasIconAndTitle() ? (
        <div class={styles.iconWrapper}>
          <Icon name={props.icon!} style={styles.icon} />
        </div>
      ) : hasAnyPeer() ? (
        <Avatar className={styles.avatar} peer={anyPeer()} size="small" isSavedMessages={props.isSavedMessages} />
      ) : undefined}
    </>
  );

  const titleText = createMemo(() => {
    const peer = anyPeer();
    return !hasIconAndTitle() && peer ? getPeerTitle(lang, peer) || props.title : undefined;
  });

  const titleElement = (
    <>
      {hasIconAndTitle() ? (
        props.title
      ) : hasAnyPeer() ? (
        props.title || (
          <FullNameTitle
            peer={anyPeer()!}
            isSavedMessages={props.isSavedMessages}
            withEmojiStatus={props.withEmojiStatus}
          />
        )
      ) : undefined}
    </>
  );

  const fullClassName = createMemo(() =>
    buildClassName(
      styles.root,
      (props.size === undefined ? 'medium' : props.size) === 'small' && styles.small,
      (chat()?.isForum || props.customPeer?.isAvatarSquare) && styles.squareAvatar,
      props.isMinimized && styles.minimized,
      props.canClose && styles.closeable,
      props.isCloseNonDestructive && styles.nonDestructive,
      !props.onClick && styles.notClickable,
      props.withPeerColors && peerColorClass(),
      props.className,
    ),
  );

  const chipSize = createMemo(() =>
    (props.size === undefined ? 'medium' : props.size) === 'small' ? CHIP_SIZE_SMALL : CHIP_SIZE_MEDIUM,
  );

  const style = createMemo(() => buildStyle(`--chip-size: ${chipSize()}px`, props.withPeerColors && peerColorStyle()));

  return (
    <div
      class={fullClassName()}
      style={style()}
      onClick={() => props.onClick?.(props.clickArg!)}
      title={props.isMinimized ? titleText() : undefined}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      {iconElement}
      {!props.isMinimized && (
        <div class={buildClassName(styles.name, props.itemClassName)} dir="auto">
          {titleElement}
        </div>
      )}
      {props.canClose && (
        <div class={styles.remove}>
          <Icon name="close" />
        </div>
      )}
    </div>
  );
};

const mapStateToProps = (
  global: GlobalState,
  { peerId, forceShowSelf }: Pick<OwnProps, 'peerId' | 'forceShowSelf'>,
): Complete<StateProps> => {
  const theme = selectTheme(global);
  if (!peerId) {
    return {
      peer: undefined,
      isSavedMessages: undefined,
      theme,
    };
  }

  const peer = selectPeer(global, peerId);
  const user = selectUser(global, peerId);
  const isSavedMessages = !forceShowSelf && user && user.isSelf;

  return {
    peer,
    isSavedMessages,
    theme,
  };
};

export default PeerChip as <T>(props: OwnProps<T>) => ReturnType<typeof PeerChip<T>>;

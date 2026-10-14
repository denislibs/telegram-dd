import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
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

const PeerChip = <T,>(ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const lang = useLang();

  const apiPeer = createMemo(() => props.mockPeer || props.peer);
  const anyPeer = createMemo(() => props.customPeer || apiPeer());

  const peerColorResult = createMemo(() =>
    usePeerColor({
      peer: () => anyPeer(),
      theme: () => props.theme,
    }),
  );
  const peerColorClass = () => peerColorResult().className;
  const peerColorStyle = () => peerColorResult().style;

  const chat = createMemo(() => (apiPeer() && isApiPeerChat(apiPeer()) ? apiPeer() : undefined));

  let iconElement: JSX.Element | undefined;
  let titleElement: JSX.Element | undefined;
  let titleText: string | undefined;

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.icon && props.title) {
    iconElement = (
      <div class={styles.iconWrapper}>
        <Icon name={props.icon} style={styles.icon} />
      </div>
    );

    titleElement = props.title;
  } else if (anyPeer()) {
    iconElement = (
      <Avatar className={styles.avatar} peer={anyPeer()} size="small" isSavedMessages={props.isSavedMessages} />
    );

    titleText = getPeerTitle(lang, anyPeer()) || props.title;
    titleElement = props.title || (
      <FullNameTitle peer={anyPeer()} isSavedMessages={props.isSavedMessages} withEmojiStatus={props.withEmojiStatus} />
    );
  }

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
      title={props.isMinimized ? titleText : undefined}
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

const mapStateToProps = (global: GlobalState, { peerId, forceShowSelf }: OwnProps): Complete<StateProps> => {
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

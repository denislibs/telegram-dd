import { createMemo } from 'frameact';
import { For, mergeProps } from 'frameact/dom';

import type { ApiPeer } from '../../api/types';
import type { AvatarSize } from './Avatar';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import Avatar, { AVATAR_SIZES } from './Avatar';

import styles from './AvatarList.module.scss';

const DEFAULT_LIMIT = 3;

type OwnProps = {
  size: AvatarSize;
  peers?: ApiPeer[];
  className?: string;
  limit?: number;
  badgeText?: string;
};

const AvatarList = (rawProps: OwnProps) => {
  const props = mergeProps({ limit: DEFAULT_LIMIT }, rawProps) as OwnProps & Required<Pick<OwnProps, 'limit'>>;
  const lang = useLang();

  const pxSize = createMemo(() => (typeof props.size === 'number' ? props.size : AVATAR_SIZES[props.size]));

  const renderingBadgeText = createMemo(() => {
    if (props.badgeText) return props.badgeText;
    if (!props.peers?.length || props.peers.length <= props.limit) return undefined;
    return `+${props.peers.length - props.limit}`;
  });

  return (
    <div
      class={buildClassName(props.className, styles.root)}
      style={`--_size: ${pxSize()}px;`}
      dir={lang.isRtl ? 'rtl' : 'ltr'}
    >
      <For each={props.peers?.slice(0, props.limit)} keyed={(peer) => peer.id}>
        {(peer) => <Avatar size={props.size} peer={peer()} className={styles.avatar} />}
      </For>
      {renderingBadgeText() && <div class={styles.badge}>{renderingBadgeText()}</div>}
    </div>
  );
};

export default AvatarList;

import { createMemo } from 'frameact';

import type { ApiPeer } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';

import useAverageColor from '../../../hooks/useAverageColor';

import AutoDeleteOutlinedIcon from './AutoDeleteOutlinedIcon';

import styles from './AutoDeleteIcon.module.scss';

type OwnProps = {
  period: number;
  peer: ApiPeer;
  className?: string;
  ariaLabel?: string;
};

const AVATAR_FALLBACK_COLOR = '#0003';

function AutoDeleteIcon(props: OwnProps) {
  const averageColor = useAverageColor(() => props.peer, AVATAR_FALLBACK_COLOR);
  const hasAvatarPhoto = createMemo(() => Boolean(props.peer.avatarPhotoId));

  return (
    <span
      class={buildClassName(styles.root, props.className)}
      style={hasAvatarPhoto() ? `background-color: ${averageColor()}` : undefined}
      role="img"
      aria-label={props.ariaLabel}
    >
      <AutoDeleteOutlinedIcon period={props.period} className={styles.glyph} />
    </span>
  );
}

export default AutoDeleteIcon;

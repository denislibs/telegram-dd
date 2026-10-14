import type { AriaRole } from 'react';
import { Show } from 'frameact/dom';

import type { IconName } from '../../../types/icons';

import { selectIsCurrentUserPremium } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';

import useSelector from '../../../hooks/data/useSelector';

import styles from './Icon.module.scss';

type OwnProps = {
  name: IconName;
  className?: string;
  style?: string;
  role?: AriaRole;
  ariaLabel?: string;
  character?: string;
  hasPremiumBadge?: boolean;
  ref?: (el: HTMLElement) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

const Icon = (props: OwnProps) => {
  return (
    <Show when={!props.hasPremiumBadge} fallback={<IconWithPremiumBadge {...props} />}>
      {renderIcon(props)}
    </Show>
  );
};

const IconWithPremiumBadge = (props: OwnProps) => {
  const isCurrentUserPremium = useSelector(selectIsCurrentUserPremium);

  return renderIcon(props, !isCurrentUserPremium());
};

function renderIcon(
  { name, ref, className, style, role, ariaLabel, character, onClick }: OwnProps,
  hasPremiumBadge?: boolean,
) {
  return (
    <i
      ref={ref}
      class={buildClassName(`icon icon-${name}`, className, hasPremiumBadge && styles.hasPremiumBadge)}
      style={style}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
      data-char={character}
      role={role}
      onClick={onClick}
    />
  );
}

export default Icon;

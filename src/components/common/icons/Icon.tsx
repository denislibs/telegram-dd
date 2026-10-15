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
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
};

const Icon = (props: OwnProps) => {
  return (
    <Show when={props.hasPremiumBadge} fallback={renderIcon(props)}>
      <IconWithPremiumBadge {...props} />
    </Show>
  );
};

const IconWithPremiumBadge = (props: OwnProps) => {
  const isCurrentUserPremium = useSelector(selectIsCurrentUserPremium);

  return renderIcon(props, () => !isCurrentUserPremium());
};

function renderIcon(props: OwnProps, hasPremiumBadge?: () => boolean) {
  return (
    <i
      ref={props.ref}
      class={buildClassName(`icon icon-${props.name}`, props.className, hasPremiumBadge?.() && styles.hasPremiumBadge)}
      style={props.style}
      // Deviation: frameact writes a boolean attribute value `true` as an empty string (`aria-hidden=""`, which ARIA does not read
      // as hidden); React wrote "true" / "false".
      aria-hidden={props.ariaLabel ? 'false' : 'true'}
      aria-label={props.ariaLabel}
      data-char={props.character}
      role={props.role}
      onClick={(e) => props.onClick?.(e)}
    />
  );
}

export default Icon;

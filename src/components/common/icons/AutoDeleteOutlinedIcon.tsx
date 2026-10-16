import { createMemo } from 'frameact';

import buildClassName from '../../../util/buildClassName';
import { formatAutoDeleteBadgePeriod } from '../helpers/autoDeletePeriods';

import useLang from '../../../hooks/useLang';

import styles from './AutoDeleteOutlinedIcon.module.scss';

type OwnProps = {
  period: number;
  className?: string;
};

// Line-style counterpart of `AutoDeleteIcon` tinted via `currentColor`; a period of 0 renders as a plain clock.
// Composes the font-icon classes manually because `Icon` cannot host the overlay label.
function AutoDeleteOutlinedIcon(props: OwnProps) {
  const lang = useLang();

  const periodText = createMemo(() => (props.period ? formatAutoDeleteBadgePeriod(lang, props.period) : undefined));
  const iconName = createMemo(() => (periodText() === undefined ? 'auto-delete-clock' : 'auto-delete-empty'));

  return (
    <i class={buildClassName('icon', `icon-${iconName()}`, styles.root, props.className)} aria-hidden="true">
      {periodText() !== undefined && (
        <span class={styles.label} dir="ltr">
          {periodText()}
        </span>
      )}
    </i>
  );
}

export default AutoDeleteOutlinedIcon;

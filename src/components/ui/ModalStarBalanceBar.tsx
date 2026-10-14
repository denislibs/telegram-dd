import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';
import { createShowTransition } from '../../lib/kit';
import type { GlobalState } from '../../global/types';

import type { ApiStarsAmount, ApiTonAmount } from '../../api/types';

import { formatStarsAmount } from '../../global/helpers/payments';
import buildClassName from '../../util/buildClassName';
import { convertTonFromNanos, convertTonToUsd, formatCurrencyAsString } from '../../util/formatCurrency';
import { formatStarsAsIcon, formatTonAsIcon, NEXT_ARROW_REPLACEMENT } from '../../util/localization/format';

import useIsTopmostBalanceBarModal from '../../hooks/element/useIsTopmostBalanceBarModal';
import useLang from '../../hooks/useLang';

import Link from './Link';

import styles from './ModalStarBalanceBar.module.scss';

export type OwnProps = {
  isModalOpen?: true;
  currency?: 'TON' | 'XTR';
  onCloseAnimationEnd?: () => void;
};

export type StateProps = {
  starBalance?: ApiStarsAmount;
  tonBalance?: ApiTonAmount;
  tonUsdRate?: number;
};

function ModalStarBalanceBar() {
  const props = withGlobal({}, mapStateToProps);
  const { openStarsBalanceModal } = getActions();

  const lang = useLang();
  const isTonMode = createMemo(() => props.currency === 'TON');
  const currentBalance = createMemo(() => (isTonMode() ? props.tonBalance : props.starBalance));
  const isOpen = createMemo(() => (props.isModalOpen ? Boolean(currentBalance()) : false));

  const { ref, shouldRender } = createShowTransition({
    isOpen: () => isOpen(),
    onCloseAnimationEnd: props.onCloseAnimationEnd,
  });

  const isTopmost = useIsTopmostBalanceBarModal(ref, () => Boolean(shouldRender() && currentBalance()));

  const handleGetMoreStars = () => {
    openStarsBalanceModal(isTonMode() ? { currency: 'TON' } : {});
  };

  return (
    <Show when={!(!shouldRender() || !currentBalance())}>
      <div class={buildClassName(styles.root, !isTopmost && styles.hidden)} ref={ref}>
        <div>
          {isTonMode()
            ? lang(
                'ModalStarsBalanceBarDescription',
                {
                  stars: formatTonAsIcon(lang, convertTonFromNanos(currentBalance().amount)),
                },
                {
                  withNodes: true,
                  withMarkdown: true,
                },
              )
            : lang(
                'ModalStarsBalanceBarDescription',
                {
                  stars: formatStarsAsIcon(lang, formatStarsAmount(lang, currentBalance() as ApiStarsAmount)),
                },
                {
                  withNodes: true,
                  withMarkdown: true,
                },
              )}
        </div>
        <div>
          {isTonMode() && Boolean(props.tonUsdRate) && (
            <div class={styles.tonInUsdDescription} style="color: var(--color-text-secondary)">
              {`≈ ${formatCurrencyAsString(
                convertTonToUsd((currentBalance() as ApiTonAmount).amount, props.tonUsdRate, true),
                'USD',
                lang.code,
              )}`}
            </div>
          )}
          {!isTonMode() && (
            <Link className={styles.getMoreStarsLink} isPrimary onClick={handleGetMoreStars}>
              {lang('GetMoreStarsLinkText', undefined, {
                withNodes: true,
                specialReplacement: NEXT_ARROW_REPLACEMENT,
              })}
            </Link>
          )}
        </div>
      </div>
    </Show>
  );
}

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const { stars, ton } = global;

  return {
    starBalance: stars?.balance,
    tonBalance: ton?.balance,
    tonUsdRate: global.appConfig.tonUsdRate,
  };
};

export default ModalStarBalanceBar;

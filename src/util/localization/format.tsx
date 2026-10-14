// FOUNDATION STUB: the plain-text formatters are telegram-tt's code; the `*AsIcon` formatters (they return JSX with
// `<StarIcon>`/`<GramIcon>` nodes) and the arrow replacements are ported with the components (T6) and return text here.
// Copied from telegram-tt src/util/localization/format.tsx
import type { ApiTypeCurrencyAmount } from '../../api/types';

import { TON_CURRENCY_CODE } from '../../config';
import { convertTonFromNanos, formatTonFromNanos, formatTonShortFromNanos } from '../formatCurrency';
import type { LangFn } from '.';

export function formatStarsAsText(lang: LangFn, amount: number) {
  return lang('StarsAmountText', { amount }, { pluralValue: amount });
}

export function formatTonAsText(lang: LangFn, amount: number, shouldConvertFromNanos?: boolean) {
  const formattedAmount = shouldConvertFromNanos ? convertTonFromNanos(Number(amount)) : amount;
  return lang('GramAmountText', { amount: lang.preciseNumber(formattedAmount) }, { pluralValue: formattedAmount });
}

export function formatTonTextFromNanos(lang: LangFn, nanos: number, isShort?: boolean) {
  const amount = isShort ? formatTonShortFromNanos(nanos) : formatTonFromNanos(nanos);

  return lang('GramAmountText', { amount }, { pluralValue: convertTonFromNanos(nanos) });
}

export function formatTonAsIcon(
  lang: LangFn,
  amount: number | string,
  options?: {
    className?: string;
    containerClassName?: string;
    withWrapper?: boolean;
    shouldConvertFromNanos?: boolean;
    isMono?: boolean;
    withIconLast?: boolean;
  },
) {
  const formattedAmount = options?.shouldConvertFromNanos ? convertTonFromNanos(Number(amount)) : amount;
  return lang('GramAmount', { amount: formattedAmount });
}

export function formatStarsAsIcon(
  lang: LangFn,
  amount: number | string,
  options?: {
    asFont?: boolean;
    className?: string;
    containerClassName?: string;
    withWrapper?: boolean;
    withIconLast?: boolean;
  },
) {
  return lang(options?.withIconLast ? 'StarsAmountIconLast' : 'StarsAmount', { amount });
}

export function formatCurrencyAmountAsText(lang: LangFn, currencyAmount: ApiTypeCurrencyAmount) {
  if (currencyAmount.currency === TON_CURRENCY_CODE) {
    return formatTonAsText(lang, currencyAmount.amount, true);
  }

  const amount = currencyAmount.amount + currencyAmount.nanos / 1e9;
  return formatStarsAsText(lang, amount);
}

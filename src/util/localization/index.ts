// FOUNDATION STUB: the localization runtime (lang packs, formatters, `replaceWithTeact`, reactive `useLang`) is ported
// with the app layer (T6). The global layer calls the functions below non-reactively from actions: here the lang
// function returns empty strings, the pack functions do nothing.
// Copied (signatures) from telegram-tt src/util/localization/index.ts
import type { ApiLanguage, LangPackStringValue } from '../../api/types';
import type { TimeFormat } from '../../types';
import type { LangFn } from './types';

export type { LangFn, LangFnParameters, RegularLangFnParameters, AdvancedLangFnParameters } from './types';

// Inert on purpose (review m5): a lang function that echoed the key would send internal keys out — a bot-forum topic
// title (`actions/api/messages.ts`) and a passkey name (`util/passcode/passkey.ts`) are built from `lang('…')` and go to
// the server and to the OS. So every translation is the empty string, and every `LangFn` member exists (a missing one
// throws a TypeError where tt has a string). T6 blocker: the real runtime.
const echoNothing = () => '';
const joinList = (list: string[]) => list.join(', ');
const translationFn = Object.assign(echoNothing, {
  with: echoNothing,
  withRegular: echoNothing,
  withAdvanced: echoNothing,
  region: () => undefined,
  currency: () => undefined,
  conjunction: joinList,
  disjunction: joinList,
  number: (value: number) => String(value),
  preciseNumber: (value: number) => String(value),
  timeFormat: '24h',
  internalFormatters: {},
  isRtl: false,
  rawCode: 'en',
  code: 'en',
}) as unknown as LangFn;

export function getTranslationFn(): LangFn {
  return translationFn;
}

export function applyLangPackDifference(
  _version: number,
  _strings: Record<string, LangPackStringValue>,
  _keysToRemove: string[],
) {}

export function requestLangPackDifference(_langCode: string) {}

export async function refreshFromCache(_langCode: string) {}

export async function loadAndChangeLanguage(_langCode: string, _shouldCheckCache?: boolean) {}

export async function changeLanguage(_newLanguage: ApiLanguage) {}

export async function initLocalization(_langCode: string, _canLoadFromServer?: boolean) {}

export function setTimeFormat(_timeFormat: TimeFormat) {}

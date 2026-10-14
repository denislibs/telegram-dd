// FOUNDATION STUB: the localization runtime (lang packs, formatters, `replaceWithTeact`, reactive `useLang`) is ported
// with the app layer (T6). The global layer calls the functions below non-reactively from actions: here the lang
// function echoes the key, the pack functions do nothing.
// Copied (signatures) from telegram-tt src/util/localization/index.ts
import type { ApiLanguage, LangPackStringValue } from '../../api/types';
import type { TimeFormat } from '../../types';
import type { LangFn } from './types';

export type { LangFn, LangFnParameters, RegularLangFnParameters, AdvancedLangFnParameters } from './types';

const translationFn = Object.assign((key: string) => key, {
  isRtl: false,
  number: (value: number) => String(value),
  preciseNumber: (value: number) => String(value),
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

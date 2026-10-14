import { createEffect, createSignal } from 'frameact';

import type { RegularLangKey } from '../types/language';

import { LANG_PACK } from '../config';
import { callApi } from '../api/gramjs';
import useLastCallback from './useLastCallback';

// TODO(codemod): useLangString: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useLangString(key: RegularLangKey, langCode?: string) {
  const [value, setValue] = createSignal<string | undefined>(undefined);

  const fetchLangString = async () => {
    if (!langCode) return undefined;

    const result = await callApi('fetchLangStrings', {
      langCode,
      langPack: LANG_PACK,
      keys: [key],
    });
    const langString = result?.strings[key];
    if (!langString || typeof langString !== 'string') return undefined;
    return langString;
  };

  createEffect(
    () => [key, langCode],
    () => {
      fetchLangString().then(setValue);
    },
  );

  return value;
}

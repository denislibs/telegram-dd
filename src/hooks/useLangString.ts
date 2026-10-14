import { createEffect, createSignal } from 'frameact';

import type { RegularLangKey } from '../types/language';

import { LANG_PACK } from '../config';
import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';
import { callApi } from '../api/gramjs';

export default function useLangString(
  key: MaybeAccessor<RegularLangKey>,
  langCode?: MaybeAccessor<string | undefined>,
) {
  const [value, setValue] = createSignal<string | undefined>(undefined);

  const fetchLangString = async () => {
    const code = read(langCode);
    if (!code) return undefined;

    const result = await callApi('fetchLangStrings', {
      langCode: code,
      langPack: LANG_PACK,
      keys: [read(key)],
    });
    const langString = result?.strings[read(key)];
    if (!langString || typeof langString !== 'string') return undefined;
    return langString;
  };

  createEffect(
    depsOf(() => [read(key), read(langCode)]),
    () => {
      fetchLangString().then(setValue);
    },
  );

  return value;
}

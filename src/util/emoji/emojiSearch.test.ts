// Original test (not in telegram-tt): the keyword library of the `:` emoji tooltip is built once per keyword set. Its
// `memoized` cache works for plain objects only: a store proxy keeps its identity while its content changes, so
// `memoized` recomputes for one on every call (the composer hands the tooltip `unwrap`ped values for that reason,
// fidelity review M2).
import { createStore, unwrap } from 'frameact/store';
import { expect, it } from 'vitest';

import { prepareEmojiLibraryMemo, searchEmojiLibraryMemo } from './emojiSearch';

const emoji = (id: string, native: string, names: string[]) => ({ id, native, names, image: id, skin: undefined });

it('builds the keyword library once for the same plain keyword objects, and on every call for store proxies', () => {
  const byId = { smile: emoji('smile', '😄', ['smile']), cat: emoji('cat', '🐱', ['cat']) } as unknown as Record<
    string,
    Emoji
  >;
  const [state] = createStore({
    baseEmojiKeywords: { happy: ['😄'] },
    emojiKeywords: { kitty: ['🐱'] },
  });

  const viaProxies = prepareEmojiLibraryMemo(byId, state.baseEmojiKeywords, state.emojiKeywords);
  expect(prepareEmojiLibraryMemo(byId, state.baseEmojiKeywords, state.emojiKeywords)).not.toBe(viaProxies);

  const base = unwrap(state.baseEmojiKeywords);
  const keywords = unwrap(state.emojiKeywords);
  const library = prepareEmojiLibraryMemo(byId, base, keywords);
  expect(prepareEmojiLibraryMemo(byId, base, keywords)).toBe(library);
  expect(searchEmojiLibraryMemo(library, 'kit', 10).map((item) => item.native)).toEqual(['🐱']);
  expect(searchEmojiLibraryMemo(library, 'hap', 10).map((item) => item.native)).toEqual(['😄']);
});

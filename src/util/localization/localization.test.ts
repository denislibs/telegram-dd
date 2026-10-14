import { describe, expect, it } from 'vitest';

import { getTranslationFn, initLocalization } from './index';

describe('the localization runtime (tt code over the bundled fallback pack)', () => {
  it('answers from the bundled fallback pack once it is read', async () => {
    await initLocalization('en', false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const loaded = getTranslationFn();
    expect(loaded('AuthTitle')).toBe('Telegram');
    expect(loaded('LoginNext')).toBe('Next');
    expect(loaded('StarsAmountText', { amount: 3 }, { pluralValue: 3 })).toContain('3');
    expect(loaded.code).toBe('en');
  });

  it('answers with the key for a string that does not exist', () => {
    expect(getTranslationFn()('NoSuchKeyInAnyPack' as 'AuthTitle')).toBe('NoSuchKeyInAnyPack');
  });
});

it('substitutes a variable literally: `$\'`, `$&` and `$$` in a value are not replacement patterns', async () => {
  await initLocalization('en', false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const lang = getTranslationFn();
  expect(lang('UserTyping', { user: "$' and $& and $$ and $`" })).toBe("$' and $& and $$ and $` is typing");
});


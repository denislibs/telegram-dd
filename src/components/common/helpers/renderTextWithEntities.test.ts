// Original test (not in telegram-tt): the foundation stub conceals Spoiler ranges (the chat list is always on screen).
import { describe, expect, it } from 'vitest';

import { ApiMessageEntityTypes } from '../../../api/types';

import { concealSpoilers, renderTextWithEntities } from './renderTextWithEntities';

const spoiler = (offset: number, length: number) => ({ type: ApiMessageEntityTypes.Spoiler, offset, length });
const BRAILLE = /^[⠀-⣿]+$/;

describe('renderTextWithEntities stub', () => {
  it('returns the text as it is without entities or without a Spoiler', () => {
    expect(renderTextWithEntities({ text: 'hello' })).toEqual(['hello']);
    expect(
      renderTextWithEntities({ text: 'hello', entities: [{ type: ApiMessageEntityTypes.Bold, offset: 0, length: 5 }] }),
    ).toEqual(['hello']);
  });

  it('conceals a Spoiler range with characters of the same length and keeps the rest', () => {
    const [result] = renderTextWithEntities({ text: 'code 12345 now', entities: [spoiler(5, 5)] });
    const text = result as string;
    expect(text).toHaveLength('code 12345 now'.length);
    expect(text.startsWith('code ')).toBe(true);
    expect(text.endsWith(' now')).toBe(true);
    expect(text.slice(5, 10)).toMatch(BRAILLE);
    expect(text).not.toContain('12345');
  });

  it('merges overlapping and adjacent ranges and ignores ranges outside the text', () => {
    const text = concealSpoilers('0123456789', [spoiler(2, 4), spoiler(4, 4), spoiler(8, 50), spoiler(-3, 2)]);
    expect(text).toHaveLength(10);
    expect(text.slice(0, 2)).not.toMatch(BRAILLE); // -3..-1 is outside
    expect(text.slice(2, 10)).toMatch(BRAILLE);
    expect(text).not.toMatch(/[2-9]/);
  });
});

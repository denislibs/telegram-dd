// Original test (not in telegram-tt): a custom emoji id that is not a number (from a hostile clipboard) is never
// queued, so it cannot fail the `loadCustomEmojis` batch of the other emoji (`BigInt('not-a-number')` throws).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  loadCustomEmojis: vi.fn<(payload: { ids: string[] }) => void>(),
  updateLastRenderedCustomEmojis: vi.fn<(payload: { ids: string[] }) => void>(),
}));

vi.mock('../../global', () => ({
  getActions: () => actions,
  getGlobal: () => ({ customEmojis: { byId: {} } }),
}));

describe('ensureCustomEmoji', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads only numeric 64-bit ids', async () => {
    const { default: ensureCustomEmoji } = await import('./ensureCustomEmoji');

    ['5368324170671202286', 'not-a-number', '1e300', '99999999999999999999', '-42', ''].forEach(ensureCustomEmoji);
    vi.advanceTimersByTime(1000);

    const loaded = actions.loadCustomEmojis.mock.calls.flatMap(([{ ids }]) => ids);
    expect(loaded).toEqual(['5368324170671202286', '-42']);
    loaded.forEach((id) => expect(() => BigInt(id)).not.toThrow());
    const rendered = actions.updateLastRenderedCustomEmojis.mock.calls.flatMap(([{ ids }]) => ids);
    expect(rendered.sort()).toEqual(['-42', '5368324170671202286']);
  });
});

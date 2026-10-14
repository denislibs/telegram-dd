import { createMemo, createRoot } from 'frameact';
import { createStore } from 'frameact/store';
import { describe, expect, it } from 'vitest';

import memoized from './memoized';

describe('memoized over store containers (N2)', () => {
  it('bypasses the identity cache when an argument is a store proxy, so a mapper keeps tracking', () => {
    const [state, setState] = createStore<{ bots: Record<string, { username: string }> }>({ bots: { w: { username: 'wallet' } } });
    let calls = 0;
    const findWalletBotId = memoized((bots: Record<string, { username: string }>) => {
      calls++;
      return Object.keys(bots).find((id) => bots[id].username === 'wallet');
    });
    createRoot((dispose) => {
      const id = createMemo(() => findWalletBotId(state.bots));
      expect(id()).toBe('w');
      setState('bots', 'w', 'username', 'other'); // the container keeps its identity, only a leaf changed
      expect(id()).toBeUndefined();
      expect(calls).toBe(2);
      dispose();
    });
    // tt objects (no proxy): the cache works as in tt
    const plain = { x: { username: 'wallet' } };
    findWalletBotId(plain);
    findWalletBotId(plain);
    expect(calls).toBe(3);
  });
});

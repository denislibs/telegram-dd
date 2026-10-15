import { type Accessor, createMemo, createSignal, onCleanup } from 'frameact';

// Not in tt (a performance deviation): a window of rows that gains many ids at once (a page-in of the infinite scroll,
// the first mount of a folder's list) mounts them over several frames, `chunk` rows per frame, the ids next to the rows
// already mounted first (for a list mounted from scratch: from the top). A small change (a reorder, a few new ids) is
// applied at once. The result is always a subsequence of `ids()` in its order, and it catches up with `ids()`.
//
// Why: mounting a chat row costs ~1 ms at 4x CPU throttling, so a page-in of 30 rows was one 50-100 ms task;
// tt's teact row is cheaper and stayed under the long-task line. The rows that wait are below the visible part
// (the infinite scroll asks for more ~800 px before the end).
export default function useProgressiveIds<T>(ids: Accessor<T[] | undefined>, chunk: number): Accessor<T[] | undefined> {
  const [tick, setTick] = createSignal(0);
  let rendered: T[] | undefined;
  let frame: number | undefined;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
  });

  const scheduleNext = () => {
    if (frame !== undefined || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed) setTick((value) => value + 1);
    });
  };

  return createMemo(() => {
    tick();
    const next = ids();
    if (!next) {
      rendered = next;
      return next;
    }

    const mounted = new Set(rendered);
    const missing: number[] = [];
    const keptIndexes: number[] = [];
    for (let i = 0; i < next.length; i++) {
      if (mounted.has(next[i])) keptIndexes.push(i);
      else missing.push(i);
    }
    if (missing.length <= chunk) {
      rendered = next;
      return next;
    }

    // Distance of each missing index to the nearest kept one (both arrays are ascending): rows next to what is on
    // screen come first. Nothing kept (a list mounted from scratch, at its top): the index itself.
    const distance = (index: number) => {
      if (!keptIndexes.length) return index;
      let lo = 0;
      let hi = keptIndexes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (keptIndexes[mid] < index) lo = mid + 1;
        else hi = mid;
      }
      const after = Math.abs(keptIndexes[lo] - index);
      const before = lo > 0 ? Math.abs(index - keptIndexes[lo - 1]) : Infinity;
      return Math.min(after, before);
    };
    const chosen = new Set(
      missing
        .map((index) => [index, distance(index)] as const)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
        .slice(0, chunk)
        .map(([index]) => index),
    );

    rendered = next.filter((id, index) => mounted.has(id) || chosen.has(index));
    scheduleNext();
    return rendered;
  });
}

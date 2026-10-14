// A small Myers line diff with a cost cap (so a fully rewritten file stays fast and deterministic).

export type SeqDiff = {
  /** Indices of `a` that are not in the common subsequence. */
  deleted: number[];
  /** Indices of `b` that are not in the common subsequence. */
  inserted: number[];
  /** The edit cap was hit: everything between the common prefix and suffix is reported as changed. */
  truncated: boolean;
};

export function diffSeq(a: string[], b: string[], maxEdits = 4000): SeqDiff {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const deleted: number[] = [];
  const inserted: number[] = [];
  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0) {
    for (let i = start; i < endA; i++) deleted.push(i);
    for (let j = start; j < endB; j++) inserted.push(j);
    return { deleted, inserted, truncated: false };
  }

  const limit = Math.min(n + m, maxEdits);
  const v = new Int32Array(2 * (limit + 1) + 3);
  const off = limit + 2;
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= limit && found < 0; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }

  if (found < 0) {
    for (let i = start; i < endA; i++) deleted.push(i);
    for (let j = start; j < endB; j++) inserted.push(j);
    return { deleted, inserted, truncated: true };
  }

  let x = n;
  let y = m;
  for (let d = found; d >= 1; d--) {
    const snap = trace[d]; // v before step d, covers k in [-(d+1), d+1]
    const at = (k: number) => snap[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
    }
    if (x === prevX) inserted.push(start + prevY);
    else deleted.push(start + prevX);
    x = prevX;
    y = prevY;
  }
  deleted.reverse();
  inserted.reverse();
  return { deleted, inserted, truncated: false };
}

// The CPU benchmark of the calibrated throttling (see cpuCalibration.ts). Plain JavaScript on purpose: it is serialised into
// the page as source text, and a TypeScript transform (tsx / esbuild `keepNames`) would add helpers the page does not have.
/**
 * The CPU benchmark, REVISION 1. It runs in the page (serialised by `page.evaluate`), so it is self-contained and
 * deterministic: a seeded generator, fixed sizes, no clock in the work itself. The mix is what rendering a list of chats is
 * made of: objects and arrays built and sorted, strings split / joined / replaced, JSON, maps and sets, a regexp.
 * Returns the times of `rounds` runs (ms) after `warmup` untimed ones, and a checksum of the work (so it cannot be
 * optimised away, and a changed workload shows up in the unit test).
 */
export function cpuBenchmark(options) {
  let seed = 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const workload = () => {
    seed = 123456789; // every round does the same work
    let sum = 0;
    // objects and arrays: rows with nested data, mapped, filtered, sorted
    const rows = [];
    for (let i = 0; i < 6000; i++) {
      const title = `chat ${Math.floor(random() * 1e6).toString(36)} ${i}`;
      rows.push({
        id: i,
        title,
        tags: [title.slice(0, 3), String(i % 17), title.toUpperCase().slice(-2)],
        unread: Math.floor(random() * 100),
        date: Math.floor(random() * 1e9),
      });
    }
    const sorted = rows
      .filter((row) => row.unread % 3 !== 0)
      .map((row) => ({ ...row, key: `${row.date}:${row.id}` }))
      .sort((a, b) => b.date - a.date || a.id - b.id);
    sum += sorted.length + sorted[0].id;

    // strings: split, join, replace, regexp, case
    let text = '';
    for (let i = 0; i < 1500; i++) text += `${rows[i].title} - ${rows[i].tags.join(',')}\n`;
    const lines = text.split('\n');
    for (const line of lines) {
      sum += line.replace(/[aeiou]/g, '').length;
      sum += line.split(' ').length;
      if (/chat [a-z0-9]+ \d+7\b/.test(line)) sum++;
    }
    sum += lines.join('|').toLowerCase().length;

    // JSON round trip
    const copy = JSON.parse(JSON.stringify(rows.slice(0, 2500)));
    sum += copy.length + copy[copy.length - 1].tags.length;

    // maps and sets keyed by strings and numbers
    const byId = new Map();
    const titles = new Set();
    for (const row of rows) {
      byId.set(row.id, row);
      titles.add(row.title.slice(0, 8));
    }
    for (let i = 0; i < 6000; i++) {
      const row = byId.get((i * 7) % 6000);
      if (row && titles.has(row.title.slice(0, 8))) sum += row.unread;
    }

    // small objects created and dropped (allocation + GC pressure, like per-row closures)
    const live = [];
    for (let i = 0; i < 60000; i++) {
      const value = i;
      const object = { a: value, b: () => value + 1 };
      if (i % 50 === 0) live.push(object);
      sum += object.b() & 3;
    }
    return sum + live.length;
  };

  // one round is eight passes of the workload (~45 ms on a fast machine)
  const round = () => {
    let sum = 0;
    for (let pass = 0; pass < 8; pass++) sum += workload();
    return sum;
  };

  let checksum = 0;
  for (let i = 0; i < options.warmup; i++) checksum += round();
  const samples = [];
  for (let i = 0; i < options.rounds; i++) {
    const start = performance.now();
    checksum += round();
    samples.push(performance.now() - start);
  }
  return { samples, checksum };
}

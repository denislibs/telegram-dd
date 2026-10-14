// Normalises a source file for comparison with its telegram-tt counterpart: formats it with the repo's prettier config
// (so the reference's own formatting never counts as a change), then reduces it to non-blank whitespace-collapsed
// lines tagged as "import line" or "code line".
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import * as prettier from 'prettier';

import { CACHE_DIR, ROOT } from './common.ts';

const FORMATTABLE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.html', '.md']);
const PRETTIER_CACHE = join(CACHE_DIR, 'prettier');

let configPromise: Promise<prettier.Options | null> | undefined;
const getConfig = () => (configPromise ??= prettier.resolveConfig(join(ROOT, 'src/x.ts')));

/** Prettier-formatted text; the text itself when the file type is not formatted or does not parse. Cached on disk. */
export async function formatForCompare(text: string, path: string): Promise<string> {
  const ext = extname(path);
  if (!FORMATTABLE.has(ext)) return text;
  const config = (await getConfig()) ?? {};
  const key = createHash('sha1')
    .update(`${prettier.version}\0${ext}\0${JSON.stringify(config)}\0${text}`)
    .digest('hex');
  const cached = join(PRETTIER_CACHE, key.slice(0, 2), key.slice(2));
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  let formatted = text;
  try {
    formatted = await prettier.format(text, { ...config, filepath: join(ROOT, 'src', `file${ext}`) });
  } catch {
    // not parseable: compare raw
  }
  mkdirSync(join(PRETTIER_CACHE, key.slice(0, 2)), { recursive: true });
  writeFileSync(cached, formatted);
  return formatted;
}

export type NormalizedLine = { text: string; isImport: boolean };

const IMPORT_START = /^import\b(?!\s*[(.])/;
const IMPORT_END = /(?:from\s*)?['"][^'"]+['"]\s*(?:with\s*\{[^}]*\}\s*)?;?\s*(?:\/\/.*|\/\*.*\*\/)?$/;

/** Marks the lines of top-level `import … from '…'` / `import '…'` statements (single- or multi-line). */
export function markImports(lines: string[]): boolean[] {
  const marks = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!IMPORT_START.test(lines[i])) continue;
    let end = i;
    while (end < lines.length && end < i + 400 && !IMPORT_END.test(lines[end])) end++;
    if (end >= lines.length || end >= i + 400) continue;
    for (let j = i; j <= end; j++) marks[j] = true;
    i = end;
  }
  return marks;
}

export function normalizeLines(text: string, path: string): NormalizedLine[] {
  const lines = text.split(/\r?\n/);
  const marks = path.endsWith('.json') || /\.s?css$/.test(path) ? lines.map(() => false) : markImports(lines);
  const result: NormalizedLine[] = [];
  lines.forEach((line, index) => {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (normalized) result.push({ text: normalized, isImport: marks[index] });
  });
  return result;
}

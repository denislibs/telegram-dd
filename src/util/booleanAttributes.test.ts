// Guard for engine gap 9 (docs/reports/slice-composer.md): frameact removes an attribute set to boolean `false` and writes
// `""` for `true`. tt's teact wrote the strings "true" / "false" for `aria-*` (setAttribute) and assigned the DOM property
// for `contentEditable` / `draggable` / `spellcheck`, which also writes "true" / "false". So, on an intrinsic element:
// - `draggable={false}` leaves an <img> draggable, `contentEditable={false}` leaves an element editable, and
//   `spellcheck={false}` leaves spellcheck on;
// - `aria-hidden` (bare) or `aria-hidden={true}` writes `aria-hidden=""`, which assistive technology does not read as
//   "true".
// Until the engine stringifies these, every site must pass the strings. This test scans the sources for the patterns.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const ROOT = join(SRC, '..');

/** Attributes whose boolean value frameact does not write the way teact did. */
const ENUMERATED = new Set([
  'contentEditable',
  'contenteditable',
  'draggable',
  'spellcheck',
  'spellCheck',
  'translate',
  'autocorrect',
]);

/** Components that turn a boolean prop of these names into the attribute string themselves. */
const CONVERTING_COMPONENTS = new Set(['NodeViewContent']);

/**
 * Known sites owned by another change, as `path:attribute`. Every entry must still match: remove it once the site is
 * fixed (the test fails on a stale entry).
 */
const PENDING = new Set<string>([]);

function listSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'vendor' || name === 'node_modules') continue;
      listSources(path, out);
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** The JSX expression `{…}` starting at `start` (the index of `{`), braces balanced. */
function readExpression(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return text.slice(start + 1);
}

/** The tag name of the JSX element whose attribute list contains `index`. */
function ownerTag(text: string, index: number): string | undefined {
  const before = text.slice(0, index);
  // `(?<![\w.])`: a type argument (`React.MouseEvent<HTMLElement>`) is not a tag.
  const matches = [...before.matchAll(/(?<![\w.])<([A-Za-z][\w.]*)[\s/>]/g)];
  return matches.at(-1)?.[1];
}

/**
 * Whether an attribute expression can evaluate to a boolean: a boolean literal, or (without a conditional `?:` that
 * picks between other values) a negation, a logical operator or a comparison.
 */
function canBeBoolean(expression: string): boolean {
  const code = expression.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "''");
  // A conditional: only its branches are written (`x === false ? 'false' : undefined` is fine).
  const branches = code.includes('?') ? code.slice(code.indexOf('?') + 1) : code;
  if (/\b(true|false)\b/.test(branches)) return true;
  if (code.includes('?')) return false;
  return /(^|[^=!])!(?!=)|\|\||&&|[=!]==?|[<>]=?/.test(code);
}

/** Comments blanked out (same length, newlines kept), so that a comment quoting a pattern is not a hit. */
function stripComments(text: string): string {
  const blank = (comment: string) => comment.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|\s)\/\/[^\n]*/g, blank);
}

export function findBooleanAttributes(path: string, source: string): string[] {
  const text = stripComments(source);
  const found: string[] = [];
  const attribute = /(?<=\s)((?:aria-[a-z]+)|[A-Za-z]+)(=\{|(?=[\s/>]))/g;
  for (const match of text.matchAll(attribute)) {
    const [, name, assign] = match;
    const isAria = name.startsWith('aria-');
    if (!isAria && !ENUMERATED.has(name)) continue;
    const index = match.index;
    const tag = ownerTag(text, index);
    // A component either spreads the prop onto an element (`OptimizedVideo`, `Dynamic`) or converts it itself.
    if (!tag || CONVERTING_COMPONENTS.has(tag)) continue;
    // The word must sit in the attribute list of that tag: no `>` closes the tag before it.
    let between = text.slice(text.lastIndexOf(`<${tag}`, index), index).replace(/=>/g, '');
    for (let previous = ''; previous !== between; ) {
      previous = between;
      between = between.replace(/\{[^{}]*\}/g, '');
    }
    if (between.includes('>')) continue;
    const isBare = assign !== '={';
    const expression = isBare ? '' : readExpression(text, index + name.length + 1);
    if (isBare || canBeBoolean(expression)) {
      const line = text.slice(0, index).split('\n').length;
      found.push(`${relative(ROOT, path)}:${line}:${name}${isBare ? '' : `={${expression.trim()}}`}`);
    }
  }
  return found;
}

it('no intrinsic element gets a boolean aria-* or enumerated attribute (engine gap 9)', () => {
  const hits = listSources(SRC).flatMap((path) => findBooleanAttributes(path, readFileSync(path, 'utf8')));
  const pendingSeen = new Set<string>();
  const unexpected = hits.filter((hit) => {
    const [file, , attr] = hit.split(':');
    const key = `${file}:${attr.split('=')[0]}`;
    if (PENDING.has(key)) {
      pendingSeen.add(key);
      return false;
    }
    return true;
  });
  expect(unexpected).toEqual([]);
  expect([...PENDING].filter((key) => !pendingSeen.has(key))).toEqual([]);
});

it('the scanner finds the dangerous patterns and skips the safe ones', () => {
  const sample = [
    '<img draggable={false} alt="" />',
    '<span contentEditable={false} />',
    '<input spellcheck={IS_TAURI ? false : undefined} />',
    '<div aria-hidden={!isOpen()} />',
    '<div aria-disabled={props.disabled || undefined} />',
    '<div aria-busy>',
    '<i class="x" aria-hidden />',
    '<img draggable="false" alt="" />',
    '<div aria-hidden={isOpen() ? \'false\' : \'true\'} />',
    '<div aria-label={props.label} />',
    "<input spellcheck={props.check === false ? 'false' : undefined} />",
    '<NodeViewContent contentEditable={isReadOnly() ? false : undefined} />',
    '<div aria-hidden="true" />',
  ].join('\n');
  expect(findBooleanAttributes(join(ROOT, 'x.tsx'), sample).map((hit) => hit.split(':').slice(1).join(':'))).toEqual([
    '1:draggable={false}',
    '2:contentEditable={false}',
    '3:spellcheck={IS_TAURI ? false : undefined}',
    '4:aria-hidden={!isOpen()}',
    '5:aria-disabled={props.disabled || undefined}',
    '6:aria-busy',
    '7:aria-hidden',
  ]);
});

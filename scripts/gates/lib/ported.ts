// Which files of src/ are "ported": they have a counterpart in the telegram-tt reference.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isFile, listOurFiles, looksBinary, ROOT } from './common.ts';

export const PORTED_FROM = /^\/\/ Ported from telegram-tt (\S+)/;

/** The reference path a file of ours was ported from: the same path, or the one named in a `Ported from` header. */
export function counterpartOf(exists: (refPath: string) => boolean, path: string, content: Buffer): string | undefined {
  if (exists(path)) return path;
  if (looksBinary(content)) return undefined;
  const match = PORTED_FROM.exec(content.toString('utf8').split('\n', 1)[0]);
  return match && exists(match[1]) ? match[1] : undefined;
}

/** `ourPath -> referencePath` for every ported file, and the list of files that exist only in src/. */
export function mapPorted(
  reference: string,
  exists: (refPath: string) => boolean = (refPath) => isFile(join(reference, refPath)),
): { ported: Map<string, string>; originalOnly: string[] } {
  const ported = new Map<string, string>();
  const originalOnly: string[] = [];
  for (const path of listOurFiles()) {
    const refPath = counterpartOf(exists, path, readFileSync(join(ROOT, path)));
    if (refPath) ported.set(path, refPath);
    else originalOnly.push(path);
  }
  return { ported, originalOnly };
}
